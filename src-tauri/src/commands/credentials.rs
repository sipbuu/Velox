use std::collections::HashMap;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};

fn fallback_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_local_data_dir()?.join("credentials.fallback.json"))
}

fn read_fallback(app: &AppHandle) -> HashMap<String, String> {
    fallback_path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn write_fallback(app: &AppHandle, map: &HashMap<String, String>) -> Result<()> {
    let path = fallback_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, serde_json::to_vec(map)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn key(service: &str, account: &str) -> String {
    format!("{service}::{account}")
}

#[tauri::command]
pub fn credentials_set(app: AppHandle, service: String, account: String, secret: String) -> Result<()> {
    match keyring::Entry::new(&service, &account).and_then(|e| e.set_password(&secret)) {
        Ok(()) => {
            let mut map = read_fallback(&app);
            if map.remove(&key(&service, &account)).is_some() {
                write_fallback(&app, &map)?;
            }
            Ok(())
        }
        Err(err) => {
            log::warn!("system keychain unavailable ({err}); using app-local fallback store");
            let mut map = read_fallback(&app);
            map.insert(key(&service, &account), secret);
            write_fallback(&app, &map)
        }
    }
}

#[tauri::command]
pub fn credentials_get(app: AppHandle, service: String, account: String) -> Result<Option<String>> {
    match keyring::Entry::new(&service, &account).and_then(|e| e.get_password()) {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) | Err(_) => Ok(read_fallback(&app).get(&key(&service, &account)).cloned()),
    }
}

#[tauri::command]
pub fn credentials_delete(app: AppHandle, service: String, account: String) -> Result<()> {
    if let Ok(entry) = keyring::Entry::new(&service, &account) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => log::warn!("keychain delete failed: {e}"),
        }
    }
    let mut map = read_fallback(&app);
    if map.remove(&key(&service, &account)).is_some() {
        write_fallback(&app, &map).map_err(|e| Error::msg(e.to_string()))?;
    }
    Ok(())
}
