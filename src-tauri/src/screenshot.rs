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
    let data_url = platform::dib_to_png_data_url(&dib, target.width as u32, target.height as u32)?;
    Ok(AssistantScreenshot {
        data_url,
        width: target.width as u32,
        height: target.height as u32,
    })
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

#[cfg(target_os = "windows")]
mod platform {
    use std::{ffi::c_void, mem, ptr};

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
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
    };

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

    pub fn dib_to_png_data_url(dib: &[u8], width: u32, height: u32) -> Result<String, String> {
        let header_size = mem::size_of::<BITMAPINFOHEADER>();
        let expected_len = header_size + width as usize * height as usize * 4;
        if dib.len() < expected_len {
            return Err("captured screenshot image data is incomplete".to_string());
        }

        let pixels = &dib[header_size..expected_len];
        let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
        for bgra in pixels.chunks_exact(4) {
            rgba.push(bgra[2]);
            rgba.push(bgra[1]);
            rgba.push(bgra[0]);
            rgba.push(255);
        }

        let mut png = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(&rgba, width, height, ColorType::Rgba8.into())
            .map_err(|error| format!("failed to encode screenshot for AI Assistant: {error}"))?;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
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
