use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard,
    },
};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{DownloadEvent, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
};

const HOST_WINDOW_LABEL: &str = "main";
const DEFAULT_PARTITION: &str = "shared";
const HIDDEN_WEBVIEW_POSITION: f64 = -32_000.0;
const AUTOFILL_AGENT: &str = r#"
(() => {
  const TITLE_CHANNEL = "__KKTERM_URL_CREDENTIAL__";
  const agent = {
    fill(credential) {
      const result = fillCredential(credential);
      if (result.filled) {
        return result;
      }
      observeForCredentialFields(credential);
      return result;
    },
    capture(nonce) {
      const passwordInput = findPasswordInput(true);
      if (!passwordInput) {
        publish({ ok: false, nonce, reason: "no-password-field", url: window.location.href });
        return;
      }
      const password = passwordInput.value || "";
      if (!password) {
        publish({ ok: false, nonce, reason: "empty-password", url: window.location.href });
        return;
      }
      const usernameInput = findUsernameInput(passwordInput);
      const username = usernameInput?.value || "";
      if (!username) {
        publish({ ok: false, nonce, reason: "empty-username", url: window.location.href });
        return;
      }
      publish({
        ok: true,
        nonce,
        url: window.location.href,
        username,
        password,
        usernameSelector: usernameInput ? selectorFor(usernameInput) : undefined,
        passwordSelector: selectorFor(passwordInput),
      });
    },
  };

  function publish(payload) {
    const previousTitle = document.title;
    document.title = `${TITLE_CHANNEL}${JSON.stringify(payload)}`;
    window.setTimeout(() => {
      if (document.title.startsWith(TITLE_CHANNEL)) {
        document.title = previousTitle;
      }
    }, 150);
  }

  let pendingFillObserver;
  let pendingFillTimer;

  function fillCredential(credential) {
    const passwordInput = inputFromSelector(credential.passwordSelector) || findPasswordInput(false);
    if (!passwordInput) {
      return { filled: false, reason: "no-password-field" };
    }
    if (credential.automatic && passwordInput.value) {
      return { filled: false, reason: "password-already-entered" };
    }

    const usernameInput = inputFromSelector(credential.usernameSelector) || findUsernameInput(passwordInput);
    if (usernameInput && credential.username && (!credential.automatic || !usernameInput.value)) {
      setInputValue(usernameInput, credential.username);
    }
    setInputValue(passwordInput, credential.password);
    if (!credential.automatic) {
      passwordInput.focus({ preventScroll: true });
    }
    return { filled: true, usernameFilled: Boolean(usernameInput && credential.username) };
  }

  function observeForCredentialFields(credential) {
    if (pendingFillObserver) {
      pendingFillObserver.disconnect();
    }
    if (pendingFillTimer) {
      window.clearTimeout(pendingFillTimer);
    }
    pendingFillObserver = new MutationObserver(() => {
      if (fillCredential(credential).filled) {
        pendingFillObserver?.disconnect();
        pendingFillObserver = undefined;
        if (pendingFillTimer) {
          window.clearTimeout(pendingFillTimer);
          pendingFillTimer = undefined;
        }
      }
    });
    pendingFillObserver.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    pendingFillTimer = window.setTimeout(() => {
      pendingFillObserver?.disconnect();
      pendingFillObserver = undefined;
      pendingFillTimer = undefined;
    }, 10000);
  }

  function inputFromSelector(selector) {
    if (!selector) {
      return undefined;
    }
    try {
      const input = document.querySelector(selector);
      return isUsableInput(input) ? input : undefined;
    } catch (_) {
      return undefined;
    }
  }

  function findPasswordInput(requireValue) {
    return Array.from(document.querySelectorAll("input[type='password']"))
      .filter(isUsableInput)
      .filter((input) => !requireValue || input.value)
      .sort((left, right) => visibleScore(right) - visibleScore(left))[0];
  }

  function findUsernameInput(passwordInput) {
    const form = passwordInput.form || passwordInput.closest("form") || document;
    const candidates = Array.from(form.querySelectorAll("input")).filter((input) => {
      if (!isUsableInput(input) || input === passwordInput) {
        return false;
      }
      const type = (input.getAttribute("type") || "text").toLowerCase();
      return ["", "text", "email", "tel", "search", "url"].includes(type);
    });
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates
      .map((input, index) => ({ input, index, score: usernameScore(input, index, passwordInput) }))
      .sort((left, right) => right.score - left.score || right.index - left.index)[0].input;
  }

  function usernameScore(input, index, passwordInput) {
    const label = [
      input.name,
      input.id,
      input.getAttribute("autocomplete"),
      input.getAttribute("aria-label"),
      input.placeholder,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = index;
    if (input.value) {
      score += 40;
    }
    if (/user|email|login|account|name/.test(label)) {
      score += 100;
    }
    if (/one-time|otp|code|search/.test(label)) {
      score -= 100;
    }
    if (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING) {
      score += 20;
    }
    return score;
  }

  function visibleScore(input) {
    const rect = input.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function isUsableInput(input) {
    return input instanceof HTMLInputElement &&
      !input.disabled &&
      !input.readOnly &&
      input.type !== "hidden" &&
      input.offsetParent !== null;
  }

  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor.set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function selectorFor(input) {
    const stable = ["id", "name", "autocomplete", "aria-label", "placeholder"];
    for (const attr of stable) {
      const value = input.getAttribute(attr);
      if (value) {
        const selector = `input[${CSS.escape(attr)}=${JSON.stringify(value)}]`;
        try {
          if (document.querySelector(selector) === input) {
            return selector;
          }
        } catch (_) {}
      }
    }
    const type = input.getAttribute("type") || "text";
    const inputs = Array.from(document.querySelectorAll(`input[type='${CSS.escape(type)}']`));
    const index = inputs.indexOf(input);
    return index >= 0 ? `input[type='${CSS.escape(type)}']:nth-of-type(${index + 1})` : "input";
  }

  Object.defineProperty(window, "__KKTERM_URL_AUTOFILL__", {
    configurable: true,
    value: agent,
  });
})();
"#;
pub struct WebviewSessionManager {
    sessions: Mutex<HashMap<String, Webview>>,
    starting_sessions: Mutex<HashSet<String>>,
    clipboard_read_allowed: Arc<AtomicBool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWebviewSessionRequest {
    session_id: String,
    url: String,
    data_partition: Option<String>,
    #[serde(default)]
    ignore_certificate_errors: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSessionStarted {
    session_id: String,
    label: String,
    partition: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWebviewBoundsRequest {
    session_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWebviewVisibilityRequest {
    session_id: String,
    visible: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewNavigateRequest {
    session_id: String,
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSimpleRequest {
    session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewCaptureCredentialRequest {
    session_id: String,
    nonce: String,
}

pub(crate) struct WebviewFillCredentialRequest {
    pub(crate) session_id: String,
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) username_selector: Option<String>,
    pub(crate) password_selector: Option<String>,
    pub(crate) automatic: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewNavigationPayload {
    session_id: String,
    url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewPageLoadPayload {
    session_id: String,
    url: String,
    status: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewTitleChangedPayload {
    session_id: String,
    title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewDownloadPayload {
    session_id: String,
    url: String,
    status: &'static str,
    path: Option<String>,
    success: Option<bool>,
}

impl WebviewSessionManager {
    pub fn new(allow_clipboard_read: bool) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            starting_sessions: Mutex::new(HashSet::new()),
            clipboard_read_allowed: Arc::new(AtomicBool::new(allow_clipboard_read)),
        }
    }

    pub fn set_clipboard_read_allowed(&self, allowed: bool) {
        self.clipboard_read_allowed
            .store(allowed, Ordering::Relaxed);
    }

    pub fn clipboard_read_allowed_state(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.clipboard_read_allowed)
    }

    pub fn start_session(
        &self,
        app: &AppHandle,
        request: StartWebviewSessionRequest,
    ) -> Result<WebviewSessionStarted, String> {
        let StartWebviewSessionRequest {
            session_id,
            url,
            data_partition,
            ignore_certificate_errors,
            x,
            y,
            width,
            height,
        } = request;

        let session_id = required_id(session_id)?;
        let parsed_url = parse_external_url(&url)?;
        // WebView2 only supports one user-data folder per process. Tauri's
        // host webview already owns one, so a child webview that asks for a
        // different `data_directory` triggers a controller-creation crash
        // inside `EmbeddedBrowserWebView.dll`. For Phase 1 every URL session
        // shares the host process's data store; cookies and storage are
        // therefore shared across all URL connections. Real per-connection
        // isolation needs a separate WebView2 process and is deferred.
        let partition = resolve_partition(data_partition);

        {
            let sessions = self.lock()?;
            if sessions.contains_key(&session_id) {
                return Err(format!("webview session '{session_id}' is already running"));
            }
        }
        {
            let mut starting_sessions = self.lock_starting()?;
            if !starting_sessions.insert(session_id.clone()) {
                return Err(format!(
                    "webview session '{session_id}' is already starting"
                ));
            }
        }

        let host_window = app.get_window(HOST_WINDOW_LABEL).map_or_else(
            || {
                self.clear_starting(&session_id);
                Err(format!(
                    "host window '{HOST_WINDOW_LABEL}' is not available"
                ))
            },
            Ok,
        )?;

        let label = webview_label_for(&session_id);
        let navigation_app = app.clone();
        let navigation_session_id = session_id.clone();
        let page_load_app = app.clone();
        let page_load_session_id = session_id.clone();
        let title_app = app.clone();
        let title_session_id = session_id.clone();
        let download_app = app.clone();
        let download_session_id = session_id.clone();
        let initial_webview_url = if ignore_certificate_errors && cfg!(windows) {
            parse_webview_blank_url()?
        } else {
            parsed_url.clone()
        };
        let builder = WebviewBuilder::new(&label, WebviewUrl::External(initial_webview_url))
            .initialization_script(AUTOFILL_AGENT)
            .on_navigation(move |url| {
                let _ = navigation_app.emit(
                    "webview-navigation",
                    WebviewNavigationPayload {
                        session_id: navigation_session_id.clone(),
                        url: url.to_string(),
                    },
                );
                true
            })
            .on_page_load(move |_webview, payload| {
                let status = match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                };
                let _ = page_load_app.emit(
                    "webview-page-load",
                    WebviewPageLoadPayload {
                        session_id: page_load_session_id.clone(),
                        url: payload.url().to_string(),
                        status,
                    },
                );
            })
            .on_document_title_changed(move |_webview, title| {
                let _ = title_app.emit(
                    "webview-title-changed",
                    WebviewTitleChangedPayload {
                        session_id: title_session_id.clone(),
                        title,
                    },
                );
            })
            .on_download(move |_webview, event| {
                let payload = match event {
                    DownloadEvent::Requested { url, destination } => WebviewDownloadPayload {
                        session_id: download_session_id.clone(),
                        url: url.to_string(),
                        status: "requested",
                        path: Some(destination.display().to_string()),
                        success: None,
                    },
                    DownloadEvent::Finished { url, path, success } => WebviewDownloadPayload {
                        session_id: download_session_id.clone(),
                        url: url.to_string(),
                        status: "finished",
                        path: path.map(|path| path.display().to_string()),
                        success: Some(success),
                    },
                    _ => WebviewDownloadPayload {
                        session_id: download_session_id.clone(),
                        url: String::new(),
                        status: "unknown",
                        path: None,
                        success: None,
                    },
                };
                let _ = download_app.emit("webview-download", payload);
                true
            })
            .auto_resize();

        let position = LogicalPosition::new(x.max(0.0), y.max(0.0));
        let size = LogicalSize::new(width.max(1.0), height.max(1.0));

        let webview = host_window
            .add_child(builder, position, size)
            .map_err(|error| {
                self.clear_starting(&session_id);
                format!("failed to attach child webview: {error}")
            })?;

        configure_clipboard_read_permission(&webview, Arc::clone(&self.clipboard_read_allowed))?;
        configure_certificate_error_bypass(&webview, ignore_certificate_errors)?;
        if ignore_certificate_errors && cfg!(windows) {
            webview
                .navigate(parsed_url)
                .map_err(|error| format!("failed to navigate webview: {error}"))?;
        }

        let mut sessions = self.lock()?;
        sessions.insert(session_id.clone(), webview);
        self.clear_starting(&session_id);

        Ok(WebviewSessionStarted {
            session_id,
            label,
            partition,
        })
    }

    pub fn update_bounds(&self, request: UpdateWebviewBoundsRequest) -> Result<(), String> {
        let UpdateWebviewBoundsRequest {
            session_id,
            x,
            y,
            width,
            height,
        } = request;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&session_id)
            .ok_or_else(|| format!("webview session '{session_id}' was not found"))?;
        show_webview(webview, x, y, width, height)?;
        Ok(())
    }

    // Tauri 2's child webview has no native visibility toggle, so a "hidden"
    // webview is moved offscreen with a 1x1 footprint. The frontend re-sends
    // the placeholder rect when revealing again, so the size restore is
    // authoritative rather than cached state.
    pub fn set_visibility(&self, request: SetWebviewVisibilityRequest) -> Result<(), String> {
        let SetWebviewVisibilityRequest {
            session_id,
            visible,
            x,
            y,
            width,
            height,
        } = request;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&session_id)
            .ok_or_else(|| format!("webview session '{session_id}' was not found"))?;
        if visible {
            for (other_session_id, other_webview) in sessions.iter() {
                if other_session_id != &session_id {
                    hide_webview(other_webview)?;
                }
            }
            show_webview(webview, x, y, width, height)?;
        } else {
            hide_webview(webview)?;
        }
        Ok(())
    }

    pub fn navigate(&self, request: WebviewNavigateRequest) -> Result<(), String> {
        let url = parse_external_url(&request.url)?;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .navigate(url)
            .map_err(|error| format!("failed to navigate webview: {error}"))
    }

    pub fn reload(&self, request: WebviewSimpleRequest) -> Result<(), String> {
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval("window.location.reload();")
            .map_err(|error| format!("failed to reload webview: {error}"))
    }

    pub fn go_back(&self, request: WebviewSimpleRequest) -> Result<(), String> {
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval("window.history.back();")
            .map_err(|error| format!("failed to navigate webview back: {error}"))
    }

    pub fn go_forward(&self, request: WebviewSimpleRequest) -> Result<(), String> {
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval("window.history.forward();")
            .map_err(|error| format!("failed to navigate webview forward: {error}"))
    }

    pub(crate) fn fill_credential(
        &self,
        request: WebviewFillCredentialRequest,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "username": request.username,
            "password": request.password,
            "usernameSelector": request.username_selector,
            "passwordSelector": request.password_selector,
            "automatic": request.automatic,
        });
        let payload = serde_json::to_string(&payload)
            .map_err(|error| format!("failed to prepare URL credential payload: {error}"))?;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval(format!(
                "window.__KKTERM_URL_AUTOFILL__?.fill({payload});"
            ))
            .map_err(|error| format!("failed to fill webview credential: {error}"))
    }

    pub fn capture_credential(
        &self,
        request: WebviewCaptureCredentialRequest,
    ) -> Result<(), String> {
        let nonce = serde_json::to_string(&request.nonce)
            .map_err(|error| format!("failed to prepare URL credential capture nonce: {error}"))?;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval(format!(
                "window.__KKTERM_URL_AUTOFILL__?.capture({nonce});"
            ))
            .map_err(|error| format!("failed to capture webview credential: {error}"))
    }

    pub fn close_session(&self, request: WebviewSimpleRequest) -> Result<(), String> {
        let mut sessions = self.lock()?;
        if let Some(webview) = sessions.remove(&request.session_id) {
            webview
                .close()
                .map_err(|error| format!("failed to close webview: {error}"))?;
        }
        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, HashMap<String, Webview>>, String> {
        self.sessions
            .lock()
            .map_err(|_| "webview session lock is poisoned".to_string())
    }

    fn lock_starting(&self) -> Result<MutexGuard<'_, HashSet<String>>, String> {
        self.starting_sessions
            .lock()
            .map_err(|_| "webview startup lock is poisoned".to_string())
    }

    fn clear_starting(&self, session_id: &str) {
        if let Ok(mut starting_sessions) = self.starting_sessions.lock() {
            starting_sessions.remove(session_id);
        }
    }
}

fn webview_label_for(session_id: &str) -> String {
    format!("url-session-{session_id}")
}

fn show_webview(webview: &Webview, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    webview
        .set_position(LogicalPosition::new(x.max(0.0), y.max(0.0)))
        .map_err(|error| format!("failed to position webview: {error}"))?;
    webview
        .set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|error| format!("failed to size webview: {error}"))
}

fn hide_webview(webview: &Webview) -> Result<(), String> {
    webview
        .set_position(LogicalPosition::new(
            HIDDEN_WEBVIEW_POSITION,
            HIDDEN_WEBVIEW_POSITION,
        ))
        .map_err(|error| format!("failed to hide webview: {error}"))?;
    webview
        .set_size(LogicalSize::new(1.0, 1.0))
        .map_err(|error| format!("failed to hide webview: {error}"))
}

fn configure_certificate_error_bypass(webview: &Webview, enabled: bool) -> Result<(), String> {
    if !enabled {
        return Ok(());
    }
    configure_platform_certificate_error_bypass(webview)
}

pub(crate) fn configure_shell_clipboard_read_permission(
    webview: &tauri::WebviewWindow,
    allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    configure_platform_shell_clipboard_read_permission(webview, allowed)
}

fn configure_clipboard_read_permission(
    webview: &Webview,
    allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    configure_platform_clipboard_read_permission(webview, allowed)
}

#[cfg(windows)]
fn configure_platform_shell_clipboard_read_permission(
    webview: &tauri::WebviewWindow,
    allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    configure_webview2_clipboard_permission(webview, allowed)
}

#[cfg(not(windows))]
fn configure_platform_shell_clipboard_read_permission(
    _webview: &tauri::WebviewWindow,
    _allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn configure_platform_clipboard_read_permission(
    webview: &Webview,
    allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    configure_webview2_clipboard_permission(webview, allowed)
}

#[cfg(windows)]
fn configure_webview2_clipboard_permission<T>(
    webview: &T,
    allowed: Arc<AtomicBool>,
) -> Result<(), String>
where
    T: Webview2PermissionTarget,
{
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2PermissionRequestedEventArgs2,
            COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        },
        PermissionRequestedEventHandler,
    };
    use windows::core::Interface;

    let setup_error = Arc::new(Mutex::new(None::<String>));
    let setup_error_for_callback = Arc::clone(&setup_error);

    webview
        .with_webview_for_permission(move |platform_webview| {
            let result = (|| -> Result<(), String> {
                unsafe {
                    let webview2 = platform_webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|error| error.to_string())?;
                    let handler =
                        PermissionRequestedEventHandler::create(Box::new(move |_sender, args| {
                            if let Some(args) = args {
                                let mut permission_kind =
                                    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ;
                                args.PermissionKind(&mut permission_kind)?;
                                if permission_kind == COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ {
                                    if allowed.load(Ordering::Relaxed) {
                                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                    }
                                    if let Ok(args2) =
                                        args.cast::<ICoreWebView2PermissionRequestedEventArgs2>()
                                    {
                                        args2.SetHandled(true)?;
                                    }
                                }
                            }
                            Ok(())
                        }));
                    let mut token = 0;
                    webview2
                        .add_PermissionRequested(&handler, &mut token)
                        .map_err(|error| error.to_string())?;
                }
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                if let Ok(mut setup_error) = setup_error_for_callback.lock() {
                    *setup_error = Some(error);
                }
            }
        })
        .map_err(|error| format!("failed to access WebView2 for clipboard settings: {error}"))?;

    if let Ok(mut setup_error) = setup_error.lock() {
        if let Some(error) = setup_error.take() {
            return Err(format!(
                "failed to configure clipboard paste permission for WebView2: {error}"
            ));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn configure_platform_clipboard_read_permission(
    _webview: &Webview,
    _allowed: Arc<AtomicBool>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
trait Webview2PermissionTarget {
    fn with_webview_for_permission<F>(&self, f: F) -> Result<(), tauri::Error>
    where
        F: FnOnce(tauri::webview::PlatformWebview) + Send + 'static;
}

#[cfg(windows)]
impl Webview2PermissionTarget for Webview {
    fn with_webview_for_permission<F>(&self, f: F) -> Result<(), tauri::Error>
    where
        F: FnOnce(tauri::webview::PlatformWebview) + Send + 'static,
    {
        self.with_webview(f)
    }
}

#[cfg(windows)]
impl Webview2PermissionTarget for tauri::WebviewWindow {
    fn with_webview_for_permission<F>(&self, f: F) -> Result<(), tauri::Error>
    where
        F: FnOnce(tauri::webview::PlatformWebview) + Send + 'static,
    {
        self.with_webview(f)
    }
}

#[cfg(windows)]
fn configure_platform_certificate_error_bypass(webview: &Webview) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_14, COREWEBVIEW2_SERVER_CERTIFICATE_ERROR_ACTION_ALWAYS_ALLOW,
        },
        ServerCertificateErrorDetectedEventHandler,
    };
    use windows::core::Interface;

    let setup_error = Arc::new(Mutex::new(None::<String>));
    let setup_error_for_callback = Arc::clone(&setup_error);

    webview
        .with_webview(move |platform_webview| {
            let result = (|| -> Result<(), String> {
                unsafe {
                    let webview2 = platform_webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|error| error.to_string())?;
                    let webview2 = webview2
                        .cast::<ICoreWebView2_14>()
                        .map_err(|error| error.to_string())?;
                    let handler = ServerCertificateErrorDetectedEventHandler::create(Box::new(
                        move |_sender, args| {
                            if let Some(args) = args {
                                args.SetAction(
                                    COREWEBVIEW2_SERVER_CERTIFICATE_ERROR_ACTION_ALWAYS_ALLOW,
                                )?;
                            }
                            Ok(())
                        },
                    ));
                    let mut token = 0;
                    webview2
                        .add_ServerCertificateErrorDetected(&handler, &mut token)
                        .map_err(|error| error.to_string())?;
                }
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                if let Ok(mut setup_error) = setup_error_for_callback.lock() {
                    *setup_error = Some(error);
                }
            }
        })
        .map_err(|error| format!("failed to access WebView2 for certificate settings: {error}"))?;

    if let Ok(mut setup_error) = setup_error.lock() {
        if let Some(error) = setup_error.take() {
            return Err(format!(
                "failed to enable URL certificate bypass for WebView2: {error}"
            ));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn configure_platform_certificate_error_bypass(_webview: &Webview) -> Result<(), String> {
    Ok(())
}

fn required_id(value: String) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("webview session id is required".to_string());
    }
    if trimmed.len() > 96 {
        return Err("webview session id must be 96 characters or fewer".to_string());
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("webview session id may only contain letters, digits, '-' or '_'".to_string());
    }
    Ok(trimmed.to_string())
}

fn parse_webview_blank_url() -> Result<url::Url, String> {
    url::Url::parse("about:blank").map_err(|error| format!("blank URL is not valid: {error}"))
}

fn parse_external_url(value: &str) -> Result<url::Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("URL is required".to_string());
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let parsed =
        url::Url::parse(&candidate).map_err(|error| format!("URL is not valid: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        other => Err(format!("URL scheme must be http or https, got {other}")),
    }
}

fn resolve_partition(data_partition: Option<String>) -> String {
    data_partition
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_PARTITION.to_string())
}
