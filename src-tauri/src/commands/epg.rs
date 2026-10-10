use std::collections::HashSet;
use std::time::Duration;

use chrono::{DateTime, NaiveDateTime};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use tauri::State;

use crate::error::{Error, Result};
use crate::util::maybe_gunzip;
use crate::AppState;

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Programme {
    channel_id: String,
    title: String,
    description: Option<String>,
    start: i64,
    end: i64,
}

pub fn parse_xmltv_time(s: &str) -> Option<i64> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_str(s, "%Y%m%d%H%M%S %z") {
        return Some(dt.timestamp_millis());
    }
    let digits: String = s.chars().take(14).collect();
    NaiveDateTime::parse_from_str(&digits, "%Y%m%d%H%M%S").ok().map(|n| n.and_utc().timestamp_millis())
}

fn attr(e: &BytesStart, name: &[u8]) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.as_ref() == name)
        .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()))
}

pub fn parse_xmltv(xml: &[u8], channels: Option<&HashSet<String>>, from: i64, to: i64) -> Vec<Programme> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut out = Vec::new();
    let mut current: Option<Programme> = None;
    let mut field: Option<&'static str> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"programme" => {
                    let channel_id = attr(&e, b"channel").unwrap_or_default();
                    let start = attr(&e, b"start").and_then(|s| parse_xmltv_time(&s)).unwrap_or(0);
                    let end = attr(&e, b"stop").and_then(|s| parse_xmltv_time(&s)).unwrap_or(start);
                    let wanted =
                        channels.map(|c| c.contains(&channel_id)).unwrap_or(true) && end >= from && start <= to;
                    current = wanted.then(|| Programme { channel_id, start, end, ..Default::default() });
                }
                b"title" if current.is_some() => field = Some("title"),
                b"desc" if current.is_some() => field = Some("desc"),
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if let (Some(p), Some(f)) = (current.as_mut(), field) {
                    let text = t.unescape().map(|c| c.into_owned()).unwrap_or_default();
                    match f {
                        "title" if p.title.is_empty() => p.title = text,
                        "desc" if p.description.is_none() => p.description = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::CData(t)) => {
                if let (Some(p), Some(f)) = (current.as_mut(), field) {
                    let text = String::from_utf8_lossy(&t).into_owned();
                    match f {
                        "title" if p.title.is_empty() => p.title = text,
                        "desc" if p.description.is_none() => p.description = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"programme" => {
                    if let Some(p) = current.take() {
                        out.push(p);
                    }
                }
                b"title" | b"desc" => field = None,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => {
                log::warn!("xmltv parse error at {}: {e}", reader.buffer_position());
                break;
            }
            _ => {}
        }
        buf.clear();
    }
    out
}

#[tauri::command]
pub async fn epg_fetch_xmltv(
    state: State<'_, AppState>,
    url: String,
    channel_ids: Option<Vec<String>>,
    hours_back: Option<i64>,
    hours_ahead: Option<i64>,
) -> Result<Vec<Programme>> {
    let res = state.http.get(&url).timeout(Duration::from_secs(180)).send().await?.error_for_status()?;
    let bytes = res.bytes().await?;
    let now = chrono::Utc::now().timestamp_millis();
    let from = now - hours_back.unwrap_or(2) * 3_600_000;
    let to = now + hours_ahead.unwrap_or(24) * 3_600_000;
    tokio::task::spawn_blocking(move || {
        let xml = maybe_gunzip(&bytes);
        let set = channel_ids.map(|v| v.into_iter().collect::<HashSet<_>>());
        parse_xmltv(&xml, set.as_ref(), from, to)
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0"?><tv>
      <channel id="a"><display-name>A</display-name></channel>
      <programme start="20250101100000 +0000" stop="20250101110000 +0000" channel="a"><title lang="en">News &amp; Weather</title><desc>Daily</desc></programme>
      <programme start="20250101100000 +0000" stop="20250101110000 +0000" channel="b"><title>Other</title></programme>
    </tv>"#;

    #[test]
    fn parses_programmes_for_selected_channels() {
        let set: HashSet<String> = ["a".to_string()].into();
        let list = parse_xmltv(XML.as_bytes(), Some(&set), 0, i64::MAX);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "News & Weather");
        assert_eq!(list[0].description.as_deref(), Some("Daily"));
        assert_eq!(list[0].start, 1_735_725_600_000);
    }

    #[test]
    fn parses_times_without_offset() {
        assert_eq!(parse_xmltv_time("20250101100000"), Some(1_735_725_600_000));
    }
}
