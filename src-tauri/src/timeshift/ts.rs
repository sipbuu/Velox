use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::{Bytes, BytesMut};
use futures_util::StreamExt;

use super::Session;
use crate::error::{Error, Result};
use crate::util::apply_headers;

const PKT: usize = 188;
const SYNC: u8 = 0x47;
const PCR_HZ: f64 = 90_000.0;
const PCR_WRAP: u64 = 1 << 33;

fn pid_of(p: &[u8]) -> u16 {
    (((p[1] & 0x1f) as u16) << 8) | p[2] as u16
}

fn pusi(p: &[u8]) -> bool {
    p[1] & 0x40 != 0
}

fn has_adaptation(p: &[u8]) -> bool {
    (p[3] >> 4) & 0x2 != 0 && p[4] > 0
}

fn payload_offset(p: &[u8]) -> Option<usize> {
    let afc = (p[3] >> 4) & 0x3;
    if afc & 0x1 == 0 {
        return None;
    }
    let off = if afc & 0x2 != 0 { 5 + p[4] as usize } else { 4 };
    (off < PKT).then_some(off)
}

fn random_access(p: &[u8]) -> bool {
    has_adaptation(p) && p[5] & 0x40 != 0
}

fn pcr(p: &[u8]) -> Option<u64> {
    if !has_adaptation(p) || p[4] < 7 || p[5] & 0x10 == 0 {
        return None;
    }
    Some(
        ((p[6] as u64) << 25)
            | ((p[7] as u64) << 17)
            | ((p[8] as u64) << 9)
            | ((p[9] as u64) << 1)
            | ((p[10] as u64) >> 7),
    )
}

fn section(p: &[u8]) -> Option<(usize, usize)> {
    let off = payload_offset(p)?;
    let start = off + 1 + *p.get(off)? as usize;
    if start + 3 > PKT {
        return None;
    }
    let len = (((p[start + 1] & 0x0f) as usize) << 8) | p[start + 2] as usize;
    let end = (start + 3 + len).saturating_sub(4).min(PKT);
    Some((start, end))
}

fn parse_pat(p: &[u8]) -> Option<u16> {
    let (start, end) = section(p)?;
    let mut i = start + 8;
    while i + 4 <= end {
        let program = ((p[i] as u16) << 8) | p[i + 1] as u16;
        let pid = (((p[i + 2] & 0x1f) as u16) << 8) | p[i + 3] as u16;
        if program != 0 {
            return Some(pid);
        }
        i += 4;
    }
    None
}

fn parse_pmt_video(p: &[u8]) -> Option<u16> {
    let (start, end) = section(p)?;
    if start + 12 > PKT {
        return None;
    }
    let info_len = (((p[start + 10] & 0x0f) as usize) << 8) | p[start + 11] as usize;
    let mut i = start + 12 + info_len;
    while i + 5 <= end {
        let stream_type = p[i];
        let pid = (((p[i + 1] & 0x1f) as u16) << 8) | p[i + 2] as u16;
        let es_len = (((p[i + 3] & 0x0f) as usize) << 8) | p[i + 4] as usize;
        if matches!(stream_type, 0x01 | 0x02 | 0x10 | 0x1b | 0x24 | 0x42 | 0xea) {
            return Some(pid);
        }
        i += 5 + es_len;
    }
    None
}

pub struct Segmenter {
    target: f64,
    carry: Vec<u8>,
    cur: BytesMut,
    pat: Option<[u8; PKT]>,
    pmt: Option<[u8; PKT]>,
    pmt_pid: Option<u16>,
    video_pid: Option<u16>,
    pcr_pid: Option<u16>,
    seg_pcr_start: Option<u64>,
    last_pcr: Option<u64>,
    wall_start: Instant,
    rai_seen: bool,
}

impl Segmenter {
    pub fn new(target: f64) -> Self {
        Self {
            target,
            carry: Vec::with_capacity(PKT * 64),
            cur: BytesMut::with_capacity(1 << 20),
            pat: None,
            pmt: None,
            pmt_pid: None,
            video_pid: None,
            pcr_pid: None,
            seg_pcr_start: None,
            last_pcr: None,
            wall_start: Instant::now(),
            rai_seen: false,
        }
    }

    fn elapsed(&self) -> f64 {
        match (self.seg_pcr_start, self.last_pcr) {
            (Some(a), Some(b)) => {
                let d = (b + PCR_WRAP - a) % PCR_WRAP;
                let secs = d as f64 / PCR_HZ;
                if secs < 120.0 {
                    return secs;
                }
                self.wall_start.elapsed().as_secs_f64()
            }
            _ => self.wall_start.elapsed().as_secs_f64(),
        }
    }

    fn begin_segment(&mut self) {
        self.cur.clear();
        if let Some(pat) = &self.pat {
            self.cur.extend_from_slice(pat);
        }
        if let Some(pmt) = &self.pmt {
            self.cur.extend_from_slice(pmt);
        }
        self.seg_pcr_start = self.last_pcr;
        self.wall_start = Instant::now();
    }

    pub fn feed(&mut self, chunk: &[u8]) -> Vec<(f64, Bytes)> {
        self.carry.extend_from_slice(chunk);
        let mut out = Vec::new();
        let mut i = 0;
        while self.carry.len() - i >= PKT {
            if self.carry[i] != SYNC || (self.carry.len() - i >= PKT * 2 && self.carry[i + PKT] != SYNC) {
                i += 1;
                continue;
            }
            let mut pkt = [0u8; PKT];
            pkt.copy_from_slice(&self.carry[i..i + PKT]);
            i += PKT;
            let pid = pid_of(&pkt);

            if pid == 0 && pusi(&pkt) {
                self.pmt_pid = parse_pat(&pkt).or(self.pmt_pid);
                self.pat = Some(pkt);
            } else if Some(pid) == self.pmt_pid && pusi(&pkt) {
                if let Some(v) = parse_pmt_video(&pkt) {
                    self.video_pid = Some(v);
                }
                if let Some((start, _)) = section(&pkt) {
                    if start + 10 <= PKT {
                        self.pcr_pid = Some((((pkt[start + 8] & 0x1f) as u16) << 8) | pkt[start + 9] as u16);
                    }
                }
                self.pmt = Some(pkt);
            }

            if self.pcr_pid.map_or(true, |p| p == pid) {
                if let Some(v) = pcr(&pkt) {
                    self.last_pcr = Some(v);
                    if self.seg_pcr_start.is_none() {
                        self.seg_pcr_start = Some(v);
                    }
                }
            }

            let is_key = Some(pid) == self.video_pid && pusi(&pkt) && random_access(&pkt);
            if is_key {
                self.rai_seen = true;
            }
            let elapsed = self.elapsed();
            let boundary = is_key || (!self.rai_seen && ((pid == 0 && pusi(&pkt)) || self.pat.is_none()));
            let has_media = self.cur.len() > PKT * 4;
            if has_media && ((elapsed >= self.target && boundary) || elapsed >= self.target * 4.0) {
                out.push((elapsed.max(0.1), self.cur.split().freeze()));
                self.begin_segment();
                if pid == 0 || Some(pid) == self.pmt_pid {
                    continue;
                }
            } else if self.cur.is_empty() && pid != 0 {
                self.begin_segment();
            }
            self.cur.extend_from_slice(&pkt);
        }
        self.carry.drain(..i);
        out
    }
}

pub async fn run(
    session: Arc<Session>,
    http: reqwest::Client,
    url: String,
    headers: HashMap<String, String>,
) -> Result<()> {
    let mut attempts = 0u32;
    let mut produced_any = false;
    loop {
        if session.cancel.is_cancelled() {
            return Ok(());
        }
        let started = Instant::now();
        let res = apply_headers(http.get(&url), &headers).send().await.and_then(|r| r.error_for_status());
        let res = match res {
            Ok(r) => r,
            Err(e) => {
                attempts += 1;
                if attempts > 5 {
                    return Err(e.into());
                }
                tokio::time::sleep(Duration::from_secs(2u64.pow(attempts.min(4)))).await;
                continue;
            }
        };

        let mut seg = Segmenter::new(2.0);
        let mut stream = res.bytes_stream();
        loop {
            let next = tokio::select! {
                _ = session.cancel.cancelled() => return Ok(()),
                n = tokio::time::timeout(Duration::from_secs(20), stream.next()) => n,
            };
            match next {
                Ok(Some(Ok(chunk))) => {
                    for (dur, bytes) in seg.feed(&chunk) {
                        session.push(dur, bytes).await?;
                        produced_any = true;
                    }
                }
                Ok(Some(Err(e))) => {
                    log::debug!("ts stream error: {e}");
                    break;
                }
                Ok(None) => break,
                Err(_) => {
                    log::debug!("ts stream stalled");
                    break;
                }
            }
        }

        if started.elapsed() > Duration::from_secs(30) {
            attempts = 0;
        }
        attempts += 1;
        if attempts > 5 {
            return Err(Error::msg(if produced_any { "live stream disconnected" } else { "stream produced no data" }));
        }
        session.mark_discontinuity().await;
        tokio::time::sleep(Duration::from_millis(500 * attempts as u64)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn packet(pid: u16, pusi: bool, rai: bool, pcr_val: Option<u64>) -> [u8; PKT] {
        let mut p = [0xffu8; PKT];
        p[0] = SYNC;
        p[1] = ((pusi as u8) << 6) | ((pid >> 8) as u8 & 0x1f);
        p[2] = pid as u8;
        if rai || pcr_val.is_some() {
            p[3] = 0x30;
            p[4] = 7;
            p[5] = if rai { 0x40 } else { 0 } | if pcr_val.is_some() { 0x10 } else { 0 };
            if let Some(v) = pcr_val {
                p[6] = (v >> 25) as u8;
                p[7] = (v >> 17) as u8;
                p[8] = (v >> 9) as u8;
                p[9] = (v >> 1) as u8;
                p[10] = ((v & 1) << 7) as u8;
            }
        } else {
            p[3] = 0x10;
        }
        p
    }

    #[test]
    fn extracts_pcr() {
        let p = packet(256, false, false, Some(123_456_789));
        assert_eq!(pcr(&p), Some(123_456_789));
    }

    #[test]
    fn cuts_segments_on_pcr_time() {
        let mut s = Segmenter::new(2.0);
        let mut stream = Vec::new();
        for i in 0..200u64 {
            stream.extend_from_slice(&packet(256, true, false, Some(i * 9_000)));
        }
        let segs = s.feed(&stream);
        assert!(segs.len() >= 8, "got {} segments", segs.len());
        for (d, b) in &segs {
            assert!((*d - 2.0).abs() < 0.2, "duration {d}");
            assert_eq!(b.len() % PKT, 0);
        }
    }

    #[test]
    fn resyncs_after_garbage() {
        let mut s = Segmenter::new(2.0);
        let mut stream = vec![0x00, 0x12, 0x47];
        for i in 0..60u64 {
            stream.extend_from_slice(&packet(256, true, false, Some(i * 9_000)));
        }
        let segs = s.feed(&stream);
        assert!(!segs.is_empty());
        assert!(segs.iter().all(|(_, b)| b[0] == SYNC));
    }
}
