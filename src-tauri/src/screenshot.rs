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
    let screen = platform::virtual_screen_rect();
    let screen_dib =
        platform::capture_screen_rect_to_dib(screen.x, screen.y, screen.width, screen.height)?;
    let windows = platform::enumerate_window_rects(&screen);
    let target = platform::select_window_rect(&screen_dib, &screen, windows)?
        .ok_or_else(|| "screenshot capture canceled".to_string())?;
    let dib = platform::crop_dib(&screen_dib, screen.width, screen.height, &screen, &target)?;
    save_dib_to_library(
        &dib,
        target.width as u32,
        target.height as u32,
        kind,
        &folder_path,
    )
}

#[cfg(target_os = "windows")]
pub fn capture_interactive_region_to_library(
    app: &tauri::AppHandle,
    kind: String,
    folder_path: String,
) -> Result<StoredScreenshot, String> {
    let _guard = MinimizedCaptureWindow::new(app)?;
    let screen = platform::virtual_screen_rect();
    let screen_dib =
        platform::capture_screen_rect_to_dib(screen.x, screen.y, screen.width, screen.height)?;
    let target = platform::select_region_rect(&screen_dib, &screen)?
        .ok_or_else(|| "screenshot capture canceled".to_string())?;
    let dib = platform::crop_dib(&screen_dib, screen.width, screen.height, &screen, &target)?;
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

#[cfg(not(target_os = "windows"))]
pub fn capture_interactive_region_to_library(
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
    let file_name = format!("KKTerm-{normalized_kind}-{captured_at}.jpg");
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
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{ReleaseCapture, SetCapture, VK_ESCAPE};
    use windows_sys::Win32::{
        Foundation::{GlobalFree, HANDLE, HWND, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::Gdi::{
            BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateSolidBrush,
            DeleteDC, DeleteObject, EndPaint, FillRect, FrameRect, GetDC, GetDIBits,
            InvalidateRect, ReleaseDC, SelectObject, SetDIBitsToDevice, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, HBITMAP, HBRUSH, HDC, HGDIOBJ,
            PAINTSTRUCT, SRCCOPY,
        },
        System::{
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
            Ole::CF_DIB,
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows,
            GetMessageW, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, IsWindowVisible,
            LoadCursorW, PostQuitMessage, RegisterClassW, SetWindowLongPtrW, ShowWindow,
            TranslateMessage, CREATESTRUCTW, CS_HREDRAW, CS_VREDRAW, GWLP_USERDATA, IDC_CROSS, MSG,
            SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW,
            WM_CREATE, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE,
            WM_NCCREATE, WM_PAINT, WNDCLASSW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
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

    pub fn enumerate_window_rects(screen: &ScreenRect) -> Vec<ScreenRect> {
        unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> i32 {
            let state = &mut *(lparam as *mut WindowEnumeration);
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }

            let mut rect: RECT = mem::zeroed();
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return 1;
            }

            let Some(rect) = screen_rect_from_rect(rect) else {
                return 1;
            };
            if rect.width < 80 || rect.height < 60 || !rect_intersects(&rect, state.screen) {
                return 1;
            }

            state
                .windows
                .push(clamp_rect_to_screen(&rect, state.screen));
            1
        }

        let mut state = WindowEnumeration {
            screen,
            windows: Vec::new(),
        };
        unsafe {
            let _ = EnumWindows(Some(enum_window), &mut state as *mut _ as LPARAM);
        }
        state.windows
    }

    pub fn select_window_rect(
        dib: &[u8],
        screen: &ScreenRect,
        windows: Vec<ScreenRect>,
    ) -> Result<Option<ScreenRect>, String> {
        run_selection_overlay(dib, screen, SelectionMode::Window { windows })
    }

    pub fn select_region_rect(
        dib: &[u8],
        screen: &ScreenRect,
    ) -> Result<Option<ScreenRect>, String> {
        run_selection_overlay(dib, screen, SelectionMode::Region)
    }

    pub fn crop_dib(
        dib: &[u8],
        source_width: i32,
        source_height: i32,
        source_screen: &ScreenRect,
        target: &ScreenRect,
    ) -> Result<Vec<u8>, String> {
        if target.width <= 0 || target.height <= 0 {
            return Err("screenshot region must have a positive size".to_string());
        }

        let header_size = mem::size_of::<BITMAPINFOHEADER>();
        let source_width = source_width.max(1) as usize;
        let source_height = source_height.max(1) as usize;
        let target_width = target.width.max(1) as usize;
        let target_height = target.height.max(1) as usize;
        let expected_len = header_size + source_width * source_height * 4;
        if dib.len() < expected_len {
            return Err("captured screenshot image data is incomplete".to_string());
        }

        let offset_x = (target.x - source_screen.x).max(0) as usize;
        let offset_y = (target.y - source_screen.y).max(0) as usize;
        if offset_x >= source_width || offset_y >= source_height {
            return Err("screenshot selection is outside the captured screen".to_string());
        }

        let copy_width = target_width.min(source_width - offset_x);
        let copy_height = target_height.min(source_height - offset_y);
        let mut cropped = vec![0u8; header_size + copy_width * copy_height * 4];
        cropped[..header_size].copy_from_slice(&dib[..header_size]);
        unsafe {
            let header = cropped.as_mut_ptr() as *mut BITMAPINFOHEADER;
            (*header).biWidth = copy_width as i32;
            (*header).biHeight = -(copy_height as i32);
            (*header).biSizeImage = (copy_width * copy_height * 4) as u32;
        }

        let source_pixels = &dib[header_size..expected_len];
        let target_pixels = &mut cropped[header_size..];
        for row in 0..copy_height {
            let source_start = ((offset_y + row) * source_width + offset_x) * 4;
            let source_end = source_start + copy_width * 4;
            let target_start = row * copy_width * 4;
            target_pixels[target_start..target_start + copy_width * 4]
                .copy_from_slice(&source_pixels[source_start..source_end]);
        }

        Ok(cropped)
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

    enum SelectionMode {
        Window { windows: Vec<ScreenRect> },
        Region,
    }

    struct WindowEnumeration<'a> {
        screen: &'a ScreenRect,
        windows: Vec<ScreenRect>,
    }

    struct SelectionOverlay<'a> {
        dib: &'a [u8],
        screen: ScreenRect,
        mode: SelectionMode,
        result: Option<ScreenRect>,
        hover: Option<ScreenRect>,
        drag_start: Option<(i32, i32)>,
        drag_current: Option<(i32, i32)>,
    }

    fn run_selection_overlay(
        dib: &[u8],
        screen: &ScreenRect,
        mode: SelectionMode,
    ) -> Result<Option<ScreenRect>, String> {
        unsafe {
            let class_name = wide_null("KKTermScreenshotSelection");
            let cursor = LoadCursorW(ptr::null_mut(), IDC_CROSS);
            let wnd_class = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(selection_wnd_proc),
                hInstance: ptr::null_mut(),
                hCursor: cursor,
                lpszClassName: class_name.as_ptr(),
                ..mem::zeroed()
            };
            let _ = RegisterClassW(&wnd_class);

            let mut overlay = Box::new(SelectionOverlay {
                dib,
                screen: ScreenRect {
                    x: screen.x,
                    y: screen.y,
                    width: screen.width,
                    height: screen.height,
                },
                mode,
                result: None,
                hover: None,
                drag_start: None,
                drag_current: None,
            });
            let overlay_ptr = overlay.as_mut() as *mut SelectionOverlay;
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                class_name.as_ptr(),
                class_name.as_ptr(),
                WS_POPUP,
                screen.x,
                screen.y,
                screen.width,
                screen.height,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                overlay_ptr.cast(),
            );
            if hwnd.is_null() {
                return Err("failed to create screenshot selection overlay".to_string());
            }

            ShowWindow(hwnd, SW_SHOW);
            let _ = InvalidateRect(hwnd, ptr::null(), 1);

            let mut message: MSG = mem::zeroed();
            while GetMessageW(&mut message, ptr::null_mut(), 0, 0) > 0 {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            Ok(overlay.result)
        }
    }

    unsafe extern "system" fn selection_wnd_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_NCCREATE {
            let create = lparam as *const CREATESTRUCTW;
            let overlay = (*create).lpCreateParams as *mut SelectionOverlay;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, overlay as isize);
            return DefWindowProcW(hwnd, message, wparam, lparam);
        }

        let overlay = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut SelectionOverlay;
        if overlay.is_null() {
            return DefWindowProcW(hwnd, message, wparam, lparam);
        }
        let overlay = &mut *overlay;

        match message {
            WM_CREATE => 0,
            WM_MOUSEMOVE => {
                let point = message_point(lparam, &overlay.screen);
                match &overlay.mode {
                    SelectionMode::Window { windows } => {
                        overlay.hover = windows
                            .iter()
                            .find(|rect| rect_contains(rect, point.0, point.1))
                            .map(copy_rect);
                    }
                    SelectionMode::Region => {
                        if overlay.drag_start.is_some() {
                            overlay.drag_current = Some(point);
                        }
                    }
                }
                let _ = InvalidateRect(hwnd, ptr::null(), 0);
                0
            }
            WM_LBUTTONDOWN => {
                let point = message_point(lparam, &overlay.screen);
                match overlay.mode {
                    SelectionMode::Window { .. } => {
                        if let Some(rect) = overlay.hover.as_ref() {
                            overlay.result = Some(copy_rect(rect));
                            DestroyWindow(hwnd);
                        }
                    }
                    SelectionMode::Region => {
                        overlay.drag_start = Some(point);
                        overlay.drag_current = Some(point);
                        SetCapture(hwnd);
                    }
                }
                0
            }
            WM_LBUTTONUP => {
                if matches!(overlay.mode, SelectionMode::Region) {
                    let point = message_point(lparam, &overlay.screen);
                    let _ = ReleaseCapture();
                    if let Some(start) = overlay.drag_start {
                        let rect = rect_from_points(start, point);
                        if rect.width >= 4 && rect.height >= 4 {
                            overlay.result = Some(clamp_rect_to_screen(&rect, &overlay.screen));
                        }
                    }
                    DestroyWindow(hwnd);
                }
                0
            }
            WM_KEYDOWN => {
                if wparam == VK_ESCAPE as usize {
                    DestroyWindow(hwnd);
                    return 0;
                }
                DefWindowProcW(hwnd, message, wparam, lparam)
            }
            WM_PAINT => {
                paint_selection_overlay(hwnd, overlay);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }

    unsafe fn paint_selection_overlay(hwnd: HWND, overlay: &SelectionOverlay<'_>) {
        let mut paint: PAINTSTRUCT = mem::zeroed();
        let hdc = BeginPaint(hwnd, &mut paint);
        if hdc.is_null() {
            return;
        }

        let header_size = mem::size_of::<BITMAPINFOHEADER>();
        if overlay.dib.len() >= header_size {
            let info = overlay.dib.as_ptr() as *const BITMAPINFO;
            let bits = overlay.dib.as_ptr().add(header_size) as *const c_void;
            let _ = SetDIBitsToDevice(
                hdc,
                0,
                0,
                overlay.screen.width as u32,
                overlay.screen.height as u32,
                0,
                0,
                0,
                overlay.screen.height as u32,
                bits,
                info,
                DIB_RGB_COLORS,
            );
        }

        let selected = match overlay.mode {
            SelectionMode::Window { .. } => overlay.hover.as_ref().map(copy_rect),
            SelectionMode::Region => overlay
                .drag_start
                .zip(overlay.drag_current)
                .map(|(start, current)| rect_from_points(start, current)),
        };
        let selected = selected
            .as_ref()
            .map(|rect| clamp_rect_to_screen(rect, &overlay.screen));
        dim_outside_rect(hdc, &overlay.screen, selected.as_ref());
        if let Some(rect) = selected {
            frame_rect(
                hdc,
                &screen_to_overlay_rect(&rect, &overlay.screen),
                0x00ff_ffff,
            );
            let inner = inset_rect(&screen_to_overlay_rect(&rect, &overlay.screen), 1);
            frame_rect(hdc, &inner, 0x0000_78ff);
        }

        EndPaint(hwnd, &paint);
    }

    unsafe fn dim_outside_rect(hdc: HDC, screen: &ScreenRect, selected: Option<&ScreenRect>) {
        let brush = Brush::new(0x0000_0000);
        let Some(selected) = selected else {
            return;
        };

        let selected = screen_to_overlay_rect(selected, screen);
        for rect in outside_rects(screen.width, screen.height, &selected) {
            let _ = FillRect(hdc, &rect, brush.0);
        }
    }

    unsafe fn frame_rect(hdc: HDC, rect: &RECT, color: u32) {
        let brush = Brush::new(color);
        let _ = FrameRect(hdc, rect, brush.0);
    }

    fn outside_rects(width: i32, height: i32, selected: &RECT) -> [RECT; 4] {
        [
            RECT {
                left: 0,
                top: 0,
                right: width,
                bottom: selected.top.max(0),
            },
            RECT {
                left: 0,
                top: selected.bottom.min(height),
                right: width,
                bottom: height,
            },
            RECT {
                left: 0,
                top: selected.top.max(0),
                right: selected.left.max(0),
                bottom: selected.bottom.min(height),
            },
            RECT {
                left: selected.right.min(width),
                top: selected.top.max(0),
                right: width,
                bottom: selected.bottom.min(height),
            },
        ]
    }

    fn wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn message_point(lparam: LPARAM, screen: &ScreenRect) -> (i32, i32) {
        let x = (lparam as u32 & 0xffff) as i16 as i32 + screen.x;
        let y = ((lparam as u32 >> 16) & 0xffff) as i16 as i32 + screen.y;
        (x, y)
    }

    fn screen_rect_from_rect(rect: RECT) -> Option<ScreenRect> {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return None;
        }
        Some(ScreenRect {
            x: rect.left,
            y: rect.top,
            width,
            height,
        })
    }

    fn rect_from_points(start: (i32, i32), end: (i32, i32)) -> ScreenRect {
        let x = start.0.min(end.0);
        let y = start.1.min(end.1);
        ScreenRect {
            x,
            y,
            width: (start.0 - end.0).abs(),
            height: (start.1 - end.1).abs(),
        }
    }

    fn rect_contains(rect: &ScreenRect, x: i32, y: i32) -> bool {
        x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height
    }

    fn rect_intersects(rect: &ScreenRect, screen: &ScreenRect) -> bool {
        rect.x < screen.x + screen.width
            && rect.x + rect.width > screen.x
            && rect.y < screen.y + screen.height
            && rect.y + rect.height > screen.y
    }

    fn clamp_rect_to_screen(rect: &ScreenRect, screen: &ScreenRect) -> ScreenRect {
        let left = rect.x.max(screen.x);
        let top = rect.y.max(screen.y);
        let right = (rect.x + rect.width).min(screen.x + screen.width);
        let bottom = (rect.y + rect.height).min(screen.y + screen.height);
        ScreenRect {
            x: left,
            y: top,
            width: (right - left).max(1),
            height: (bottom - top).max(1),
        }
    }

    fn screen_to_overlay_rect(rect: &ScreenRect, screen: &ScreenRect) -> RECT {
        RECT {
            left: rect.x - screen.x,
            top: rect.y - screen.y,
            right: rect.x - screen.x + rect.width,
            bottom: rect.y - screen.y + rect.height,
        }
    }

    fn inset_rect(rect: &RECT, amount: i32) -> RECT {
        RECT {
            left: rect.left + amount,
            top: rect.top + amount,
            right: rect.right - amount,
            bottom: rect.bottom - amount,
        }
    }

    fn copy_rect(rect: &ScreenRect) -> ScreenRect {
        ScreenRect {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        }
    }

    struct Brush(HBRUSH);

    impl Brush {
        unsafe fn new(color: u32) -> Self {
            Self(CreateSolidBrush(color))
        }
    }

    impl Drop for Brush {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(self.0 as HGDIOBJ);
            }
        }
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
