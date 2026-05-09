use std::{
    env, fs,
    path::{Path, PathBuf},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureScreenshotRequest {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantScreenshot {
    data_url: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredScreenshot {
    id: String,
    path: String,
    file_name: String,
    data_url: String,
    width: u32,
    height: u32,
    captured_at: u128,
    label: String,
    kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListScreenshotsRequest {
    offset: Option<usize>,
    limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListScreenshotsResponse {
    screenshots: Vec<StoredScreenshot>,
    total: usize,
    has_more: bool,
}

#[cfg(target_os = "windows")]
pub fn capture_rect_to_clipboard(
    app: &tauri::AppHandle,
    request: CaptureScreenshotRequest,
) -> Result<(), String> {
    let target = capture_target(app, request)?;
    platform::capture_screen_rect_to_clipboard(
        target.owner_hwnd,
        target.x,
        target.y,
        target.width,
        target.height,
    )
}

#[cfg(target_os = "windows")]
pub fn capture_rect_for_assistant(
    app: &tauri::AppHandle,
    request: CaptureScreenshotRequest,
) -> Result<AssistantScreenshot, String> {
    let target = capture_target(app, request)?;
    let dib =
        platform::capture_screen_rect_to_dib(target.x, target.y, target.width, target.height)?;
    let result = platform::dib_to_jpeg_data_url(&dib, target.width as u32, target.height as u32)?;
    Ok(AssistantScreenshot {
        data_url: result.data_url,
        width: result.width,
        height: result.height,
    })
}

#[cfg(target_os = "windows")]
pub fn capture_fullscreen_for_assistant() -> Result<AssistantScreenshot, String> {
    let target = platform::virtual_screen_rect();
    let dib =
        platform::capture_screen_rect_to_dib(target.x, target.y, target.width, target.height)?;
    let result = platform::dib_to_jpeg_data_url(&dib, target.width as u32, target.height as u32)?;
    Ok(AssistantScreenshot {
        data_url: result.data_url,
        width: result.width,
        height: result.height,
    })
}

#[cfg(target_os = "windows")]
pub fn capture_rect_to_library(
    app: &tauri::AppHandle,
    request: CaptureScreenshotRequest,
    kind: String,
    folder_path: String,
) -> Result<StoredScreenshot, String> {
    let target = capture_target(app, request)?;
    let dib =
        platform::capture_screen_rect_to_dib(target.x, target.y, target.width, target.height)?;
    save_dib_to_library(
        &dib,
        target.width as u32,
        target.height as u32,
        kind,
        &folder_path,
    )
}

#[cfg(target_os = "windows")]
pub fn capture_fullscreen_to_library(
    app: &tauri::AppHandle,
    kind: String,
    folder_path: String,
) -> Result<StoredScreenshot, String> {
    let _guard = MinimizedCaptureWindow::new(app)?;
    let target = platform::virtual_screen_rect();
    let dib =
        platform::capture_screen_rect_to_dib(target.x, target.y, target.width, target.height)?;
    save_dib_to_library(
        &dib,
        target.width as u32,
        target.height as u32,
        kind,
        &folder_path,
    )
}

#[cfg(target_os = "windows")]
pub fn capture_active_window_to_library(
    app: &tauri::AppHandle,
    kind: String,
    folder_path: String,
) -> Result<StoredScreenshot, String> {
    let _guard = MinimizedCaptureWindow::new(app)?;
    let target = platform::foreground_window_rect()?;
    let dib =
        platform::capture_screen_rect_to_dib(target.x, target.y, target.width, target.height)?;
    save_dib_to_library(
        &dib,
        target.width as u32,
        target.height as u32,
        kind,
        &folder_path,
    )
}

#[cfg(target_os = "windows")]
struct CaptureTarget {
    owner_hwnd: windows_sys::Win32::Foundation::HWND,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[cfg(target_os = "windows")]
struct MinimizedCaptureWindow {
    window: tauri::Window,
    was_minimized: bool,
    was_visible: bool,
}

#[cfg(target_os = "windows")]
impl MinimizedCaptureWindow {
    fn new(app: &tauri::AppHandle) -> Result<Self, String> {
        let window = app
            .get_window("main")
            .ok_or_else(|| "main window is not available".to_string())?;
        let was_minimized = window.is_minimized().unwrap_or(false);
        let was_visible = window.is_visible().unwrap_or(true);
        window
            .minimize()
            .map_err(|error| format!("failed to minimize window before screenshot: {error}"))?;
        thread::sleep(std::time::Duration::from_millis(350));
        Ok(Self {
            window,
            was_minimized,
            was_visible,
        })
    }
}

#[cfg(target_os = "windows")]
impl Drop for MinimizedCaptureWindow {
    fn drop(&mut self) {
        if self.was_visible {
            let _ = self.window.show();
        }
        if !self.was_minimized {
            let _ = self.window.unminimize();
            let _ = self.window.set_focus();
        }
    }
}

#[cfg(target_os = "windows")]
fn capture_target(
    app: &tauri::AppHandle,
    request: CaptureScreenshotRequest,
) -> Result<CaptureTarget, String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "main window is not available".to_string())?;
    let inner_position = window
        .inner_position()
        .map_err(|error| format!("failed to resolve window position: {error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("failed to resolve window scale factor: {error}"))?;
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("failed to resolve window handle: {error}"))?;

    let x = inner_position.x + (request.x * scale_factor).round() as i32;
    let y = inner_position.y + (request.y * scale_factor).round() as i32;
    let width = (request.width * scale_factor).round().max(1.0) as i32;
    let height = (request.height * scale_factor).round().max(1.0) as i32;

    Ok(CaptureTarget {
        owner_hwnd: hwnd.0,
        x,
        y,
        width,
        height,
    })
}

#[cfg(not(target_os = "windows"))]
pub fn capture_rect_to_clipboard(
    _app: &tauri::AppHandle,
    _request: CaptureScreenshotRequest,
) -> Result<(), String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn capture_rect_for_assistant(
    _app: &tauri::AppHandle,
    _request: CaptureScreenshotRequest,
) -> Result<AssistantScreenshot, String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn capture_fullscreen_for_assistant() -> Result<AssistantScreenshot, String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn capture_rect_to_library(
    _app: &tauri::AppHandle,
    _request: CaptureScreenshotRequest,
    _kind: String,
    _folder_path: String,
) -> Result<StoredScreenshot, String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn capture_fullscreen_to_library(
    _app: &tauri::AppHandle,
    _kind: String,
    _folder_path: String,
) -> Result<StoredScreenshot, String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn capture_active_window_to_library(
    _app: &tauri::AppHandle,
    _kind: String,
    _folder_path: String,
) -> Result<StoredScreenshot, String> {
    Err("screenshot capture is currently available on Windows".to_string())
}

pub fn list_library_screenshots(
    request: ListScreenshotsRequest,
    folder_path: String,
) -> Result<ListScreenshotsResponse, String> {
    let folder = ensure_screenshots_folder(&folder_path)?;
    let mut paths = Vec::new();
    for entry in fs::read_dir(&folder)
        .map_err(|error| format!("failed to read screenshots folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to read screenshots folder entry: {error}"))?;
        let path = entry.path();
        if !is_supported_image_path(&path) {
            continue;
        }
        let modified = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_to_millis)
            .unwrap_or(0);
        paths.push((modified, path));
    }
    paths.sort_by(|a, b| b.0.cmp(&a.0));

    let total = paths.len();
    let offset = request.offset.unwrap_or(0).min(total);
    let limit = request.limit.unwrap_or(60).clamp(1, 200);
    let screenshots = paths
        .into_iter()
        .skip(offset)
        .take(limit)
        .filter_map(|(_, path)| stored_screenshot_from_path(&folder, path).ok())
        .collect::<Vec<_>>();
    let has_more = offset + screenshots.len() < total;

    Ok(ListScreenshotsResponse {
        screenshots,
        total,
        has_more,
    })
}

pub fn delete_library_screenshot(id: String, folder_path: String) -> Result<(), String> {
    let folder = ensure_screenshots_folder(&folder_path)?;
    let path = screenshot_path_from_id(&folder, &id)?;
    fs::remove_file(&path).map_err(|error| format!("failed to delete screenshot: {error}"))
}

pub fn clear_library_screenshots(folder_path: String) -> Result<(), String> {
    let folder = ensure_screenshots_folder(&folder_path)?;
    for entry in fs::read_dir(&folder)
        .map_err(|error| format!("failed to read screenshots folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("failed to read screenshots folder entry: {error}"))?;
        let path = entry.path();
        if is_supported_image_path(&path) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn save_dib_to_library(
    dib: &[u8],
    width: u32,
    height: u32,
    kind: String,
    folder_path: &str,
) -> Result<StoredScreenshot, String> {
    let folder = ensure_screenshots_folder(folder_path)?;
    let jpeg = platform::dib_to_jpeg_bytes(dib, width, height)?;
    let captured_at = now_millis();
    let normalized_kind = normalize_kind(&kind);
    let file_name = format!("AdminDeck-{normalized_kind}-{captured_at}.jpg");
    let path = folder.join(file_name);
    fs::write(&path, jpeg).map_err(|error| format!("failed to save screenshot: {error}"))?;
    stored_screenshot_from_path(&folder, path)
}

fn ensure_screenshots_folder(folder_path: &str) -> Result<PathBuf, String> {
    let folder = expand_user_profile(folder_path);
    fs::create_dir_all(&folder)
        .map_err(|error| format!("failed to create screenshots folder: {error}"))?;
    Ok(folder)
}

fn expand_user_profile(path: &str) -> PathBuf {
    let trimmed = path.trim();
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from);
    if let Some(rest) = trimmed.strip_prefix("%USERPROFILE%") {
        if let Some(home) = home {
            return home.join(rest.trim_start_matches(['\\', '/']));
        }
    }
    PathBuf::from(trimmed)
}

fn stored_screenshot_from_path(
    screenshots_folder: &Path,
    path: PathBuf,
) -> Result<StoredScreenshot, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("failed to read screenshot metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("screenshot path is not a file".to_string());
    }

    let image =
        image::open(&path).map_err(|error| format!("failed to read screenshot: {error}"))?;
    let (width, height) = image.dimensions();
    let bytes = fs::read(&path).map_err(|error| format!("failed to load screenshot: {error}"))?;
    let mime_type = mime_type_for_path(&path);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "screenshot file name is not valid UTF-8".to_string())?
        .to_string();
    let captured_at = metadata
        .modified()
        .ok()
        .and_then(system_time_to_millis)
        .unwrap_or_else(now_millis);
    let canonical_folder = screenshots_folder
        .canonicalize()
        .map_err(|error| format!("failed to resolve screenshots folder: {error}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve screenshot path: {error}"))?;
    let relative = canonical_path
        .strip_prefix(&canonical_folder)
        .map_err(|_| "screenshot is outside the screenshots folder".to_string())?;
    let id = relative.to_string_lossy().replace('\\', "/");
    let kind = kind_from_file_name(&file_name);

    Ok(StoredScreenshot {
        id,
        path: path.to_string_lossy().to_string(),
        file_name,
        data_url: format!("data:{mime_type};base64,{}", STANDARD.encode(bytes)),
        width,
        height,
        captured_at,
        label: label_for_kind(&kind).to_string(),
        kind,
    })
}

fn screenshot_path_from_id(folder: &Path, id: &str) -> Result<PathBuf, String> {
    if id.contains("..") || id.contains('\\') || id.contains('/') {
        return Err("invalid screenshot id".to_string());
    }
    let path = folder.join(id);
    let canonical_folder = folder
        .canonicalize()
        .map_err(|error| format!("failed to resolve screenshots folder: {error}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve screenshot path: {error}"))?;
    if !canonical_path.starts_with(&canonical_folder) {
        return Err("screenshot path is outside the screenshots folder".to_string());
    }
    Ok(canonical_path)
}

fn is_supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png"
            )
        })
        .unwrap_or(false)
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        _ => "image/jpeg",
    }
}

fn normalize_kind(kind: &str) -> &'static str {
    match kind {
        "region" => "region",
        "fullscreen" => "fullscreen",
        "window" => "window",
        _ => "screenshot",
    }
}

fn kind_from_file_name(file_name: &str) -> String {
    let lower = file_name.to_ascii_lowercase();
    if lower.contains("-region-") {
        "region".to_string()
    } else if lower.contains("-fullscreen-") {
        "fullscreen".to_string()
    } else if lower.contains("-window-") {
        "window".to_string()
    } else {
        "screenshot".to_string()
    }
}

fn label_for_kind(kind: &str) -> &'static str {
    match kind {
        "region" => "Region screenshot",
        "fullscreen" => "Fullscreen screenshot",
        "window" => "Window screenshot",
        _ => "Screenshot",
    }
}

fn now_millis() -> u128 {
    system_time_to_millis(SystemTime::now()).unwrap_or(0)
}

fn system_time_to_millis(time: SystemTime) -> Option<u128> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

#[cfg(target_os = "windows")]
mod platform {
    use std::{ffi::c_void, mem, ptr};

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::{codecs::jpeg::JpegEncoder, ColorType, ImageEncoder};
    use windows_sys::Win32::{
        Foundation::{GlobalFree, HANDLE, HWND},
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
            DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, SRCCOPY,
        },
        System::{
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
            Ole::CF_DIB,
        },
        UI::WindowsAndMessaging::{
            GetForegroundWindow, GetSystemMetrics, GetWindowRect, SM_CXVIRTUALSCREEN,
            SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        },
    };

    pub struct ScreenRect {
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn virtual_screen_rect() -> ScreenRect {
        let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(1);
        let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(1);
        ScreenRect {
            x: unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) },
            y: unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) },
            width,
            height,
        }
    }

    pub fn foreground_window_rect() -> Result<ScreenRect, String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return Err("no active window is available for screenshot capture".to_string());
            }

            let mut rect = mem::zeroed();
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return Err("failed to resolve active window bounds".to_string());
            }

            let width = (rect.right - rect.left).max(1);
            let height = (rect.bottom - rect.top).max(1);
            Ok(ScreenRect {
                x: rect.left,
                y: rect.top,
                width,
                height,
            })
        }
    }

    pub fn capture_screen_rect_to_clipboard(
        owner_hwnd: HWND,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(), String> {
        let dib = capture_screen_rect_to_dib(x, y, width, height)?;
        unsafe { write_dib_to_clipboard(owner_hwnd, &dib) }
    }

    pub fn capture_screen_rect_to_dib(
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<Vec<u8>, String> {
        if width <= 0 || height <= 0 {
            return Err("screenshot region must have a positive size".to_string());
        }

        unsafe {
            let screen_dc = ScreenDc::new()?;
            let memory_dc = MemoryDc::new(screen_dc.0)?;
            let bitmap = Bitmap::new(screen_dc.0, width, height)?;
            let previous = SelectObject(memory_dc.0, bitmap.0 as HGDIOBJ);
            if previous.is_null() {
                return Err("failed to select screenshot bitmap".to_string());
            }

            let copied = BitBlt(
                memory_dc.0,
                0,
                0,
                width,
                height,
                screen_dc.0,
                x,
                y,
                SRCCOPY | CAPTUREBLT,
            );
            let _ = SelectObject(memory_dc.0, previous);
            if copied == 0 {
                return Err("failed to capture screenshot region".to_string());
            }

            bitmap_to_dib(screen_dc.0, bitmap.0, width, height)
        }
    }

    pub struct JpegResult {
        pub data_url: String,
        pub width: u32,
        pub height: u32,
    }

    pub fn dib_to_jpeg_data_url(dib: &[u8], width: u32, height: u32) -> Result<JpegResult, String> {
        let jpeg = dib_to_jpeg_bytes(dib, width, height)?;
        Ok(JpegResult {
            data_url: format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)),
            width,
            height,
        })
    }

    pub fn dib_to_jpeg_bytes(dib: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
        let header_size = mem::size_of::<BITMAPINFOHEADER>();
        let expected_len = header_size + width as usize * height as usize * 4;
        if dib.len() < expected_len {
            return Err("captured screenshot image data is incomplete".to_string());
        }

        let pixels = &dib[header_size..expected_len];
        let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
        for bgra in pixels.chunks_exact(4) {
            rgb.push(bgra[2]);
            rgb.push(bgra[1]);
            rgb.push(bgra[0]);
        }

        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, 90)
            .write_image(&rgb, width, height, ColorType::Rgb8.into())
            .map_err(|error| format!("failed to encode JPEG: {error}"))?;
        Ok(jpeg)
    }

    unsafe fn bitmap_to_dib(
        screen_dc: HDC,
        bitmap: HBITMAP,
        width: i32,
        height: i32,
    ) -> Result<Vec<u8>, String> {
        let stride = ((width * 32 + 31) / 32) * 4;
        let image_size = (stride * height) as usize;
        let header_size = mem::size_of::<BITMAPINFOHEADER>();
        let mut dib = vec![0u8; header_size + image_size];

        let header = dib.as_mut_ptr() as *mut BITMAPINFOHEADER;
        (*header).biSize = header_size as u32;
        (*header).biWidth = width;
        (*header).biHeight = -height;
        (*header).biPlanes = 1;
        (*header).biBitCount = 32;
        (*header).biCompression = BI_RGB;
        (*header).biSizeImage = image_size as u32;

        let info = dib.as_mut_ptr() as *mut BITMAPINFO;
        let bits = dib.as_mut_ptr().add(header_size) as *mut c_void;
        let lines = GetDIBits(
            screen_dc,
            bitmap,
            0,
            height as u32,
            bits,
            info,
            DIB_RGB_COLORS,
        );
        if lines == 0 {
            return Err("failed to encode screenshot for clipboard".to_string());
        }

        Ok(dib)
    }

    unsafe fn write_dib_to_clipboard(owner: HWND, dib: &[u8]) -> Result<(), String> {
        let handle = GlobalAlloc(GMEM_MOVEABLE, dib.len());
        if handle.is_null() {
            return Err("failed to allocate clipboard image memory".to_string());
        }

        let target = GlobalLock(handle);
        if target.is_null() {
            let _ = GlobalFree(handle);
            return Err("failed to lock clipboard image memory".to_string());
        }
        ptr::copy_nonoverlapping(dib.as_ptr(), target as *mut u8, dib.len());
        let _ = GlobalUnlock(handle);

        if OpenClipboard(owner) == 0 {
            let _ = GlobalFree(handle);
            return Err("failed to open clipboard".to_string());
        }
        let clipboard = ClipboardGuard;

        if EmptyClipboard() == 0 {
            let _ = GlobalFree(handle);
            return Err("failed to clear clipboard".to_string());
        }
        if SetClipboardData(CF_DIB as u32, handle as HANDLE).is_null() {
            let _ = GlobalFree(handle);
            return Err("failed to write screenshot to clipboard".to_string());
        }

        mem::forget(clipboard);
        let _ = CloseClipboard();
        Ok(())
    }

    struct ScreenDc(HDC);

    impl ScreenDc {
        unsafe fn new() -> Result<Self, String> {
            let hdc = GetDC(ptr::null_mut());
            if hdc.is_null() {
                return Err("failed to get screen device context".to_string());
            }
            Ok(Self(hdc))
        }
    }

    impl Drop for ScreenDc {
        fn drop(&mut self) {
            unsafe {
                let _ = ReleaseDC(ptr::null_mut(), self.0);
            }
        }
    }

    struct MemoryDc(HDC);

    impl MemoryDc {
        unsafe fn new(screen_dc: HDC) -> Result<Self, String> {
            let hdc = CreateCompatibleDC(screen_dc);
            if hdc.is_null() {
                return Err("failed to create screenshot device context".to_string());
            }
            Ok(Self(hdc))
        }
    }

    impl Drop for MemoryDc {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteDC(self.0);
            }
        }
    }

    struct Bitmap(HBITMAP);

    impl Bitmap {
        unsafe fn new(screen_dc: HDC, width: i32, height: i32) -> Result<Self, String> {
            let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
            if bitmap.is_null() {
                return Err("failed to create screenshot bitmap".to_string());
            }
            Ok(Self(bitmap))
        }
    }

    impl Drop for Bitmap {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(self.0 as HGDIOBJ);
            }
        }
    }

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }
}
