mod commands;
mod downloads;
mod error;
mod native_glass;
mod server;
mod timeshift;
mod util;

use std::time::Duration;
use tauri::{Manager, RunEvent};

pub struct AppState {
    pub http: reqwest::Client,
    pub server: server::ServerInfo,
    pub timeshift: timeshift::Manager,
    pub downloads: downloads::Manager,
    pub material: native_glass::NativeMaterial,
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("Velox/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .pool_idle_timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .expect("failed to build HTTP client")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "ios"))]
    let builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
            .build(),
    );
    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let http = http_client();

            let ts_root = handle.path().app_cache_dir()?.join("timeshift");
            timeshift::purge_all(&ts_root);
            let ts = timeshift::Manager::new(ts_root, http.clone());

            let info = tauri::async_runtime::block_on(server::start(ts.clone(), http.clone()))?;
            log::info!("media relay listening on {}", info.base_url);

            let dl = downloads::Manager::load(handle.clone(), http.clone())?;

            let material = app
                .get_webview_window("main")
                .map(|w| native_glass::apply(&w))
                .unwrap_or(native_glass::NativeMaterial::None);

            app.manage(AppState { http, server: info, timeshift: ts, downloads: dl, material });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::http::http_get_text,
            commands::http::http_request,
            commands::credentials::credentials_set,
            commands::credentials::credentials_get,
            commands::credentials::credentials_delete,
            commands::local::local_scan,
            commands::epg::epg_fetch_xmltv,
            commands::media::media_server_info,
            commands::media::native_material,
            commands::media::timeshift_start,
            commands::media::timeshift_stop,
            commands::downloads::downloads_list,
            commands::downloads::downloads_enqueue,
            commands::downloads::downloads_pause,
            commands::downloads::downloads_resume,
            commands::downloads::downloads_cancel,
            commands::downloads::downloads_remove,
            commands::downloads::downloads_set_concurrency,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Velox")
        .run(|app, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                if let Some(state) = app.try_state::<AppState>() {
                    state.timeshift.stop_all();
                    state.downloads.persist();
                }
            }
            _ => {}
        });
}
