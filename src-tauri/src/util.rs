use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use std::collections::HashMap;
use std::io::Read;

pub fn b64url_decode(s: &str) -> Option<String> {
    let trimmed = s.trim_end_matches('=');
    URL_SAFE_NO_PAD.decode(trimmed).ok().and_then(|b| String::from_utf8(b).ok())
}

pub fn b64url_encode(s: &str) -> String {
    URL_SAFE_NO_PAD.encode(s.as_bytes())
}

pub fn maybe_gunzip(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut out = Vec::with_capacity(bytes.len() * 4);
        if flate2::read::MultiGzDecoder::new(bytes).read_to_end(&mut out).is_ok() {
            return out;
        }
    }
    bytes.to_vec()
}

pub fn apply_headers(mut rb: reqwest::RequestBuilder, headers: &HashMap<String, String>) -> reqwest::RequestBuilder {
    for (k, v) in headers {
        rb = rb.header(k.as_str(), v.as_str());
    }
    rb
}

pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String =
        name.chars()
            .map(|c| {
                if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                    '_'
                } else {
                    c
                }
            })
            .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    let base = if trimmed.is_empty() { "download" } else { trimmed };
    base.chars().take(120).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn b64_roundtrip() {
        let s = "http://example.com/a b?c=1&d=é";
        assert_eq!(b64url_decode(&b64url_encode(s)).as_deref(), Some(s));
    }

    #[test]
    fn sanitizes() {
        assert_eq!(sanitize_filename("A/B: C?"), "A_B_ C_");
        assert_eq!(sanitize_filename("..."), "download");
    }
}
