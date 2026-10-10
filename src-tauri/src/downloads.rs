use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::header::{CONTENT_LENGTH, CONTENT_RANGE, RANGE};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager as _};
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::error::{Error, Result};
use crate::util::{apply_headers, sanitize_filename};

const EVENT: &str = "velox://download";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadState {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub title: String,
    pub url: String,
    pub file_path: String,
    pub state: DownloadState,
    pub bytes_done: u64,
    pub bytes_total: Option<u64>,
    pub speed_bps: u64,
    pub error: Option<String>,
    pub poster_url: Option<String>,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueRequest {
    pub url: String,
    pub title: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub poster_url: Option<String>,
    pub extension: Option<String>,
}

struct Inner {
    app: AppHandle,
    http: reqwest::Client,
    dir: PathBuf,
    db: PathBuf,
    tasks: Mutex<HashMap<String, DownloadTask>>,
    tokens: Mutex<HashMap<String, (u64, CancellationToken)>>,
    generation: AtomicU64,
    max: AtomicUsize,
    active: AtomicUsize,
    slot_freed: Notify,
}

#[derive(Clone)]
pub struct Manager(Arc<Inner>);

fn download_dir(app: &AppHandle) -> Result<PathBuf> {
    let p = app.path();
    let dir = if cfg!(any(target_os = "ios", target_os = "android")) {
        p.document_dir()?.join("Downloads")
    } else {
        p.download_dir().or_else(|_| p.app_data_dir())?.join("Velox")
    };
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

impl Manager {
    pub fn load(app: AppHandle, http: reqwest::Client) -> Result<Self> {
        let db = app.path().app_data_dir()?.join("downloads.json");
        if let Some(d) = db.parent() {
            std::fs::create_dir_all(d)?;
        }
        let mut tasks: HashMap<String, DownloadTask> =
            std::fs::read(&db).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let mut resume = Vec::new();
        for t in tasks.values_mut() {
            t.speed_bps = 0;
            if matches!(t.state, DownloadState::Downloading | DownloadState::Queued) {
                t.state = DownloadState::Queued;
                resume.push(t.id.clone());
            }
        }
        let mgr = Self(Arc::new(Inner {
            dir: download_dir(&app)?,
            app,
            http,
            db,
            tasks: Mutex::new(tasks),
            tokens: Mutex::default(),
            generation: AtomicU64::new(0),
            max: AtomicUsize::new(2),
            active: AtomicUsize::new(0),
            slot_freed: Notify::new(),
        }));
        for id in resume {
            mgr.spawn(id);
        }
        Ok(mgr)
    }

    pub fn list(&self) -> Vec<DownloadTask> {
        self.0.tasks.lock().map(|m| m.values().cloned().collect()).unwrap_or_default()
    }

    pub fn persist(&self) {
        let Ok(map) = self.0.tasks.lock() else { return };
        match serde_json::to_vec_pretty(&*map) {
            Ok(bytes) => {
                if let Err(e) = std::fs::write(&self.0.db, bytes) {
                    log::warn!("failed to persist downloads: {e}");
                }
            }
            Err(e) => log::warn!("failed to serialize downloads: {e}"),
        }
    }

    fn update(&self, id: &str, f: impl FnOnce(&mut DownloadTask)) -> Option<DownloadTask> {
        let snapshot = {
            let mut map = self.0.tasks.lock().ok()?;
            let t = map.get_mut(id)?;
            f(t);
            t.clone()
        };
        let _ = self.0.app.emit(EVENT, &snapshot);
        Some(snapshot)
    }

    fn state_of(&self, id: &str) -> Option<DownloadState> {
        self.0.tasks.lock().ok()?.get(id).map(|t| t.state)
    }

    fn unique_path(&self, title: &str, ext: &str) -> PathBuf {
        let base = sanitize_filename(title);
        let ext = ext.trim_start_matches('.').chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect::<String>();
        let ext = if ext.is_empty() { "mp4".to_string() } else { ext };
        let taken: Vec<String> = self.list().into_iter().map(|t| t.file_path).collect();
        let mut n = 0;
        loop {
            let name = if n == 0 { format!("{base}.{ext}") } else { format!("{base} ({n}).{ext}") };
            let p = self.0.dir.join(name);
            if !p.exists() && !taken.contains(&p.to_string_lossy().to_string()) {
                return p;
            }
            n += 1;
        }
    }

    pub fn enqueue(&self, req: EnqueueRequest) -> Result<DownloadTask> {
        let ext = req.extension.clone().unwrap_or_else(|| "mp4".into());
        let path = self.unique_path(&req.title, &ext);
        let task = DownloadTask {
            id: uuid::Uuid::new_v4().simple().to_string(),
            title: req.title,
            url: req.url,
            file_path: path.to_string_lossy().to_string(),
            state: DownloadState::Queued,
            bytes_done: 0,
            bytes_total: None,
            speed_bps: 0,
            error: None,
            poster_url: req.poster_url,
            created_at: chrono::Utc::now().timestamp_millis(),
            headers: req.headers,
        };
        self.0.tasks.lock().map_err(|_| Error::msg("downloads lock poisoned"))?.insert(task.id.clone(), task.clone());
        self.persist();
        self.spawn(task.id.clone());
        Ok(task)
    }

    pub fn pause(&self, id: &str) -> Result<()> {
        self.update(id, |t| {
            if matches!(t.state, DownloadState::Downloading | DownloadState::Queued) {
                t.state = DownloadState::Paused;
                t.speed_bps = 0;
            }
        });
        self.cancel_token(id);
        self.persist();
        Ok(())
    }

    pub fn resume(&self, id: &str) -> Result<()> {
        let st = self.state_of(id).ok_or_else(|| Error::msg("unknown download"))?;
        if matches!(st, DownloadState::Paused | DownloadState::Failed | DownloadState::Queued) {
            self.update(id, |t| {
                t.state = DownloadState::Queued;
                t.error = None;
            });
            self.spawn(id.to_string());
        }
        Ok(())
    }

    pub fn cancel(&self, id: &str) -> Result<()> {
        let snapshot = self.update(id, |t| {
            if t.state != DownloadState::Completed {
                t.state = DownloadState::Cancelled;
                t.speed_bps = 0;
            }
        });
        self.cancel_token(id);
        if let Some(t) = snapshot.filter(|t| t.state == DownloadState::Cancelled) {
            let _ = std::fs::remove_file(part_path(&t.file_path));
        }
        self.persist();
        Ok(())
    }

    pub fn remove(&self, id: &str, delete_file: bool) -> Result<()> {
        self.cancel_token(id);
        let removed = self.0.tasks.lock().ok().and_then(|mut m| m.remove(id));
        if let Some(t) = removed {
            let _ = std::fs::remove_file(part_path(&t.file_path));
            if delete_file {
                let _ = std::fs::remove_file(&t.file_path);
            }
        }
        self.persist();
        Ok(())
    }

    pub fn set_concurrency(&self, n: usize) {
        self.0.max.store(n.clamp(1, 6), Ordering::SeqCst);
        self.0.slot_freed.notify_waiters();
    }

    fn cancel_token(&self, id: &str) {
        if let Some((_, tok)) = self.0.tokens.lock().ok().and_then(|mut m| m.remove(id)) {
            tok.cancel();
        }
    }

    fn spawn(&self, id: String) {
        let token = CancellationToken::new();
        let gen = self.0.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut m) = self.0.tokens.lock() {
            if let Some((_, old)) = m.insert(id.clone(), (gen, token.clone())) {
                old.cancel();
            }
        }
        let mgr = self.clone();
        tauri::async_runtime::spawn(async move {
            if !mgr.acquire_slot(&token).await {
                return;
            }
            let result = mgr.run(&id, &token).await;
            mgr.0.active.fetch_sub(1, Ordering::SeqCst);
            mgr.0.slot_freed.notify_waiters();
            if let Err(e) = result {
                if mgr.state_of(&id) == Some(DownloadState::Downloading) {
                    mgr.update(&id, |t| {
                        t.state = DownloadState::Failed;
                        t.error = Some(e.to_string());
                        t.speed_bps = 0;
                    });
                }
            }
            if let Ok(mut m) = mgr.0.tokens.lock() {
                if m.get(&id).is_some_and(|(g, _)| *g == gen) {
                    m.remove(&id);
                }
            }
            mgr.persist();
        });
    }

    async fn acquire_slot(&self, token: &CancellationToken) -> bool {
        loop {
            let notified = self.0.slot_freed.notified();
            let cur = self.0.active.load(Ordering::SeqCst);
            if cur < self.0.max.load(Ordering::SeqCst)
                && self.0.active.compare_exchange(cur, cur + 1, Ordering::SeqCst, Ordering::SeqCst).is_ok()
            {
                return true;
            }
            tokio::select! {
                _ = notified => {}
                _ = token.cancelled() => return false,
                _ = tokio::time::sleep(Duration::from_secs(5)) => {}
            }
        }
    }

    async fn run(&self, id: &str, token: &CancellationToken) -> Result<()> {
        let task = self
            .update(id, |t| {
                t.state = DownloadState::Downloading;
                t.error = None;
            })
            .ok_or_else(|| Error::msg("download vanished"))?;

        let part = part_path(&task.file_path);
        let existing = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);

        let mut rb = apply_headers(self.0.http.get(&task.url), &task.headers);
        if existing > 0 {
            rb = rb.header(RANGE, format!("bytes={existing}-"));
        }
        let res = tokio::select! {
            _ = token.cancelled() => return Ok(()),
            r = rb.send() => r?.error_for_status()?,
        };

        let resumed = existing > 0 && res.status() == StatusCode::PARTIAL_CONTENT;
        let offset = if resumed { existing } else { 0 };
        let total = res
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.rsplit('/').next())
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| {
                res.headers()
                    .get(CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(|l| l + offset)
            });

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(resumed)
            .truncate(!resumed)
            .open(&part)
            .await?;

        let mut done = offset;
        let mut stream = res.bytes_stream();
        let mut last_emit = Instant::now();
        let mut window_bytes = 0u64;
        self.update(id, |t| {
            t.bytes_done = done;
            t.bytes_total = total;
        });

        loop {
            let chunk = tokio::select! {
                _ = token.cancelled() => {
                    file.flush().await?;
                    return Ok(());
                }
                c = tokio::time::timeout(Duration::from_secs(60), stream.next()) => c,
            };
            match chunk {
                Ok(Some(Ok(bytes))) => {
                    file.write_all(&bytes).await?;
                    done += bytes.len() as u64;
                    window_bytes += bytes.len() as u64;
                    let elapsed = last_emit.elapsed();
                    if elapsed >= Duration::from_millis(500) {
                        let speed = (window_bytes as f64 / elapsed.as_secs_f64()) as u64;
                        self.update(id, |t| {
                            t.bytes_done = done;
                            t.speed_bps = speed;
                        });
                        last_emit = Instant::now();
                        window_bytes = 0;
                    }
                }
                Ok(Some(Err(e))) => return Err(e.into()),
                Ok(None) => break,
                Err(_) => return Err(Error::msg("download stalled")),
            }
        }

        file.flush().await?;
        drop(file);
        if let Some(t) = total {
            if done < t {
                return Err(Error::msg(format!("incomplete download ({done} of {t} bytes)")));
            }
        }
        tokio::fs::rename(&part, &task.file_path).await?;
        self.update(id, |t| {
            t.state = DownloadState::Completed;
            t.bytes_done = done;
            t.bytes_total = Some(done);
            t.speed_bps = 0;
        });
        Ok(())
    }
}

fn part_path(file: &str) -> PathBuf {
    PathBuf::from(format!("{file}.part"))
}
