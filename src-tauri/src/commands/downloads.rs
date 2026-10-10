use tauri::State;

use crate::downloads::{DownloadTask, EnqueueRequest};
use crate::error::Result;
use crate::AppState;

#[tauri::command]
pub fn downloads_list(state: State<'_, AppState>) -> Vec<DownloadTask> {
    state.downloads.list()
}

#[tauri::command]
pub fn downloads_enqueue(state: State<'_, AppState>, request: EnqueueRequest) -> Result<DownloadTask> {
    state.downloads.enqueue(request)
}

#[tauri::command]
pub fn downloads_pause(state: State<'_, AppState>, id: String) -> Result<()> {
    state.downloads.pause(&id)
}

#[tauri::command]
pub fn downloads_resume(state: State<'_, AppState>, id: String) -> Result<()> {
    state.downloads.resume(&id)
}

#[tauri::command]
pub fn downloads_cancel(state: State<'_, AppState>, id: String) -> Result<()> {
    state.downloads.cancel(&id)
}

#[tauri::command]
pub fn downloads_remove(state: State<'_, AppState>, id: String, delete_file: bool) -> Result<()> {
    state.downloads.remove(&id, delete_file)
}

#[tauri::command]
pub fn downloads_set_concurrency(state: State<'_, AppState>, n: usize) {
    state.downloads.set_concurrency(n);
}
