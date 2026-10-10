mod hls;
mod session;
mod ts;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

use crate::error::{Error, Result};
pub use session::{Session, Storage};

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpstreamKind {
    Hls,
    Mpegts,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub container: UpstreamKind,
    pub window_sec: u32,
    pub storage: Storage,
}

#[derive(Clone)]
pub struct Manager {
    root: PathBuf,
    http: reqwest::Client,
    sessions: Arc<Mutex<HashMap<String, Arc<Session>>>>,
}

pub fn purge_all(root: &Path) {
    if root.exists() {
        if let Err(e) = std::fs::remove_dir_all(root) {
            log::warn!("failed to purge timeshift cache {}: {e}", root.display());
        }
    }
}

const MAX_SESSIONS: usize = 4;

impl Manager {
    pub fn new(root: PathBuf, http: reqwest::Client) -> Self {
        Self { root, http, sessions: Default::default() }
    }

    pub fn get(&self, id: &str) -> Option<Arc<Session>> {
        self.sessions.lock().ok()?.get(id).cloned()
    }

    pub async fn start(&self, req: StartRequest) -> Result<String> {
        let id = uuid::Uuid::new_v4().simple().to_string();
        let dir = self.root.join(&id);
        if req.storage == Storage::Disk {
            tokio::fs::create_dir_all(&dir).await?;
        }
        let window = req.window_sec.clamp(10, 3600) as f64;
        let session = Arc::new(Session::new(id.clone(), dir, req.storage, window));

        {
            let mut map = self.sessions.lock().map_err(|_| Error::msg("timeshift lock poisoned"))?;
            while map.len() >= MAX_SESSIONS {
                let Some(oldest) = map.values().min_by_key(|s| s.created_at()).map(|s| s.id().to_string()) else {
                    break;
                };
                if let Some(s) = map.remove(&oldest) {
                    s.shutdown();
                }
            }
            map.insert(id.clone(), session.clone());
        }

        let http = self.http.clone();
        tauri::async_runtime::spawn(async move {
            let result = match req.container {
                UpstreamKind::Hls => hls::run(session.clone(), http, req.url, req.headers).await,
                UpstreamKind::Mpegts => ts::run(session.clone(), http, req.url, req.headers).await,
            };
            if let Err(e) = result {
                log::warn!("timeshift session {} ended: {e}", session.id());
                session.fail(e.to_string()).await;
            }
        });
        Ok(id)
    }

    pub fn stop(&self, id: &str) {
        let removed = self.sessions.lock().ok().and_then(|mut m| m.remove(id));
        if let Some(s) = removed {
            s.shutdown();
        }
    }

    pub fn stop_all(&self) {
        let all: Vec<_> = self.sessions.lock().map(|mut m| m.drain().map(|(_, s)| s).collect()).unwrap_or_default();
        for s in all {
            s.shutdown();
        }
        purge_all(&self.root);
    }
}
