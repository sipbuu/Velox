use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use url::Url;

use super::Session;
use crate::error::{Error, Result};
use crate::util::apply_headers;

#[derive(Debug, Default)]
pub struct MediaPlaylist {
    pub media_sequence: u64,
    pub target_duration: f64,
    pub segments: Vec<(f64, String)>,
    pub ended: bool,
    pub encrypted: bool,
    pub map_uri: Option<String>,
}

pub enum Parsed {
    Master(Vec<(u64, String)>),
    Media(MediaPlaylist),
}

fn attr_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("{key}=");
    let start = line.find(&needle)? + needle.len();
    let rest = &line[start..];
    if let Some(stripped) = rest.strip_prefix('"') {
        stripped.split('"').next()
    } else {
        rest.split(',').next()
    }
}

pub fn parse(text: &str) -> Parsed {
    let mut variants = Vec::new();
    let mut media = MediaPlaylist::default();
    let mut pending_dur: Option<f64> = None;
    let mut pending_bw: Option<u64> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            pending_bw = Some(attr_value(rest, "BANDWIDTH").and_then(|b| b.parse().ok()).unwrap_or(0));
        } else if let Some(rest) = line.strip_prefix("#EXTINF:") {
            pending_dur = rest.split(',').next().and_then(|d| d.trim().parse().ok());
        } else if let Some(rest) = line.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
            media.media_sequence = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("#EXT-X-TARGETDURATION:") {
            media.target_duration = rest.trim().parse().unwrap_or(6.0);
        } else if line.starts_with("#EXT-X-ENDLIST") {
            media.ended = true;
        } else if let Some(rest) = line.strip_prefix("#EXT-X-KEY:") {
            if attr_value(rest, "METHOD").map(|m| m != "NONE").unwrap_or(false) {
                media.encrypted = true;
            }
        } else if let Some(rest) = line.strip_prefix("#EXT-X-MAP:") {
            media.map_uri = attr_value(rest, "URI").map(str::to_string);
        } else if !line.starts_with('#') {
            if let Some(bw) = pending_bw.take() {
                variants.push((bw, line.to_string()));
            } else {
                media.segments.push((pending_dur.take().unwrap_or(media.target_duration.max(1.0)), line.to_string()));
            }
        }
    }
    if !variants.is_empty() {
        Parsed::Master(variants)
    } else {
        Parsed::Media(media)
    }
}

async fn get_text(http: &reqwest::Client, url: &Url, headers: &HashMap<String, String>) -> Result<(String, Url)> {
    let res = apply_headers(http.get(url.clone()), headers)
        .timeout(Duration::from_secs(15))
        .send()
        .await?
        .error_for_status()?;
    let final_url = res.url().clone();
    Ok((res.text().await?, final_url))
}

async fn get_bytes(http: &reqwest::Client, url: &Url, headers: &HashMap<String, String>) -> Result<bytes::Bytes> {
    Ok(apply_headers(http.get(url.clone()), headers)
        .timeout(Duration::from_secs(30))
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?)
}

pub async fn run(
    session: Arc<Session>,
    http: reqwest::Client,
    url: String,
    headers: HashMap<String, String>,
) -> Result<()> {
    let mut playlist_url = Url::parse(&url).map_err(|e| Error::msg(e.to_string()))?;
    let mut next_upstream: Option<u64> = None;
    let mut have_init = false;
    let mut failures = 0u32;

    loop {
        if session.cancel.is_cancelled() {
            return Ok(());
        }
        let (text, base) = match get_text(&http, &playlist_url, &headers).await {
            Ok(v) => {
                failures = 0;
                v
            }
            Err(e) => {
                failures += 1;
                if failures > 5 {
                    return Err(e);
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        let media = match parse(&text) {
            Parsed::Master(mut variants) => {
                variants.sort_by_key(|(bw, _)| std::cmp::Reverse(*bw));
                let (_, uri) = variants.into_iter().next().ok_or_else(|| Error::msg("empty master playlist"))?;
                playlist_url = base.join(&uri).map_err(|e| Error::msg(e.to_string()))?;
                continue;
            }
            Parsed::Media(m) => m,
        };

        if media.encrypted {
            return Err(Error::msg(
                "encrypted HLS streams can't use the software buffer; disable it to use native time-shift",
            ));
        }
        if let (false, Some(map)) = (have_init, &media.map_uri) {
            let init_url = base.join(map).map_err(|e| Error::msg(e.to_string()))?;
            session.set_init(get_bytes(&http, &init_url, &headers).await?).await;
            have_init = true;
        }

        let first = media.media_sequence;
        let last = first + media.segments.len() as u64;
        let start = match next_upstream {
            None => last.saturating_sub(3).max(first),
            Some(n) if n + 50 < first || n > last + 50 => {
                session.mark_discontinuity().await;
                first
            }
            Some(n) => n.max(first),
        };

        for (i, (dur, uri)) in media.segments.iter().enumerate() {
            let seq = first + i as u64;
            if seq < start {
                continue;
            }
            let seg_url = base.join(uri).map_err(|e| Error::msg(e.to_string()))?;
            let data = tokio::select! {
                _ = session.cancel.cancelled() => return Ok(()),
                r = get_bytes(&http, &seg_url, &headers) => r,
            };
            match data {
                Ok(b) => session.push(*dur, b).await?,
                Err(e) => {
                    log::debug!("segment {seq} failed: {e}");
                    session.mark_discontinuity().await;
                }
            }
            next_upstream = Some(seq + 1);
        }

        if media.ended {
            session.finish().await;
            return Ok(());
        }
        let wait = (media.target_duration / 2.0).clamp(1.0, 6.0);
        tokio::select! {
            _ = session.cancel.cancelled() => return Ok(()),
            _ = tokio::time::sleep(Duration::from_secs_f64(wait)) => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_master_and_media() {
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\nhigh.m3u8\n";
        match parse(master) {
            Parsed::Master(v) => assert_eq!(v, vec![(800000, "low.m3u8".into()), (3000000, "high.m3u8".into())]),
            _ => panic!("expected master"),
        }
        let media =
            "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:42\n#EXTINF:5.5,\na.ts\n#EXTINF:6,\nb.ts\n";
        match parse(media) {
            Parsed::Media(m) => {
                assert_eq!(m.media_sequence, 42);
                assert_eq!(m.segments.len(), 2);
                assert!((m.segments[0].0 - 5.5).abs() < 1e-9);
                assert!(!m.encrypted);
            }
            _ => panic!("expected media"),
        }
    }
}
