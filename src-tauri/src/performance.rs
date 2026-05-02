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
