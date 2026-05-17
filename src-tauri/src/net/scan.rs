//! TCP-connect port checks and full-range port scans.
//!
//! AV mitigations (spec §10):
//! - TCP full-connect only (no SYN/half-open). Uses `tokio::net::TcpStream::connect`.
//! - Inter-connection jitter (default 5ms) to break burst-SYN heuristics.
//! - Hard caps: max 1024 ports per call, max 64 concurrent connections.

use crate::net::NetError;
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Semaphore};
use tokio_util::sync::CancellationToken;

pub const DEFAULT_CONNECT_TIMEOUT_MS: u64 = 1500;
pub const MAX_PORTS_PER_SCAN: usize = 1024;
pub const SCAN_CONCURRENCY: usize = 64;
pub const SCAN_JITTER_MS: u64 = 5;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpCheckResult {
    pub open: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<NetError>,
}

pub async fn tcp_check(host: &str, port: u16, timeout_ms: Option<u64>) -> TcpCheckResult {
    let host = host.trim();
    if host.is_empty() {
        return TcpCheckResult {
            open: false, rtt_ms: None,
            error: Some(NetError::invalid("host is required")),
        };
    }
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_CONNECT_TIMEOUT_MS));
    let addr_str = format!("{}:{}", host, port);

    let start = Instant::now();
    let lookup = match tokio::net::lookup_host(&addr_str).await {
        Ok(it) => it.collect::<Vec<SocketAddr>>(),
        Err(e) => {
            return TcpCheckResult {
                open: false, rtt_ms: None,
                error: Some(NetError::HostNotFound { reason: e.to_string() }),
            };
        }
    };
    if lookup.is_empty() {
        return TcpCheckResult {
            open: false, rtt_ms: None,
            error: Some(NetError::HostNotFound { reason: "no addresses".into() }),
        };
    }
    let target = lookup[0];

    match tokio::time::timeout(timeout, TcpStream::connect(target)).await {
        Ok(Ok(_stream)) => TcpCheckResult {
            open: true,
            rtt_ms: Some(start.elapsed().as_millis()),
            error: None,
        },
        Ok(Err(e)) => {
            let mapped = match e.kind() {
                std::io::ErrorKind::ConnectionRefused => NetError::Refused,
                std::io::ErrorKind::TimedOut => NetError::Timeout,
                std::io::ErrorKind::PermissionDenied => NetError::PermissionDenied { hint: e.to_string() },
                _ => NetError::Unreachable,
            };
            TcpCheckResult { open: false, rtt_ms: None, error: Some(mapped) }
        }
        Err(_) => TcpCheckResult {
            open: false, rtt_ms: None, error: Some(NetError::Timeout),
        },
    }
}

#[derive(Debug, Clone)]
pub struct PortScanOptions {
    pub concurrency: usize,
    pub timeout_ms: u64,
    pub jitter_ms: u64,
}

impl Default for PortScanOptions {
    fn default() -> Self {
        Self {
            concurrency: SCAN_CONCURRENCY,
            timeout_ms: DEFAULT_CONNECT_TIMEOUT_MS,
            jitter_ms: SCAN_JITTER_MS,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortResult {
    pub port: u16,
    pub open: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner: Option<String>,
}

pub fn validate_ports(ports: &[u16]) -> Result<(), NetError> {
    if ports.is_empty() {
        return Err(NetError::invalid("at least one port required"));
    }
    if ports.len() > MAX_PORTS_PER_SCAN {
        return Err(NetError::invalid(format!(
            "max {} ports per scan; got {}",
            MAX_PORTS_PER_SCAN, ports.len()
        )));
    }
    Ok(())
}

pub fn enforce_concurrency_cap(requested: usize) -> usize {
    requested.clamp(1, SCAN_CONCURRENCY)
}

pub fn enforce_jitter_floor(requested: u64) -> u64 {
    requested.max(SCAN_JITTER_MS)
}

pub async fn run_port_scan(
    host: &str,
    ports: Vec<u16>,
    opts: PortScanOptions,
    cancel: CancellationToken,
    out: mpsc::UnboundedSender<PortResult>,
) -> Result<(), NetError> {
    validate_ports(&ports)?;
    let host_owned = host.to_string();
    let concurrency = enforce_concurrency_cap(opts.concurrency);
    let jitter = enforce_jitter_floor(opts.jitter_ms);
    let timeout_ms = opts.timeout_ms;

    let sem = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(ports.len());
    for (idx, port) in ports.into_iter().enumerate() {
        if cancel.is_cancelled() { break; }
        if idx > 0 && jitter > 0 {
            tokio::time::sleep(Duration::from_millis(jitter)).await;
        }
        let sem = sem.clone();
        let host_clone = host_owned.clone();
        let tx = out.clone();
        let cancel_clone = cancel.clone();
        let handle = tokio::spawn(async move {
            let _permit = match sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };
            if cancel_clone.is_cancelled() { return; }
            let r = tcp_check(&host_clone, port, Some(timeout_ms)).await;
            let _ = tx.send(PortResult {
                port, open: r.open, rtt_ms: r.rtt_ms, banner: None,
            });
        });
        handles.push(handle);
    }
    for h in handles {
        let _ = h.await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn tcp_check_empty_host_is_invalid() {
        let r = tcp_check("", 80, None).await;
        assert!(!r.open);
        assert!(matches!(r.error, Some(NetError::InvalidArgument { .. })));
    }

    #[tokio::test]
    async fn tcp_check_open_port_is_open() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { loop { let _ = listener.accept().await; } });
        let r = tcp_check("127.0.0.1", port, Some(2000)).await;
        assert!(r.open, "expected open, got {:?}", r);
        assert!(r.rtt_ms.is_some());
    }

    #[tokio::test]
    async fn tcp_check_closed_port_reports_error() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let r = tcp_check("127.0.0.1", port, Some(2000)).await;
        assert!(!r.open);
        assert!(r.error.is_some());
    }

    #[test]
    fn validate_ports_rejects_empty() {
        assert!(matches!(validate_ports(&[]).unwrap_err(), NetError::InvalidArgument { .. }));
    }

    #[test]
    fn validate_ports_rejects_oversized() {
        let too_many = vec![80u16; MAX_PORTS_PER_SCAN + 1];
        assert!(matches!(validate_ports(&too_many).unwrap_err(), NetError::InvalidArgument { .. }));
    }

    #[test]
    fn concurrency_cap_enforced() {
        assert_eq!(enforce_concurrency_cap(0), 1);
        assert_eq!(enforce_concurrency_cap(1000), SCAN_CONCURRENCY);
        assert_eq!(enforce_concurrency_cap(10), 10);
    }

    #[test]
    fn jitter_floor_enforced() {
        assert_eq!(enforce_jitter_floor(0), SCAN_JITTER_MS);
        assert_eq!(enforce_jitter_floor(100), 100);
    }

    #[tokio::test]
    async fn scan_finds_open_port() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open_port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { loop { let _ = listener.accept().await; } });

        let (tx, mut rx) = mpsc::unbounded_channel();
        let cancel = CancellationToken::new();
        run_port_scan(
            "127.0.0.1",
            vec![open_port, open_port.wrapping_add(1), open_port.wrapping_add(2)],
            PortScanOptions { concurrency: 4, timeout_ms: 500, jitter_ms: 1 },
            cancel,
            tx,
        ).await.unwrap();

        let mut results = Vec::new();
        while let Some(r) = rx.recv().await { results.push(r); }
        assert!(results.iter().any(|r| r.open && r.port == open_port),
            "expected port {} open, got {:?}", open_port, results);
    }
}
