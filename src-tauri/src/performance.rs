use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub struct PerformanceMonitor {
    started_at: Instant,
    last_ssh_terminal_ready: Mutex<Option<TerminalReadyMeasurement>>,
    host_usage: Mutex<HostUsageState>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUsageSnapshot {
    cpu_percent: Option<f64>,
    ram_percent: Option<f64>,
    network_downstream_bytes_per_second: Option<f64>,
    network_upstream_bytes_per_second: Option<f64>,
    sampled_at_unix_seconds: u64,
    source: &'static str,
}

#[derive(Clone, Copy)]
struct TerminalReadyMeasurement {
    duration_ms: u128,
    recorded_at_unix_seconds: u64,
}

#[derive(Default)]
struct HostUsageState {
    previous_cpu: Option<SystemCpuTimes>,
    previous_network: Option<NetworkSample>,
}

#[derive(Clone, Copy)]
struct SystemCpuTimes {
    idle: u64,
    kernel: u64,
    user: u64,
}

#[derive(Clone, Copy)]
struct NetworkSample {
    in_bytes: u64,
    out_bytes: u64,
    sampled_at: Instant,
}

struct NetworkTransferRates {
    downstream_bytes_per_second: f64,
    upstream_bytes_per_second: f64,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            last_ssh_terminal_ready: Mutex::new(None),
            host_usage: Mutex::new(HostUsageState::default()),
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

    pub fn host_usage_snapshot(&self) -> HostUsageSnapshot {
        let mut state = self.host_usage.lock().ok();
        let state = state.as_deref_mut();
        let (cpu_percent, ram_percent, network_transfer_rates, source) = host_usage_counters(state);
        HostUsageSnapshot {
            cpu_percent: clamp_percent(cpu_percent),
            ram_percent: clamp_percent(ram_percent),
            network_downstream_bytes_per_second: network_transfer_rates
                .as_ref()
                .map(|rates| rates.downstream_bytes_per_second)
                .filter(|value| value.is_finite())
                .map(|value| value.max(0.0)),
            network_upstream_bytes_per_second: network_transfer_rates
                .as_ref()
                .map(|rates| rates.upstream_bytes_per_second)
                .filter(|value| value.is_finite())
                .map(|value| value.max(0.0)),
            sampled_at_unix_seconds: unix_seconds(),
            source,
        }
    }
}

fn clamp_percent(value: Option<f64>) -> Option<f64> {
    value
        .filter(|value| value.is_finite())
        .map(|value| value.clamp(0.0, 100.0))
}

#[cfg(target_os = "windows")]
fn host_usage_counters(
    state: Option<&mut HostUsageState>,
) -> (
    Option<f64>,
    Option<f64>,
    Option<NetworkTransferRates>,
    &'static str,
) {
    let ram_percent = windows_memory_percent();
    let cpu_times = windows_cpu_times();
    let network_sample = windows_network_sample();

    let Some(state) = state else {
        return (None, ram_percent, None, "windows-win32-stateless");
    };

    let cpu_percent = cpu_times.and_then(|current| {
        let previous = state.previous_cpu.replace(current)?;
        cpu_usage_between(previous, current)
    });
    if cpu_times.is_none() {
        state.previous_cpu = None;
    }

    let network_transfer_rates = network_sample.and_then(|current| {
        let previous = state.previous_network.replace(current)?;
        network_transfer_rates_between(previous, current)
    });
    if network_sample.is_none() {
        state.previous_network = None;
    }

    (
        cpu_percent,
        ram_percent,
        network_transfer_rates,
        "windows-win32",
    )
}

#[cfg(not(target_os = "windows"))]
fn host_usage_counters(
    _state: Option<&mut HostUsageState>,
) -> (
    Option<f64>,
    Option<f64>,
    Option<NetworkTransferRates>,
    &'static str,
) {
    (None, None, None, "unsupported-platform")
}

fn cpu_usage_between(previous: SystemCpuTimes, current: SystemCpuTimes) -> Option<f64> {
    let idle = current.idle.checked_sub(previous.idle)?;
    let kernel = current.kernel.checked_sub(previous.kernel)?;
    let user = current.user.checked_sub(previous.user)?;
    let total = kernel.checked_add(user)?;
    if total == 0 {
        return None;
    }
    let busy = total.saturating_sub(idle);
    Some((busy as f64 / total as f64) * 100.0)
}

fn network_transfer_rates_between(
    previous: NetworkSample,
    current: NetworkSample,
) -> Option<NetworkTransferRates> {
    let in_bytes = current.in_bytes.checked_sub(previous.in_bytes)?;
    let out_bytes = current.out_bytes.checked_sub(previous.out_bytes)?;
    let elapsed = current
        .sampled_at
        .checked_duration_since(previous.sampled_at)?;
    let seconds = elapsed.as_secs_f64();
    if seconds <= 0.0 {
        return None;
    }
    Some(NetworkTransferRates {
        downstream_bytes_per_second: in_bytes as f64 / seconds,
        upstream_bytes_per_second: out_bytes as f64 / seconds,
    })
}

#[cfg(target_os = "windows")]
fn windows_memory_percent() -> Option<f64> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::System::{
        ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION},
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
    };

    unsafe {
        let mut status: MEMORYSTATUSEX = zeroed();
        status.dwLength = size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 {
            return Some(status.dwMemoryLoad as f64);
        }

        let mut info: PERFORMANCE_INFORMATION = zeroed();
        info.cb = size_of::<PERFORMANCE_INFORMATION>() as u32;
        if GetPerformanceInfo(&mut info, info.cb) != 0 && info.PhysicalTotal > 0 {
            let used_pages = info.PhysicalTotal.saturating_sub(info.PhysicalAvailable);
            return Some((used_pages as f64 / info.PhysicalTotal as f64) * 100.0);
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn windows_cpu_times() -> Option<SystemCpuTimes> {
    use std::mem::zeroed;
    use windows_sys::Win32::{Foundation::FILETIME, System::Threading::GetSystemTimes};

    unsafe {
        let mut idle: FILETIME = zeroed();
        let mut kernel: FILETIME = zeroed();
        let mut user: FILETIME = zeroed();
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 {
            return None;
        }
        Some(SystemCpuTimes {
            idle: filetime_to_u64(idle),
            kernel: filetime_to_u64(kernel),
            user: filetime_to_u64(user),
        })
    }
}

#[cfg(target_os = "windows")]
fn filetime_to_u64(filetime: windows_sys::Win32::Foundation::FILETIME) -> u64 {
    ((filetime.dwHighDateTime as u64) << 32) | filetime.dwLowDateTime as u64
}

#[cfg(target_os = "windows")]
fn windows_network_sample() -> Option<NetworkSample> {
    use std::{ptr::null_mut, slice};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        FreeMibTable, GetIfTable2, MIB_IF_TABLE2,
    };

    unsafe {
        let mut table: *mut MIB_IF_TABLE2 = null_mut();
        if GetIfTable2(&mut table) != 0 || table.is_null() {
            return None;
        }

        let rows = slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        let (in_bytes, out_bytes) =
            rows.iter()
                .fold((0_u64, 0_u64), |(in_total, out_total), row| {
                    (
                        in_total.saturating_add(row.InOctets),
                        out_total.saturating_add(row.OutOctets),
                    )
                });
        FreeMibTable(table.cast());

        Some(NetworkSample {
            in_bytes,
            out_bytes,
            sampled_at: Instant::now(),
        })
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

    #[test]
    fn host_usage_percentages_are_clamped() {
        assert_eq!(clamp_percent(Some(-10.0)), Some(0.0));
        assert_eq!(clamp_percent(Some(37.5)), Some(37.5));
        assert_eq!(clamp_percent(Some(125.0)), Some(100.0));
        assert_eq!(clamp_percent(Some(f64::NAN)), None);
    }

    #[test]
    fn cpu_usage_calculates_busy_percentage_from_deltas() {
        let previous = SystemCpuTimes {
            idle: 100,
            kernel: 300,
            user: 100,
        };
        let current = SystemCpuTimes {
            idle: 150,
            kernel: 500,
            user: 200,
        };

        assert_eq!(
            cpu_usage_between(previous, current),
            Some(250.0 / 300.0 * 100.0)
        );
    }

    #[test]
    fn network_usage_calculates_transfer_rates_from_deltas() {
        let start = Instant::now();
        let previous = NetworkSample {
            in_bytes: 1_000,
            out_bytes: 2_000,
            sampled_at: start,
        };
        let current = NetworkSample {
            in_bytes: 6_000,
            out_bytes: 17_000,
            sampled_at: start + Duration::from_secs(5),
        };

        let rates = network_transfer_rates_between(previous, current).unwrap();
        assert_eq!(rates.downstream_bytes_per_second, 1_000.0);
        assert_eq!(rates.upstream_bytes_per_second, 3_000.0);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_snapshot_reports_working_set() {
        let snapshot = PerformanceMonitor::new().snapshot();

        assert!(snapshot.working_set_bytes.unwrap_or_default() > 0);
        assert_eq!(snapshot.memory_source, "windows-working-set");
    }
}
