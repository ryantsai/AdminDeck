#[cfg(target_os = "windows")]
mod platform {
    use std::{
        collections::HashMap,
        ffi::c_void,
        mem::ManuallyDrop,
        sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock},
    };

    use serde::{Deserialize, Serialize};
    use tauri::{AppHandle, Manager};
    use windows::{
        core::{Interface, BSTR, PCSTR, PCWSTR},
        Win32::{
            Foundation::{HWND, POINT, RECT, VARIANT_FALSE, VARIANT_TRUE},
            Graphics::Gdi::ClientToScreen,
            System::{
                Com::{
                    IDispatch, DISPATCH_METHOD, DISPATCH_PROPERTYGET, DISPATCH_PROPERTYPUT,
                    DISPPARAMS,
                },
                LibraryLoader::{GetProcAddress, LoadLibraryW},
                Ole::{OleInitialize, DISPID_PROPERTYPUT},
                Variant::{VariantClear, VARIANT, VT_BOOL, VT_BSTR, VT_DISPATCH, VT_I2, VT_I4},
            },
            UI::WindowsAndMessaging::{
                CreateWindowExW, DestroyWindow, GetWindowRect, SetWindowPos, ShowWindow, HMENU,
                SWP_NOACTIVATE, SWP_NOZORDER, SW_SHOWNOACTIVATE, WS_CLIPCHILDREN,
                WS_CLIPSIBLINGS, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_POPUP, WS_VISIBLE,
            },
        },
    };

    const HOST_WINDOW_LABEL: &str = "main";
    const HIDDEN_RDP_POSITION: i32 = -32_000;
    const LOCALE_USER_DEFAULT: u32 = 0x0400;
    const RDP_MIN_DESKTOP_WIDTH: i32 = 640;
    const RDP_MIN_DESKTOP_HEIGHT: i32 = 480;
    const RDP_DISPLAY_ORIENTATION_LANDSCAPE: i32 = 0;
    const RDP_DISPLAY_SCALE_FACTOR_PERCENT: i32 = 100;
    const RDP_PROGIDS: &[&str] = &[
        "MsTscAx.MsTscAx.13",
        "MsTscAx.MsTscAx.12",
        "MsTscAx.MsTscAx.11",
        "MsTscAx.MsTscAx.10",
        "MsTscAx.MsTscAx.9",
        "MsTscAx.MsTscAx.8",
        "MsTscAx.MsTscAx.7",
        "MsTscAx.MsTscAx.6",
        "MsTscAx.MsTscAx.5",
        "MsTscAx.MsTscAx.4",
        "MsTscAx.MsTscAx.3",
        "MsTscAx.MsTscAx.2",
        "MsTscAx.MsTscAx.1",
        "MsTscAx.MsTscAx",
    ];
    const ADVANCED_SETTINGS_PROPERTIES: &[&str] = &[
        "AdvancedSettings12",
        "AdvancedSettings11",
        "AdvancedSettings10",
        "AdvancedSettings9",
        "AdvancedSettings8",
        "AdvancedSettings7",
        "AdvancedSettings6",
        "AdvancedSettings5",
        "AdvancedSettings4",
        "AdvancedSettings3",
        "AdvancedSettings2",
        "AdvancedSettings",
    ];

    type AtlAxWinInit = unsafe extern "system" fn() -> i32;
    type AtlAxGetControl =
        unsafe extern "system" fn(HWND, *mut *mut c_void) -> windows::core::HRESULT;

    struct AtlFunctions {
        ax_win_init: AtlAxWinInit,
        ax_get_control: AtlAxGetControl,
    }

    #[derive(Clone)]
    pub struct RdpSessionManager {
        sessions: Arc<Mutex<HashMap<String, RdpSession>>>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct StartRdpSessionRequest {
        session_id: String,
        host: String,
        user: String,
        port: Option<u16>,
        secret_owner_id: Option<String>,
        password: Option<String>,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSessionStarted {
        session_id: String,
        host: String,
        port: u16,
        control: String,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSessionStatus {
        session_id: String,
        connection_state: i32,
        connected: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct UpdateRdpBoundsRequest {
        session_id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SetRdpVisibilityRequest {
        session_id: String,
        visible: bool,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SyncRdpDisplaySizeRequest {
        session_id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpDisplaySizeSync {
        session_id: String,
        connection_state: i32,
        connected: bool,
        display_synced: bool,
        desktop_width: i32,
        desktop_height: i32,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSimpleRequest {
        session_id: String,
    }

    struct RdpSession {
        hwnd: HWND,
        owner: HWND,
        dispatch: IDispatch,
        desktop_width: i32,
        desktop_height: i32,
    }

    // These values are always created, used, and destroyed through closures
    // dispatched onto Tauri's main thread. The marker lets the session map live
    // behind app state while preserving that thread-affinity by convention.
    unsafe impl Send for RdpSession {}

    struct VariantArg(VARIANT);

    impl RdpSessionManager {
        pub fn new() -> Self {
            Self {
                sessions: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        pub fn start_session(
            &self,
            app: AppHandle,
            request: StartRdpSessionRequest,
        ) -> Result<RdpSessionStarted, String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |app| {
                start_session_on_main_thread(sessions, &app, request)
            })
        }

        pub fn update_bounds(
            &self,
            app: AppHandle,
            request: UpdateRdpBoundsRequest,
        ) -> Result<(), String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |app| {
                let host_window = app
                    .get_window(HOST_WINDOW_LABEL)
                    .ok_or_else(|| format!("host window '{HOST_WINDOW_LABEL}' is not available"))?;
                let scale_factor = host_window
                    .scale_factor()
                    .map_err(|error| format!("failed to read host window scale factor: {error}"))?;
                let mut sessions = lock_sessions(&sessions)?;
                let session = sessions
                    .get_mut(&request.session_id)
                    .ok_or_else(|| format!("RDP session '{}' was not found", request.session_id))?;
                show_and_resize_rdp(
                    session,
                    scale_factor,
                    request.x,
                    request.y,
                    request.width,
                    request.height,
                )
            })
        }

        pub fn set_visibility(
            &self,
            app: AppHandle,
            request: SetRdpVisibilityRequest,
        ) -> Result<(), String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |app| {
                let host_window = app
                    .get_window(HOST_WINDOW_LABEL)
                    .ok_or_else(|| format!("host window '{HOST_WINDOW_LABEL}' is not available"))?;
                let scale_factor = host_window
                    .scale_factor()
                    .map_err(|error| format!("failed to read host window scale factor: {error}"))?;
                let sessions = lock_sessions(&sessions)?;
                if request.visible {
                    for (other_session_id, other_session) in sessions.iter() {
                        if other_session_id != &request.session_id {
                            park_rdp_at_current_size(other_session.hwnd)?;
                        }
                    }
                    let session = sessions.get(&request.session_id).ok_or_else(|| {
                        format!("RDP session '{}' was not found", request.session_id)
                    })?;
                    show_rdp(
                        session.hwnd,
                        session.owner,
                        scale_factor,
                        request.x,
                        request.y,
                        request.width,
                        request.height,
                    )
                    .map(|_| ())
                } else {
                    let session = sessions.get(&request.session_id).ok_or_else(|| {
                        format!("RDP session '{}' was not found", request.session_id)
                    })?;
                    stage_rdp(
                        session.hwnd,
                        scale_factor,
                        request.x,
                        request.y,
                        request.width,
                        request.height,
                    )
                    .map(|_| ())
                }
            })
        }

        pub fn sync_display_size(
            &self,
            app: AppHandle,
            request: SyncRdpDisplaySizeRequest,
        ) -> Result<RdpDisplaySizeSync, String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |app| {
                let host_window = app
                    .get_window(HOST_WINDOW_LABEL)
                    .ok_or_else(|| format!("host window '{HOST_WINDOW_LABEL}' is not available"))?;
                let scale_factor = host_window
                    .scale_factor()
                    .map_err(|error| format!("failed to read host window scale factor: {error}"))?;
                let mut sessions = lock_sessions(&sessions)?;
                let session = sessions
                    .get_mut(&request.session_id)
                    .ok_or_else(|| format!("RDP session '{}' was not found", request.session_id))?;
                let rect = stage_rdp(
                    session.hwnd,
                    scale_factor,
                    request.x,
                    request.y,
                    request.width,
                    request.height,
                )?;
                let desktop_width = desktop_width_for(rect.2);
                let desktop_height = desktop_height_for(rect.3);
                let connection_state = get_property_i32(&session.dispatch, "Connected")?;
                let connected = is_rdp_connected_state(connection_state);
                let display_synced = connected
                    && sync_remote_desktop_size(session, desktop_width, desktop_height, true);
                Ok(RdpDisplaySizeSync {
                    session_id: request.session_id,
                    connection_state,
                    connected,
                    display_synced,
                    desktop_width: session.desktop_width,
                    desktop_height: session.desktop_height,
                })
            })
        }

        pub fn close_session(
            &self,
            app: AppHandle,
            request: RdpSimpleRequest,
        ) -> Result<(), String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |_app| {
                let mut sessions = lock_sessions(&sessions)?;
                if let Some(session) = sessions.remove(&request.session_id) {
                    let _ = invoke_method(&session.dispatch, "Disconnect");
                    unsafe {
                        DestroyWindow(session.hwnd).map_err(|error| {
                            format!("failed to destroy RDP host window: {error}")
                        })?;
                    }
                }
                Ok(())
            })
        }

        pub fn session_status(
            &self,
            app: AppHandle,
            request: RdpSimpleRequest,
        ) -> Result<RdpSessionStatus, String> {
            let sessions = Arc::clone(&self.sessions);
            run_on_main_thread(app, move |_app| {
                let sessions = lock_sessions(&sessions)?;
                let session = sessions
                    .get(&request.session_id)
                    .ok_or_else(|| format!("RDP session '{}' was not found", request.session_id))?;
                let connection_state = get_property_i32(&session.dispatch, "Connected")?;
                Ok(RdpSessionStatus {
                    session_id: request.session_id,
                    connection_state,
                    connected: is_rdp_connected_state(connection_state),
                })
            })
        }
    }

    impl StartRdpSessionRequest {
        pub(crate) fn secret_owner_id(&self) -> Option<&str> {
            self.secret_owner_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        }

        pub(crate) fn password(&self) -> Option<&str> {
            self.password.as_deref().filter(|value| !value.is_empty())
        }

        pub(crate) fn set_password(&mut self, password: Option<String>) {
            self.password = password;
        }
    }

    fn start_session_on_main_thread(
        sessions: Arc<Mutex<HashMap<String, RdpSession>>>,
        app: &AppHandle,
        request: StartRdpSessionRequest,
    ) -> Result<RdpSessionStarted, String> {
        let session_id = required_id(request.session_id)?;
        let host = required_field("RDP host", request.host)?;
        let user = request.user.trim().to_string();
        let port = request.port.unwrap_or(3389);
        if port == 0 {
            return Err("RDP port must be between 1 and 65535".to_string());
        }

        {
            let sessions = lock_sessions(&sessions)?;
            if sessions.contains_key(&session_id) {
                return Err(format!("RDP session '{session_id}' is already running"));
            }
        }

        let atl = atl_functions()?;
        unsafe {
            OleInitialize(None)
                .map_err(|error| format!("failed to initialize OLE for RDP hosting: {error}"))?;
            if (atl.ax_win_init)() == 0 {
                return Err("failed to initialize ATL ActiveX hosting".to_string());
            }
        }

        let host_window = app
            .get_window(HOST_WINDOW_LABEL)
            .ok_or_else(|| format!("host window '{HOST_WINDOW_LABEL}' is not available"))?;
        let parent_hwnd = host_window
            .hwnd()
            .map_err(|error| format!("failed to get host window handle: {error}"))?;

        let parent_hwnd = HWND(parent_hwnd.0);
        let scale_factor = host_window
            .scale_factor()
            .map_err(|error| format!("failed to read host window scale factor: {error}"))?;
        let size = scaled_rect(
            request.x,
            request.y,
            request.width,
            request.height,
            scale_factor,
        );
        let initial_rect = staged_rect(size.2, size.3);
        let (hwnd, dispatch, control) = create_rdp_control(parent_hwnd, initial_rect)?;

        configure_rdp_control(
            &dispatch,
            &host,
            &user,
            port,
            request.password.as_deref(),
            desktop_width_for(size.2),
            desktop_height_for(size.3),
        )?;
        invoke_method(&dispatch, "Connect")?;

        let mut sessions = lock_sessions(&sessions)?;
        sessions.insert(
            session_id.clone(),
            RdpSession {
                hwnd,
                owner: parent_hwnd,
                dispatch,
                // DesktopWidth/DesktopHeight seed the initial connection, but the
                // ActiveX control may not apply dynamic sizing until after Connect
                // has progressed. Keep the synced size unknown so the frontend's
                // startup bounds pushes retry the real remote desktop resize.
                desktop_width: 0,
                desktop_height: 0,
            },
        );

        Ok(RdpSessionStarted {
            session_id,
            host,
            port,
            control,
        })
    }

    fn create_rdp_control(
        owner_hwnd: HWND,
        rect: (i32, i32, i32, i32),
    ) -> Result<(HWND, IDispatch, String), String> {
        let mut last_error = String::new();
        for progid in RDP_PROGIDS {
            let class_name = wide_null("AtlAxWin");
            let control_name = wide_null(progid);
            let hwnd = unsafe {
                CreateWindowExW(
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    PCWSTR(class_name.as_ptr()),
                    PCWSTR(control_name.as_ptr()),
                    WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                    rect.0,
                    rect.1,
                    rect.2,
                    rect.3,
                    Some(owner_hwnd),
                    Option::<HMENU>::None,
                    None,
                    None,
                )
            };

            let hwnd = match hwnd {
                Ok(hwnd) => hwnd,
                Err(error) => {
                    last_error = format!("{progid}: {error}");
                    continue;
                }
            };

            match control_dispatch(hwnd).and_then(|dispatch| {
                get_dispid(&dispatch, "Server")?;
                Ok(dispatch)
            }) {
                Ok(dispatch) => return Ok((hwnd, dispatch, (*progid).to_string())),
                Err(error) => {
                    last_error = format!("{progid}: {error}");
                    unsafe {
                        let _ = DestroyWindow(hwnd);
                    }
                }
            }
        }

        Err(format!(
            "failed to create Microsoft RDP ActiveX control from mstscax.dll ({last_error})"
        ))
    }

    fn control_dispatch(hwnd: HWND) -> Result<IDispatch, String> {
        let mut unknown = std::ptr::null_mut();
        let atl = atl_functions()?;
        unsafe {
            (atl.ax_get_control)(hwnd, &mut unknown)
                .ok()
                .map_err(|error| format!("failed to get RDP ActiveX control: {error}"))?;
            let unknown = windows::core::IUnknown::from_raw(unknown);
            unknown
                .cast::<IDispatch>()
                .map_err(|error| format!("RDP ActiveX control does not expose IDispatch: {error}"))
        }
    }

    fn configure_rdp_control(
        dispatch: &IDispatch,
        host: &str,
        user: &str,
        port: u16,
        password: Option<&str>,
        desktop_width: i32,
        desktop_height: i32,
    ) -> Result<(), String> {
        let (domain, username) = split_windows_user(user);
        set_property_string(dispatch, "Server", host)?;
        if !username.is_empty() {
            set_property_string(dispatch, "UserName", &username)?;
        }
        if let Some(domain) = domain.as_deref() {
            set_property_string(dispatch, "Domain", domain)?;
        }
        set_property_i32(dispatch, "ColorDepth", 32)?;
        set_property_i32(dispatch, "DesktopWidth", desktop_width)?;
        set_property_i32(dispatch, "DesktopHeight", desktop_height)?;
        set_optional_property_bool(dispatch, "PromptForCredentials", password.is_none())?;
        set_optional_property_string(dispatch, "ConnectingText", "Connecting to remote desktop")?;
        set_optional_property_string(dispatch, "DisconnectedText", "Remote desktop disconnected")?;
        if let Some(password) = password.filter(|value| !value.is_empty()) {
            set_clear_text_password(dispatch, password);
        }

        if let Some(advanced) = get_advanced_settings(dispatch) {
            let _ = set_property_bool(&advanced, "AllowPromptingForCredentials", true);
            let _ = set_property_i32(&advanced, "RDPPort", i32::from(port));
            let _ = set_property_bool(&advanced, "EnableCredSspSupport", true);
            let _ = set_property_bool(&advanced, "RedirectClipboard", true);
            let _ = set_property_bool(&advanced, "SmartSizing", false);
        }

        Ok(())
    }

    fn split_windows_user(user: &str) -> (Option<String>, String) {
        let trimmed = user.trim();
        if let Some((domain, username)) = trimmed.split_once('\\') {
            let domain = domain.trim();
            let username = username.trim();
            if !domain.is_empty() && !username.is_empty() {
                return (Some(domain.to_string()), username.to_string());
            }
        }
        (None, trimmed.to_string())
    }

    fn get_dispid(dispatch: &IDispatch, name: &str) -> Result<i32, String> {
        let wide = wide_null(name);
        let mut name_ptr = PCWSTR(wide.as_ptr());
        let mut dispid = 0;
        unsafe {
            dispatch
                .GetIDsOfNames(
                    &windows::core::GUID::zeroed(),
                    &mut name_ptr,
                    1,
                    LOCALE_USER_DEFAULT,
                    &mut dispid,
                )
                .map_err(|error| format!("RDP ActiveX member '{name}' was not found: {error}"))?;
        }
        Ok(dispid)
    }

    fn set_property_string(dispatch: &IDispatch, name: &str, value: &str) -> Result<(), String> {
        invoke_property_put(dispatch, name, VariantArg::bstr(value))
    }

    fn set_optional_property_string(
        dispatch: &IDispatch,
        name: &str,
        value: &str,
    ) -> Result<(), String> {
        match set_property_string(dispatch, name, value) {
            Ok(()) => Ok(()),
            Err(_) => Ok(()),
        }
    }

    fn set_property_i32(dispatch: &IDispatch, name: &str, value: i32) -> Result<(), String> {
        invoke_property_put(dispatch, name, VariantArg::i4(value))
    }

    fn set_property_bool(dispatch: &IDispatch, name: &str, value: bool) -> Result<(), String> {
        invoke_property_put(dispatch, name, VariantArg::bool(value))
    }

    fn set_optional_property_bool(
        dispatch: &IDispatch,
        name: &str,
        value: bool,
    ) -> Result<(), String> {
        match set_property_bool(dispatch, name, value) {
            Ok(()) => Ok(()),
            Err(_) => Ok(()),
        }
    }

    fn set_clear_text_password(dispatch: &IDispatch, password: &str) {
        if set_property_string(dispatch, "ClearTextPassword", password).is_ok() {
            return;
        }
        if let Some(advanced) = get_advanced_settings(dispatch) {
            let _ = set_property_string(&advanced, "ClearTextPassword", password);
        }
    }

    fn get_advanced_settings(dispatch: &IDispatch) -> Option<IDispatch> {
        ADVANCED_SETTINGS_PROPERTIES
            .iter()
            .find_map(|name| get_dispatch_property(dispatch, name).ok())
    }

    fn invoke_property_put(
        dispatch: &IDispatch,
        name: &str,
        mut arg: VariantArg,
    ) -> Result<(), String> {
        let dispid = get_dispid(dispatch, name)?;
        let mut named_arg = DISPID_PROPERTYPUT;
        let mut params = DISPPARAMS {
            rgvarg: &mut arg.0,
            rgdispidNamedArgs: &mut named_arg,
            cArgs: 1,
            cNamedArgs: 1,
        };
        unsafe {
            dispatch
                .Invoke(
                    dispid,
                    &windows::core::GUID::zeroed(),
                    LOCALE_USER_DEFAULT,
                    DISPATCH_PROPERTYPUT,
                    &mut params,
                    None,
                    None,
                    None,
                )
                .map_err(|error| format!("failed to set RDP ActiveX property '{name}': {error}"))
        }
    }

    fn get_dispatch_property(dispatch: &IDispatch, name: &str) -> Result<IDispatch, String> {
        let dispid = get_dispid(dispatch, name)?;
        let mut result = VARIANT::default();
        let params = DISPPARAMS::default();
        unsafe {
            dispatch
                .Invoke(
                    dispid,
                    &windows::core::GUID::zeroed(),
                    LOCALE_USER_DEFAULT,
                    DISPATCH_PROPERTYGET,
                    &params,
                    Some(&mut result),
                    None,
                    None,
                )
                .map_err(|error| {
                    format!("failed to read RDP ActiveX property '{name}': {error}")
                })?;
            let variant_data = &*result.Anonymous.Anonymous;
            if variant_data.vt != VT_DISPATCH {
                return Err(format!(
                    "RDP ActiveX property '{name}' did not return IDispatch"
                ));
            }
            let dispatch = (*variant_data.Anonymous.pdispVal)
                .clone()
                .ok_or_else(|| format!("RDP ActiveX property '{name}' did not return IDispatch"))?;
            Ok(dispatch)
        }
    }

    fn get_property_i32(dispatch: &IDispatch, name: &str) -> Result<i32, String> {
        let dispid = get_dispid(dispatch, name)?;
        let mut result = VARIANT::default();
        let params = DISPPARAMS::default();
        unsafe {
            dispatch
                .Invoke(
                    dispid,
                    &windows::core::GUID::zeroed(),
                    LOCALE_USER_DEFAULT,
                    DISPATCH_PROPERTYGET,
                    &params,
                    Some(&mut result),
                    None,
                    None,
                )
                .map_err(|error| {
                    format!("failed to read RDP ActiveX property '{name}': {error}")
                })?;
            let variant_data = &*result.Anonymous.Anonymous;
            let value = match variant_data.vt {
                VT_I2 => i32::from(variant_data.Anonymous.iVal),
                VT_I4 => variant_data.Anonymous.lVal,
                VT_BOOL => {
                    if variant_data.Anonymous.boolVal.as_bool() {
                        1
                    } else {
                        0
                    }
                }
                _ => {
                    let _ = VariantClear(&mut result);
                    return Err(format!(
                        "RDP ActiveX property '{name}' did not return an integer state"
                    ));
                }
            };
            let _ = VariantClear(&mut result);
            Ok(value)
        }
    }

    fn invoke_method(dispatch: &IDispatch, name: &str) -> Result<(), String> {
        invoke_method_with_i32_args(dispatch, name, &[])
    }

    fn invoke_method_with_i32_args(
        dispatch: &IDispatch,
        name: &str,
        args: &[i32],
    ) -> Result<(), String> {
        let dispid = get_dispid(dispatch, name)?;
        let mut variants: Vec<VARIANT> =
            args.iter().rev().map(|value| variant_i4(*value)).collect();
        let mut params = DISPPARAMS {
            rgvarg: if variants.is_empty() {
                std::ptr::null_mut()
            } else {
                variants.as_mut_ptr()
            },
            rgdispidNamedArgs: std::ptr::null_mut(),
            cArgs: variants.len() as u32,
            cNamedArgs: 0,
        };
        let mut result = VARIANT::default();
        unsafe {
            let invoke_result = dispatch
                .Invoke(
                    dispid,
                    &windows::core::GUID::zeroed(),
                    LOCALE_USER_DEFAULT,
                    DISPATCH_METHOD,
                    &mut params,
                    Some(&mut result),
                    None,
                    None,
                )
                .map_err(|error| format!("failed to invoke RDP ActiveX method '{name}': {error}"));
            for variant in variants.iter_mut() {
                let _ = VariantClear(variant);
            }
            let _ = VariantClear(&mut result);
            invoke_result
        }
    }

    fn variant_i4(value: i32) -> VARIANT {
        let mut variant = VARIANT::default();
        unsafe {
            let variant_data = &mut *variant.Anonymous.Anonymous;
            variant_data.vt = VT_I4;
            variant_data.Anonymous.lVal = value;
        }
        variant
    }

    fn show_and_resize_rdp(
        session: &mut RdpSession,
        scale_factor: f64,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        let rect = show_rdp(
            session.hwnd,
            session.owner,
            scale_factor,
            x,
            y,
            width,
            height,
        )?;
        let desktop_width = desktop_width_for(rect.2);
        let desktop_height = desktop_height_for(rect.3);
        let _ = sync_remote_desktop_size(session, desktop_width, desktop_height, false);
        Ok(())
    }

    fn sync_remote_desktop_size(
        session: &mut RdpSession,
        desktop_width: i32,
        desktop_height: i32,
        force: bool,
    ) -> bool {
        if !force
            && !should_resize_remote_desktop(
                session.desktop_width,
                session.desktop_height,
                desktop_width,
                desktop_height,
            )
        {
            return true;
        }
        if resize_remote_desktop(&session.dispatch, desktop_width, desktop_height).is_err() {
            return false;
        }
        session.desktop_width = desktop_width;
        session.desktop_height = desktop_height;
        true
    }

    fn should_resize_remote_desktop(
        current_width: i32,
        current_height: i32,
        desktop_width: i32,
        desktop_height: i32,
    ) -> bool {
        current_width != desktop_width || current_height != desktop_height
    }

    fn resize_remote_desktop(
        dispatch: &IDispatch,
        desktop_width: i32,
        desktop_height: i32,
    ) -> Result<(), String> {
        invoke_method_with_i32_args(
            dispatch,
            "UpdateSessionDisplaySettings",
            &[
                desktop_width,
                desktop_height,
                desktop_width,
                desktop_height,
                RDP_DISPLAY_ORIENTATION_LANDSCAPE,
                RDP_DISPLAY_SCALE_FACTOR_PERCENT,
                RDP_DISPLAY_SCALE_FACTOR_PERCENT,
            ],
        )
        .or_else(|_| {
            invoke_method_with_i32_args(dispatch, "Reconnect", &[desktop_width, desktop_height])
        })
    }

    fn show_rdp(
        hwnd: HWND,
        owner: HWND,
        scale_factor: f64,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(i32, i32, i32, i32), String> {
        let rect = scaled_rect(x, y, width, height, scale_factor);
        let origin = client_to_screen_point(owner, rect.0, rect.1)?;
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                origin.0,
                origin.1,
                rect.2,
                rect.3,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|error| format!("failed to position RDP control: {error}"))?;
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Ok((origin.0, origin.1, rect.2, rect.3))
    }

    fn stage_rdp(
        hwnd: HWND,
        scale_factor: f64,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(i32, i32, i32, i32), String> {
        let rect = scaled_rect(x, y, width, height, scale_factor);
        let staged = staged_rect(rect.2, rect.3);
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                staged.0,
                staged.1,
                staged.2,
                staged.3,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|error| format!("failed to stage RDP control: {error}"))?;
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Ok(staged)
    }

    fn staged_rect(width: i32, height: i32) -> (i32, i32, i32, i32) {
        (
            HIDDEN_RDP_POSITION,
            HIDDEN_RDP_POSITION,
            width.max(1),
            height.max(1),
        )
    }

    fn client_to_screen_point(owner: HWND, x: i32, y: i32) -> Result<(i32, i32), String> {
        let mut point = POINT { x, y };
        let ok = unsafe { ClientToScreen(owner, &mut point) };
        if !ok.as_bool() {
            return Err("failed to translate RDP host coordinates to screen space".to_string());
        }
        Ok((point.x, point.y))
    }

    fn park_rdp_at_current_size(hwnd: HWND) -> Result<(), String> {
        let mut rect = RECT::default();
        unsafe {
            GetWindowRect(hwnd, &mut rect)
                .map_err(|error| format!("failed to read RDP control bounds: {error}"))?;
        }
        let width = (rect.right - rect.left).max(1);
        let height = (rect.bottom - rect.top).max(1);
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                HIDDEN_RDP_POSITION,
                HIDDEN_RDP_POSITION,
                width,
                height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|error| format!("failed to park RDP control: {error}"))?;
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Ok(())
    }

    fn scaled_rect(
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        scale_factor: f64,
    ) -> (i32, i32, i32, i32) {
        let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            1.0
        };
        (
            (x.max(0.0) * scale_factor).round() as i32,
            (y.max(0.0) * scale_factor).round() as i32,
            (width.max(1.0) * scale_factor).round() as i32,
            (height.max(1.0) * scale_factor).round() as i32,
        )
    }

    fn desktop_width_for(width: i32) -> i32 {
        width.max(RDP_MIN_DESKTOP_WIDTH)
    }

    fn desktop_height_for(height: i32) -> i32 {
        height.max(RDP_MIN_DESKTOP_HEIGHT)
    }

    fn is_rdp_connected_state(connection_state: i32) -> bool {
        connection_state != 0
    }

    fn run_on_main_thread<F, T>(app: AppHandle, f: F) -> Result<T, String>
    where
        F: FnOnce(AppHandle) -> Result<T, String> + Send + 'static,
        T: Send + 'static,
    {
        let app_for_closure = app.clone();
        let (sender, receiver) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = f(app_for_closure);
            let _ = sender.send(result);
        })
        .map_err(|error| format!("failed to dispatch RDP work to main thread: {error}"))?;
        receiver
            .recv()
            .map_err(|_| "RDP main-thread task did not return".to_string())?
    }

    fn atl_functions() -> Result<&'static AtlFunctions, String> {
        static ATL_FUNCTIONS: OnceLock<Result<AtlFunctions, String>> = OnceLock::new();
        ATL_FUNCTIONS
            .get_or_init(load_atl_functions)
            .as_ref()
            .map_err(Clone::clone)
    }

    fn load_atl_functions() -> Result<AtlFunctions, String> {
        let module = unsafe { LoadLibraryW(PCWSTR(wide_null("atl.dll").as_ptr())) }
            .map_err(|error| format!("failed to load atl.dll for ActiveX hosting: {error}"))?;
        let ax_win_init = unsafe { GetProcAddress(module, PCSTR(b"AtlAxWinInit\0".as_ptr())) }
            .ok_or_else(|| "atl.dll does not export AtlAxWinInit".to_string())?;
        let ax_get_control =
            unsafe { GetProcAddress(module, PCSTR(b"AtlAxGetControl\0".as_ptr())) }
                .ok_or_else(|| "atl.dll does not export AtlAxGetControl".to_string())?;
        Ok(AtlFunctions {
            ax_win_init: unsafe { std::mem::transmute::<_, AtlAxWinInit>(ax_win_init) },
            ax_get_control: unsafe { std::mem::transmute::<_, AtlAxGetControl>(ax_get_control) },
        })
    }

    fn lock_sessions(
        sessions: &Arc<Mutex<HashMap<String, RdpSession>>>,
    ) -> Result<MutexGuard<'_, HashMap<String, RdpSession>>, String> {
        sessions
            .lock()
            .map_err(|_| "RDP session lock is poisoned".to_string())
    }

    fn required_id(value: String) -> Result<String, String> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err("RDP session id is required".to_string());
        }
        if trimmed.len() > 96 {
            return Err("RDP session id must be 96 characters or fewer".to_string());
        }
        if !trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        {
            return Err("RDP session id may only contain letters, digits, '-' or '_'".to_string());
        }
        Ok(trimmed.to_string())
    }

    fn required_field(label: &str, value: String) -> Result<String, String> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(format!("{label} is required"));
        }
        Ok(trimmed.to_string())
    }

    fn wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    impl VariantArg {
        fn bstr(value: &str) -> Self {
            let mut variant = VARIANT::default();
            unsafe {
                let variant_data = &mut *variant.Anonymous.Anonymous;
                variant_data.vt = VT_BSTR;
                variant_data.Anonymous.bstrVal = ManuallyDrop::new(BSTR::from(value));
            }
            Self(variant)
        }

        fn i4(value: i32) -> Self {
            let mut variant = VARIANT::default();
            unsafe {
                let variant_data = &mut *variant.Anonymous.Anonymous;
                variant_data.vt = VT_I4;
                variant_data.Anonymous.lVal = value;
            }
            Self(variant)
        }

        fn bool(value: bool) -> Self {
            let mut variant = VARIANT::default();
            unsafe {
                let variant_data = &mut *variant.Anonymous.Anonymous;
                variant_data.vt = VT_BOOL;
                variant_data.Anonymous.boolVal = if value { VARIANT_TRUE } else { VARIANT_FALSE };
            }
            Self(variant)
        }
    }

    impl Drop for VariantArg {
        fn drop(&mut self) {
            unsafe {
                let _ = VariantClear(&mut self.0);
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn splits_domain_qualified_windows_users() {
            assert_eq!(
                split_windows_user("DOMAIN\\admin"),
                (Some("DOMAIN".to_string()), "admin".to_string())
            );
            assert_eq!(
                split_windows_user("admin@example.com"),
                (None, "admin@example.com".to_string())
            );
        }

        #[test]
        fn uses_registered_mstscax_progids_for_activex_creation() {
            assert_eq!(RDP_PROGIDS.first().copied(), Some("MsTscAx.MsTscAx.13"));
            assert!(RDP_PROGIDS.contains(&"MsTscAx.MsTscAx.12"));
            assert!(RDP_PROGIDS.contains(&"MsTscAx.MsTscAx"));
            assert!(
                RDP_PROGIDS
                    .iter()
                    .all(|progid| !progid.starts_with("MsRdpClient")),
                "RDP creation must use registered ProgIDs, not Microsoft Learn class names"
            );
        }

        #[test]
        fn tries_newest_advanced_settings_dispatch_before_legacy_names() {
            let names = ADVANCED_SETTINGS_PROPERTIES;
            assert_eq!(names.first().copied(), Some("AdvancedSettings12"));
            assert!(names.contains(&"AdvancedSettings2"));
            assert_eq!(names.last().copied(), Some("AdvancedSettings"));
        }

        #[test]
        fn validates_session_ids_for_native_window_labels() {
            assert_eq!(
                required_id("rdp-session_1".to_string()).as_deref(),
                Ok("rdp-session_1")
            );
            assert!(required_id("bad/session".to_string()).is_err());
        }

        #[test]
        fn scales_logical_bounds_to_physical_pixels() {
            assert_eq!(
                scaled_rect(10.0, 20.0, 800.0, 600.0, 1.5),
                (15, 30, 1200, 900)
            );
            assert_eq!(scaled_rect(-10.0, -20.0, 0.0, 0.0, 1.25), (0, 0, 1, 1));
            assert_eq!(
                scaled_rect(10.0, 20.0, 800.0, 600.0, 0.0),
                (10, 20, 800, 600)
            );
        }

        #[test]
        fn enforces_rdp_desktop_minimum_size() {
            assert_eq!(desktop_width_for(320), RDP_MIN_DESKTOP_WIDTH);
            assert_eq!(desktop_height_for(240), RDP_MIN_DESKTOP_HEIGHT);
            assert_eq!(desktop_width_for(1200), 1200);
            assert_eq!(desktop_height_for(900), 900);
        }

        #[test]
        fn treats_unknown_desktop_size_as_needing_resize() {
            assert!(should_resize_remote_desktop(0, 0, 1920, 1080));
            assert!(should_resize_remote_desktop(1920, 1080, 2048, 1080));
            assert!(!should_resize_remote_desktop(1920, 1080, 1920, 1080));
        }

        #[test]
        fn stages_rdp_control_offscreen_at_requested_size() {
            assert_eq!(
                staged_rect(1920, 1080),
                (HIDDEN_RDP_POSITION, HIDDEN_RDP_POSITION, 1920, 1080)
            );
            assert_eq!(
                staged_rect(0, -10),
                (HIDDEN_RDP_POSITION, HIDDEN_RDP_POSITION, 1, 1)
            );
        }

        #[test]
        fn treats_zero_rdp_connected_state_as_disconnected() {
            assert!(!is_rdp_connected_state(0));
            assert!(is_rdp_connected_state(1));
            assert!(is_rdp_connected_state(2));
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use serde::{Deserialize, Serialize};
    use tauri::AppHandle;

    #[derive(Clone)]
    pub struct RdpSessionManager;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct StartRdpSessionRequest {
        pub session_id: String,
        pub host: String,
        pub user: String,
        pub port: Option<u16>,
        pub secret_owner_id: Option<String>,
        pub password: Option<String>,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSessionStarted {
        session_id: String,
        host: String,
        port: u16,
        control: String,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSessionStatus {
        session_id: String,
        connection_state: i32,
        connected: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct UpdateRdpBoundsRequest {
        pub session_id: String,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SetRdpVisibilityRequest {
        pub session_id: String,
        pub visible: bool,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SyncRdpDisplaySizeRequest {
        pub session_id: String,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpDisplaySizeSync {
        session_id: String,
        connection_state: i32,
        connected: bool,
        display_synced: bool,
        desktop_width: i32,
        desktop_height: i32,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct RdpSimpleRequest {
        pub session_id: String,
    }

    impl RdpSessionManager {
        pub fn new() -> Self {
            Self
        }

        pub fn start_session(
            &self,
            _app: AppHandle,
            _request: StartRdpSessionRequest,
        ) -> Result<RdpSessionStarted, String> {
            Err("RDP sessions require Windows and the Microsoft RDP ActiveX control".to_string())
        }

        pub fn update_bounds(
            &self,
            _app: AppHandle,
            _request: UpdateRdpBoundsRequest,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn set_visibility(
            &self,
            _app: AppHandle,
            _request: SetRdpVisibilityRequest,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn sync_display_size(
            &self,
            _app: AppHandle,
            request: SyncRdpDisplaySizeRequest,
        ) -> Result<RdpDisplaySizeSync, String> {
            Ok(RdpDisplaySizeSync {
                session_id: request.session_id,
                connection_state: 0,
                connected: false,
                display_synced: false,
                desktop_width: 0,
                desktop_height: 0,
            })
        }

        pub fn close_session(
            &self,
            _app: AppHandle,
            _request: RdpSimpleRequest,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn session_status(
            &self,
            _app: AppHandle,
            request: RdpSimpleRequest,
        ) -> Result<RdpSessionStatus, String> {
            Ok(RdpSessionStatus {
                session_id: request.session_id,
                connection_state: 0,
                connected: is_rdp_connected_state(0),
            })
        }
    }

    fn is_rdp_connected_state(connection_state: i32) -> bool {
        connection_state != 0
    }

    impl StartRdpSessionRequest {
        pub(crate) fn secret_owner_id(&self) -> Option<&str> {
            self.secret_owner_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        }

        pub(crate) fn password(&self) -> Option<&str> {
            self.password.as_deref().filter(|value| !value.is_empty())
        }

        pub(crate) fn set_password(&mut self, password: Option<String>) {
            self.password = password;
        }
    }
}

pub use platform::*;
