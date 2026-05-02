use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub struct PerformanceMonitor {
    started_at: Instant,
    last_ssh_terminal_ready: Mutex<Option<TerminalReadyMeasurement>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceSnapshot {
    uptime_ms: u128,
    working_set_bytes: Option<u64>,
    memory_source: &'static str,
    last_ssh_terminal_ready_ms: Option<u128>,
    last_ssh_terminal_ready_at_unix_seconds: Option<u64>,
}

#[derive(Clone, Copy)]
struct TerminalReadyMeasurement {
    duration_ms: u128,
    recorded_at_unix_seconds: u64,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            last_ssh_terminal_ready: Mutex::new(None),
        }
    }

    pub fn snapshot(&self) -> PerformanceSnapshot {
        let (working_set_bytes, memory_source) = process_working_set_bytes();
        let last_ssh_terminal_ready = self
            .last_ssh_terminal_ready
            .lock()
            .ok()
            .and_then(|measurement| *measurement);
        PerformanceSnapshot {
            uptime_ms: self.started_at.elapsed().as_millis(),
            working_set_bytes,
            memory_source,
            last_ssh_terminal_ready_ms: last_ssh_terminal_ready
                .map(|measurement| measurement.duration_ms),
            last_ssh_terminal_ready_at_unix_seconds: last_ssh_terminal_ready
                .map(|measurement| measurement.recorded_at_unix_seconds),
        }
    }

    pub fn record_ssh_terminal_ready(&self, duration_ms: u128) {
        if let Ok(mut measurement) = self.last_ssh_terminal_ready.lock() {
            *measurement = Some(TerminalReadyMeasurement {
                duration_ms,
                recorded_at_unix_seconds: unix_seconds(),
            });
        }
    }
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn process_working_set_bytes() -> (Option<u64>, &'static str) {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::System::{
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::GetCurrentProcess,
    };

    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS = zeroed();
        counters.cb = size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let success = GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb) != 0;
        if success {
            (Some(counters.WorkingSetSize as u64), "windows-working-set")
        } else {
            (None, "windows-working-set-unavailable")
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn process_working_set_bytes() -> (Option<u64>, &'static str) {
    (None, "unsupported-platform")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{thread, time::Duration};

    #[test]
    fn snapshot_reports_monotonic_uptime() {
        let monitor = PerformanceMonitor::new();
        let first = monitor.snapshot();
        thread::sleep(Duration::from_millis(1));
        let second = monitor.snapshot();

        assert!(second.uptime_ms >= first.uptime_ms);
        assert!(!second.memory_source.is_empty());
    }

    #[test]
    fn snapshot_reports_last_ssh_terminal_ready_measurement() {
        let monitor = PerformanceMonitor::new();

        monitor.record_ssh_terminal_ready(42);
        let snapshot = monitor.snapshot();

        assert_eq!(snapshot.last_ssh_terminal_ready_ms, Some(42));
        assert!(
            snapshot
                .last_ssh_terminal_ready_at_unix_seconds
                .unwrap_or_default()
                > 0
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_snapshot_reports_working_set() {
        let snapshot = PerformanceMonitor::new().snapshot();

        assert!(snapshot.working_set_bytes.unwrap_or_default() > 0);
        assert_eq!(snapshot.memory_source, "windows-working-set");
    }
}
