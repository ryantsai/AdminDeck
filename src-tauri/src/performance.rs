use serde::Serialize;
use std::time::Instant;

pub struct PerformanceMonitor {
    started_at: Instant,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceSnapshot {
    uptime_ms: u128,
    working_set_bytes: Option<u64>,
    memory_source: &'static str,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }

    pub fn snapshot(&self) -> PerformanceSnapshot {
        let (working_set_bytes, memory_source) = process_working_set_bytes();
        PerformanceSnapshot {
            uptime_ms: self.started_at.elapsed().as_millis(),
            working_set_bytes,
            memory_source,
        }
    }
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

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_snapshot_reports_working_set() {
        let snapshot = PerformanceMonitor::new().snapshot();

        assert!(snapshot.working_set_bytes.unwrap_or_default() > 0);
        assert_eq!(snapshot.memory_source, "windows-working-set");
    }
}
