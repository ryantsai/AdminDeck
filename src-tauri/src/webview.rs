use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, MutexGuard},
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
  const agent = {
    fill(credential) {
      const passwordInput = findPasswordInput();
      if (!passwordInput) {
        return { filled: false, reason: "no-password-field" };
      }

      const usernameInput = findUsernameInput(passwordInput);
      if (usernameInput && credential.username) {
        setInputValue(usernameInput, credential.username);
      }
      setInputValue(passwordInput, credential.password);
      passwordInput.focus({ preventScroll: true });
      return { filled: true, usernameFilled: Boolean(usernameInput && credential.username) };
    },
  };

  function findPasswordInput() {
    return Array.from(document.querySelectorAll("input[type='password']")).find(isUsableInput);
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
      .map((input, index) => ({ input, index, score: usernameScore(input, index) }))
      .sort((left, right) => right.score - left.score || right.index - left.index)[0].input;
  }

  function usernameScore(input, index) {
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
    if (/user|email|login|account|name/.test(label)) {
      score += 100;
    }
    if (/one-time|otp|code|search/.test(label)) {
      score -= 100;
    }
    return score;
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

  Object.defineProperty(window, "__ADMINDECK_URL_AUTOFILL__", {
    configurable: true,
    value: agent,
  });
})();
"#;

pub struct WebviewSessionManager {
    sessions: Mutex<HashMap<String, Webview>>,
    starting_sessions: Mutex<HashSet<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWebviewSessionRequest {
    session_id: String,
    url: String,
    data_partition: Option<String>,
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

pub(crate) struct WebviewFillCredentialRequest {
    pub(crate) session_id: String,
    pub(crate) username: String,
    pub(crate) password: String,
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
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            starting_sessions: Mutex::new(HashSet::new()),
        }
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
        let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
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
        });
        let payload = serde_json::to_string(&payload)
            .map_err(|error| format!("failed to prepare URL credential payload: {error}"))?;
        let sessions = self.lock()?;
        let webview = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("webview session '{}' was not found", request.session_id))?;
        webview
            .eval(format!(
                "window.__ADMINDECK_URL_AUTOFILL__?.fill({payload});"
            ))
            .map_err(|error| format!("failed to fill webview credential: {error}"))
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
