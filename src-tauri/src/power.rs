use std::sync::{mpsc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

pub struct DontSleepManager {
    worker: Mutex<Option<DontSleepWorker>>,
}

impl DontSleepManager {
    pub fn new() -> Self {
        Self {
            worker: Mutex::new(None),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.worker
            .lock()
            .map(|worker| worker.is_some())
            .unwrap_or(false)
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<bool, String> {
        let mut worker = self
            .worker
            .lock()
            .map_err(|_| "Don't Sleep state is unavailable".to_string())?;

        if enabled {
            if worker.is_none() {
                *worker = Some(DontSleepWorker::start()?);
            }
            return Ok(true);
        }

        if let Some(active_worker) = worker.take() {
            active_worker.stop()?;
        }
        Ok(false)
    }
}

struct DontSleepWorker {
    stop_tx: mpsc::Sender<()>,
    handle: JoinHandle<Result<(), String>>,
}

impl DontSleepWorker {
    fn start() -> Result<Self, String> {
        let (ready_tx, ready_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let handle = thread::Builder::new()
            .name("AdminDeck Don't Sleep".to_string())
            .spawn(move || platform::run_dont_sleep_worker(stop_rx, ready_tx))
            .map_err(|error| format!("failed to start Don't Sleep worker: {error}"))?;

        match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => Ok(Self { stop_tx, handle }),
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(error)
            }
            Err(error) => {
                let _ = stop_tx.send(());
                let _ = handle.join();
                Err(format!("Don't Sleep worker did not start: {error}"))
            }
        }
    }

    fn stop(self) -> Result<(), String> {
        let _ = self.stop_tx.send(());
        self.handle
            .join()
            .map_err(|_| "Don't Sleep worker panicked".to_string())?
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::{mem, ptr, sync::mpsc, time::Duration};

    use windows_sys::Win32::{
        Foundation::{GetLastError, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        System::{
            LibraryLoader::GetModuleHandleW,
            Power::{
                SetThreadExecutionState, ES_AWAYMODE_REQUIRED, ES_CONTINUOUS, ES_SYSTEM_REQUIRED,
            },
            Shutdown::{ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy},
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW,
            RegisterClassW, TranslateMessage, UnregisterClassW, CW_USEDEFAULT, MSG, PM_REMOVE,
            WM_ENDSESSION, WM_QUERYENDSESSION, WNDCLASSW, WS_OVERLAPPED,
        },
    };

    const WINDOW_CLASS: &str = "AdminDeckDontSleepWindow";
    const WINDOW_TITLE: &str = "AdminDeck Don't Sleep";
    const SHUTDOWN_REASON: &str = "AdminDeck Don't Sleep mode is enabled.";

    pub fn run_dont_sleep_worker(
        stop_rx: mpsc::Receiver<()>,
        ready_tx: mpsc::Sender<Result<(), String>>,
    ) -> Result<(), String> {
        let mut guard = match DontSleepGuard::new() {
            Ok(guard) => {
                let _ = ready_tx.send(Ok(()));
                guard
            }
            Err(error) => {
                let _ = ready_tx.send(Err(error.clone()));
                return Err(error);
            }
        };

        loop {
            guard.pump_messages();
            match stop_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }

        Ok(())
    }

    struct DontSleepGuard {
        class_name: Vec<u16>,
        hwnd: HWND,
        instance: HINSTANCE,
        shutdown_block_reason_registered: bool,
        window_destroyed: bool,
    }

    impl DontSleepGuard {
        fn new() -> Result<Self, String> {
            let class_name = wide_string(WINDOW_CLASS);
            let window_title = wide_string(WINDOW_TITLE);
            let shutdown_reason = wide_string(SHUTDOWN_REASON);

            unsafe {
                let instance = GetModuleHandleW(ptr::null());
                if instance.is_null() {
                    return Err(format!(
                        "failed to resolve module handle: Windows error {}",
                        GetLastError()
                    ));
                }

                let window_class = WNDCLASSW {
                    lpfnWndProc: Some(dont_sleep_window_proc),
                    hInstance: instance,
                    lpszClassName: class_name.as_ptr(),
                    ..mem::zeroed()
                };

                if RegisterClassW(&window_class) == 0 {
                    return Err(format!(
                        "failed to register Don't Sleep window class: Windows error {}",
                        GetLastError()
                    ));
                }

                let hwnd = CreateWindowExW(
                    0,
                    class_name.as_ptr(),
                    window_title.as_ptr(),
                    WS_OVERLAPPED,
                    CW_USEDEFAULT,
                    CW_USEDEFAULT,
                    0,
                    0,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    instance,
                    ptr::null(),
                );

                if hwnd.is_null() {
                    let _ = UnregisterClassW(class_name.as_ptr(), instance);
                    return Err(format!(
                        "failed to create Don't Sleep shutdown window: Windows error {}",
                        GetLastError()
                    ));
                }

                if ShutdownBlockReasonCreate(hwnd, shutdown_reason.as_ptr()) == 0 {
                    let _ = DestroyWindow(hwnd);
                    let _ = UnregisterClassW(class_name.as_ptr(), instance);
                    return Err(format!(
                        "failed to register Don't Sleep shutdown block reason: Windows error {}",
                        GetLastError()
                    ));
                }

                let full_flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED;
                let base_flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED;
                if SetThreadExecutionState(full_flags) == 0
                    && SetThreadExecutionState(base_flags) == 0
                {
                    let _ = ShutdownBlockReasonDestroy(hwnd);
                    let _ = DestroyWindow(hwnd);
                    let _ = UnregisterClassW(class_name.as_ptr(), instance);
                    return Err(format!(
                        "failed to enable Windows execution state: Windows error {}",
                        GetLastError()
                    ));
                }

                Ok(Self {
                    class_name,
                    hwnd,
                    instance,
                    shutdown_block_reason_registered: true,
                    window_destroyed: false,
                })
            }
        }

        fn pump_messages(&mut self) {
            unsafe {
                let mut message: MSG = mem::zeroed();
                while PeekMessageW(&mut message, self.hwnd, 0, 0, PM_REMOVE) != 0 {
                    let _ = TranslateMessage(&message);
                    let _ = DispatchMessageW(&message);
                }
            }
        }

        fn teardown(&mut self) {
            unsafe {
                let _ = SetThreadExecutionState(ES_CONTINUOUS);
                if self.shutdown_block_reason_registered {
                    let _ = ShutdownBlockReasonDestroy(self.hwnd);
                    self.shutdown_block_reason_registered = false;
                }
                if !self.window_destroyed {
                    let _ = DestroyWindow(self.hwnd);
                    self.window_destroyed = true;
                }
                let _ = UnregisterClassW(self.class_name.as_ptr(), self.instance);
            }
        }
    }

    impl Drop for DontSleepGuard {
        fn drop(&mut self) {
            self.teardown();
        }
    }

    unsafe extern "system" fn dont_sleep_window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match message {
            WM_QUERYENDSESSION => 0,
            WM_ENDSESSION => 0,
            _ => unsafe { DefWindowProcW(hwnd, message, wparam, lparam) },
        }
    }

    fn wide_string(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use std::sync::mpsc;

    pub fn run_dont_sleep_worker(
        _stop_rx: mpsc::Receiver<()>,
        ready_tx: mpsc::Sender<Result<(), String>>,
    ) -> Result<(), String> {
        let error = "Don't Sleep is currently available on Windows.".to_string();
        let _ = ready_tx.send(Err(error.clone()));
        Err(error)
    }
}
