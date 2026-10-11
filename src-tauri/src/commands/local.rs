use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use walkdir::WalkDir;

use crate::error::{Error, Result};

const MEDIA_EXT: &[&str] = &["mp4", "m4v", "mov", "mkv", "webm", "ts", "m2ts", "m3u8", "mp3", "m4a", "aac", "flac"];
const SUB_EXT: &[&str] = &["srt", "vtt", "ass", "ssa"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileEntry {
    path: String,
    name: String,
    size: u64,
    modified: u64,
    folder: String,
    subtitles: Vec<String>,
}

fn ext_of(p: &Path) -> Option<String> {
    p.extension().map(|e| e.to_string_lossy().to_lowercase())
}

fn scan(folders: Vec<String>) -> Vec<LocalFileEntry> {
    let mut out = Vec::new();
    for root in folders {
        let mut subs_by_dir: HashMap<String, Vec<String>> = HashMap::new();
        let mut media = Vec::new();
        for entry in WalkDir::new(&root).follow_links(true).max_depth(8).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let Some(ext) = ext_of(entry.path()) else { continue };
            let dir = entry.path().parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            if SUB_EXT.contains(&ext.as_str()) {
                subs_by_dir.entry(dir).or_default().push(name);
            } else if MEDIA_EXT.contains(&ext.as_str()) {
                media.push((entry, dir, name));
            }
        }
        for (entry, dir, name) in media {
            let meta = entry.metadata().ok();
            let stem = Path::new(&name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let subtitles = subs_by_dir
                .get(&dir)
                .map(|v| v.iter().filter(|s| s.starts_with(&stem)).cloned().collect())
                .unwrap_or_default();
            out.push(LocalFileEntry {
                path: entry.path().to_string_lossy().to_string(),
                name,
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                modified: meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
                folder: dir,
                subtitles,
            });
        }
    }
    out
}

#[tauri::command]
pub async fn local_scan(folders: Vec<String>) -> Result<Vec<LocalFileEntry>> {
    tokio::task::spawn_blocking(move || scan(folders)).await.map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
pub async fn text_file_write(path: String, contents: String) -> Result<()> {
    tokio::fs::write(&path, contents).await?;
    Ok(())
}

#[tauri::command]
pub async fn text_file_read(path: String) -> Result<String> {
    let bytes = tokio::fs::read(&path).await?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(Error::msg("file is too large"));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
