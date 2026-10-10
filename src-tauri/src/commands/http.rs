use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::USER_AGENT;
use tauri::State;

use crate::error::Result;
use crate::util::{apply_headers, maybe_gunzip};
use crate::AppState;

#[tauri::command]
pub async fn http_get_text(
    state: State<'_, AppState>,
    url: String,
    headers: Option<HashMap<String, String>>,
    user_agent: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<String> {
    let mut rb = state.http.get(&url).timeout(Duration::from_millis(timeout_ms.unwrap_or(30_000)));
    if let Some(ua) = user_agent.filter(|s| !s.is_empty()) {
        rb = rb.header(USER_AGENT, ua);
    }
    rb = apply_headers(rb, &headers.unwrap_or_default());
    let res = rb.send().await?.error_for_status()?;
    let bytes = res.bytes().await?;
    Ok(String::from_utf8_lossy(&maybe_gunzip(&bytes)).into_owned())
}
