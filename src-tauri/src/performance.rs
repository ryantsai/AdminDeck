use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub struct PerformanceMonitor {
    started_at: Instant,
    last_ssh_terminal_ready: Mutex<Option<TerminalReadyMeasurement>>,
    host_usage: Mutex<HostUsageState>,
    system_counters: Mutex<SystemPerformanceCountersState>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPerformanceCountersSnapshot {
    cpu_percent: Option<f64>,
    logical_processor_count: Option<u32>,
    ram_percent: Option<f64>,
    ram_total_bytes: Option<u64>,
    ram_available_bytes: Option<u64>,
    commit_percent: Option<f64>,
    commit_total_bytes: Option<u64>,
    commit_limit_bytes: Option<u64>,
    system_cache_bytes: Option<u64>,
    handle_count: Option<u32>,
    process_count: Option<u32>,
    thread_count: Option<u32>,
    network_downstream_bytes_per_second: Option<f64>,
    network_upstream_bytes_per_second: Option<f64>,
    app_working_set_bytes: Option<u64>,
    app_private_bytes: Option<u64>,
    app_pagefile_bytes: Option<u64>,
    app_read_bytes_per_second: Option<f64>,
    app_write_bytes_per_second: Option<f64>,
    app_other_bytes_per_second: Option<f64>,
    system_uptime_seconds: Option<u64>,
    system_drive_total_bytes: Option<u64>,
    system_drive_free_bytes: Option<u64>,
    system_drive_free_percent: Option<f64>,
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

#[derive(Default)]
struct SystemPerformanceCountersState {
    previous_cpu: Option<SystemCpuTimes>,
    previous_network: Option<NetworkSample>,
    previous_process_io: Option<ProcessIoSample>,
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

#[derive(Clone, Copy)]
struct ProcessIoSample {
    read_bytes: u64,
    write_bytes: u64,
    other_bytes: u64,
    sampled_at: Instant,
}

struct ProcessIoRates {
    read_bytes_per_second: f64,
    write_bytes_per_second: f64,
    other_bytes_per_second: f64,
}

#[derive(Default)]
struct SystemMemoryCounters {
    ram_percent: Option<f64>,
    ram_total_bytes: Option<u64>,
    ram_available_bytes: Option<u64>,
    commit_percent: Option<f64>,
    commit_total_bytes: Option<u64>,
    commit_limit_bytes: Option<u64>,
    system_cache_bytes: Option<u64>,
    handle_count: Option<u32>,
    process_count: Option<u32>,
    thread_count: Option<u32>,
}

#[derive(Default)]
struct ProcessMemoryCounters {
    working_set_bytes: Option<u64>,
    private_bytes: Option<u64>,
    pagefile_bytes: Option<u64>,
}

#[derive(Default)]
struct DiskSpaceCounters {
    total_bytes: Option<u64>,
    free_bytes: Option<u64>,
    free_percent: Option<f64>,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            last_ssh_terminal_ready: Mutex::new(None),
            host_usage: Mutex::new(HostUsageState::default()),
            system_counters: Mutex::new(SystemPerformanceCountersState::default()),
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

    pub fn system_performance_counters_snapshot(&self) -> SystemPerformanceCountersSnapshot {
        let mut state = self.system_counters.lock().ok();
        let state = state.as_deref_mut();
        system_performance_counters_snapshot(state)
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

fn process_io_rates_between(
    previous: ProcessIoSample,
    current: ProcessIoSample,
) -> Option<ProcessIoRates> {
    let read_bytes = current.read_bytes.checked_sub(previous.read_bytes)?;
    let write_bytes = current.write_bytes.checked_sub(previous.write_bytes)?;
    let other_bytes = current.other_bytes.checked_sub(previous.other_bytes)?;
    let elapsed = current
        .sampled_at
        .checked_duration_since(previous.sampled_at)?;
    let seconds = elapsed.as_secs_f64();
    if seconds <= 0.0 {
        return None;
    }
    Some(ProcessIoRates {
        read_bytes_per_second: read_bytes as f64 / seconds,
        write_bytes_per_second: write_bytes as f64 / seconds,
        other_bytes_per_second: other_bytes as f64 / seconds,
    })
}

#[cfg(target_os = "windows")]
fn system_performance_counters_snapshot(
    state: Option<&mut SystemPerformanceCountersState>,
) -> SystemPerformanceCountersSnapshot {
    let cpu_times = windows_cpu_times();
    let network_sample = windows_network_sample();
    let process_io_sample = windows_process_io_sample();
    let memory = windows_system_memory_counters();
    let app_memory = windows_process_memory_counters();
    let system_drive = windows_system_drive_space();

    let (cpu_percent, network_transfer_rates, process_io_rates) = if let Some(state) = state {
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

        let process_io_rates = process_io_sample.and_then(|current| {
            let previous = state.previous_process_io.replace(current)?;
            process_io_rates_between(previous, current)
        });
        if process_io_sample.is_none() {
            state.previous_process_io = None;
        }

        (cpu_percent, network_transfer_rates, process_io_rates)
    } else {
        (None, None, None)
    };

    SystemPerformanceCountersSnapshot {
        cpu_percent: clamp_percent(cpu_percent),
        logical_processor_count: logical_processor_count(),
        ram_percent: clamp_percent(memory.ram_percent),
        ram_total_bytes: memory.ram_total_bytes,
        ram_available_bytes: memory.ram_available_bytes,
        commit_percent: clamp_percent(memory.commit_percent),
        commit_total_bytes: memory.commit_total_bytes,
        commit_limit_bytes: memory.commit_limit_bytes,
        system_cache_bytes: memory.system_cache_bytes,
        handle_count: memory.handle_count,
        process_count: memory.process_count,
        thread_count: memory.thread_count,
        network_downstream_bytes_per_second: sanitize_rate(
            network_transfer_rates
                .as_ref()
                .map(|rates| rates.downstream_bytes_per_second),
        ),
        network_upstream_bytes_per_second: sanitize_rate(
            network_transfer_rates.map(|rates| rates.upstream_bytes_per_second),
        ),
        app_working_set_bytes: app_memory.working_set_bytes,
        app_private_bytes: app_memory.private_bytes,
        app_pagefile_bytes: app_memory.pagefile_bytes,
        app_read_bytes_per_second: sanitize_rate(
            process_io_rates
                .as_ref()
                .map(|rates| rates.read_bytes_per_second),
        ),
        app_write_bytes_per_second: sanitize_rate(
            process_io_rates
                .as_ref()
                .map(|rates| rates.write_bytes_per_second),
        ),
        app_other_bytes_per_second: sanitize_rate(
            process_io_rates.map(|rates| rates.other_bytes_per_second),
        ),
        system_uptime_seconds: windows_system_uptime_seconds(),
        system_drive_total_bytes: system_drive.total_bytes,
        system_drive_free_bytes: system_drive.free_bytes,
        system_drive_free_percent: clamp_percent(system_drive.free_percent),
        sampled_at_unix_seconds: unix_seconds(),
        source: "windows-win32-low-overhead",
    }
}

#[cfg(not(target_os = "windows"))]
fn system_performance_counters_snapshot(
    _state: Option<&mut SystemPerformanceCountersState>,
) -> SystemPerformanceCountersSnapshot {
    SystemPerformanceCountersSnapshot {
        cpu_percent: None,
        logical_processor_count: logical_processor_count(),
        ram_percent: None,
        ram_total_bytes: None,
        ram_available_bytes: None,
        commit_percent: None,
        commit_total_bytes: None,
        commit_limit_bytes: None,
        system_cache_bytes: None,
        handle_count: None,
        process_count: None,
        thread_count: None,
        network_downstream_bytes_per_second: None,
        network_upstream_bytes_per_second: None,
        app_working_set_bytes: None,
        app_private_bytes: None,
        app_pagefile_bytes: None,
        app_read_bytes_per_second: None,
        app_write_bytes_per_second: None,
        app_other_bytes_per_second: None,
        system_uptime_seconds: None,
        system_drive_total_bytes: None,
        system_drive_free_bytes: None,
        system_drive_free_percent: None,
        sampled_at_unix_seconds: unix_seconds(),
        source: "unsupported-platform",
    }
}

fn sanitize_rate(value: Option<f64>) -> Option<f64> {
    value
        .filter(|value| value.is_finite())
        .map(|value| value.max(0.0))
}

fn logical_processor_count() -> Option<u32> {
    std::thread::available_parallelism()
        .ok()
        .and_then(|count| u32::try_from(count.get()).ok())
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
fn windows_system_memory_counters() -> SystemMemoryCounters {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::System::{
        ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION},
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
    };

    let mut counters = SystemMemoryCounters::default();

    unsafe {
        let mut status: MEMORYSTATUSEX = zeroed();
        status.dwLength = size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 {
            counters.ram_percent = Some(status.dwMemoryLoad as f64);
            counters.ram_total_bytes = Some(status.ullTotalPhys);
            counters.ram_available_bytes = Some(status.ullAvailPhys);
        }

        let mut info: PERFORMANCE_INFORMATION = zeroed();
        info.cb = size_of::<PERFORMANCE_INFORMATION>() as u32;
        if GetPerformanceInfo(&mut info, info.cb) != 0 {
            let page_size = info.PageSize as u64;
            counters.handle_count = Some(info.HandleCount);
            counters.process_count = Some(info.ProcessCount);
            counters.thread_count = Some(info.ThreadCount);
            counters.commit_total_bytes = pages_to_bytes(info.CommitTotal, page_size);
            counters.commit_limit_bytes = pages_to_bytes(info.CommitLimit, page_size);
            counters.system_cache_bytes = pages_to_bytes(info.SystemCache, page_size);
            counters.commit_percent =
                percent_ratio(info.CommitTotal as u64, info.CommitLimit as u64);

            if counters.ram_total_bytes.is_none() {
                counters.ram_total_bytes = pages_to_bytes(info.PhysicalTotal, page_size);
            }
            if counters.ram_available_bytes.is_none() {
                counters.ram_available_bytes = pages_to_bytes(info.PhysicalAvailable, page_size);
            }
            if counters.ram_percent.is_none() && info.PhysicalTotal > 0 {
                let used_pages = info.PhysicalTotal.saturating_sub(info.PhysicalAvailable);
                counters.ram_percent = percent_ratio(used_pages as u64, info.PhysicalTotal as u64);
            }
        }
    }

    counters
}

fn pages_to_bytes(pages: usize, page_size: u64) -> Option<u64> {
    u64::try_from(pages)
        .ok()
        .and_then(|pages| pages.checked_mul(page_size))
}

fn percent_ratio(numerator: u64, denominator: u64) -> Option<f64> {
    if denominator == 0 {
        None
    } else {
        Some((numerator as f64 / denominator as f64) * 100.0)
    }
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

#[cfg(target_os = "windows")]
fn windows_process_io_sample() -> Option<ProcessIoSample> {
    use std::mem::zeroed;
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetProcessIoCounters, IO_COUNTERS,
    };

    unsafe {
        let mut counters: IO_COUNTERS = zeroed();
        if GetProcessIoCounters(GetCurrentProcess(), &mut counters) == 0 {
            return None;
        }
        Some(ProcessIoSample {
            read_bytes: counters.ReadTransferCount,
            write_bytes: counters.WriteTransferCount,
            other_bytes: counters.OtherTransferCount,
            sampled_at: Instant::now(),
        })
    }
}

#[cfg(target_os = "windows")]
fn windows_process_memory_counters() -> ProcessMemoryCounters {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::System::{
        ProcessStatus::{
            GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
        },
        Threading::GetCurrentProcess,
    };

    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS_EX = zeroed();
        counters.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        let success = GetProcessMemoryInfo(
            GetCurrentProcess(),
            (&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX).cast::<PROCESS_MEMORY_COUNTERS>(),
            counters.cb,
        ) != 0;
        if !success {
            return ProcessMemoryCounters::default();
        }
        ProcessMemoryCounters {
            working_set_bytes: Some(counters.WorkingSetSize as u64),
            private_bytes: Some(counters.PrivateUsage as u64),
            pagefile_bytes: Some(counters.PagefileUsage as u64),
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_system_uptime_seconds() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;

    Some(unsafe { GetTickCount64() / 1_000 })
}

#[cfg(target_os = "windows")]
fn windows_system_drive_space() -> DiskSpaceCounters {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut root = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    if !root.ends_with('\\') {
        root.push('\\');
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(&root)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut available_to_caller = 0_u64;
        let mut total = 0_u64;
        let mut free = 0_u64;
        if GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available_to_caller,
            &mut total,
            &mut free,
        ) == 0
        {
            return DiskSpaceCounters::default();
        }
        DiskSpaceCounters {
            total_bytes: Some(total),
            free_bytes: Some(free),
            free_percent: percent_ratio(free, total),
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

    #[test]
    fn process_io_usage_calculates_transfer_rates_from_deltas() {
        let start = Instant::now();
        let previous = ProcessIoSample {
            read_bytes: 10,
            write_bytes: 100,
            other_bytes: 1_000,
            sampled_at: start,
        };
        let current = ProcessIoSample {
            read_bytes: 2_010,
            write_bytes: 5_100,
            other_bytes: 4_000,
            sampled_at: start + Duration::from_secs(2),
        };

        let rates = process_io_rates_between(previous, current).unwrap();
        assert_eq!(rates.read_bytes_per_second, 1_000.0);
        assert_eq!(rates.write_bytes_per_second, 2_500.0);
        assert_eq!(rates.other_bytes_per_second, 1_500.0);
    }

    #[test]
    fn percent_ratio_ignores_zero_denominator() {
        assert_eq!(percent_ratio(25, 100), Some(25.0));
        assert_eq!(percent_ratio(25, 0), None);
    }

    #[test]
    fn system_performance_counters_snapshot_reports_source_and_timestamp() {
        let snapshot = PerformanceMonitor::new().system_performance_counters_snapshot();

        assert!(!snapshot.source.is_empty());
        assert!(snapshot.sampled_at_unix_seconds > 0);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_snapshot_reports_working_set() {
        let snapshot = PerformanceMonitor::new().snapshot();

        assert!(snapshot.working_set_bytes.unwrap_or_default() > 0);
        assert_eq!(snapshot.memory_source, "windows-working-set");
    }
}
