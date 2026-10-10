use std::collections::VecDeque;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use bytes::Bytes;
use serde::Deserialize;
use tokio::sync::{Notify, RwLock};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Storage {
    Memory,
    Disk,
}

enum Data {
    Memory(Bytes),
    Disk(PathBuf),
}

struct Segment {
    seq: u64,
    duration: f64,
    discontinuity: bool,
    data: Data,
}

#[derive(Default)]
struct Window {
    segments: VecDeque<Segment>,
    next_seq: u64,
    total: f64,
    error: Option<String>,
    ended: bool,
    init: Option<Bytes>,
    fmp4: bool,
    pending_discontinuity: bool,
    disc_seq: u64,
}

pub struct Session {
    id: String,
    dir: PathBuf,
    storage: Storage,
    window_sec: f64,
    created: Instant,
    state: RwLock<Window>,
    notify: Notify,
    pub cancel: CancellationToken,
}

impl Session {
    pub fn new(id: String, dir: PathBuf, storage: Storage, window_sec: f64) -> Self {
        Self {
            id,
            dir,
            storage,
            window_sec,
            created: Instant::now(),
            state: RwLock::new(Window::default()),
            notify: Notify::new(),
            cancel: CancellationToken::new(),
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn created_at(&self) -> Instant {
        self.created
    }

    pub async fn set_init(&self, init: Bytes) {
        let mut w = self.state.write().await;
        w.init = Some(init);
        w.fmp4 = true;
    }

    pub async fn mark_discontinuity(&self) {
        self.state.write().await.pending_discontinuity = true;
    }

    pub async fn push(&self, duration: f64, bytes: Bytes) -> std::io::Result<()> {
        if self.cancel.is_cancelled() {
            return Ok(());
        }
        let seq = self.state.read().await.next_seq;
        let data = match self.storage {
            Storage::Memory => Data::Memory(bytes),
            Storage::Disk => {
                let path = self.dir.join(format!("{seq}.seg"));
                tokio::fs::write(&path, &bytes).await?;
                Data::Disk(path)
            }
        };

        let mut evicted = Vec::new();
        {
            let mut w = self.state.write().await;
            let discontinuity = std::mem::take(&mut w.pending_discontinuity);
            w.segments.push_back(Segment { seq, duration, discontinuity, data });
            w.next_seq = seq + 1;
            w.total += duration;
            let max_seg = w.segments.iter().map(|s| s.duration).fold(0.0, f64::max);
            let keep = self.window_sec + (max_seg * 3.0).max(6.0);
            while w.total > keep && w.segments.len() > 3 {
                if let Some(old) = w.segments.pop_front() {
                    w.total -= old.duration;
                    if old.discontinuity {
                        w.disc_seq += 1;
                    }
                    evicted.push(old);
                }
            }
        }
        for seg in evicted {
            if let Data::Disk(p) = seg.data {
                let _ = tokio::fs::remove_file(p).await;
            }
        }
        self.notify.notify_waiters();
        Ok(())
    }

    pub async fn fail(&self, message: String) {
        let mut w = self.state.write().await;
        if w.segments.is_empty() {
            w.error = Some(message);
        }
        w.ended = true;
        drop(w);
        self.notify.notify_waiters();
    }

    pub async fn finish(&self) {
        self.state.write().await.ended = true;
        self.notify.notify_waiters();
    }

    pub async fn playlist(&self) -> Result<String, String> {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let notified = self.notify.notified();
            {
                let w = self.state.read().await;
                if let Some(e) = &w.error {
                    return Err(e.clone());
                }
                if !w.segments.is_empty() || w.ended {
                    return Ok(render(&w));
                }
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err("timed out waiting for the live stream".into());
            }
            tokio::select! {
                _ = notified => {}
                _ = tokio::time::sleep(left) => {}
                _ = self.cancel.cancelled() => return Err("session stopped".into()),
            }
        }
    }

    pub async fn resource(&self, name: &str) -> Option<(Bytes, &'static str)> {
        let w = self.state.read().await;
        if name.starts_with("init") {
            return w.init.clone().map(|b| (b, "video/mp4"));
        }
        let seq: u64 = name.split('.').next()?.parse().ok()?;
        let mime = if w.fmp4 { "video/iso.segment" } else { "video/mp2t" };
        let seg = w.segments.iter().find(|s| s.seq == seq)?;
        match &seg.data {
            Data::Memory(b) => Some((b.clone(), mime)),
            Data::Disk(p) => {
                let p = p.clone();
                drop(w);
                tokio::fs::read(p).await.ok().map(|v| (Bytes::from(v), mime))
            }
        }
    }

    pub fn shutdown(&self) {
        self.cancel.cancel();
        if self.storage == Storage::Disk {
            let dir = self.dir.clone();
            std::thread::spawn(move || {
                let _ = std::fs::remove_dir_all(dir);
            });
        }
    }
}

fn render(w: &Window) -> String {
    let target = w.segments.iter().map(|s| s.duration).fold(1.0, f64::max).ceil() as u64;
    let first = w.segments.front().map(|s| s.seq).unwrap_or(0);
    let ext = if w.fmp4 { "m4s" } else { "ts" };
    let mut out = format!(
        "#EXTM3U\n#EXT-X-VERSION:{}\n#EXT-X-TARGETDURATION:{target}\n#EXT-X-MEDIA-SEQUENCE:{first}\n",
        if w.fmp4 { 7 } else { 3 }
    );
    out.push_str(&format!("#EXT-X-DISCONTINUITY-SEQUENCE:{}\n", w.disc_seq));
    if w.fmp4 && w.init.is_some() {
        out.push_str("#EXT-X-MAP:URI=\"init.mp4\"\n");
    }
    for s in &w.segments {
        if s.discontinuity {
            out.push_str("#EXT-X-DISCONTINUITY\n");
        }
        out.push_str(&format!("#EXTINF:{:.3},\n{}.{ext}\n", s.duration, s.seq));
    }
    if w.ended {
        out.push_str("#EXT-X-ENDLIST\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn sliding_window_evicts_old_segments() {
        let s = Session::new("t".into(), PathBuf::from("/nonexistent"), Storage::Memory, 10.0);
        for _ in 0..20 {
            s.push(2.0, Bytes::from_static(b"x")).await.unwrap();
        }
        let pl = s.playlist().await.unwrap();
        let count = pl.matches("#EXTINF").count();
        assert!((5..=9).contains(&count), "kept {count} segments");
        assert!(pl.contains("#EXT-X-MEDIA-SEQUENCE:"));
        assert!(s.resource("19.ts").await.is_some());
        assert!(s.resource("0.ts").await.is_none());
    }
}
