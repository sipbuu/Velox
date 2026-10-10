use serde::Serialize;
use tauri::State;

use crate::error::Result;
use crate::timeshift::StartRequest;
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoDto {
    base_url: String,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeshiftSessionDto {
    id: String,
    playlist_url: String,
}

#[tauri::command]
pub fn media_server_info(state: State<'_, AppState>) -> ServerInfoDto {
    ServerInfoDto { base_url: state.server.base_url.clone(), token: state.server.token.clone() }
}

#[tauri::command]
pub async fn timeshift_start(state: State<'_, AppState>, request: StartRequest) -> Result<TimeshiftSessionDto> {
    let id = state.timeshift.start(request).await?;
    Ok(TimeshiftSessionDto { playlist_url: format!("{}/ts/{id}/index.m3u8", state.server.base_url), id })
}

#[tauri::command]
pub async fn timeshift_stop(state: State<'_, AppState>, id: String) -> Result<()> {
    state.timeshift.stop(&id);
    Ok(())
}
