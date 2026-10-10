use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use tower_http::cors::CorsLayer;
use url::Url;

use crate::error::Result;
use crate::timeshift;
use crate::util::{apply_headers, b64url_decode, b64url_encode};

#[derive(Clone)]
pub struct ServerInfo {
    pub base_url: String,
    pub token: String,
}

#[derive(Clone)]
struct Ctx {
    info: Arc<ServerInfo>,
    http: reqwest::Client,
    ts: timeshift::Manager,
}

pub async fn start(ts: timeshift::Manager, http: reqwest::Client) -> Result<ServerInfo> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let info =
        ServerInfo { base_url: format!("http://127.0.0.1:{port}"), token: uuid::Uuid::new_v4().simple().to_string() };
    let ctx = Ctx { info: Arc::new(info.clone()), http, ts };

    let app = Router::new()
        .route("/proxy", get(proxy))
        .route("/ts/{id}/index.m3u8", get(ts_playlist))
        .route("/ts/{id}/{segment}", get(ts_segment))
        .layer(CorsLayer::permissive())
        .with_state(ctx);

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("media relay stopped: {e}");
        }
    });
    Ok(info)
}

#[derive(Deserialize)]
struct ProxyQuery {
    k: String,
    u: String,
    h: Option<String>,
}

fn is_playlist(content_type: &str, url: &Url) -> bool {
    let ct = content_type.to_ascii_lowercase();
    ct.contains("mpegurl") || url.path().to_ascii_lowercase().ends_with(".m3u8")
}

fn proxied(info: &ServerInfo, target: &str, h: Option<&str>) -> String {
    let mut s = format!("{}/proxy?k={}&u={}", info.base_url, info.token, b64url_encode(target));
    if let Some(h) = h {
        s.push_str("&h=");
        s.push_str(h);
    }
    s
}

pub fn rewrite_playlist(text: &str, base: &Url, map: impl Fn(&str) -> String) -> String {
    let resolve = |raw: &str| base.join(raw.trim()).map(|u| u.to_string()).unwrap_or_else(|_| raw.to_string());
    let mut out = String::with_capacity(text.len() * 2);
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push('\n');
            continue;
        }
        if trimmed.starts_with('#') {
            if let Some(start) = trimmed.find("URI=\"") {
                let rest = &trimmed[start + 5..];
                if let Some(end) = rest.find('"') {
                    let uri = &rest[..end];
                    out.push_str(&trimmed[..start + 5]);
                    out.push_str(&map(&resolve(uri)));
                    out.push_str(&rest[end..]);
                    out.push('\n');
                    continue;
                }
            }
            out.push_str(trimmed);
        } else {
            out.push_str(&map(&resolve(trimmed)));
        }
        out.push('\n');
    }
    out
}

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, msg.into()).into_response()
}

async fn proxy(State(ctx): State<Ctx>, Query(q): Query<ProxyQuery>, req_headers: HeaderMap) -> Response {
    if q.k != ctx.info.token {
        return err(StatusCode::FORBIDDEN, "invalid token");
    }
    let Some(target) = b64url_decode(&q.u) else {
        return err(StatusCode::BAD_REQUEST, "bad url");
    };
    let headers: HashMap<String, String> =
        q.h.as_deref().and_then(b64url_decode).and_then(|j| serde_json::from_str(&j).ok()).unwrap_or_default();

    let mut rb = apply_headers(ctx.http.get(&target), &headers);
    if let Some(range) = req_headers.get(header::RANGE) {
        rb = rb.header(header::RANGE, range);
    }
    let upstream = match rb.send().await {
        Ok(r) => r,
        Err(e) => return err(StatusCode::BAD_GATEWAY, e.to_string()),
    };

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type =
        upstream.headers().get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let final_url = upstream.url().clone();

    if status.is_success() && is_playlist(&content_type, &final_url) {
        let text = match upstream.text().await {
            Ok(t) => t,
            Err(e) => return err(StatusCode::BAD_GATEWAY, e.to_string()),
        };
        let body = rewrite_playlist(&text, &final_url, |abs| proxied(&ctx.info, abs, q.h.as_deref()));
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(body))
            .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "response"));
    }

    let mut builder = Response::builder().status(status);
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
        header::LAST_MODIFIED,
    ] {
        if let Some(v) = upstream.headers().get(name.as_str()) {
            if let Ok(v) = HeaderValue::from_bytes(v.as_bytes()) {
                builder = builder.header(name, v);
            }
        }
    }
    builder
        .body(Body::from_stream(upstream.bytes_stream()))
        .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "response"))
}

async fn ts_playlist(State(ctx): State<Ctx>, Path(id): Path<String>) -> Response {
    let Some(session) = ctx.ts.get(&id) else {
        return err(StatusCode::NOT_FOUND, "no such session");
    };
    match session.playlist().await {
        Ok(body) => Response::builder()
            .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
            .header(header::CACHE_CONTROL, "no-cache, no-store")
            .body(Body::from(body))
            .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "response")),
        Err(e) => err(StatusCode::BAD_GATEWAY, e),
    }
}

async fn ts_segment(State(ctx): State<Ctx>, Path((id, segment)): Path<(String, String)>) -> Response {
    let Some(session) = ctx.ts.get(&id) else {
        return err(StatusCode::NOT_FOUND, "no such session");
    };
    match session.resource(&segment).await {
        Some((bytes, mime)) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "max-age=3600")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "response")),
        None => err(StatusCode::NOT_FOUND, "segment expired"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_relative_uris_and_attributes() {
        let base = Url::parse("http://cdn.example/live/ch1/index.m3u8").unwrap();
        let src =
            "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\n/abs/seg2.ts\n";
        let out = rewrite_playlist(src, &base, |u| format!("P[{u}]"));
        assert!(out.contains("URI=\"P[http://cdn.example/live/ch1/key.bin]\""));
        assert!(out.contains("P[http://cdn.example/live/ch1/seg1.ts]"));
        assert!(out.contains("P[http://cdn.example/abs/seg2.ts]"));
    }
}
