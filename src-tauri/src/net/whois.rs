//! WHOIS lookups via TCP/43 to whois.iana.org for referral, then to the responsible server.

use crate::net::NetError;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

const PER_OP_TIMEOUT_MS: u64 = 30_000;
const IANA_SERVER: &str = "whois.iana.org:43";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoisResult {
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed: Option<HashMap<String, String>>,
}

pub async fn lookup(domain: &str) -> Result<WhoisResult, NetError> {
    let d = domain.trim().to_ascii_lowercase();
    if !is_valid_domain_query(&d) {
        return Err(NetError::invalid("expected a valid domain (e.g. example.com)"));
    }
    let fut = async {
        let iana = whois_query(IANA_SERVER, &d).await?;
        let referral_server = extract_referral(&iana);
        let raw = if let Some(server) = referral_server {
            whois_query(&format!("{}:43", server), &d).await.unwrap_or(iana)
        } else {
            iana
        };
        let parsed = parse_kv(&raw);
        Ok::<_, NetError>(WhoisResult { raw, parsed: if parsed.is_empty() { None } else { Some(parsed) } })
    };
    timeout(Duration::from_millis(PER_OP_TIMEOUT_MS), fut)
        .await
        .map_err(|_| NetError::Timeout)?
}

fn is_valid_domain_query(value: &str) -> bool {
    if value.is_empty() || value.len() > 253 || !value.contains('.') {
        return false;
    }
    value
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
}

async fn whois_query(server: &str, query: &str) -> Result<String, NetError> {
    let mut stream = TcpStream::connect(server).await
        .map_err(|_| NetError::Unreachable)?;
    stream.write_all(format!("{}\r\n", query).as_bytes()).await
        .map_err(|e| NetError::internal(e.to_string()))?;
    let mut buf = Vec::with_capacity(8192);
    stream.read_to_end(&mut buf).await
        .map_err(|e| NetError::internal(e.to_string()))?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn extract_referral(text: &str) -> Option<String> {
    for line in text.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("refer:").or_else(|| l.strip_prefix("whois:")) {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn parse_kv(text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('%') || l.starts_with('#') { continue; }
        if let Some(idx) = l.find(':') {
            let key = l[..idx].trim().to_ascii_lowercase();
            let val = l[idx + 1..].trim().to_string();
            if !key.is_empty() && !val.is_empty() {
                out.entry(key).or_insert(val);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_invalid_domain() {
        assert!(matches!(lookup("not-a-domain").await.unwrap_err(), NetError::InvalidArgument { .. }));
        assert!(matches!(lookup("").await.unwrap_err(), NetError::InvalidArgument { .. }));
    }

    #[tokio::test]
    async fn rejects_query_with_control_characters() {
        let err = lookup("example.com\r\nwhois.evil.test").await.unwrap_err();
        assert!(matches!(err, NetError::InvalidArgument { .. }));
    }

    #[test]
    fn parse_kv_extracts_pairs() {
        let sample = "domain: example.com\n% comment\nregistrar: Example Inc\nempty:\n";
        let kv = parse_kv(sample);
        assert_eq!(kv.get("domain"), Some(&"example.com".to_string()));
        assert_eq!(kv.get("registrar"), Some(&"Example Inc".to_string()));
        assert!(!kv.contains_key("empty"));
    }

    #[test]
    fn extract_referral_finds_refer_line() {
        let sample = "domain: example\nrefer: whois.verisign-grs.com\n";
        assert_eq!(extract_referral(sample), Some("whois.verisign-grs.com".into()));
    }
}
