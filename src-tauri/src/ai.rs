use futures::StreamExt;
use github_copilot_sdk::{
    Client as CopilotSdkClient, ClientOptions as CopilotSdkClientOptions, Error as CopilotSdkError,
    LogLevel as CopilotSdkLogLevel, MessageOptions as CopilotSdkMessageOptions,
    Model as CopilotSdkModel, SessionConfig as CopilotSdkSessionConfig,
    SessionEvent as CopilotSdkSessionEvent,
};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;
use tokio::time::timeout;

mod providers;
use providers::provider_for;
use tauri::ipc::Channel;
use tauri::{Emitter, Manager};

use crate::dashboard_ids::new_dashboard_id;
use crate::dashboard_storage as ds;
use crate::storage::{
    ai_provider_secret_owner_id, AiAssistantToolSettings, AiProviderSettings, Storage,
};

static LIVE_TOOL_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);
const COPILOT_SDK_RESPONSE_TIMEOUT: Duration = Duration::from_secs(300);

macro_rules! ai_interaction_debug {
    ($event:expr, $payload:expr) => {
        if cfg!(debug_assertions) {
            let payload = $payload;
            crate::logging::ai_assistant_debug($event, &payload);
        }
    };
}

pub struct AssistantLiveToolBridge {
    pending: Mutex<HashMap<String, oneshot::Sender<String>>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModelOption {
    pub id: String,
    pub label: String,
    pub supports_image_input: Option<bool>,
}

pub type AiProviderModelOption = CopilotModelOption;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAiProviderModelsRequest {
    provider_kind: String,
    base_url: String,
    #[serde(default)]
    allow_insecure_tls: bool,
}

impl ListAiProviderModelsRequest {
    pub(crate) fn provider_kind(&self) -> &str {
        &self.provider_kind
    }

    pub(crate) fn base_url(&self) -> &str {
        &self.base_url
    }

    pub(crate) fn allow_insecure_tls(&self) -> bool {
        self.allow_insecure_tls
    }
}

#[derive(Clone, Copy)]
enum AiProviderModelListStrategy {
    GitHubCopilotSdk,
    OllamaTags,
    OpenAiCompatible,
}

impl AssistantLiveToolBridge {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    async fn request(&self, app: &tauri::AppHandle, tool_name: &str, args: Value) -> String {
        let request_id = new_live_tool_request_id();
        let (tx, rx) = oneshot::channel();
        match self.pending.lock() {
            Ok(mut pending) => {
                pending.insert(request_id.clone(), tx);
            }
            Err(_) => {
                return json!({"ok": false, "error": "live tool bridge is unavailable"})
                    .to_string();
            }
        }

        let payload = json!({
            "requestId": request_id,
            "toolName": tool_name,
            "args": args,
        });
        ai_interaction_debug!("live_tool.request", payload.clone());
        if let Err(error) = app.emit("assistant-live-tool-request", payload) {
            let _ = self.take_pending(&request_id);
            ai_interaction_debug!(
                "live_tool.dispatch_error",
                json!({
                    "requestId": request_id,
                    "toolName": tool_name,
                    "error": error.to_string(),
                })
            );
            return json!({"ok": false, "error": format!("failed to dispatch live tool request: {error}")})
                .to_string();
        }

        match timeout(Duration::from_secs(15), rx).await {
            Ok(Ok(result)) => {
                ai_interaction_debug!(
                    "live_tool.result",
                    json!({
                        "requestId": request_id,
                        "toolName": tool_name,
                        "result": result,
                    })
                );
                result
            }
            Ok(Err(_)) => {
                ai_interaction_debug!(
                    "live_tool.channel_closed",
                    json!({
                        "requestId": request_id,
                        "toolName": tool_name,
                    })
                );
                json!({"ok": false, "error": "live tool response channel closed"}).to_string()
            }
            Err(_) => {
                let _ = self.take_pending(&request_id);
                ai_interaction_debug!(
                    "live_tool.timeout",
                    json!({
                        "requestId": request_id,
                        "toolName": tool_name,
                    })
                );
                json!({"ok": false, "error": "live tool timed out waiting for the frontend"})
                    .to_string()
            }
        }
    }

    fn complete(&self, request_id: &str, result: String) -> Result<(), String> {
        let sender = self
            .take_pending(request_id)
            .ok_or_else(|| "live tool request is no longer pending".to_string())?;
        sender
            .send(result)
            .map_err(|_| "live tool receiver is no longer available".to_string())
    }

    fn take_pending(&self, request_id: &str) -> Option<oneshot::Sender<String>> {
        self.pending
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(request_id))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantLiveToolCompletion {
    request_id: String,
    result: String,
}

pub fn complete_live_tool_request(
    bridge: &AssistantLiveToolBridge,
    completion: AssistantLiveToolCompletion,
) -> Result<(), String> {
    ai_interaction_debug!(
        "live_tool.frontend_completion",
        json!({
            "requestId": completion.request_id,
            "result": completion.result,
        })
    );
    bridge.complete(&completion.request_id, completion.result)
}

fn new_live_tool_request_id() -> String {
    let seq = LIVE_TOOL_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("live-tool-{millis}-{seq}")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProposalRequest {
    prompt: String,
    command: String,
    reason: String,
    context_label: String,
    selected_output: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProposalPlan {
    prompt: String,
    command: String,
    reason: String,
    context_label: String,
    risk_label: String,
    approval_required: bool,
    extra_confirmation_required: bool,
    safety_notes: Vec<String>,
}

pub fn plan_command_proposal(
    request: CommandProposalRequest,
) -> Result<CommandProposalPlan, String> {
    let prompt = trim_required("proposal request", request.prompt)?;
    let command = trim_required("proposed command", request.command)?;
    let reason = trim_required("proposal reason", request.reason)?;
    let context_label = trim_required("proposal context", request.context_label)?;
    let selected_output = request
        .selected_output
        .map(|output| output.trim().to_string())
        .filter(|output| !output.is_empty());
    let safety = classify_command_safety(&command, selected_output.as_deref());

    Ok(CommandProposalPlan {
        prompt,
        command,
        reason,
        context_label,
        risk_label: if safety.extra_confirmation_required {
            "Extra confirmation".to_string()
        } else {
            "Approval required".to_string()
        },
        approval_required: true,
        extra_confirmation_required: safety.extra_confirmation_required,
        safety_notes: safety.notes,
    })
}

struct CommandSafety {
    extra_confirmation_required: bool,
    notes: Vec<String>,
}

fn classify_command_safety(command: &str, selected_output: Option<&str>) -> CommandSafety {
    let normalized = command.to_ascii_lowercase();
    let mut notes = Vec::new();
    let mut extra_confirmation_required = false;
    if selected_output.is_some() {
        notes.push(
            "Selected terminal output is included in the assistant context for this proposal."
                .to_string(),
        );
    }

    if contains_any(
        &normalized,
        &[
            "rm -rf",
            "remove-item",
            " rmdir ",
            " del ",
            " format ",
            "mkfs",
            "diskpart",
            "dd if=",
            "shutdown",
            "reboot",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("May delete, overwrite, reboot, or otherwise change system state.".to_string());
    }

    if contains_any(
        &normalized,
        &[
            "systemctl restart",
            "systemctl stop",
            "restart-service",
            "stop-service",
            "docker rm",
            "kubectl delete",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("May interrupt a service or running workload.".to_string());
    }

    if contains_any(
        &normalized,
        &[
            "password",
            "passwd",
            "secret",
            "token",
            "api_key",
            "apikey",
            "id_rsa",
            "id_ed25519",
            ".ssh",
        ],
    ) {
        extra_confirmation_required = true;
        notes.push("Mentions credentials, tokens, or SSH key material.".to_string());
    }

    if selected_output.is_some_and(mentions_sensitive_material) {
        extra_confirmation_required = true;
        notes.push(
            "Selected output may contain credentials, tokens, or SSH key material.".to_string(),
        );
    }

    if notes.is_empty() {
        notes.push(
            "Read-only or low-impact intent was detected, but approval is still required."
                .to_string(),
        );
    }

    CommandSafety {
        extra_confirmation_required,
        notes,
    }
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn mentions_sensitive_material(value: &str) -> bool {
    contains_any(
        &value.to_ascii_lowercase(),
        &[
            "password",
            "passwd",
            "secret",
            "token",
            "api_key",
            "apikey",
            "authorization:",
            "bearer ",
            "id_rsa",
            "id_ed25519",
            "-----begin",
        ],
    )
}

fn trim_required(label: &str, value: String) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(value)
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatMessage {
    role: String,
    content: String,
    #[serde(default)]
    reasoning_content: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentScreenshotContext {
    source_label: String,
    data_url: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileContext {
    source_label: String,
    file_data: Option<String>,
    data_url: Option<String>,
    mime_type: Option<String>,
    text: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPageContext {
    source_label: String,
    text: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRequest {
    prompt: String,
    context_label: String,
    intent: Option<String>,
    #[serde(default = "default_agent_allow_tools")]
    allow_tools: bool,
    selected_output: Option<String>,
    screenshot: Option<AgentScreenshotContext>,
    #[serde(default)]
    screenshots: Vec<AgentScreenshotContext>,
    #[serde(default)]
    files: Vec<AgentFileContext>,
    system_context: Option<String>,
    messages: Vec<AgentChatMessage>,
    output_language: Option<String>,
    page_context: Option<AgentPageContext>,
}

fn default_agent_allow_tools() -> bool {
    true
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunResponse {
    provider_kind: String,
    model: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_content: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum AiStreamEvent {
    ReasoningDelta {
        delta: String,
    },
    ContentDelta {
        delta: String,
    },
    ToolCallStart {
        tool_id: String,
        tool_name: String,
    },
    ToolCallEnd {
        tool_id: String,
        tool_name: String,
        error: Option<String>,
    },
    Done {
        model: String,
        provider_kind: String,
    },
}

pub async fn run_agent(
    app: tauri::AppHandle,
    settings: AiProviderSettings,
    api_key: Option<String>,
    request: AgentRunRequest,
) -> Result<AgentRunResponse, String> {
    ai_interaction_debug!(
        "agent.run_start",
        json!({
            "mode": "nonStreaming",
            "settings": &settings,
            "hasApiKey": api_key.as_ref().is_some_and(|value| !value.trim().is_empty()),
            "request": &request,
        })
    );
    let provider = provider_for(settings.provider_kind())?;
    let result = provider.run(app, settings, api_key, request).await;
    match &result {
        Ok(response) => {
            ai_interaction_debug!("agent.run_success", json!({ "response": response }));
        }
        Err(error) => {
            ai_interaction_debug!("agent.run_error", json!({ "error": error }));
        }
    }
    result
}

pub async fn run_agent_streaming(
    app: tauri::AppHandle,
    settings: AiProviderSettings,
    api_key: Option<String>,
    request: AgentRunRequest,
    channel: Channel<Value>,
) -> Result<AgentRunResponse, String> {
    ai_interaction_debug!(
        "agent.run_start",
        json!({
            "mode": "streaming",
            "settings": &settings,
            "hasApiKey": api_key.as_ref().is_some_and(|value| !value.trim().is_empty()),
            "request": &request,
        })
    );
    let provider = provider_for(settings.provider_kind())?;
    let result = provider
        .run_streaming(app, settings, api_key, request, channel)
        .await;
    match &result {
        Ok(response) => {
            ai_interaction_debug!("agent.run_success", json!({ "response": response }));
        }
        Err(error) => {
            ai_interaction_debug!("agent.run_error", json!({ "error": error }));
        }
    }
    result
}

trait AgentProvider {
    async fn run(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String>;

    async fn run_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String>;
}

enum AgentProviderAdapter {
    OpenAi(OpenAiCompatibleProvider),
    GitHubCopilot(GitHubCopilotProvider),
}

impl AgentProviderAdapter {
    #[cfg(test)]
    fn provider_kind(&self) -> &'static str {
        match self {
            AgentProviderAdapter::OpenAi(provider) => provider.provider_kind,
            AgentProviderAdapter::GitHubCopilot(provider) => provider.provider_kind(),
        }
    }
}

impl AgentProvider for AgentProviderAdapter {
    async fn run(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        match self {
            AgentProviderAdapter::OpenAi(provider) => {
                provider.run(app, settings, api_key, request).await
            }
            AgentProviderAdapter::GitHubCopilot(provider) => {
                provider.run(app, settings, api_key, request).await
            }
        }
    }

    async fn run_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String> {
        match self {
            AgentProviderAdapter::OpenAi(provider) => {
                provider
                    .run_streaming(app, settings, api_key, request, channel)
                    .await
            }
            AgentProviderAdapter::GitHubCopilot(provider) => {
                provider
                    .run_streaming(app, settings, api_key, request, channel)
                    .await
            }
        }
    }
}

struct OpenAiCompatibleProvider {
    provider_kind: &'static str,
    label: &'static str,
    requires_api_key: bool,
    endpoint_style: OpenAiEndpointStyle,
    auth_style: OpenAiAuthStyle,
    default_api: OpenAiApiStyle,
}

struct GitHubCopilotProvider;

impl GitHubCopilotProvider {
    fn provider_kind(&self) -> &'static str {
        "github-copilot"
    }

    fn label(&self) -> &'static str {
        "GitHub Copilot"
    }
}

impl AgentProvider for GitHubCopilotProvider {
    async fn run(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        let token = require_copilot_token(api_key)?;
        let prompt = build_copilot_prompt(request);
        let output = run_copilot_sdk(&app, &settings, &token, &prompt).await?;
        finish_copilot_response(self, settings.model(), output)
    }

    async fn run_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String> {
        let response = self.run(app, settings, api_key, request).await?;
        let _ = channel.send(json!(AiStreamEvent::ContentDelta {
            delta: response.content.clone(),
        }));
        let _ = channel.send(json!(AiStreamEvent::Done {
            model: response.model.clone(),
            provider_kind: response.provider_kind.clone(),
        }));
        Ok(response)
    }
}

#[derive(Clone, Copy)]
enum OpenAiEndpointStyle {
    ChatCompletions,
    Azure,
}

#[derive(Clone, Copy)]
enum OpenAiAuthStyle {
    Bearer,
    ApiKeyHeader,
}

#[derive(Clone, Copy)]
enum OpenAiApiStyle {
    ChatCompletions,
    Responses,
}

impl AgentProvider for OpenAiCompatibleProvider {
    async fn run(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        let api_key = api_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if self.requires_api_key && api_key.is_none() {
            return Err(format!(
                "{} needs an API key before AI Assistant can chat.",
                self.label
            ));
        }

        match self.default_api {
            OpenAiApiStyle::ChatCompletions => self.run_chat(app, settings, api_key, request).await,
            OpenAiApiStyle::Responses => self.run_responses(app, settings, api_key, request).await,
        }
    }

    async fn run_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String> {
        let api_key = api_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if self.requires_api_key && api_key.is_none() {
            return Err(format!(
                "{} needs an API key before AI Assistant can chat.",
                self.label
            ));
        }

        match self.default_api {
            OpenAiApiStyle::ChatCompletions => {
                self.run_chat_streaming(app, settings, api_key, request, channel)
                    .await
            }
            OpenAiApiStyle::Responses => {
                self.run_responses_streaming(app, settings, api_key, request, channel)
                    .await
            }
        }
    }
}

#[derive(Deserialize, Default)]
struct ChatSseChunk {
    choices: Vec<ChatSseChoice>,
}

#[derive(Deserialize, Default)]
struct ChatSseChoice {
    delta: ChatSseDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, Default)]
struct ChatSseDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<SseToolCallDelta>,
}

#[derive(Deserialize)]
struct SseToolCallDelta {
    index: u32,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<SseToolCallFunctionDelta>,
}

#[derive(Deserialize, Default)]
struct SseToolCallFunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Default)]
struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}

fn ai_http_client(allow_insecure_tls: bool) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(allow_insecure_tls)
        .build()
        .map_err(|error| format!("failed to configure AI HTTP client: {error}"))
}

fn log_provider_request<T: Serialize>(
    api: &str,
    provider_kind: &str,
    model: &str,
    turn_index: usize,
    endpoint: &str,
    body: &T,
) {
    let body_value = serde_json::to_value(body).unwrap_or(Value::Null);
    let item_summary = summarize_request_items(&body_value);
    ai_interaction_debug!(
        "provider.request",
        json!({
            "api": api,
            "providerKind": provider_kind,
            "model": model,
            "turn": turn_index,
            "endpoint": endpoint,
            "itemSummary": item_summary,
            "body": body_value,
        })
    );
}

/// Per-boundary diagnostics: for each top-level item the harness sends to the
/// provider, log `type`, `role`, and approximate size. This catches malformed
/// items (e.g. an `output_text` content part leaked to the top level) before
/// the provider rejects the request with an opaque enum-only 400.
fn summarize_request_items(body: &Value) -> Vec<Value> {
    let array = body
        .get("input")
        .or_else(|| body.get("messages"))
        .and_then(Value::as_array);
    let Some(items) = array else {
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let type_str = item.get("type").and_then(Value::as_str);
            let role = item.get("role").and_then(Value::as_str);
            let content_parts: Vec<&str> = item
                .get("content")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|part| part.get("type").and_then(Value::as_str))
                        .collect()
                })
                .unwrap_or_default();
            let approx_bytes = serde_json::to_string(item)
                .map(|s| s.len())
                .unwrap_or_default();
            json!({
                "index": index,
                "type": type_str,
                "role": role,
                "contentParts": content_parts,
                "approxBytes": approx_bytes,
            })
        })
        .collect()
}

fn log_provider_response(
    api: &str,
    provider_kind: &str,
    model: &str,
    turn_index: usize,
    status: u16,
    body: &str,
) {
    ai_interaction_debug!(
        "provider.response",
        json!({
            "api": api,
            "providerKind": provider_kind,
            "model": model,
            "turn": turn_index,
            "status": status,
            "body": body,
        })
    );
}

macro_rules! ai_debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[kkterm-ai] {}", format!($($arg)*));
        }
    };
}

#[derive(Default)]
struct ResponsesStreamState {
    content: Option<String>,
    reasoning: String,
    tool_call_items: HashMap<String, ResponsesStreamToolCall>,
    tool_call_order: Vec<String>,
}

struct ResponsesStreamToolCall {
    call_id: String,
    name: String,
    arguments: String,
}

#[derive(Default)]
struct ResponsesStreamDeltas {
    content_delta: Option<String>,
    reasoning_delta: Option<String>,
}

impl ResponsesStreamState {
    fn append_content(&mut self, delta: &str) {
        if delta.is_empty() {
            return;
        }
        self.content = Some(
            self.content
                .take()
                .unwrap_or_default()
                .chars()
                .chain(delta.chars())
                .collect(),
        );
    }

    fn into_tool_calls(self) -> Vec<OpenAiToolCall> {
        let mut items = self.tool_call_items;
        let mut tool_calls = Vec::new();
        for item_id in self.tool_call_order {
            let Some(item) = items.remove(&item_id) else {
                continue;
            };
            if !item.name.is_empty() && !item.call_id.is_empty() {
                tool_calls.push(OpenAiToolCall {
                    id: item.call_id,
                    function: OpenAiToolCallFunction {
                        name: item.name,
                        arguments: item.arguments,
                    },
                });
            }
        }
        tool_calls
    }
}

fn append_completed_responses_message_text(
    state: &mut ResponsesStreamState,
    item: &Value,
) -> Option<String> {
    if item.get("type").and_then(Value::as_str) != Some("message") {
        return None;
    }
    let text = item
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter_map(|part| {
                    (part.get("type").and_then(Value::as_str) == Some("output_text"))
                        .then(|| part.get("text").and_then(Value::as_str))
                        .flatten()
                })
                .collect::<Vec<_>>()
                .join("\n")
        })?
        .trim()
        .to_string();
    if text.is_empty() {
        return None;
    }

    match state.content.as_deref() {
        Some(current) if current == text => None,
        Some(current) if text.starts_with(current) => {
            let delta = text[current.len()..].to_string();
            state.append_content(&delta);
            (!delta.is_empty()).then_some(delta)
        }
        Some(_) => None,
        None => {
            state.append_content(&text);
            Some(text)
        }
    }
}

fn apply_responses_stream_event(
    state: &mut ResponsesStreamState,
    event: &Value,
) -> ResponsesStreamDeltas {
    let mut deltas = ResponsesStreamDeltas::default();
    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

    match event_type {
        "response.output_text.delta" => {
            if let Some(delta) = event.get("delta").and_then(Value::as_str) {
                if !delta.is_empty() {
                    state.append_content(delta);
                    deltas.content_delta = Some(delta.to_string());
                }
            }
        }
        "response.reasoning_text.delta" | "response.reasoning_summary_text.delta" => {
            if let Some(delta) = event.get("delta").and_then(Value::as_str) {
                if !delta.is_empty() {
                    state.reasoning.push_str(delta);
                    deltas.reasoning_delta = Some(delta.to_string());
                }
            }
        }
        "response.output_item.added" => {
            if let Some(item) = event.get("item") {
                if item.get("type").and_then(Value::as_str) == Some("function_call") {
                    let item_id = item
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    if item_id.is_empty() {
                        return deltas;
                    }
                    let call_id = item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    if !state.tool_call_items.contains_key(&item_id) {
                        state.tool_call_order.push(item_id.clone());
                    }
                    state.tool_call_items.insert(
                        item_id,
                        ResponsesStreamToolCall {
                            call_id,
                            name,
                            arguments: String::new(),
                        },
                    );
                }
            }
        }
        "response.output_item.done" => {
            if let Some(item) = event.get("item") {
                deltas.content_delta = append_completed_responses_message_text(state, item);
            }
        }
        "response.function_call_arguments.delta" => {
            let item_id = event
                .get("item_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Some(delta) = event.get("delta").and_then(Value::as_str) {
                if let Some(entry) = state.tool_call_items.get_mut(&item_id) {
                    entry.arguments.push_str(delta);
                }
            }
        }
        "response.function_call_arguments.done" => {
            let item_id = event
                .get("item_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Some(arguments) = event.get("arguments").and_then(Value::as_str) {
                if let Some(entry) = state.tool_call_items.get_mut(&item_id) {
                    entry.arguments = arguments.to_string();
                }
            }
        }
        _ => {}
    }

    deltas
}

fn emit_stream(channel: &Channel<Value>, event: &AiStreamEvent) -> Result<(), String> {
    let value = serde_json::to_value(event).map_err(|e| e.to_string())?;
    ai_interaction_debug!("stream.emit", value.clone());
    channel
        .send(value)
        .map_err(|e| format!("failed to send stream event: {e}"))
}

async fn stream_chat_completions(
    response: reqwest::Response,
    channel: &Channel<Value>,
) -> Result<(String, Vec<OpenAiToolCall>, Option<String>), String> {
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut tool_call_builders: HashMap<u32, ToolCallAccumulator> = HashMap::new();

    let mut stream = response.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream read error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].trim().to_string();
            buf = buf[nl + 1..].to_string();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let data = match line.strip_prefix("data: ") {
                Some(d) => d,
                None => continue,
            };
            if data == "[DONE]" {
                ai_interaction_debug!(
                    "provider.stream_data",
                    json!({ "api": "chat_completions", "data": data })
                );
                break;
            }
            ai_interaction_debug!(
                "provider.stream_data",
                json!({ "api": "chat_completions", "data": data })
            );
            let chunk: ChatSseChunk =
                serde_json::from_str(data).map_err(|e| format!("SSE parse error: {e}"))?;
            for choice in chunk.choices {
                if let Some(finish_reason) = choice.finish_reason.as_deref() {
                    ai_debug!("chat stream finish_reason={finish_reason}");
                }
                if let Some(c) = choice.delta.content.as_deref() {
                    if !c.is_empty() {
                        content.push_str(c);
                        emit_stream(
                            channel,
                            &AiStreamEvent::ContentDelta {
                                delta: c.to_string(),
                            },
                        )?;
                    }
                }
                if let Some(r) = choice.delta.reasoning_content.as_deref() {
                    if !r.is_empty() {
                        reasoning.push_str(r);
                        emit_stream(
                            channel,
                            &AiStreamEvent::ReasoningDelta {
                                delta: r.to_string(),
                            },
                        )?;
                    }
                }
                for tc in &choice.delta.tool_calls {
                    let acc = tool_call_builders.entry(tc.index).or_default();
                    if let Some(id) = &tc.id {
                        acc.id.clone_from(id);
                    }
                    if let Some(ref f) = tc.function {
                        if let Some(name) = &f.name {
                            acc.name.clone_from(name);
                        }
                        if let Some(args) = &f.arguments {
                            acc.arguments.push_str(args);
                        }
                    }
                }
            }
        }
    }

    let mut tool_calls: Vec<OpenAiToolCall> = Vec::new();
    let mut indexes: Vec<u32> = tool_call_builders.keys().copied().collect();
    indexes.sort();
    for idx in indexes {
        if let Some(acc) = tool_call_builders.remove(&idx) {
            if !acc.name.is_empty() {
                tool_calls.push(OpenAiToolCall {
                    id: acc.id,
                    function: OpenAiToolCallFunction {
                        name: acc.name,
                        arguments: acc.arguments,
                    },
                });
            }
        }
    }

    let reasoning_content = reasoning
        .trim()
        .is_empty()
        .then(|| None)
        .unwrap_or(Some(reasoning));

    Ok((content, tool_calls, reasoning_content))
}

async fn stream_responses_completions(
    response: reqwest::Response,
    channel: &Channel<Value>,
) -> Result<(Option<String>, Vec<OpenAiToolCall>, Option<String>), String> {
    let mut state = ResponsesStreamState::default();
    let mut current_event = String::new();

    let mut stream = response.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream read error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].trim().to_string();
            buf = buf[nl + 1..].to_string();

            if line.starts_with("event: ") {
                current_event = line[7..].trim().to_string();
                continue;
            }

            let data = match line.strip_prefix("data: ") {
                Some(d) => d,
                None => continue,
            };
            if data == "[DONE]" {
                ai_interaction_debug!(
                    "provider.stream_data",
                    json!({ "api": "responses", "event": current_event.clone(), "data": data })
                );
                break;
            }
            ai_interaction_debug!(
                "provider.stream_data",
                json!({ "api": "responses", "event": current_event.clone(), "data": data })
            );

            let event: Value =
                serde_json::from_str(data).map_err(|e| format!("SSE parse error: {e}"))?;

            let deltas = apply_responses_stream_event(&mut state, &event);
            if let Some(delta) = deltas.content_delta {
                emit_stream(channel, &AiStreamEvent::ContentDelta { delta })?;
            }
            if let Some(delta) = deltas.reasoning_delta {
                emit_stream(channel, &AiStreamEvent::ReasoningDelta { delta })?;
            }

            current_event.clear();
        }
    }

    let content = state.content.clone();
    let reasoning_content = state
        .reasoning
        .trim()
        .is_empty()
        .then(|| None)
        .unwrap_or(Some(state.reasoning.clone()));
    let tool_calls = state.into_tool_calls();

    Ok((content, tool_calls, reasoning_content))
}

impl OpenAiCompatibleProvider {
    fn supports_explicit_strict_tool_schemas(&self) -> bool {
        matches!(self.provider_kind, "openai" | "azure-openai")
    }

    fn tool_definitions_for_provider(
        &self,
        tools: &[OpenAiToolDefinition],
    ) -> Vec<OpenAiToolDefinition> {
        let mut tools = tools.to_vec();
        if !self.supports_explicit_strict_tool_schemas() {
            for tool in &mut tools {
                tool.function.strict = false;
            }
        }
        tools
    }

    fn responses_tool_definitions_for_provider(
        &self,
        tools: &[OpenAiToolDefinition],
    ) -> Vec<Value> {
        let tools = self.tool_definitions_for_provider(tools);
        responses_tool_definitions(&tools)
    }

    async fn run_chat(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        let prompt = trim_required("assistant prompt", request.prompt)?;
        let context_label = trim_required("assistant context", request.context_label)?;
        let endpoint =
            chat_completions_endpoint(settings.base_url(), settings.model(), self.endpoint_style)?;
        let mut messages = build_agent_messages(
            prompt,
            context_label,
            request.intent,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            request.page_context,
            supports_image_input(self.provider_kind, settings.model()),
            request.screenshot,
            request.screenshots,
            request.messages,
            request.output_language,
        );
        let client = ai_http_client(settings.allow_insecure_tls())?;
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let provider_tool_definitions = self.tool_definitions_for_provider(&tool_definitions);
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let mut content = String::new();
        let mut reasoning_content: Option<String> = None;
        let mut exhausted = true;

        for turn_index in 0..10 {
            let request_body = OpenAiCompatibleChatRequest {
                model: settings.model().to_string(),
                messages: messages.clone(),
                stream: false,
                tools: provider_tool_definitions.clone(),
                tool_choice: (!provider_tool_definitions.is_empty()).then(|| "auto".to_string()),
                thinking: deepseek_thinking(self.provider_kind, settings.reasoning_effort()),
            };
            log_provider_request(
                "chat_completions",
                self.provider_kind,
                settings.model(),
                turn_index + 1,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
            log_provider_response(
                "chat_completions",
                self.provider_kind,
                settings.model(),
                turn_index + 1,
                status.as_u16(),
                &response_text,
            );

            if !status.is_success() {
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let completion: OpenAiCompatibleChatResponse = serde_json::from_str(&response_text)
                .map_err(|error| format!("failed to parse {} response: {error}", self.label))?;
            let Some(choice) = completion.choices.into_iter().next() else {
                return Err(format!("{} response did not include a choice", self.label));
            };
            content = choice.message.content.trim().to_string();
            reasoning_content = choice.message.reasoning_content.clone();
            if choice.message.tool_calls.is_empty() {
                exhausted = false;
                break;
            }

            let tool_calls = choice.message.tool_calls;
            messages.push(OpenAiCompatibleMessage {
                role: "assistant".to_string(),
                content: OpenAiCompatibleContent::Text(content.clone()),
                reasoning_content: reasoning_content.clone().filter(|r| !r.trim().is_empty()),
                tool_call_id: None,
                tool_calls: Some(
                    tool_calls
                        .iter()
                        .map(|tool_call| OpenAiAssistantToolCall {
                            id: tool_call.id.clone(),
                            tool_type: "function".to_string(),
                            function: OpenAiAssistantToolCallFunction {
                                name: tool_call.function.name.clone(),
                                arguments: tool_call.function.arguments.clone(),
                            },
                        })
                        .collect(),
                ),
            });
            for tool_call in tool_calls {
                let result = run_ai_tool(&settings, &app_data_dir, &app, &tool_call, None).await;
                messages.push(OpenAiCompatibleMessage {
                    role: "tool".to_string(),
                    content: OpenAiCompatibleContent::Text(result),
                    reasoning_content: None,
                    tool_call_id: Some(tool_call.id),
                    tool_calls: None,
                });
            }
        }

        if exhausted {
            let request_body = OpenAiCompatibleChatRequest {
                model: settings.model().to_string(),
                messages: messages.clone(),
                stream: false,
                tools: vec![],
                tool_choice: None,
                thinking: deepseek_thinking(self.provider_kind, settings.reasoning_effort()),
            };
            log_provider_request(
                "chat_completions",
                self.provider_kind,
                settings.model(),
                11,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
            log_provider_response(
                "chat_completions",
                self.provider_kind,
                settings.model(),
                11,
                status.as_u16(),
                &response_text,
            );

            if !status.is_success() {
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let completion: OpenAiCompatibleChatResponse = serde_json::from_str(&response_text)
                .map_err(|error| format!("failed to parse {} response: {error}", self.label))?;
            let Some(choice) = completion.choices.into_iter().next() else {
                return Err(format!("{} response did not include a choice", self.label));
            };
            content = choice.message.content.trim().to_string();
            reasoning_content = choice.message.reasoning_content.clone();
        }

        finish_agent_response(self, settings.model(), content, reasoning_content)
    }

    async fn run_responses(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        let prompt = trim_required("assistant prompt", request.prompt)?;
        let context_label = trim_required("assistant context", request.context_label)?;
        let endpoint = responses_endpoint(settings.base_url(), self.endpoint_style)?;
        let messages = build_agent_messages(
            prompt,
            context_label,
            request.intent,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            request.page_context,
            supports_image_input(self.provider_kind, settings.model()),
            request.screenshot,
            request.screenshots,
            request.messages,
            request.output_language,
        );
        let mut input = responses_input_from_messages(messages, request.files);
        let client = ai_http_client(settings.allow_insecure_tls())?;
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let provider_tool_definitions =
            self.responses_tool_definitions_for_provider(&tool_definitions);
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let mut content = String::new();
        let mut reasoning_content: Option<String> = None;
        let mut exhausted = true;

        for turn_index in 0..10 {
            let request_body = OpenAiResponsesRequest {
                model: settings.model().to_string(),
                input: input.clone(),
                stream: false,
                store: false,
                tools: provider_tool_definitions.clone(),
                tool_choice: (!provider_tool_definitions.is_empty()).then(|| "auto".to_string()),
            };
            log_provider_request(
                "responses",
                self.provider_kind,
                settings.model(),
                turn_index + 1,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
            log_provider_response(
                "responses",
                self.provider_kind,
                settings.model(),
                turn_index + 1,
                status.as_u16(),
                &response_text,
            );

            if !status.is_success() {
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let response_value: Value = serde_json::from_str(&response_text)
                .map_err(|error| format!("failed to parse {} response: {error}", self.label))?;
            if let Some(text) = response_value
                .get("output_text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                content = text.to_string();
            } else if let Some(text) = extract_responses_output_text(&response_value) {
                content = text;
            }
            reasoning_content = response_value
                .get("reasoning_content")
                .and_then(Value::as_str)
                .filter(|r| !r.trim().is_empty())
                .map(String::from);

            let tool_calls = extract_responses_tool_calls(&response_value);
            if tool_calls.is_empty() {
                exhausted = false;
                break;
            }

            if let Some(output) = response_value.get("output").and_then(Value::as_array) {
                input.extend(output.iter().cloned());
            }
            for tool_call in tool_calls {
                let result = run_ai_tool(&settings, &app_data_dir, &app, &tool_call, None).await;
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": tool_call.id,
                    "output": result,
                }));
            }
        }

        if exhausted {
            let request_body = OpenAiResponsesRequest {
                model: settings.model().to_string(),
                input: input.clone(),
                stream: false,
                store: false,
                tools: vec![],
                tool_choice: None,
            };
            log_provider_request(
                "responses",
                self.provider_kind,
                settings.model(),
                11,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
            log_provider_response(
                "responses",
                self.provider_kind,
                settings.model(),
                11,
                status.as_u16(),
                &response_text,
            );

            if !status.is_success() {
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let response_value: Value = serde_json::from_str(&response_text)
                .map_err(|error| format!("failed to parse {} response: {error}", self.label))?;
            if let Some(text) = response_value
                .get("output_text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                content = text.to_string();
            } else if let Some(text) = extract_responses_output_text(&response_value) {
                content = text;
            }
            reasoning_content = response_value
                .get("reasoning_content")
                .and_then(Value::as_str)
                .filter(|r| !r.trim().is_empty())
                .map(String::from);
        }

        finish_agent_response(self, settings.model(), content, reasoning_content)
    }

    async fn run_chat_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String> {
        let prompt = trim_required("assistant prompt", request.prompt)?;
        let context_label = trim_required("assistant context", request.context_label)?;
        let endpoint =
            chat_completions_endpoint(settings.base_url(), settings.model(), self.endpoint_style)?;
        let mut messages = build_agent_messages(
            prompt,
            context_label,
            request.intent,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            request.page_context,
            supports_image_input(self.provider_kind, settings.model()),
            request.screenshot,
            request.screenshots,
            request.messages,
            request.output_language,
        );
        let client = ai_http_client(settings.allow_insecure_tls())?;
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let provider_tool_definitions = self.tool_definitions_for_provider(&tool_definitions);
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let model = settings.model().to_string();
        let exhausted = true;
        let mut tool_error_tracker = ConsecutiveToolErrorTracker::default();

        for turn_index in 0..10 {
            ai_debug!(
                "chat stream request provider={} model={} subturn={} messages={} tools={}",
                self.provider_kind,
                model,
                turn_index + 1,
                messages.len(),
                tool_definitions.len()
            );
            let request_body = OpenAiCompatibleChatRequest {
                model: model.clone(),
                messages: messages.clone(),
                stream: true,
                tools: provider_tool_definitions.clone(),
                tool_choice: (!provider_tool_definitions.is_empty()).then(|| "auto".to_string()),
                thinking: deepseek_thinking(self.provider_kind, settings.reasoning_effort()),
            };
            log_provider_request(
                "chat_completions_stream",
                self.provider_kind,
                &model,
                turn_index + 1,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
                log_provider_response(
                    "chat_completions_stream",
                    self.provider_kind,
                    &model,
                    turn_index + 1,
                    status.as_u16(),
                    &response_text,
                );
                ai_debug!(
                    "chat stream HTTP error provider={} model={} subturn={} status={} body={}",
                    self.provider_kind,
                    model,
                    turn_index + 1,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                );
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let (content, tool_calls, streamed_reasoning) =
                stream_chat_completions(response, &channel).await?;
            ai_debug!(
                "chat stream response provider={} model={} subturn={} content_len={} reasoning_len={} tool_calls={}",
                self.provider_kind,
                model,
                turn_index + 1,
                content.len(),
                streamed_reasoning.as_deref().map(str::len).unwrap_or(0),
                tool_calls.len()
            );

            if tool_calls.is_empty() {
                require_streamed_assistant_content(self, &content)?;
                emit_stream(
                    &channel,
                    &AiStreamEvent::Done {
                        model: model.clone(),
                        provider_kind: self.provider_kind.to_string(),
                    },
                )?;
                return finish_agent_response(self, &model, content, streamed_reasoning);
            }

            messages.push(OpenAiCompatibleMessage {
                role: "assistant".to_string(),
                content: OpenAiCompatibleContent::Text(content.clone()),
                reasoning_content: streamed_reasoning.filter(|r| !r.trim().is_empty()),
                tool_call_id: None,
                tool_calls: Some(
                    tool_calls
                        .iter()
                        .map(|tool_call| OpenAiAssistantToolCall {
                            id: tool_call.id.clone(),
                            tool_type: "function".to_string(),
                            function: OpenAiAssistantToolCallFunction {
                                name: tool_call.function.name.clone(),
                                arguments: tool_call.function.arguments.clone(),
                            },
                        })
                        .collect(),
                ),
            });
            for tool_call in &tool_calls {
                ai_debug!(
                    "tool start provider={} model={} subturn={} id={} name={} args_len={}",
                    self.provider_kind,
                    model,
                    turn_index + 1,
                    tool_call.id,
                    tool_call.function.name,
                    tool_call.function.arguments.len()
                );
                emit_stream(
                    &channel,
                    &AiStreamEvent::ToolCallStart {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                    },
                )?;
                let result =
                    run_ai_tool(&settings, &app_data_dir, &app, tool_call, Some(&channel)).await;
                ai_debug!(
                    "tool end provider={} model={} subturn={} id={} name={} result_len={}",
                    self.provider_kind,
                    model,
                    turn_index + 1,
                    tool_call.id,
                    tool_call.function.name,
                    result.len()
                );
                let tool_error = tool_result_error(&result);
                let abort_message =
                    tool_error_tracker.note(&tool_call.function.name, &tool_error);
                messages.push(OpenAiCompatibleMessage {
                    role: "tool".to_string(),
                    content: OpenAiCompatibleContent::Text(result),
                    reasoning_content: None,
                    tool_call_id: Some(tool_call.id.clone()),
                    tool_calls: None,
                });
                emit_stream(
                    &channel,
                    &AiStreamEvent::ToolCallEnd {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                        error: tool_error,
                    },
                )?;
                if let Some(message) = abort_message {
                    emit_stream(
                        &channel,
                        &AiStreamEvent::Done {
                            model: model.clone(),
                            provider_kind: self.provider_kind.to_string(),
                        },
                    )?;
                    return finish_agent_response(self, &model, message, None);
                }
            }
        }

        if exhausted {
            ai_debug!(
                "chat stream exhausted tool loop provider={} model={} messages={}",
                self.provider_kind,
                model,
                messages.len()
            );
            let request_body = OpenAiCompatibleChatRequest {
                model: model.clone(),
                messages: messages.clone(),
                stream: true,
                tools: vec![],
                tool_choice: None,
                thinking: deepseek_thinking(self.provider_kind, settings.reasoning_effort()),
            };
            log_provider_request(
                "chat_completions_stream",
                self.provider_kind,
                &model,
                11,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
                log_provider_response(
                    "chat_completions_stream",
                    self.provider_kind,
                    &model,
                    11,
                    status.as_u16(),
                    &response_text,
                );
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let (content, _tool_calls, _streamed_reasoning) =
                stream_chat_completions(response, &channel).await?;
            require_streamed_assistant_content(self, &content)?;
            emit_stream(
                &channel,
                &AiStreamEvent::Done {
                    model: model.clone(),
                    provider_kind: self.provider_kind.to_string(),
                },
            )?;
            return finish_agent_response(self, &model, content, _streamed_reasoning);
        }

        Err(format!("{} exhausted the assistant tool loop", self.label))
    }

    async fn run_responses_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<AgentRunResponse, String> {
        let prompt = trim_required("assistant prompt", request.prompt)?;
        let context_label = trim_required("assistant context", request.context_label)?;
        let endpoint = responses_endpoint(settings.base_url(), self.endpoint_style)?;
        let messages = build_agent_messages(
            prompt,
            context_label,
            request.intent,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            request.page_context,
            supports_image_input(self.provider_kind, settings.model()),
            request.screenshot,
            request.screenshots,
            request.messages,
            request.output_language,
        );
        let client = ai_http_client(settings.allow_insecure_tls())?;
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let model = settings.model().to_string();
        let exhausted = true;

        let mut input = responses_input_from_messages(messages, request.files);
        let resp_tool_defs = self.responses_tool_definitions_for_provider(&tool_definitions);
        let mut tool_error_tracker = ConsecutiveToolErrorTracker::default();

        for turn_index in 0..10 {
            let request_body = OpenAiResponsesRequest {
                model: model.clone(),
                input: input.clone(),
                stream: true,
                store: false,
                tools: resp_tool_defs.clone(),
                tool_choice: (!resp_tool_defs.is_empty()).then(|| "auto".to_string()),
            };
            log_provider_request(
                "responses_stream",
                self.provider_kind,
                &model,
                turn_index + 1,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
                log_provider_response(
                    "responses_stream",
                    self.provider_kind,
                    &model,
                    turn_index + 1,
                    status.as_u16(),
                    &response_text,
                );
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let (content, tool_calls, _streamed_reasoning) =
                stream_responses_completions(response, &channel).await?;

            if let Some(output) = &content {
                input.push(json!({
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": output}],
                }));
            }

            if tool_calls.is_empty() {
                require_streamed_assistant_content(self, content.as_deref().unwrap_or(""))?;
                emit_stream(
                    &channel,
                    &AiStreamEvent::Done {
                        model,
                        provider_kind: self.provider_kind.to_string(),
                    },
                )?;
                return finish_agent_response(
                    self,
                    settings.model(),
                    content.unwrap_or_default(),
                    _streamed_reasoning,
                );
            }

            for tc in &tool_calls {
                input.push(json!({
                    "type": "function_call",
                    "call_id": tc.id,
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                }));
            }
            for tool_call in &tool_calls {
                emit_stream(
                    &channel,
                    &AiStreamEvent::ToolCallStart {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                    },
                )?;
                let result =
                    run_ai_tool(&settings, &app_data_dir, &app, tool_call, Some(&channel)).await;
                let tool_error = tool_result_error(&result);
                let abort_message =
                    tool_error_tracker.note(&tool_call.function.name, &tool_error);
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": tool_call.id,
                    "output": result,
                }));
                emit_stream(
                    &channel,
                    &AiStreamEvent::ToolCallEnd {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                        error: tool_error,
                    },
                )?;
                if let Some(message) = abort_message {
                    emit_stream(
                        &channel,
                        &AiStreamEvent::Done {
                            model: model.clone(),
                            provider_kind: self.provider_kind.to_string(),
                        },
                    )?;
                    return finish_agent_response(self, &model, message, None);
                }
            }
        }

        if exhausted {
            let request_body = OpenAiResponsesRequest {
                model: model.clone(),
                input: input.clone(),
                stream: true,
                store: false,
                tools: vec![],
                tool_choice: None,
            };
            log_provider_request(
                "responses_stream",
                self.provider_kind,
                &model,
                11,
                &endpoint,
                &request_body,
            );
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&request_body)
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
                log_provider_response(
                    "responses_stream",
                    self.provider_kind,
                    &model,
                    11,
                    status.as_u16(),
                    &response_text,
                );
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let (content, _tool_calls, _streamed_reasoning) =
                stream_responses_completions(response, &channel).await?;
            require_streamed_assistant_content(self, content.as_deref().unwrap_or(""))?;
            emit_stream(
                &channel,
                &AiStreamEvent::Done {
                    model: model.clone(),
                    provider_kind: self.provider_kind.to_string(),
                },
            )?;
            return finish_agent_response(
                self,
                &model,
                content.unwrap_or_default(),
                _streamed_reasoning,
            );
        }

        Err(format!("{} exhausted the assistant tool loop", self.label))
    }
}

#[derive(Serialize)]
struct OpenAiCompatibleChatRequest {
    model: String,
    messages: Vec<OpenAiCompatibleMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<OpenAiToolDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<DeepSeekThinking>,
}

#[derive(Serialize)]
struct DeepSeekThinking {
    #[serde(rename = "type")]
    thinking_type: &'static str,
    reasoning_effort: &'static str,
}

#[derive(Serialize)]
struct OpenAiResponsesRequest {
    model: String,
    input: Vec<Value>,
    stream: bool,
    store: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
}

#[derive(Clone, Serialize)]
struct OpenAiCompatibleMessage {
    role: String,
    content: OpenAiCompatibleContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAiAssistantToolCall>>,
}

#[derive(Clone, Serialize)]
struct OpenAiAssistantToolCall {
    id: String,
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAiAssistantToolCallFunction,
}

#[derive(Clone, Serialize)]
struct OpenAiAssistantToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Clone, Serialize)]
#[serde(untagged)]
enum OpenAiCompatibleContent {
    Text(String),
    Parts(Vec<OpenAiCompatibleContentPart>),
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OpenAiCompatibleContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAiCompatibleImageUrl },
}

#[derive(Clone, Serialize)]
struct OpenAiCompatibleImageUrl {
    url: String,
}

#[derive(Clone, Serialize)]
struct OpenAiToolDefinition {
    #[serde(rename = "type")]
    tool_type: &'static str,
    function: OpenAiToolFunctionDefinition,
}

#[derive(Clone, Serialize)]
struct OpenAiToolFunctionDefinition {
    name: &'static str,
    description: &'static str,
    parameters: Value,
    #[serde(skip_serializing_if = "is_false")]
    strict: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn finish_agent_response(
    provider: &OpenAiCompatibleProvider,
    model: &str,
    content: String,
    reasoning_content: Option<String>,
) -> Result<AgentRunResponse, String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err(format!(
            "{} response did not include assistant content",
            provider.label
        ));
    }

    Ok(AgentRunResponse {
        provider_kind: provider.provider_kind.to_string(),
        model: model.to_string(),
        content,
        reasoning_content: reasoning_content.filter(|r| !r.trim().is_empty()),
    })
}

fn finish_copilot_response(
    provider: &GitHubCopilotProvider,
    model: &str,
    content: String,
) -> Result<AgentRunResponse, String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err(format!(
            "{} response did not include assistant content",
            provider.label()
        ));
    }

    Ok(AgentRunResponse {
        provider_kind: provider.provider_kind().to_string(),
        model: model.to_string(),
        content,
        reasoning_content: None,
    })
}

fn require_copilot_token(api_key: Option<String>) -> Result<String, String> {
    api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Connect GitHub Copilot in Settings before AI Assistant can chat.".to_string()
        })
}

async fn run_copilot_sdk(
    app: &tauri::AppHandle,
    settings: &AiProviderSettings,
    token: &str,
    prompt: &str,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to locate app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    let client_options = build_copilot_sdk_client_options(app_data_dir, token);
    ai_interaction_debug!(
        "copilot.request",
        json!({
            "model": settings.model(),
            "prompt": prompt,
            "requestPermission": false,
        })
    );
    let client = CopilotSdkClient::start(client_options)
        .await
        .map_err(|error| format_copilot_sdk_error("start", error))?;

    let result = async {
        let session = client
            .create_session(build_copilot_sdk_session_config(settings, token))
            .await
            .map_err(|error| format_copilot_sdk_error("create session", error))?;

        let content_result = async {
            let response_event = session
                .send_and_wait(
                    CopilotSdkMessageOptions::new(prompt)
                        .with_wait_timeout(COPILOT_SDK_RESPONSE_TIMEOUT),
                )
                .await
                .map_err(|error| format_copilot_sdk_error("send message", error))?;

            let content = response_event
                .as_ref()
                .and_then(copilot_assistant_message_content);

            match content {
                Some(content) => Ok(content),
                None => {
                    let messages = session
                        .get_messages()
                        .await
                        .map_err(|error| format_copilot_sdk_error("read messages", error))?;
                    last_copilot_assistant_message_content(&messages).ok_or_else(|| {
                        "GitHub Copilot SDK returned no assistant content".to_string()
                    })
                }
            }
        }
        .await;

        if let Err(error) = session.disconnect().await {
            ai_debug!("copilot sdk session disconnect failed: {error}");
        }

        content_result
    }
    .await;

    if let Err(error) = client.stop().await {
        ai_debug!("copilot sdk client stop failed: {error}");
    }

    match &result {
        Ok(content) => {
            ai_interaction_debug!("copilot.response", json!({ "content": content }));
        }
        Err(error) => {
            ai_interaction_debug!("copilot.error", json!({ "error": error }));
        }
    }
    result
}

pub async fn list_copilot_models(
    app: &tauri::AppHandle,
    token: &str,
) -> Result<Vec<CopilotModelOption>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to locate app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    let client_options = build_copilot_sdk_client_options(app_data_dir, token);
    let client = CopilotSdkClient::start(client_options)
        .await
        .map_err(|error| format_copilot_sdk_error("start", error))?;

    let result = client
        .list_models()
        .await
        .map(|models| {
            models
                .iter()
                .filter_map(copilot_model_option_from_sdk_model)
                .collect()
        })
        .map_err(|error| format_copilot_sdk_error("list models", error));

    if let Err(error) = client.stop().await {
        ai_debug!("copilot sdk client stop failed after model listing: {error}");
    }

    result
}

pub async fn list_ai_provider_models(
    app: &tauri::AppHandle,
    provider_kind: &str,
    base_url: &str,
    api_key: Option<String>,
    allow_insecure_tls: bool,
) -> Result<Vec<AiProviderModelOption>, String> {
    match model_list_strategy_for_provider(provider_kind)? {
        AiProviderModelListStrategy::GitHubCopilotSdk => {
            let token = api_key
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    "Connect GitHub Copilot in Settings before listing Copilot models.".to_string()
                })?;
            list_copilot_models(app, &token).await
        }
        strategy @ (AiProviderModelListStrategy::OllamaTags
        | AiProviderModelListStrategy::OpenAiCompatible) => {
            let endpoint = model_list_endpoint(base_url, strategy)?;
            let client = ai_http_client(allow_insecure_tls)?;
            let response = client
                .get(endpoint)
                .headers(model_list_headers(api_key.as_deref())?)
                .send()
                .await
                .map_err(|error| format!("failed to reach AI provider model list: {error}"))?;
            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read AI provider model list: {error}"))?;
            if !status.is_success() {
                return Err(format!(
                    "AI provider model list returned HTTP {}: {}",
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }
            match strategy {
                AiProviderModelListStrategy::OllamaTags => parse_ollama_tags_models(&response_text),
                AiProviderModelListStrategy::OpenAiCompatible => {
                    parse_openai_compatible_models(&response_text)
                }
                AiProviderModelListStrategy::GitHubCopilotSdk => unreachable!(),
            }
        }
    }
}

fn model_list_strategy_for_provider(
    provider_kind: &str,
) -> Result<AiProviderModelListStrategy, String> {
    match provider_kind.trim().to_lowercase().as_str() {
        "github-copilot" | "github_copilot" | "github copilot" => {
            Ok(AiProviderModelListStrategy::GitHubCopilotSdk)
        }
        "ollama" => Ok(AiProviderModelListStrategy::OllamaTags),
        "openai" | "openrouter" | "deepseek" | "gemini" | "grok" | "litellm" | "nvidia"
        | "opencode" | "openai-compatible" | "openai_compatible" | "openai compatible" => {
            Ok(AiProviderModelListStrategy::OpenAiCompatible)
        }
        "azure-openai" | "azure_openai" | "azure openai" => Err(
            "Azure OpenAI model refresh is deployment-based; enter the deployment name manually."
                .to_string(),
        ),
        "anthropic" => Err(
            "Anthropic model refresh is not available through the OpenAI-compatible model list."
                .to_string(),
        ),
        _ => Err("AI provider model refresh is not supported for this provider.".to_string()),
    }
}

fn model_list_headers(api_key: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        let header_value = HeaderValue::from_str(&format!("Bearer {api_key}")).map_err(|_| {
            "AI API key contains characters that cannot be sent in an HTTP header".to_string()
        })?;
        headers.insert(AUTHORIZATION, header_value);
    }
    Ok(headers)
}

fn copilot_model_option_from_sdk_model(model: &CopilotSdkModel) -> Option<CopilotModelOption> {
    let id = model.id.trim();
    if id.is_empty() {
        return None;
    }
    let label = model.name.trim();
    Some(CopilotModelOption {
        id: id.to_string(),
        label: if label.is_empty() {
            id.to_string()
        } else {
            label.to_string()
        },
        supports_image_input: model
            .capabilities
            .supports
            .as_ref()
            .and_then(|supports| supports.vision),
    })
}

fn build_copilot_sdk_client_options(app_data_dir: PathBuf, token: &str) -> CopilotSdkClientOptions {
    CopilotSdkClientOptions::new()
        .with_cwd(app_data_dir.clone())
        .with_copilot_home(app_data_dir.join("copilot"))
        .with_github_token(token)
        .with_use_logged_in_user(false)
        .with_log_level(CopilotSdkLogLevel::Error)
        .with_session_idle_timeout_seconds(0)
}

fn build_copilot_sdk_session_config(
    settings: &AiProviderSettings,
    token: &str,
) -> CopilotSdkSessionConfig {
    let mut config = CopilotSdkSessionConfig::default();
    config.client_name = Some("KKTerm".to_string());
    config.model = Some(settings.model().to_string());
    config.streaming = Some(false);
    config.tools = Some(Vec::new());
    config.available_tools = Some(Vec::new());
    config.mcp_servers = Some(HashMap::new());
    config.enable_config_discovery = Some(false);
    config.request_user_input = Some(false);
    config.request_permission = Some(false);
    config.request_exit_plan_mode = Some(false);
    config.request_auto_mode_switch = Some(false);
    config.request_elicitation = Some(false);
    config.github_token = Some(token.to_string());
    config
}

fn format_copilot_sdk_error(stage: &str, error: CopilotSdkError) -> String {
    match error {
        CopilotSdkError::BinaryNotFound { name, hint } => format!(
            "GitHub Copilot SDK could not find {name}. Rebuild KKTerm with bundled Copilot CLI support, set COPILOT_CLI_PATH, or install the Copilot CLI. {hint}"
        ),
        _ => format!("GitHub Copilot SDK failed to {stage}: {error}"),
    }
}

fn copilot_assistant_message_content(event: &CopilotSdkSessionEvent) -> Option<String> {
    if event.event_type != "assistant.message" {
        return None;
    }
    event
        .data
        .get("content")
        .and_then(Value::as_str)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
}

fn last_copilot_assistant_message_content(events: &[CopilotSdkSessionEvent]) -> Option<String> {
    events
        .iter()
        .rev()
        .find_map(copilot_assistant_message_content)
}

fn build_copilot_prompt(request: AgentRunRequest) -> String {
    let mut sections = Vec::new();
    sections.push(
        "You are the KKTerm AI Assistant. Help with local-first terminal, SSH, SFTP, dashboard, and workspace workflows. Do not execute commands; propose commands for user approval when needed."
            .to_string(),
    );

    if let Some(system_context) = non_empty(request.system_context) {
        sections.push(format!("System context:\n{system_context}"));
    }
    if let Some(intent) = non_empty(request.intent) {
        sections.push(format!("User intent:\n{intent}"));
    }
    if let Some(output_language) = non_empty(request.output_language) {
        sections.push(format!(
            "Respond in this language when practical: {output_language}"
        ));
    }
    if let Some(page_context) = request.page_context {
        if !page_context.text.trim().is_empty() {
            sections.push(format!(
                "Page context ({label}):\n{text}",
                label = page_context.source_label,
                text = truncate_prompt_section(&page_context.text, 12_000)
            ));
        }
    }
    if let Some(selected_output) = non_empty(request.selected_output) {
        sections.push(format!(
            "Selected output ({label}):\n{output}",
            label = request.context_label,
            output = truncate_prompt_section(&selected_output, 16_000)
        ));
    }

    let screenshots: Vec<_> = request
        .screenshots
        .into_iter()
        .chain(request.screenshot)
        .filter(|screenshot| !screenshot.source_label.trim().is_empty())
        .map(|screenshot| screenshot.source_label)
        .collect();
    if !screenshots.is_empty() {
        sections.push(format!(
            "Screenshots were attached from: {}. The current Copilot SDK chat bridge does not pass image bytes, so ask for text details if visual inspection is required.",
            screenshots.join(", ")
        ));
    }

    let mut file_sections = Vec::new();
    for file in request.files {
        if let Some(text) = file
            .text
            .or(file.file_data)
            .filter(|text| !text.trim().is_empty())
        {
            file_sections.push(format!(
                "File ({label}{mime}):\n{text}",
                label = file.source_label,
                mime = file
                    .mime_type
                    .map(|mime| format!(", {mime}"))
                    .unwrap_or_default(),
                text = truncate_prompt_section(&text, 12_000)
            ));
        } else if file.data_url.is_some() {
            file_sections.push(format!(
                "File ({label}) was attached as binary data and is not included in this Copilot SDK chat prompt.",
                label = file.source_label
            ));
        }
    }
    if !file_sections.is_empty() {
        sections.push(file_sections.join("\n\n"));
    }

    if !request.messages.is_empty() {
        let history = request
            .messages
            .into_iter()
            .map(|message| {
                let role = if message.role.trim().is_empty() {
                    "message".to_string()
                } else {
                    message.role
                };
                format!(
                    "{role}: {content}",
                    content = truncate_prompt_section(&message.content, 8_000)
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        sections.push(format!("Conversation history:\n{history}"));
    }

    sections.push(format!("User request:\n{}", request.prompt));
    sections.join("\n\n---\n\n")
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn truncate_prompt_section(value: &str, max_chars: usize) -> String {
    let value = value.trim();
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut truncated = value.chars().take(max_chars).collect::<String>();
    truncated.push_str("\n[truncated]");
    truncated
}

fn require_streamed_assistant_content(
    provider: &OpenAiCompatibleProvider,
    content: &str,
) -> Result<(), String> {
    if content.trim().is_empty() {
        ai_debug!(
            "stream response missing visible assistant content provider={}",
            provider.provider_kind
        );
        Err(format!(
            "{} response did not include assistant content",
            provider.label
        ))
    } else {
        Ok(())
    }
}

fn deepseek_thinking(provider_kind: &str, reasoning_effort: &str) -> Option<DeepSeekThinking> {
    if provider_kind != "deepseek" {
        return None;
    }
    let reasoning_effort = match reasoning_effort.trim().to_ascii_lowercase().as_str() {
        "max" | "maximum" | "xhigh" | "x-high" | "x_high" => "max",
        "high" | "low" | "medium" => "high",
        _ => return None,
    };
    Some(DeepSeekThinking {
        thinking_type: "enabled",
        reasoning_effort,
    })
}

fn responses_tool_definitions(tools: &[OpenAiToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            let mut value = json!({
                "type": tool.tool_type,
                "name": tool.function.name,
                "description": tool.function.description,
                "parameters": tool.function.parameters.clone(),
            });
            if tool.function.strict {
                value["strict"] = Value::Bool(true);
            }
            value
        })
        .collect()
}

fn responses_input_from_messages(
    messages: Vec<OpenAiCompatibleMessage>,
    files: Vec<AgentFileContext>,
) -> Vec<Value> {
    let mut input = Vec::new();
    for message in messages {
        if message.role == "system" {
            if let OpenAiCompatibleContent::Text(text) = message.content {
                input.push(json!({"role": "developer", "content": text}));
            }
            continue;
        }
        input.push(responses_message_from_openai_compatible(message));
    }

    let file_parts: Vec<Value> = files
        .into_iter()
        .filter_map(normalize_file_context)
        .collect();
    if !file_parts.is_empty() {
        input.push(json!({
            "role": "user",
            "content": file_parts,
        }));
    }
    input
}

fn responses_message_from_openai_compatible(message: OpenAiCompatibleMessage) -> Value {
    let role = message.role;
    match message.content {
        OpenAiCompatibleContent::Text(text) => json!({"role": role, "content": text}),
        OpenAiCompatibleContent::Parts(parts) => {
            let content: Vec<Value> = parts
                .into_iter()
                .map(|part| match part {
                    OpenAiCompatibleContentPart::Text { text } => {
                        json!({"type": "input_text", "text": text})
                    }
                    OpenAiCompatibleContentPart::ImageUrl { image_url } => {
                        json!({"type": "input_image", "image_url": image_url.url})
                    }
                })
                .collect();
            json!({"role": role, "content": content})
        }
    }
}

fn normalize_file_context(file: AgentFileContext) -> Option<Value> {
    let filename = file.source_label.trim().to_string();
    if filename.is_empty() {
        return None;
    }
    let file_data = file
        .file_data
        .or(file.data_url)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(file_data) = file_data {
        let file_data = if file_data.starts_with("data:") {
            file_data
        } else {
            let mime_type = file
                .mime_type
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "application/octet-stream".to_string());
            format!("data:{mime_type};base64,{file_data}")
        };
        return Some(json!({
            "type": "input_file",
            "filename": filename,
            "file_data": file_data,
        }));
    }

    file.text
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|text| {
            json!({
                "type": "input_text",
                "text": format!("Attached file {filename}:\n```text\n{text}\n```")
            })
        })
}

fn extract_responses_output_text(response: &Value) -> Option<String> {
    let mut parts = Vec::new();
    for item in response.get("output")?.as_array()? {
        if item.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        let Some(content) = item.get("content").and_then(Value::as_array) else {
            continue;
        };
        for part in content {
            if part.get("type").and_then(Value::as_str) == Some("output_text") {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    let text = text.trim();
                    if !text.is_empty() {
                        parts.push(text.to_string());
                    }
                }
            }
        }
    }
    (!parts.is_empty()).then(|| parts.join("\n"))
}

fn extract_responses_tool_calls(response: &Value) -> Vec<OpenAiToolCall> {
    response
        .get("output")
        .and_then(Value::as_array)
        .map(|output| {
            output
                .iter()
                .filter_map(|item| {
                    if item.get("type").and_then(Value::as_str) != Some("function_call") {
                        return None;
                    }
                    let name = item.get("name")?.as_str()?.to_string();
                    let arguments = item
                        .get("arguments")
                        .and_then(Value::as_str)
                        .unwrap_or("{}")
                        .to_string();
                    let id = item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .and_then(Value::as_str)?
                        .to_string();
                    Some(OpenAiToolCall {
                        id,
                        function: OpenAiToolCallFunction { name, arguments },
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn ai_tool_definitions(settings: &AiAssistantToolSettings) -> Vec<OpenAiToolDefinition> {
    if !settings.any_enabled() {
        return Vec::new();
    }
    let mut tools = Vec::new();
    tools.push(tool_definition(
        "request_secret_entry",
        "Ask KKTerm to render a local secret entry card without exposing the secret to the AI model. Use this for API keys, passwords, tokens, and widget secrets after the owning widget or provider metadata exists.",
        request_secret_entry_schema(),
    ).strict());
    if settings.current_time() {
        tools.push(tool_definition(
            "current_time",
            "Get current local time in RFC 3339 format.",
            json!({"type":"object","properties":{}}),
        ));
    }
    if settings.web_search() {
        tools.push(tool_definition(
            "web_search",
            "Search the public web and return compact results.",
            json!({"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}),
        ));
    }
    if settings.web_fetch() {
        tools.push(tool_definition(
            "web_fetch",
            "Fetch one http or https URL and return compact text content.",
            json!({"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}),
        ));
    }
    if settings.app_data_file_search() {
        tools.push(tool_definition(
            "app_data_file_search",
            "Search for file names under KKTerm app data only.",
            json!({"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}),
        ));
    }
    if settings.app_data_file_read() {
        tools.push(tool_definition(
            "app_data_file_read",
            "Read a small UTF-8 text file under KKTerm app data only.",
            json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        ));
    }
    if settings.shell_command() {
        tools.push(tool_definition("shell_command", "Run a non-destructive PowerShell or batch command from KKTerm app data only. Destructive commands are blocked.", json!({"type":"object","properties":{"command":{"type":"string"},"shell":{"type":"string","enum":["powershell","batch"]}},"required":["command"]})));
    }
    if settings.dashboard() {
        tools.push(tool_definition(
            "dashboard_load_state",
            "Load the full Dashboard state: all views, widget instances, and custom widgets.",
            json!({"type":"object","properties":{}}),
        ));
        tools.push(tool_definition(
            "dashboard_create_view",
            "Create a new Dashboard view (tab) with an optional grid density.",
            json!({"type":"object","properties":{"title":{"type":"string"},"gridDensity":{"type":"string","enum":["compact","default","roomy"]}},"required":["title"]}),
        ));
        tools.push(tool_definition(
            "dashboard_update_view",
            "Update a Dashboard view's title, grid density, or sort order.",
            json!({"type":"object","properties":{"id":{"type":"string"},"patch":{"type":"object","properties":{"title":{"type":"string"},"gridDensity":{"type":"string","enum":["compact","default","roomy"]},"sortOrder":{"type":"integer"}}}},"required":["id","patch"]}),
        ));
        tools.push(tool_definition(
            "dashboard_remove_view",
            "Remove a Dashboard view and all its widget instances.",
            json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}),
        ));
        tools.push(tool_definition(
            "dashboard_reorder_views",
            "Reorder Dashboard views by providing a full ordered list of view IDs.",
            json!({"type":"object","properties":{"orderedIds":{"type":"array","items":{"type":"string"}}},"required":["orderedIds"]}),
        ));
        tools.push(tool_definition(
            "dashboard_add_instance",
            "Add a widget instance to a Dashboard view at a specific grid position.",
            json!({"type":"object","properties":{"viewId":{"type":"string"},"kind":{"type":"string","enum":["builtIn","content","script"]},"sourceId":{"type":"string"},"preset":{"type":"string","enum":["panel","ambient","tile","hero","action"]},"accentName":{"type":"string","enum":["default","blue","indigo","teal","green","amber","red","purple","pink","slate","cyan","orange","rose","emerald","sky"]},"iconName":{"type":"string","enum":["Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun","Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar","Database","Globe","Lock","Key","Mail","Mic","Monitor","Music","Package","Phone","Pin","Power","Printer","Radio","Search","Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash","Truck","User","Users","Video","Volume","Watch","Wifi","Wind","Zap","Layers","List","Grid"]},"gridX":{"type":"integer","minimum":0,"maximum":11},"gridY":{"type":"integer","minimum":0},"gridW":{"type":"integer","minimum":1,"maximum":12},"gridH":{"type":"integer","minimum":1}},"required":["viewId","kind","sourceId","preset","accentName","iconName","gridX","gridY","gridW","gridH"]}),
        ));
        tools.push(tool_definition(
            "dashboard_update_instance",
            "Update a widget instance's preset, accent, icon, custom title, Ambient title visibility, or grid position.",
            json!({"type":"object","properties":{"id":{"type":"string"},"patch":{"type":"object","properties":{"preset":{"type":"string","enum":["panel","ambient","tile","hero","action"]},"accentName":{"type":"string","enum":["default","blue","indigo","teal","green","amber","red","purple","pink","slate","cyan","orange","rose","emerald","sky"]},"iconName":{"type":"string","enum":["Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun","Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar","Database","Globe","Lock","Key","Mail","Mic","Monitor","Music","Package","Phone","Pin","Power","Printer","Radio","Search","Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash","Truck","User","Users","Video","Volume","Watch","Wifi","Wind","Zap","Layers","List","Grid"]},"customTitle":{"type":["string","null"]},"hideTitle":{"type":"boolean"},"gridX":{"type":"integer"},"gridY":{"type":"integer"},"gridW":{"type":"integer"},"gridH":{"type":"integer"}}}},"required":["id","patch"]}),
        ));
        tools.push(tool_definition(
            "dashboard_remove_instance",
            "Remove a single widget instance from the Dashboard.",
            json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}),
        ));
        tools.push(tool_definition(
            "dashboard_apply_layout",
            "Batch-update grid positions for all instances in a Dashboard view.",
            json!({"type":"object","properties":{"viewId":{"type":"string"},"layout":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"gridX":{"type":"integer"},"gridY":{"type":"integer"},"gridW":{"type":"integer"},"gridH":{"type":"integer"}},"required":["id","gridX","gridY","gridW","gridH"]}}},"required":["viewId","layout"]}),
        ));
        tools.push(tool_definition(
            "dashboard_create_widget",
            "Create a validated AI-authored custom widget and place it on the selected Dashboard view in one step. Prefer this for user requests to create a visible widget. Prefer content widgets for static markdown, key/value summaries, checklists, and stats. Use script widgets only when the user explicitly needs live JavaScript behavior. Strongly prefer KKTerm's bundled widget libraries (for example mermaid, three, animejs, echarts, chartjs, marked, prism, leaflet, qrcode, mathjs, papaparse, dayjs, konva, pixijs, matter, gridjs, jsyaml, chroma) over loading CDN scripts or reimplementing equivalent logic from scratch: when a catalog entry fits the request, list its key in body.libraries so KKTerm preloads it offline-safe before running source, and call the documented global from your script. Use a runtime CDN load (permissions.network true plus an injected script tag) only when no bundled library covers the need; hand-roll the algorithm in source only as a last resort when neither a bundled library nor a small CDN-loadable library is suitable. For script widgets that display remote images, fetch remote data, or load external libraries from a CDN, set permissions.network to true; otherwise keep it false. External website links must be normal http/https anchors or call KK.openExternal(url), and KKTerm will open them in the user's external browser. Choose preset, accentName, iconName, and grid size deliberately from the widget purpose: panel for standard tools, tile/stat for compact metrics, action for launch/action surfaces, hero only for rare high-priority summaries. Size widgets generously enough to avoid inner scrollbars: simple timers/counters need at least 4x3, forms or images need 5x4 or larger, lists need height for expected rows. Games, canvas demos, and single-purpose interactive tools should start compact, normally 4-6 columns wide and 4-7 rows tall; do not make them full-width unless the user asks for a wide layout. For Three.js widgets, list body.libraries [\"three\"], size the renderer from KK.getViewport(), update renderer/camera on KK.onViewportResize, center the scene at world origin, and fit the camera to a Box3/Sphere around the complete object with about 15-25% margin so it remains centered and fully visible instead of oversized or clipped. For chartjs, echarts, leaflet, konva, pixijs, matter, mermaid, qrcode, jsbarcode, and gridjs widgets, mount the visual area inside kk-stage or kk-panel and size it from KK.getViewport() or the containing element; on KK.onViewportResize call the library's resize/update method so it stays centered and proportionate. Prefer calm app-like accents such as blue, teal, slate, emerald, amber for warnings, and red/rose only for destructive or error-oriented widgets. Never set text and background to the same or low-contrast colors; use host CSS variables and compact app-style controls. For polished script-widget UI, use KKTerm's built-in classes before writing custom CSS: kk-shell, kk-toolbar, kk-cluster, kk-title, kk-subtitle, kk-muted, kk-panel, kk-card, kk-grid, kk-stat, kk-stat-value, kk-stat-label, kk-pill, kk-badge, kk-stage, and kk-fill. Avoid default unstyled browser controls and oversized explanatory text. If the widget needs user-configurable/persistent per-instance options, provide settingsSchema.fields with text, number, boolean, select, or secret fields. Use secret fields for passwords, API keys, tokens, and similar values; secret fields require type, key, label, and placeholder only, with no defaultValue. SQLite stores only secret references and scripts must call await KK.getSecret('fieldKey') to read the OS-keychain value at runtime. After this tool returns, use the returned instance.id to request any needed widget secret with ownerId dashboard-widget-secret:<instance.id>:<fieldKey>. Do not generate full HTML documents; script source should create or update DOM nodes inside the provided root. CRITICAL for games and interactive canvases: always check boundary collisions against the arena edges (top, bottom, left, right) - a collision function that only checks filled cells but not the floor/walls will let pieces fall off-screen forever, turning the widget into a silent resource drain. Include an exit path for any requestAnimationFrame loop: check a stopped/paused/gameOver state at the top of the rAF callback so the loop can terminate rather than running 60fps forever. List only libraries whose documented global you actually call in source; declaring unused libraries (for example listing matter when the source never references Matter) wastes memory and bandwidth and is rejected at validation.",
            dashboard_create_widget_schema(),
        ).strict());
        tools.push(tool_definition(
            "dashboard_create_custom_widget",
            "Create a reusable AI-authored custom widget definition only; this does not place it on a view. bodyJson must be a JSON string matching the selected kind. Optional settingsSchemaJson defines app-rendered per-instance settings fields; use type secret for passwords, API keys, and tokens so only secret references are stored in SQLite. Prefer dashboard_create_widget when the user expects a visible widget.",
            json!({"type":"object","properties":{"kind":{"type":"string","enum":["content","script"]},"title":{"type":"string"},"summary":{"type":"string"},"category":{"type":"string"},"bodyJson":{"type":"string"},"settingsSchemaJson":{"type":"string"},"createdBy":{"type":"string","enum":["user","agent"]}},"required":["kind","title","summary","category","bodyJson","createdBy"]}),
        ));
        tools.push(tool_definition(
            "dashboard_update_custom_widget",
            "Update an existing custom widget's title, summary, category, or body. Prefer patch.body with the same structured body shape used by dashboard_create_widget so KKTerm serializes valid JSON for you. Use legacy patch.bodyJson only when you intentionally need to submit a pre-serialized JSON string.",
            dashboard_update_custom_widget_schema(),
        ));
        tools.push(tool_definition(
            "dashboard_remove_custom_widget",
            "Remove a custom widget definition. Set forceDeleteInstances to also remove all its placed instances.",
            json!({"type":"object","properties":{"id":{"type":"string"},"forceDeleteInstances":{"type":"boolean"}},"required":["id"]}),
        ));
        tools.push(tool_definition(
            "dashboard_reset",
            "Reset the entire Dashboard to defaults, removing all views, instances, and AI-authored custom widgets.",
            json!({"type":"object","properties":{}}),
        ));
    }
    if settings.connections() {
        tools.push(tool_definition(
            "connection_list",
            "List all saved KKTerm Connections and folders. Connections are durable saved resources, not live Sessions.",
            json!({"type":"object","properties":{}}),
        ));
        tools.push(tool_definition(
            "connection_create",
            "Create one saved KKTerm Connection. Secrets are not accepted here; use request_secret_entry or the app-owned secret UI for passwords and tokens.",
            connection_request_schema(false),
        ));
        tools.push(tool_definition(
            "connection_open",
            "Open a saved KKTerm Connection in the Workspace by id. Opening a Connection creates a live Session/Tab; it does not mutate the saved Connection.",
            json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}),
        ));
        tools.push(tool_definition(
            "connection_update",
            "Update one saved KKTerm Connection. First call connection_list, then submit the full updated Connection fields with the original id and type.",
            connection_request_schema(true),
        ));
        tools.push(tool_definition(
            "connection_delete",
            "Delete one saved KKTerm Connection by id. This removes durable Connection data but does not expose or delete secret values directly.",
            json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}),
        ));
    }
    if settings.sessions() {
        tools.push(tool_definition(
            "session_state",
            "Read the currently open KKTerm Tabs and active live Session targets, including pane ids the assistant can use with other session_* tools.",
            json!({"type":"object","properties":{}}),
        ));
        tools.push(tool_definition(
            "session_terminal_read_buffer",
            "Read visible terminal buffer text from an open terminal Pane. Use session_state first to discover paneId. Defaults to the active terminal Pane.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]},"maxChars":{"type":["integer","null"],"minimum":1,"maximum":50000}},"required":["paneId","maxChars"]}),
        ));
        tools.push(tool_definition(
            "session_terminal_send_text",
            "Send text to an open terminal Pane. Use this for user-approved commands. Set pressEnter true to submit.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]},"text":{"type":"string"},"pressEnter":{"type":"boolean"}},"required":["paneId","text","pressEnter"]}),
        ));
        tools.push(tool_definition(
            "session_remote_desktop_screenshot",
            "Capture the active RDP/VNC remote desktop surface as a transient PNG data URL for visual inspection.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]}},"required":["paneId"]}),
        ));
        tools.push(tool_definition(
            "session_remote_desktop_send_text",
            "Send text to an active remote desktop Session. RDP uses native text injection; VNC sends keyboard events when supported.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]},"text":{"type":"string"},"pressEnter":{"type":"boolean"}},"required":["paneId","text","pressEnter"]}),
        ));
        tools.push(tool_definition(
            "session_remote_desktop_keypress",
            "Send a named key press to an active RDP/VNC remote desktop Session.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]},"key":{"type":"string","enum":["enter","tab","escape","backspace","delete","arrowUp","arrowDown","arrowLeft","arrowRight","home","end","pageUp","pageDown","space","ctrlAltDelete"]}},"required":["paneId","key"]}),
        ));
        tools.push(tool_definition(
            "session_remote_desktop_mouse_click",
            "Send a mouse click to an active RDP/VNC remote desktop Session using remote surface coordinates.",
            json!({"type":"object","properties":{"paneId":{"type":["string","null"]},"x":{"type":"integer","minimum":0},"y":{"type":"integer","minimum":0},"button":{"type":"string","enum":["left","right","middle"]}},"required":["paneId","x","y","button"]}),
        ));
        tools.push(tool_definition(
            "session_file_browser_list",
            "List files in an active SFTP/FTP file browser Session. Defaults to its current remote path.",
            json!({"type":"object","properties":{"tabId":{"type":["string","null"]},"path":{"type":["string","null"]}},"required":["tabId","path"]}),
        ));
        tools.push(tool_definition(
            "session_file_browser_create_folder",
            "Create a folder in an active SFTP/FTP file browser Session.",
            json!({"type":"object","properties":{"tabId":{"type":["string","null"]},"parentPath":{"type":"string"},"name":{"type":"string"}},"required":["tabId","parentPath","name"]}),
        ));
        tools.push(tool_definition(
            "session_file_browser_rename",
            "Rename a path in an active SFTP/FTP file browser Session.",
            json!({"type":"object","properties":{"tabId":{"type":["string","null"]},"path":{"type":"string"},"newName":{"type":"string"}},"required":["tabId","path","newName"]}),
        ));
        tools.push(tool_definition(
            "session_file_browser_delete",
            "Delete a path in an active SFTP/FTP file browser Session.",
            json!({"type":"object","properties":{"tabId":{"type":["string","null"]},"path":{"type":"string"}},"required":["tabId","path"]}),
        ));
    }
    tools
}

fn connection_request_schema(include_id: bool) -> Value {
    let mut properties = serde_json::Map::new();
    if include_id {
        properties.insert("id".to_string(), json!({"type":"string"}));
    }
    properties.extend([
        ("name".to_string(), json!({"type":"string","minLength":1})),
        (
            "type".to_string(),
            json!({"type":"string","enum":["local","ssh","telnet","serial","url","rdp","vnc","ftp"]}),
        ),
        ("folderId".to_string(), json!({"type":["string","null"]})),
        ("host".to_string(), json!({"type":"string"})),
        ("user".to_string(), json!({"type":"string"})),
        ("port".to_string(), json!({"type":["integer","null"],"minimum":1,"maximum":65535})),
        ("keyPath".to_string(), json!({"type":["string","null"]})),
        ("proxyJump".to_string(), json!({"type":["string","null"]})),
        (
            "authMethod".to_string(),
            json!({"type":["string","null"],"enum":["keyFile","password","agent",null]}),
        ),
        ("localShell".to_string(), json!({"type":["string","null"]})),
        ("localStartupDirectory".to_string(), json!({"type":["string","null"]})),
        ("localStartupScript".to_string(), json!({"type":["string","null"]})),
        ("url".to_string(), json!({"type":["string","null"]})),
        ("dataPartition".to_string(), json!({"type":["string","null"]})),
        ("useTmuxSessions".to_string(), json!({"type":["boolean","null"]})),
        ("serialLine".to_string(), json!({"type":["string","null"]})),
        ("serialSpeed".to_string(), json!({"type":["integer","null"],"minimum":1})),
    ]);
    let mut required = vec![json!("name"), json!("type")];
    if include_id {
        required.insert(0, json!("id"));
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true
    })
}

fn request_secret_entry_schema() -> Value {
    json!({
        "type":"object",
        "properties":{
            "kind":{"type":"string","enum":["widgetSecret","aiApiKey"]},
            "instanceId":{"type":["string","null"]},
            "fieldKey":{"type":["string","null"]},
            "label":{"type":"string","minLength":1,"maxLength":80},
            "description":{"type":["string","null"],"maxLength":240},
            "placeholder":{"type":["string","null"],"maxLength":120}
        },
        "required":["kind","instanceId","fieldKey","label","description","placeholder"],
        "additionalProperties":false
    })
}

fn dashboard_create_widget_schema() -> Value {
    json!({
        "type":"object",
        "properties":{
            "viewId":{"type":"string"},
            "kind":{"type":"string","enum":["content","script"]},
            "title":{"type":"string","minLength":1,"maxLength":120},
            "summary":{"type":"string","maxLength":240},
            "category":{"type":"string","minLength":1,"maxLength":80},
            "settingsSchema":{"type":["object","null"],"properties":{"fields":{"type":"array","items":dashboard_widget_settings_field_schema()}},"required":["fields"],"additionalProperties":false},
            "body": dashboard_widget_body_schema(),
            "preset":{"type":"string","enum":["panel","ambient","tile","hero","action"]},
            "accentName":{"type":"string","enum":["default","blue","indigo","teal","green","amber","red","purple","pink","slate","cyan","orange","rose","emerald","sky"]},
            "iconName":{"type":"string","enum":["Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun","Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar","Database","Globe","Lock","Key","Mail","Mic","Monitor","Music","Package","Phone","Pin","Power","Printer","Radio","Search","Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash","Truck","User","Users","Video","Volume","Watch","Wifi","Wind","Zap","Layers","List","Grid"]},
            "gridX":{"type":"integer","minimum":0,"maximum":11},
            "gridY":{"type":"integer","minimum":0},
            "gridW":{"type":"integer","minimum":1,"maximum":12},
            "gridH":{"type":"integer","minimum":1}
        },
        "required":["viewId","kind","title","summary","category","settingsSchema","body","preset","accentName","iconName","gridX","gridY","gridW","gridH"],
        "additionalProperties":false
    })
}

fn dashboard_update_custom_widget_schema() -> Value {
    json!({
        "type":"object",
        "properties":{
            "id":{"type":"string"},
            "patch":{
                "type":"object",
                "properties":{
                    "title":{"type":"string"},
                    "summary":{"type":"string"},
                    "category":{"type":"string"},
                    "body": dashboard_widget_body_schema(),
                    "bodyJson":{"type":"string"},
                    "settingsSchemaJson":{"type":"string"}
                },
                "additionalProperties":false
            }
        },
        "required":["id","patch"],
        "additionalProperties":false
    })
}

fn dashboard_widget_body_schema() -> Value {
    json!({
        "anyOf":[
            {"type":"object","properties":{"shape":{"type":"string","enum":["markdown"]},"data":{"type":"object","properties":{"source":{"type":"string","minLength":1}},"required":["source"],"additionalProperties":false}},"required":["shape","data"],"additionalProperties":false},
            {"type":"object","properties":{"shape":{"type":"string","enum":["kvList"]},"data":{"type":"object","properties":{"rows":{"type":"array","minItems":1,"items":{"type":"object","properties":{"label":{"type":"string","minLength":1},"value":{"type":"string"}},"required":["label","value"],"additionalProperties":false}}},"required":["rows"],"additionalProperties":false}},"required":["shape","data"],"additionalProperties":false},
            {"type":"object","properties":{"shape":{"type":"string","enum":["checklist"]},"data":{"type":"object","properties":{"items":{"type":"array","minItems":1,"items":{"type":"object","properties":{"label":{"type":"string","minLength":1},"done":{"type":"boolean"}},"required":["label","done"],"additionalProperties":false}}},"required":["items"],"additionalProperties":false}},"required":["shape","data"],"additionalProperties":false},
            {"type":"object","properties":{"shape":{"type":"string","enum":["stat"]},"data":{"type":"object","properties":{"value":{"type":"string","minLength":1},"unit":{"type":["string","null"]},"delta":{"type":["string","null"]},"caption":{"type":["string","null"]}},"required":["value","unit","delta","caption"],"additionalProperties":false}},"required":["shape","data"],"additionalProperties":false},
            {"type":"object","properties":{"source":{"type":"string","minLength":1},"permissions":{"type":"object","properties":{"network":{"type":"boolean"},"pollSeconds":{"type":["integer","null"],"minimum":1}},"required":["network","pollSeconds"],"additionalProperties":false},"htmlShim":{"type":["string","null"]},"libraries":{"type":"array","maxItems":8,"items":{"type":"string","enum":dashboard_widget_library_keys()}}},"required":["source","permissions","htmlShim","libraries"],"additionalProperties":false}
        ]
    })
}

fn dashboard_widget_library_keys() -> Value {
    json!([
        "mermaid",
        "echarts",
        "chartjs",
        "qrcode",
        "jsbarcode",
        "jspdf",
        "mathjs",
        "papaparse",
        "pica",
        "dayjs",
        "konva",
        "roughjs",
        "alasql",
        "three",
        "pixijs",
        "matter",
        "prism",
        "jsyaml",
        "gridjs",
        "ansitohtml",
        "cronstrue",
        "cronparser",
        "jwtdecode",
        "diffmatchpatch",
        "chroma",
        "leaflet",
        "fflate",
        "marked",
        "animejs",
    ])
}

fn dashboard_widget_settings_field_schema() -> Value {
    let option_schema = json!({
        "type":"object",
        "properties":{"label":{"type":"string"},"value":{"type":"string"}},
        "required":["label","value"],
        "additionalProperties":false
    });

    json!({
        "anyOf":[
            {"type":"object","properties":{"type":{"type":"string","enum":["text"]},"key":{"type":"string"},"label":{"type":"string"},"placeholder":{"type":["string","null"]},"defaultValue":{"type":["string","null"]}},"required":["type","key","label","placeholder","defaultValue"],"additionalProperties":false},
            {"type":"object","properties":{"type":{"type":"string","enum":["number"]},"key":{"type":"string"},"label":{"type":"string"},"min":{"type":["number","null"]},"max":{"type":["number","null"]},"step":{"type":["number","null"]},"defaultValue":{"type":["number","null"]}},"required":["type","key","label","min","max","step","defaultValue"],"additionalProperties":false},
            {"type":"object","properties":{"type":{"type":"string","enum":["boolean"]},"key":{"type":"string"},"label":{"type":"string"},"defaultValue":{"type":["boolean","null"]}},"required":["type","key","label","defaultValue"],"additionalProperties":false},
            {"type":"object","properties":{"type":{"type":"string","enum":["select"]},"key":{"type":"string"},"label":{"type":"string"},"options":{"type":"array","items":option_schema,"minItems":1},"defaultValue":{"type":["string","null"]}},"required":["type","key","label","options","defaultValue"],"additionalProperties":false},
            {"type":"object","properties":{"type":{"type":"string","enum":["secret"]},"key":{"type":"string"},"label":{"type":"string"},"placeholder":{"type":["string","null"]}},"required":["type","key","label","placeholder"],"additionalProperties":false}
        ]
    })
}

fn normalize_ai_widget_initial_size(
    kind: &str,
    title: &str,
    summary: &str,
    category: &str,
    body: &Value,
    grid_w: i64,
    grid_h: i64,
) -> (i64, i64) {
    let mut width = grid_w.clamp(1, 12);
    let mut height = grid_h.max(1);
    if kind == "script" && looks_like_compact_interactive_widget(title, summary, category, body) {
        width = width.min(6);
        height = height.max(4);
    }
    (width, height)
}

fn looks_like_compact_interactive_widget(
    title: &str,
    summary: &str,
    category: &str,
    body: &Value,
) -> bool {
    let haystack = format!(
        "{} {} {} {}",
        title,
        summary,
        category,
        body.get("source").and_then(Value::as_str).unwrap_or("")
    )
    .to_ascii_lowercase();
    [
        "game",
        "tetris",
        "tris",
        "playable",
        "keyboard",
        "spinner",
        "timer",
        "stopwatch",
        "counter",
        "calculator",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
}

fn tool_definition(
    name: &'static str,
    description: &'static str,
    parameters: Value,
) -> OpenAiToolDefinition {
    OpenAiToolDefinition {
        tool_type: "function",
        function: OpenAiToolFunctionDefinition {
            name,
            description,
            parameters,
            strict: false,
        },
    }
}

impl OpenAiToolDefinition {
    fn strict(mut self) -> Self {
        self.function.strict = true;
        self
    }
}

async fn run_ai_tool(
    settings: &AiProviderSettings,
    app_data_dir: &Path,
    app: &tauri::AppHandle,
    call: &OpenAiToolCall,
    stream_channel: Option<&Channel<Value>>,
) -> String {
    let args: Value = serde_json::from_str(&call.function.arguments).unwrap_or_else(|_| json!({}));
    let tool_settings = settings.tools();
    ai_interaction_debug!(
        "tool.call",
        json!({
            "id": &call.id,
            "name": &call.function.name,
            "arguments": &call.function.arguments,
            "parsedArguments": &args,
            "permissionMode": settings.tool_permission_mode(),
        })
    );
    if tool_requires_allow_all(&call.function.name) && settings.tool_permission_mode() != "allowAll"
    {
        let result = tool_permission_required_result(&call.function.name);
        ai_interaction_debug!(
            "tool.permission_required",
            json!({
                "id": &call.id,
                "name": &call.function.name,
                "permissionMode": settings.tool_permission_mode(),
                "result": &result,
            })
        );
        return result;
    }
    let result = match call.function.name.as_str() {
        "request_secret_entry" => {
            request_secret_entry_tool(args, settings.provider_kind(), stream_channel)
        }
        "current_time" if tool_settings.current_time() => current_time_tool(),
        "web_search" if tool_settings.web_search() => web_search_tool(settings, args).await,
        "web_fetch" if tool_settings.web_fetch() => web_fetch_tool(args).await,
        "app_data_file_search" if tool_settings.app_data_file_search() => {
            app_data_file_search_tool(app_data_dir, args)
        }
        "app_data_file_read" if tool_settings.app_data_file_read() => {
            app_data_file_read_tool(app_data_dir, args)
        }
        "shell_command" if tool_settings.shell_command() => shell_command_tool(app_data_dir, args),
        name if tool_settings.dashboard() && name.starts_with("dashboard_") => {
            dashboard_tool(app, name, args)
        }
        name if tool_settings.connections() && name.starts_with("connection_") => {
            connection_tool(app, name, args)
        }
        name if tool_settings.sessions() && name.starts_with("session_") => {
            live_session_tool(app, name, args).await
        }
        _ => "Tool is disabled in AI Assistant settings.".to_string(),
    };
    ai_interaction_debug!(
        "tool.result",
        json!({
            "id": &call.id,
            "name": &call.function.name,
            "result": &result,
        })
    );
    result
}

fn tool_requires_allow_all(tool_name: &str) -> bool {
    tool_name == "shell_command"
        || (tool_name.starts_with("dashboard_") && tool_name != "dashboard_load_state")
        || matches!(
            tool_name,
            "connection_create" | "connection_update" | "connection_delete" | "connection_open"
        )
        || matches!(
            tool_name,
            "session_terminal_send_text"
                | "session_remote_desktop_send_text"
                | "session_remote_desktop_keypress"
                | "session_remote_desktop_mouse_click"
                | "session_file_browser_create_folder"
                | "session_file_browser_rename"
                | "session_file_browser_delete"
        )
}

fn tool_permission_required_result(tool_name: &str) -> String {
    json!({
        "ok": false,
        "error": "permissionRequired",
        "tool": tool_name,
        "permissionMode": "prompt",
        "message": "This tool changes KKTerm or the local machine. Ask the user to switch AI Assistant tool permissions to Allow All before calling it."
    })
    .to_string()
}

fn connection_tool(app: &tauri::AppHandle, name: &str, args: Value) -> String {
    let storage = app.state::<Storage>();
    let result: Result<Value, String> = match name {
        "connection_list" => storage
            .list_connection_tree()
            .map(|tree| serde_json::to_value(tree).unwrap_or(Value::Null)),
        "connection_create" => {
            serde_json::from_value::<crate::storage::CreateConnectionRequest>(args)
                .map_err(|error| format!("invalid connection_create request: {error}"))
                .and_then(|request| {
                    storage
                        .create_connection(request)
                        .map(|connection| serde_json::to_value(connection).unwrap_or(Value::Null))
                })
        }
        "connection_update" => {
            serde_json::from_value::<crate::storage::UpdateConnectionRequest>(args)
                .map_err(|error| format!("invalid connection_update request: {error}"))
                .and_then(|request| {
                    storage
                        .update_connection(request)
                        .map(|connection| serde_json::to_value(connection).unwrap_or(Value::Null))
                })
        }
        "connection_open" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                Err("connection_open requires id".to_string())
            } else {
                app.emit("assistant-open-connection", id)
                    .map(|_| json!({"ok": true}))
                    .map_err(|error| format!("failed to request Connection open: {error}"))
            }
        }
        "connection_delete" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                Err("connection_delete requires id".to_string())
            } else {
                storage.delete_connection(id).map(|_| json!({"ok": true}))
            }
        }
        _ => Err("Unknown Connection tool".to_string()),
    };

    match result {
        Ok(value) => {
            if name != "connection_list" {
                let _ = app.emit(
                    "connection-tree-changed",
                    json!({ "source": "aiTool", "tool": name }),
                );
            }
            value.to_string()
        }
        Err(error) => json!({ "ok": false, "error": error }).to_string(),
    }
}

async fn live_session_tool(app: &tauri::AppHandle, name: &str, args: Value) -> String {
    match app.try_state::<AssistantLiveToolBridge>() {
        Some(bridge) => bridge.request(app, name, args).await,
        None => json!({"ok": false, "error": "live session tools are unavailable"}).to_string(),
    }
}

fn dashboard_tool(app: &tauri::AppHandle, name: &str, args: Value) -> String {
    let storage = app.state::<Storage>();
    let result: Result<Value, String> = storage.with_connection_infallible(|conn| match name {
        "dashboard_load_state" => ds::load_state(conn)
            .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
            .map_err(|e| e.to_string()),
        "dashboard_create_view" => {
            let title = arg_string(&args, "title");
            if title.is_empty() {
                return Err("dashboard_create_view requires title".to_string());
            }
            let grid_density = args
                .get("gridDensity")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let id = new_dashboard_id("view");
            ds::create_view(conn, &id, &title, grid_density.as_deref())
                .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        "dashboard_update_view" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_update_view requires id".to_string());
            }
            let patch: ds::ViewPatch =
                serde_json::from_value(args.get("patch").cloned().unwrap_or(Value::Null))
                    .map_err(|e| format!("invalid patch: {e}"))?;
            ds::update_view(conn, &id, &patch)
                .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        "dashboard_remove_view" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_remove_view requires id".to_string());
            }
            ds::remove_view(conn, &id)
                .map(|_| json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        "dashboard_reorder_views" => {
            let ordered_ids: Vec<String> = args
                .get("orderedIds")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            ds::reorder_views(conn, &ordered_ids)
                .map(|_| json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        "dashboard_add_instance" => {
            let view_id = arg_string(&args, "viewId");
            let kind = arg_string(&args, "kind");
            let source_id = arg_string(&args, "sourceId");
            let preset = arg_string(&args, "preset");
            let accent_name = arg_string(&args, "accentName");
            let icon_name = arg_string(&args, "iconName");
            let grid_x = args.get("gridX").and_then(Value::as_i64).unwrap_or(0);
            let grid_y = args.get("gridY").and_then(Value::as_i64).unwrap_or(0);
            let mut grid_w = args.get("gridW").and_then(Value::as_i64).unwrap_or(4);
            let mut grid_h = args.get("gridH").and_then(Value::as_i64).unwrap_or(3);
            if grid_x + grid_w > 12 {
                grid_w = (12 - grid_x).max(1);
            }
            if grid_w < 1 {
                grid_w = 1;
            }
            if grid_h < 1 {
                grid_h = 1;
            }
            let id = new_dashboard_id("inst");
            ds::add_instance(
                conn,
                &id,
                &view_id,
                &kind,
                &source_id,
                &preset,
                &accent_name,
                &icon_name,
                grid_x,
                grid_y,
                grid_w,
                grid_h,
            )
            .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
            .map_err(|e| e.to_string())
        }
        "dashboard_update_instance" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_update_instance requires id".to_string());
            }
            let patch: ds::InstancePatch =
                serde_json::from_value(args.get("patch").cloned().unwrap_or(Value::Null))
                    .map_err(|e| format!("invalid patch: {e}"))?;
            ds::update_instance(conn, &id, &patch)
                .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        "dashboard_remove_instance" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_remove_instance requires id".to_string());
            }
            ds::remove_instance(conn, &id)
                .map(|_| json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        "dashboard_apply_layout" => {
            let view_id = arg_string(&args, "viewId");
            if view_id.is_empty() {
                return Err("dashboard_apply_layout requires viewId".to_string());
            }
            let layout: Vec<ds::LayoutEntry> = args
                .get("layout")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            ds::apply_layout(conn, &view_id, &layout)
                .map(|_| json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        "dashboard_create_widget" => {
            let view_id = arg_string(&args, "viewId");
            if view_id.is_empty() {
                return Err("dashboard_create_widget requires viewId".to_string());
            }
            let kind = arg_string(&args, "kind");
            let title = arg_string(&args, "title");
            let summary = arg_string(&args, "summary");
            let category = arg_string(&args, "category");
            let body = args.get("body").cloned().unwrap_or(Value::Null);
            if body.is_null() {
                return Err("dashboard_create_widget requires body".to_string());
            }
            let body_json =
                serde_json::to_string(&body).map_err(|e| format!("invalid body: {e}"))?;
            let settings_schema_json = args
                .get("settingsSchema")
                .filter(|value| !value.is_null())
                .map(serde_json::to_string)
                .transpose()
                .map_err(|e| format!("invalid settingsSchema: {e}"))?;
            let preset = arg_string(&args, "preset");
            let accent_name = arg_string(&args, "accentName");
            let icon_name = arg_string(&args, "iconName");
            let grid_x = args.get("gridX").and_then(Value::as_i64).unwrap_or(0);
            let grid_y = args.get("gridY").and_then(Value::as_i64).unwrap_or(0);
            let requested_grid_w = args.get("gridW").and_then(Value::as_i64).unwrap_or(4);
            let requested_grid_h = args.get("gridH").and_then(Value::as_i64).unwrap_or(3);
            let (mut grid_w, mut grid_h) = normalize_ai_widget_initial_size(
                &kind,
                &title,
                &summary,
                &category,
                &body,
                requested_grid_w,
                requested_grid_h,
            );
            if grid_x + grid_w > 12 {
                grid_w = (12 - grid_x).max(1);
            }
            if grid_w < 1 {
                grid_w = 1;
            }
            if grid_h < 1 {
                grid_h = 1;
            }
            ai_interaction_debug!(
                "dashboard.create_widget.prepare",
                json!({
                    "viewId": &view_id,
                    "kind": &kind,
                    "title": &title,
                    "summary": &summary,
                    "category": &category,
                    "bodyJson": &body_json,
                    "settingsSchemaJson": &settings_schema_json,
                    "requestedGrid": {
                        "w": requested_grid_w,
                        "h": requested_grid_h,
                    },
                    "normalizedGrid": {
                        "x": grid_x,
                        "y": grid_y,
                        "w": grid_w,
                        "h": grid_h,
                    },
                    "preset": &preset,
                    "accentName": &accent_name,
                    "iconName": &icon_name,
                })
            );
            let custom_widget_id = new_dashboard_id("cw");
            let instance_id = new_dashboard_id("inst");
            let custom_widget = ds::create_custom_widget(
                conn,
                &custom_widget_id,
                &kind,
                &title,
                &summary,
                &category,
                &body_json,
                settings_schema_json.as_deref(),
                "agent",
            )
            .map_err(|e| e.to_string())?;
            ai_interaction_debug!(
                "dashboard.create_widget.custom_created",
                json!({
                    "customWidgetId": &custom_widget_id,
                    "instanceId": &instance_id,
                    "customWidget": &custom_widget,
                })
            );
            let instance = match ds::add_instance(
                conn,
                &instance_id,
                &view_id,
                &kind,
                &custom_widget_id,
                &preset,
                &accent_name,
                &icon_name,
                grid_x,
                grid_y,
                grid_w,
                grid_h,
            ) {
                Ok(instance) => instance,
                Err(error) => {
                    let _ = ds::remove_custom_widget(conn, &custom_widget_id, true);
                    ai_interaction_debug!(
                        "dashboard.create_widget.instance_error_rollback",
                        json!({
                            "customWidgetId": &custom_widget_id,
                            "instanceId": &instance_id,
                            "error": format!("{error:?}"),
                        })
                    );
                    return Err(format!("{error:?}"));
                }
            };
            ai_interaction_debug!(
                "dashboard.create_widget.instance_created",
                json!({
                    "customWidgetId": &custom_widget_id,
                    "instanceId": &instance_id,
                    "instance": &instance,
                })
            );
            Ok(json!({ "customWidget": custom_widget, "instance": instance }))
        }
        "dashboard_create_custom_widget" => {
            let kind = arg_string(&args, "kind");
            let title = arg_string(&args, "title");
            let summary = arg_string(&args, "summary");
            let category = arg_string(&args, "category");
            let body_json = arg_string(&args, "bodyJson");
            let settings_schema_json = args
                .get("settingsSchemaJson")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let created_by = arg_string(&args, "createdBy");
            let id = new_dashboard_id("cw");
            ds::create_custom_widget(
                conn,
                &id,
                &kind,
                &title,
                &summary,
                &category,
                &body_json,
                settings_schema_json.as_deref(),
                &created_by,
            )
            .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
            .map_err(|e| e.to_string())
        }
        "dashboard_update_custom_widget" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_update_custom_widget requires id".to_string());
            }
            let patch: ds::CustomWidgetPatch =
                serde_json::from_value(normalize_dashboard_custom_widget_patch(
                    args.get("patch").cloned().unwrap_or(Value::Null),
                )?)
                .map_err(|e| format!("invalid patch: {e}"))?;
            ds::update_custom_widget(conn, &id, &patch)
                .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        "dashboard_remove_custom_widget" => {
            let id = arg_string(&args, "id");
            if id.is_empty() {
                return Err("dashboard_remove_custom_widget requires id".to_string());
            }
            let force = args
                .get("forceDeleteInstances")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            ds::remove_custom_widget(conn, &id, force)
                .map(|_| json!({"ok": true}))
                .map_err(|e| e.to_string())
        }
        "dashboard_reset" => ds::reset_dashboard(conn)
            .map(|_| json!({"ok": true}))
            .map_err(|e| e.to_string()),
        _ => Err(format!("unknown dashboard tool: {name}")),
    });
    if result.is_ok() && is_dashboard_mutating_tool(name) {
        let _ = app.emit(
            "dashboard-changed",
            json!({ "source": "aiTool", "tool": name }),
        );
    }
    match result {
        Ok(v) => serde_json::to_string(&v).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => format!("{{\"error\":\"{}\"}}", e.replace('"', "\\\"")),
    }
}

fn normalize_dashboard_custom_widget_patch(mut patch: Value) -> Result<Value, String> {
    let Some(object) = patch.as_object_mut() else {
        return Ok(patch);
    };
    if object.get("bodyJson").is_none() {
        if let Some(body) = object.remove("body") {
            let body_json = serde_json::to_string(&body)
                .map_err(|error| format!("invalid patch.body: {error}"))?;
            object.insert("bodyJson".to_string(), Value::String(body_json));
        }
    } else {
        object.remove("body");
    }
    Ok(patch)
}

fn is_dashboard_mutating_tool(name: &str) -> bool {
    name.starts_with("dashboard_") && name != "dashboard_load_state"
}

fn request_secret_entry_tool(
    args: Value,
    provider_kind: &str,
    stream_channel: Option<&Channel<Value>>,
) -> String {
    match build_secret_entry_request(&args, provider_kind) {
        Ok(request) => {
            if let Some(channel) = stream_channel {
                if let Err(error) = emit_stream(
                    channel,
                    &AiStreamEvent::ContentDelta {
                        delta: format!("\n\n{}\n\n", request.markdown),
                    },
                ) {
                    return format!("{{\"error\":\"{}\"}}", error.replace('"', "\\\""));
                }
            }
            serde_json::to_string(&json!({
                "ok": true,
                "kind": request.kind,
                "ownerId": request.owner_id,
                "label": request.label,
                "secretRequestMarkdown": request.markdown,
                "message": "KKTerm is showing a local secret entry card. The secret value is entered locally and is not visible to the AI model."
            }))
            .unwrap_or_else(|_| "{}".to_string())
        }
        Err(error) => format!("{{\"error\":\"{}\"}}", error.replace('"', "\\\"")),
    }
}

struct SecretEntryRequest {
    kind: String,
    owner_id: String,
    label: String,
    markdown: String,
}

fn build_secret_entry_request(
    args: &Value,
    provider_kind: &str,
) -> Result<SecretEntryRequest, String> {
    let kind = arg_string(args, "kind");
    let label = bounded_required_arg(args, "label", 80)?;
    let description = bounded_optional_arg(args, "description", 240);
    let placeholder = bounded_optional_arg(args, "placeholder", 120);
    let owner_id = match kind.as_str() {
        "aiApiKey" => ai_provider_secret_owner_id(provider_kind),
        "widgetSecret" => {
            let instance_id = bounded_required_arg(args, "instanceId", 80)?;
            let field_key = bounded_required_arg(args, "fieldKey", 64)?;
            if !valid_secret_owner_component(&instance_id) {
                return Err("request_secret_entry instanceId is invalid".to_string());
            }
            if !valid_secret_field_key(&field_key) {
                return Err("request_secret_entry fieldKey is invalid".to_string());
            }
            format!("dashboard-widget-secret:{instance_id}:{field_key}")
        }
        _ => return Err("request_secret_entry kind must be widgetSecret or aiApiKey".to_string()),
    };
    let request = json!({
        "kind": kind,
        "ownerId": owner_id,
        "label": label,
        "description": description,
        "placeholder": placeholder
    });
    let markdown = format!(
        "```kkterm-secret-request\n{}\n```",
        serde_json::to_string(&request).map_err(|error| error.to_string())?
    );
    Ok(SecretEntryRequest {
        kind,
        owner_id,
        label,
        markdown,
    })
}

fn bounded_required_arg(args: &Value, key: &str, max_len: usize) -> Result<String, String> {
    let value = arg_string(args, key);
    if value.is_empty() {
        return Err(format!("request_secret_entry {key} is required"));
    }
    if value.len() > max_len {
        return Err(format!("request_secret_entry {key} is too long"));
    }
    Ok(value)
}

fn bounded_optional_arg(args: &Value, key: &str, max_len: usize) -> Option<String> {
    let value = arg_string(args, key);
    (!value.is_empty()).then(|| value.chars().take(max_len).collect())
}

fn valid_secret_owner_component(value: &str) -> bool {
    !value.is_empty() && !value.contains(':') && !value.chars().any(char::is_control)
}

fn valid_secret_field_key(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    value.len() <= 64 && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn current_time_tool() -> String {
    time::OffsetDateTime::now_local()
        .ok()
        .and_then(|t| {
            t.format(&time::format_description::well_known::Rfc3339)
                .ok()
        })
        .unwrap_or_else(|| {
            let utc = time::OffsetDateTime::now_utc();
            utc.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_else(|_| utc.unix_timestamp().to_string())
        })
}

async fn web_search_tool(settings: &AiProviderSettings, args: Value) -> String {
    let query = arg_string(&args, "query");
    if query.is_empty() {
        return "web_search requires query.".to_string();
    }
    let provider = settings.search_provider();
    let allow_insecure = settings.allow_insecure_tls();

    match provider {
        "scraper" | "" => web_search_scraper(&query, allow_insecure).await,
        "brave" => match settings.search_provider_api_key() {
            Some(key) => web_search_brave(&query, key, allow_insecure).await,
            None => "Brave Search API key is not configured.".to_string(),
        },
        "tavily" => match settings.search_provider_api_key() {
            Some(key) => web_search_tavily(&query, key, allow_insecure).await,
            None => "Tavily Search API key is not configured.".to_string(),
        },
        "searxng" => {
            let instance_url = settings.searxng_url();
            if instance_url.is_empty() {
                "SearXNG instance URL is not configured.".to_string()
            } else {
                web_search_searxng(&query, instance_url, allow_insecure).await
            }
        }
        _ => "Unknown search provider configured.".to_string(),
    }
}

async fn web_fetch_tool(args: Value) -> String {
    let url = arg_string(&args, "url");
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return "web_fetch only accepts http:// or https:// URLs.".to_string();
    }
    let client = match reqwest::Client::builder().build() {
        Ok(client) => client,
        Err(error) => return format!("Failed to create HTTP client: {error}"),
    };
    match client.get(&url).send().await {
        Ok(response) => {
            let content_type = response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if !content_type.contains("text/html") && !content_type.contains("text/plain") {
                return format!(
                    "Cannot fetch content type: {content_type}. Only text/html and text/plain are supported."
                );
            }
            match response.text().await {
                Ok(html) => extract_readable_text(&html),
                Err(error) => format!("Failed to read page: {error}"),
            }
        }
        Err(error) => format!("Fetch failed: {error}"),
    }
}

fn app_data_file_search_tool(root: &Path, args: Value) -> String {
    let query = arg_string(&args, "query").to_ascii_lowercase();
    if query.is_empty() {
        return "app_data_file_search requires query.".to_string();
    }
    let mut matches = Vec::new();
    collect_file_matches(root, root, &query, &mut matches);
    if matches.is_empty() {
        "No matching app data files found.".to_string()
    } else {
        matches.join("\n")
    }
}

fn app_data_file_read_tool(root: &Path, args: Value) -> String {
    let requested = arg_string(&args, "path");
    let Some(path) = safe_app_data_path(root, &requested) else {
        return "Path is outside KKTerm app data or is invalid.".to_string();
    };
    match fs::metadata(&path) {
        Ok(metadata) if metadata.len() > 128 * 1024 => {
            "File is too large for Assistant reading.".to_string()
        }
        Ok(metadata) if !metadata.is_file() => "Path is not a regular file.".to_string(),
        Ok(_) => match fs::read_to_string(&path) {
            Ok(text) => text.chars().take(12000).collect(),
            Err(error) => format!("Failed to read app data file: {error}"),
        },
        Err(error) => format!("Failed to inspect app data file: {error}"),
    }
}

fn shell_command_tool(root: &Path, args: Value) -> String {
    let command = arg_string(&args, "command");
    let shell = arg_string(&args, "shell");
    if command.is_empty() {
        return "shell_command requires command.".to_string();
    }
    if is_destructive_command(&command) {
        return "Blocked: deletion or destructive commands require an explicit KKTerm approval prompt and were not executed.".to_string();
    }
    let output = if shell.eq_ignore_ascii_case("batch") {
        Command::new("cmd")
            .args(["/C", &command])
            .current_dir(root)
            .output()
    } else {
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &command])
            .current_dir(root)
            .output()
    };
    match output {
        Ok(output) => {
            let mut text = String::new();
            text.push_str(&format!("exit code: {:?}\n", output.status.code()));
            text.push_str(&String::from_utf8_lossy(&output.stdout));
            text.push_str(&String::from_utf8_lossy(&output.stderr));
            text.chars().take(12000).collect()
        }
        Err(error) => format!("Command failed to start: {error}"),
    }
}

fn collect_file_matches(root: &Path, dir: &Path, query: &str, matches: &mut Vec<String>) {
    if matches.len() >= 50 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().contains(query))
        {
            matches.push(
                path.strip_prefix(root)
                    .unwrap_or(&path)
                    .display()
                    .to_string(),
            );
            if matches.len() >= 50 {
                return;
            }
        }
        if path.is_dir() {
            collect_file_matches(root, &path, query, matches);
        }
    }
}

fn safe_app_data_path(root: &Path, requested: &str) -> Option<PathBuf> {
    let root = root.canonicalize().ok()?;
    let candidate = root.join(requested.trim().trim_start_matches(['/', '\\']));
    let canonical = candidate.canonicalize().ok()?;
    canonical.starts_with(&root).then_some(canonical)
}

fn arg_string(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn tool_result_error(result: &str) -> Option<String> {
    let trimmed = result.trim();
    if !trimmed.starts_with("{\"error\"") {
        return None;
    }
    serde_json::from_str::<Value>(trimmed)
        .ok()
        .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string))
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty())
}

/// Maximum number of times the same `(tool, error)` pair may repeat
/// consecutively before the agent loop aborts. Prevents pathological
/// retry loops where the model regenerates the same broken tool call
/// because the tool result gave it no actionable diagnostic.
const MAX_CONSECUTIVE_TOOL_ERRORS: u8 = 3;

#[derive(Default)]
struct ConsecutiveToolErrorTracker {
    signature: Option<String>,
    count: u8,
}

impl ConsecutiveToolErrorTracker {
    /// Update tracker after a tool call. If the same `(tool, error)` pair has
    /// repeated `MAX_CONSECUTIVE_TOOL_ERRORS` times, return an explanatory
    /// message the caller should surface to the user before bailing out.
    fn note(&mut self, tool_name: &str, error: &Option<String>) -> Option<String> {
        let Some(err) = error else {
            self.signature = None;
            self.count = 0;
            return None;
        };
        let signature = format!("{tool_name}::{err}");
        if self.signature.as_deref() == Some(signature.as_str()) {
            self.count += 1;
        } else {
            self.count = 1;
            self.signature = Some(signature);
        }
        if self.count >= MAX_CONSECUTIVE_TOOL_ERRORS {
            Some(format!(
                "Aborted tool loop: '{tool_name}' returned the same error {} times in a row. \
Last error: {err}",
                self.count
            ))
        } else {
            None
        }
    }
}

fn is_destructive_command(command: &str) -> bool {
    contains_any(
        &command.to_ascii_lowercase(),
        &[
            "remove-item",
            "rm ",
            "rm-",
            "del ",
            "erase ",
            "rmdir",
            "rd /",
            "format",
            "diskpart",
            "mkfs",
            "dd if=",
            "shutdown",
            "restart-computer",
            "stop-computer",
            "set-content",
            "out-file",
            ">",
            "move-item",
            "copy-item",
            "new-item",
        ],
    )
}

fn strip_html(value: &str) -> String {
    let mut out = String::with_capacity(value.len().min(8192));
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

fn url_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn clean_text(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut prev_was_whitespace = true;
    for ch in text.chars() {
        if ch.is_whitespace() {
            if !prev_was_whitespace {
                result.push(' ');
            }
            prev_was_whitespace = true;
        } else {
            result.push(ch);
            prev_was_whitespace = false;
        }
    }
    result.trim().to_string()
}

fn extract_readable_text(html: &str) -> String {
    let document = Html::parse_document(html);

    for selector_str in [
        "article",
        "main",
        "[role=\"main\"]",
        ".post-content",
        ".article-content",
        ".entry-content",
        "#content",
    ] {
        if let Ok(selector) = Selector::parse(selector_str) {
            let combined: String = document
                .select(&selector)
                .flat_map(|el| el.text())
                .collect::<Vec<_>>()
                .join(" ");
            let cleaned = clean_text(&combined);
            if cleaned.len() > 200 {
                return cleaned.chars().take(8000).collect();
            }
        }
    }

    if let Ok(selector) = Selector::parse("body") {
        if let Some(body) = document.select(&selector).next() {
            let combined: String = body.text().collect::<Vec<_>>().join(" ");
            return clean_text(&combined).chars().take(8000).collect();
        }
    }

    clean_text(&strip_html(html)).chars().take(8000).collect()
}

fn build_web_client(allow_insecure_tls: bool) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(allow_insecure_tls)
        .build()
        .map_err(|e| format!("failed to create HTTP client: {e}"))
}

async fn web_search_scraper(query: &str, allow_insecure_tls: bool) -> String {
    let client = match build_web_client(allow_insecure_tls) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let json_url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        url_encode(query)
    );

    match client.get(&json_url).send().await {
        Ok(response) => match response.json::<DdgInstantAnswer>().await {
            Ok(answer) => {
                let mut result = String::new();
                if !answer.abstract_text.is_empty() {
                    result.push_str("Instant answer: ");
                    result.push_str(&answer.abstract_text);
                    if !answer.abstract_url.is_empty() {
                        result.push_str(&format!("\nSource: {}", answer.abstract_url));
                    }
                }
                let mut has_related = false;
                for topic in &answer.related_topics {
                    if let Some(text) = &topic.text {
                        if !has_related {
                            if !result.is_empty() {
                                result.push_str("\n\n");
                            }
                            result.push_str("Related topics:\n");
                            has_related = true;
                        }
                        result.push_str(&format!("- {}\n", text));
                    }
                }
                if !result.is_empty() {
                    return result.chars().take(4000).collect();
                }
            }
            Err(_) => {}
        },
        Err(_) => {}
    }

    let html_url = format!("https://html.duckduckgo.com/html/?q={}", url_encode(query));
    match client.get(&html_url).send().await {
        Ok(response) => match response.text().await {
            Ok(html) => {
                let document = Html::parse_document(&html);
                let mut result = String::new();
                if let Ok(sel) = Selector::parse(".result__body") {
                    for (i, el) in document.select(&sel).enumerate() {
                        if i >= 6 {
                            break;
                        }
                        let snippet: String = el.text().collect::<Vec<_>>().join(" ");
                        let cleaned = clean_text(&snippet);
                        if !cleaned.is_empty() {
                            result.push_str(&cleaned);
                            result.push('\n');
                        }
                    }
                }
                if result.is_empty() {
                    clean_text(&strip_html(&html)).chars().take(4000).collect()
                } else {
                    result.chars().take(4000).collect()
                }
            }
            Err(error) => format!("Web search failed: {error}"),
        },
        Err(error) => format!("Web search failed: {error}"),
    }
}

async fn web_search_brave(query: &str, api_key: &str, allow_insecure_tls: bool) -> String {
    let client = match build_web_client(allow_insecure_tls) {
        Ok(c) => c,
        Err(e) => return e,
    };
    let url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count=5",
        url_encode(query)
    );
    match client
        .get(&url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .send()
        .await
    {
        Ok(response) => match response.json::<BraveSearchResponse>().await {
            Ok(data) => {
                if let Some(web) = data.web {
                    let mut result = String::new();
                    for (i, r) in web.results.iter().enumerate() {
                        result.push_str(&format!("{}. {}\n", i + 1, r.title));
                        result.push_str(&format!("   {}\n", r.url));
                        result.push_str(&format!("   {}\n", r.description));
                    }
                    result.chars().take(4000).collect()
                } else {
                    "Brave Search returned no web results.".to_string()
                }
            }
            Err(error) => format!("Failed to parse Brave Search response: {error}"),
        },
        Err(error) => format!("Brave Search request failed: {error}"),
    }
}

async fn web_search_tavily(query: &str, api_key: &str, allow_insecure_tls: bool) -> String {
    let client = match build_web_client(allow_insecure_tls) {
        Ok(c) => c,
        Err(e) => return e,
    };
    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "include_answer": true,
        "max_results": 5,
    });
    match client
        .post("https://api.tavily.com/search")
        .json(&body)
        .send()
        .await
    {
        Ok(response) => match response.json::<TavilySearchResponse>().await {
            Ok(data) => {
                let mut result = String::new();
                if let Some(answer) = &data.answer {
                    if !answer.is_empty() {
                        result.push_str("Answer: ");
                        result.push_str(answer);
                        result.push_str("\n\n");
                    }
                }
                for (i, r) in data.results.iter().enumerate() {
                    result.push_str(&format!("{}. {}\n", i + 1, r.title));
                    result.push_str(&format!("   {}\n", r.url));
                    result.push_str(&format!("   {}\n", r.content));
                }
                result.chars().take(4000).collect()
            }
            Err(error) => format!("Failed to parse Tavily response: {error}"),
        },
        Err(error) => format!("Tavily request failed: {error}"),
    }
}

async fn web_search_searxng(query: &str, instance_url: &str, allow_insecure_tls: bool) -> String {
    let client = match build_web_client(allow_insecure_tls) {
        Ok(c) => c,
        Err(e) => return e,
    };
    let base = instance_url.trim_end_matches('/');
    let url = format!("{}/search?q={}&format=json", base, url_encode(query));
    match client.get(&url).send().await {
        Ok(response) => match response.json::<SearxngSearchResponse>().await {
            Ok(data) => {
                let mut result = String::new();
                for (i, r) in data.results.iter().enumerate().take(6) {
                    result.push_str(&format!("{}. {}\n", i + 1, r.title));
                    result.push_str(&format!("   {}\n", r.url));
                    if let Some(content) = &r.content {
                        result.push_str(&format!("   {}\n", content));
                    }
                }
                if result.is_empty() {
                    "SearXNG returned no results.".to_string()
                } else {
                    result.chars().take(4000).collect()
                }
            }
            Err(error) => format!("Failed to parse SearXNG response: {error}"),
        },
        Err(error) => format!("SearXNG request failed: {error}"),
    }
}

#[derive(Deserialize)]
struct DdgInstantAnswer {
    #[serde(rename = "AbstractText")]
    abstract_text: String,
    #[serde(rename = "AbstractURL")]
    abstract_url: String,
    #[serde(rename = "RelatedTopics")]
    related_topics: Vec<DdgRelatedTopic>,
}

#[derive(Deserialize)]
struct DdgRelatedTopic {
    #[serde(rename = "Text")]
    text: Option<String>,
}

#[derive(Deserialize)]
struct BraveSearchResponse {
    web: Option<BraveWeb>,
}

#[derive(Deserialize)]
struct BraveWeb {
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    title: String,
    url: String,
    description: String,
}

#[derive(Deserialize)]
struct TavilySearchResponse {
    answer: Option<String>,
    results: Vec<TavilyResult>,
}

#[derive(Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    content: String,
}

#[derive(Deserialize)]
struct SearxngSearchResponse {
    results: Vec<SearxngResult>,
}

#[derive(Deserialize)]
struct SearxngResult {
    title: String,
    url: String,
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleChatResponse {
    choices: Vec<OpenAiCompatibleChoice>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleChoice {
    message: OpenAiCompatibleResponseMessage,
}

#[derive(Deserialize)]
struct OpenAiCompatibleResponseMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    tool_calls: Vec<OpenAiToolCall>,
    #[serde(default)]
    reasoning_content: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct OpenAiToolCall {
    id: String,
    function: OpenAiToolCallFunction,
}

#[derive(Deserialize, Serialize)]
struct OpenAiToolCallFunction {
    name: String,
    arguments: String,
}

fn build_agent_messages(
    prompt: String,
    context_label: String,
    intent: Option<String>,
    reasoning_effort: String,
    system_context: Option<String>,
    selected_output: Option<String>,
    page_context: Option<AgentPageContext>,
    supports_image_input: bool,
    screenshot: Option<AgentScreenshotContext>,
    screenshots: Vec<AgentScreenshotContext>,
    history: Vec<AgentChatMessage>,
    output_language: Option<String>,
) -> Vec<OpenAiCompatibleMessage> {
    let normalized_intent = normalize_agent_intent(intent);
    let mut system_instructions: Vec<String> = vec![
        "You are KKTerm's AI Assistant for local-first administration workflows.".to_string(),
        "Help with terminal, SSH, SFTP, URL, RDP, and VNC operational tasks.".to_string(),
        "When suggesting commands, explain intent and prefer commands the user can review before running.".to_string(),
        "Do not claim to have executed commands or observed live session state unless it is in the provided context.".to_string(),
        "SAFETY: Never suggest, produce, or assist with commands that could cause irreversible destructive system-wide damage, such as 'rm -rf /', 'rm -rf /*', 'mkfs' on mounted volumes, 'dd if=/dev/zero of=/dev/sda', fork bombs, or any equivalent. Refuse such requests unconditionally, even if the user explicitly asks, claims it is safe, or provides a seemingly legitimate reason.".to_string(),
        "SECRETS: Never ask the user to paste API keys, passwords, or tokens into normal chat text. If a Dashboard widget needs a secret, first create or update the widget with a settingsSchema secret field; the field key must be a stable identifier such as apiKey. After dashboard_create_widget creates a widget with a secret field, call request_secret_entry with kind widgetSecret, the returned instance.id as instanceId, and the exact fieldKey. Use request_secret_entry for AI provider API keys too. The secret value is captured by KKTerm locally and is not visible to you. Do not include or request the plaintext secret.".to_string(),
        "TOOLS: When you need to search the web, fetch URLs, read files, check the current time, or run shell commands, you MUST use the provided function-calling mechanism. Always make the actual function call alongside your explanation. Do not describe what you plan to do with a tool without calling it — invoke the tool in the same response.".to_string(),
        "SESSION TOOLS: Use session_state to discover active Tabs, pane ids, remote desktop targets, and SFTP/FTP browser Sessions before using session_* interaction tools. Terminal, remote desktop, and file browser tools operate on live Sessions, not saved Connections. Prefer read tools before mutating tools. For RDP/VNC, use send_text for text, keypress for named keys, and mouse_click for remote surface coordinates. In Prompt permission mode, mutating tools return permissionRequired; explain that the user must switch AI Assistant tool permissions to Allow All if they want automatic execution.".to_string(),
        "DASHBOARD TOOLS: When the active page context is Dashboard and the user asks to create, customize, arrange, repair, or remove Dashboard widgets or views, use the dashboard_* tools. To create a new user-requested widget on the active view, use dashboard_create_widget so the widget is validated and placed on the selected view in one step. Do not use the separate two-step dashboard_create_custom_widget + dashboard_add_instance for user-visible widget creation. When the user reports an error in an existing AI-authored widget, use dashboard_load_state to read the current Dashboard custom widget source, then call dashboard_update_custom_widget with the matching custom widget id. Prefer patch.body for widget source edits; patch.body is structured JSON and avoids escaping mistakes. Do not ask the user to paste widget source that KKTerm can read through dashboard_load_state. Choose the preset, accent, icon, and grid size to fit the widget's job and KKTerm's quiet desktop style; do not pick decorative colors at random. Be boundary-aware: size simple timers/counters at least 4x3, forms or images at least 5x4, and list widgets tall enough for their expected rows so the initial widget does not show inner scrollbars. Games, canvas demos, and single-purpose interactive tools should start compact, normally 4-6 columns wide and 4-7 rows tall; do not make them full-width unless the user asks for a wide layout. For Three.js widgets, list body.libraries [\"three\"], size the renderer from KK.getViewport(), update renderer/camera on KK.onViewportResize, center the scene at world origin, and fit the camera to a Box3/Sphere around the complete object with about 15-25% margin so it remains centered and fully visible instead of oversized or clipped. For chartjs, echarts, leaflet, konva, pixijs, matter, mermaid, qrcode, jsbarcode, and gridjs widgets, mount the visual area inside kk-stage or kk-panel and size it from KK.getViewport() or the containing element; on KK.onViewportResize call the library's resize/update method so it stays centered and proportionate. Prefer schema/content widgets when possible, and keep generated script widget UI compact, app-like, readable, high-contrast, and free of full HTML documents or script tags. Use KKTerm's built-in script UI classes before writing custom CSS: kk-shell, kk-toolbar, kk-cluster, kk-title, kk-subtitle, kk-muted, kk-panel, kk-card, kk-grid, kk-stat, kk-stat-value, kk-stat-label, kk-pill, kk-badge, kk-stage, and kk-fill. Avoid default unstyled browser controls and oversized explanatory text. Use body.libraries for curated local script libraries such as mermaid and animejs; use permissions.network=true only for remote network access or CDN-loaded libraries. Use settingsSchema.fields for persistent per-instance custom options; KKTerm renders those settings and scripts can read non-secret values with KK.getSettings() and save via KK.setSetting(key, value). Passwords, API keys, tokens, and similar sensitive values must use settingsSchema field type secret with no defaultValue; SQLite stores only a secretRef, the value lives in OS keychain as widgetSecret, and scripts read it with await KK.getSecret('fieldKey') only when needed. After creating a widget with a secret field, call request_secret_entry using the returned widget instance id and the exact secret field key instead of asking the user to paste the secret in chat. When a widget embeds remote images, fetches remote data, or loads external libraries from a CDN, set script permissions.network=true. External website links should be http/https anchors or KK.openExternal(url); they open in the external browser, not inside the widget iframe.".to_string(),
        "MCP IN WIDGETS: When a widget's source will call KK.callMcpTool('<server>', '<tool>', <args>), you MUST first discover the real tool list and parameter shape of that server before writing the widget. Use the mcp_list_tools tool (or read tool schemas from current page context) to look up the exact tool names, required argument keys, and response field names. Do not guess tool names like 'opendata-search_datasets' or invent arguments like 'agency' or 'normalised_only' and do not assume a response has fields like 'datasets[0].dataset_id' without verifying. Quote the tool's documented argument keys verbatim in the widget source, and parse the actual response shape returned by that tool. If a tool result does not match what the widget expects at runtime, fix the parser to match the real shape rather than retrying with the same guess. If the user names an MCP server (for example twinkle-hub) but no tool list is available, ask the user to confirm the server is connected before generating widget code that depends on it.".to_string(),
    ];
    if let Some(language) = normalize_output_language(output_language) {
        system_instructions.push(language);
    }
    if normalized_intent == AgentIntent::ExtensionCreation {
        system_instructions.extend([
            "EXTENSION DRAFT MODE: The user is asking for a KKTerm extension draft. Produce reviewable extension design, manifest, permission request, and source files only.".to_string(),
            "Do not say that KKTerm installed, enabled, executed, loaded, or verified generated extension code.".to_string(),
            "Keep extension output approval-based: require explicit user review before any future install, run, file write, permission grant, or command execution step.".to_string(),
            "Prefer narrow extension permissions, local-first storage boundaries, and clear trust notes. If a KKTerm extension API is not provided in context, mark API details as proposed rather than claiming they exist.".to_string(),
        ]);
    }

    let mut messages = vec![OpenAiCompatibleMessage {
        role: "system".to_string(),
        content: OpenAiCompatibleContent::Text(system_instructions.join(" ")),
        reasoning_content: None,
        tool_call_id: None,
        tool_calls: None,
    }];

    messages.extend(
        history
            .into_iter()
            .filter_map(to_openai_compatible_history_message),
    );

    let mut user_content = format!(
        "Active context: {context_label}\nAssistant intent: {}\nReasoning effort: {reasoning_effort}\n\nUser request:\n{prompt}",
        normalized_intent.as_str()
    );
    if let Some(system_context) = system_context
        .map(|context| context.trim().to_string())
        .filter(|context| !context.is_empty())
    {
        user_content.push_str("\n\nSSH target system context:\n```text\n");
        user_content.push_str(&system_context);
        user_content.push_str("\n```");
    }
    if let Some(selected_output) = selected_output
        .map(|output| output.trim().to_string())
        .filter(|output| !output.is_empty())
    {
        user_content.push_str("\n\nSelected terminal output:\n```text\n");
        user_content.push_str(&selected_output);
        user_content.push_str("\n```");
    }
    if let Some(page_context) = normalize_page_context(page_context) {
        user_content.push_str("\n\nActive page context: ");
        user_content.push_str(&page_context.source_label);
        user_content.push_str("\n```text\n");
        user_content.push_str(&page_context.text);
        user_content.push_str("\n```");
    }
    let mut image_contexts: Vec<AgentScreenshotContext> = vec![];
    if let Some(screenshot) = screenshot {
        image_contexts.push(screenshot);
    }
    image_contexts.extend(screenshots);
    let image_contexts: Vec<AgentScreenshotContext> = image_contexts
        .into_iter()
        .filter_map(normalize_screenshot_context)
        .collect();
    let content = if supports_image_input && !image_contexts.is_empty() {
        let source_labels = image_contexts
            .iter()
            .map(|screenshot| screenshot.source_label.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        let mut parts = vec![OpenAiCompatibleContentPart::Text {
            text: format!("{user_content}\n\nAttached image sources: {source_labels}"),
        }];
        parts.extend(image_contexts.into_iter().map(|screenshot| {
            OpenAiCompatibleContentPart::ImageUrl {
                image_url: OpenAiCompatibleImageUrl {
                    url: screenshot.data_url,
                },
            }
        }));
        OpenAiCompatibleContent::Parts(parts)
    } else {
        OpenAiCompatibleContent::Text(user_content)
    };
    messages.push(OpenAiCompatibleMessage {
        role: "user".to_string(),
        content,
        reasoning_content: None,
        tool_call_id: None,
        tool_calls: None,
    });
    messages
}

fn normalize_page_context(page_context: Option<AgentPageContext>) -> Option<AgentPageContext> {
    let page_context = page_context?;
    let source_label = page_context.source_label.trim().to_string();
    let text = page_context.text.trim().to_string();
    if source_label.is_empty() || text.is_empty() {
        return None;
    }
    Some(AgentPageContext { source_label, text })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AgentIntent {
    Chat,
    ExtensionCreation,
}

impl AgentIntent {
    fn as_str(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::ExtensionCreation => "extensionCreation",
        }
    }
}

fn normalize_agent_intent(intent: Option<String>) -> AgentIntent {
    match intent
        .as_deref()
        .map(str::trim)
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("extensioncreation")
        | Some("extension_creation")
        | Some("extension-draft")
        | Some("extensiondraft") => AgentIntent::ExtensionCreation,
        _ => AgentIntent::Chat,
    }
}

fn normalize_output_language(language: Option<String>) -> Option<String> {
    language
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| format!("Always respond in {value}."))
}

fn normalize_screenshot_context(
    screenshot: AgentScreenshotContext,
) -> Option<AgentScreenshotContext> {
    let source_label = screenshot.source_label.trim().to_string();
    let data_url = screenshot.data_url.trim().to_string();
    if source_label.is_empty() || !data_url.starts_with("data:image/") {
        return None;
    }
    Some(AgentScreenshotContext {
        source_label,
        data_url,
    })
}

fn supports_image_input(provider_kind: &str, model: &str) -> bool {
    let normalized_model = model.trim().to_ascii_lowercase();
    let unprefixed_model = normalized_model
        .rsplit('/')
        .next()
        .unwrap_or(normalized_model.as_str());

    if provider_kind == "deepseek" || provider_kind == "nvidia" {
        return false;
    }

    if text_only_model(&normalized_model) || text_only_model(unprefixed_model) {
        return false;
    }

    match provider_kind {
        "openai" | "azure-openai" => normalized_model.starts_with("gpt-5"),
        "grok" => {
            normalized_model.starts_with("grok-4") && !normalized_model.starts_with("grok-code")
        }
        "anthropic" => true,
        _ => image_input_model(&normalized_model) || image_input_model(unprefixed_model),
    }
}

fn text_only_model(model: &str) -> bool {
    model.starts_with("deepseek")
        || model.contains("/deepseek")
        || model.starts_with("grok-code")
        || model.starts_with("qwen3")
        || model.starts_with("gpt-oss")
        || model.starts_with("meta/llama")
        || model.starts_with("llama")
        || model.starts_with("bytedance/seed-oss")
        || model.starts_with("abacusai/dracarys")
}

fn image_input_model(model: &str) -> bool {
    model.starts_with("gpt-5")
        || model.starts_with("claude")
        || model.starts_with("gemini")
        || model.starts_with("grok-4")
        || model.starts_with("gemma3")
        || model.starts_with("llava")
        || model.starts_with("bakllava")
        || model.starts_with("minicpm-v")
        || model.starts_with("qwen-vl")
        || model.starts_with("qwen2-vl")
        || model.starts_with("qwen2.5-vl")
        || model.starts_with("kimi-vl")
        || model.starts_with("kimi-k")
        || model.contains("-vision")
        || model.contains("_vision")
        || model.contains("-vl")
        || model.contains("_vl")
        || model.contains("-multimodal")
        || model.contains("_multimodal")
}

fn to_openai_compatible_history_message(
    message: AgentChatMessage,
) -> Option<OpenAiCompatibleMessage> {
    let role = match message.role.trim() {
        "assistant" => "assistant",
        "user" => "user",
        _ => return None,
    };
    let content = message.content.trim().to_string();
    if content.is_empty() {
        return None;
    }
    Some(OpenAiCompatibleMessage {
        role: role.to_string(),
        content: OpenAiCompatibleContent::Text(content),
        reasoning_content: message.reasoning_content.filter(|r| !r.trim().is_empty()),
        tool_call_id: None,
        tool_calls: None,
    })
}

fn responses_endpoint(
    base_url: &str,
    endpoint_style: OpenAiEndpointStyle,
) -> Result<String, String> {
    let base_url = trim_required("AI provider endpoint", base_url.to_string())?;
    let base_url = base_url.trim_end_matches('/');
    match endpoint_style {
        OpenAiEndpointStyle::ChatCompletions => {
            if base_url.ends_with("/responses") {
                Ok(base_url.to_string())
            } else if let Some(prefix) = base_url.strip_suffix("/chat/completions") {
                Ok(format!("{prefix}/responses"))
            } else {
                Ok(format!("{base_url}/responses"))
            }
        }
        OpenAiEndpointStyle::Azure => azure_responses_endpoint(base_url),
    }
}

fn azure_responses_endpoint(base_url: &str) -> Result<String, String> {
    if base_url.ends_with("/responses") {
        return Ok(base_url.to_string());
    }
    if let Some(prefix) = base_url.strip_suffix("/chat/completions") {
        return Ok(format!("{prefix}/responses"));
    }
    if base_url.ends_with("/openai/v1") || base_url.ends_with("/openai/v1/") {
        return Ok(format!("{}/responses", base_url.trim_end_matches('/')));
    }
    Ok(format!(
        "{}/openai/v1/responses",
        base_url.trim_end_matches('/')
    ))
}

fn chat_completions_endpoint(
    base_url: &str,
    model: &str,
    endpoint_style: OpenAiEndpointStyle,
) -> Result<String, String> {
    let base_url = trim_required("AI provider endpoint", base_url.to_string())?;
    let base_url = base_url.trim_end_matches('/');
    match endpoint_style {
        OpenAiEndpointStyle::ChatCompletions => {
            if base_url.ends_with("/chat/completions") {
                Ok(base_url.to_string())
            } else {
                Ok(format!("{base_url}/chat/completions"))
            }
        }
        OpenAiEndpointStyle::Azure => azure_chat_completions_endpoint(base_url, model),
    }
}

fn azure_chat_completions_endpoint(base_url: &str, deployment: &str) -> Result<String, String> {
    if base_url.ends_with("/chat/completions") {
        return Ok(base_url.to_string());
    }
    if base_url.ends_with("/openai/v1") || base_url.ends_with("/openai/v1/") {
        return Ok(format!(
            "{}/chat/completions",
            base_url.trim_end_matches('/')
        ));
    }

    let deployment = trim_required("Azure OpenAI deployment", deployment.to_string())?;
    let deployment: String = url::form_urlencoded::byte_serialize(deployment.as_bytes()).collect();
    Ok(format!(
        "{}/openai/deployments/{deployment}/chat/completions?api-version=2024-10-21",
        base_url.trim_end_matches('/')
    ))
}

fn model_list_endpoint(
    base_url: &str,
    strategy: AiProviderModelListStrategy,
) -> Result<String, String> {
    let base_url = trim_required("AI provider endpoint", base_url.to_string())?;
    let base_url = base_url.trim_end_matches('/');
    match strategy {
        AiProviderModelListStrategy::GitHubCopilotSdk => {
            Err("GitHub Copilot model listing uses the Copilot SDK.".to_string())
        }
        AiProviderModelListStrategy::OllamaTags => {
            let mut url = url::Url::parse(base_url)
                .map_err(|error| format!("AI provider endpoint is not a valid URL: {error}"))?;
            url.set_path("/api/tags");
            url.set_query(None);
            url.set_fragment(None);
            Ok(url.to_string())
        }
        AiProviderModelListStrategy::OpenAiCompatible => {
            if base_url.ends_with("/models") {
                Ok(base_url.to_string())
            } else if let Some(prefix) = base_url.strip_suffix("/chat/completions") {
                Ok(format!("{prefix}/models"))
            } else if let Some(prefix) = base_url.strip_suffix("/responses") {
                Ok(format!("{prefix}/models"))
            } else if base_url.ends_with("/v1") {
                Ok(format!("{base_url}/models"))
            } else if url::Url::parse(base_url)
                .map(|url| url.path() == "/" || url.path().is_empty())
                .unwrap_or(false)
            {
                Ok(format!("{base_url}/v1/models"))
            } else {
                Ok(format!("{base_url}/models"))
            }
        }
    }
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaTagModel>,
}

#[derive(Deserialize)]
struct OllamaTagModel {
    #[serde(default)]
    name: String,
    #[serde(default)]
    model: String,
}

fn parse_ollama_tags_models(value: &str) -> Result<Vec<AiProviderModelOption>, String> {
    let response: OllamaTagsResponse = serde_json::from_str(value)
        .map_err(|error| format!("failed to parse Ollama model list: {error}"))?;
    Ok(response
        .models
        .into_iter()
        .filter_map(|model| {
            let id = if model.name.trim().is_empty() {
                model.model.trim()
            } else {
                model.name.trim()
            };
            model_option_from_id(id)
        })
        .collect())
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
    #[serde(default)]
    data: Vec<OpenAiModelEntry>,
}

#[derive(Deserialize)]
struct OpenAiModelEntry {
    #[serde(default)]
    id: String,
}

fn parse_openai_compatible_models(value: &str) -> Result<Vec<AiProviderModelOption>, String> {
    let response: OpenAiModelsResponse = serde_json::from_str(value)
        .map_err(|error| format!("failed to parse OpenAI-compatible model list: {error}"))?;
    Ok(response
        .data
        .into_iter()
        .filter_map(|model| model_option_from_id(&model.id))
        .collect())
}

fn model_option_from_id(id: &str) -> Option<AiProviderModelOption> {
    let id = id.trim();
    if id.is_empty() {
        return None;
    }
    Some(AiProviderModelOption {
        id: id.to_string(),
        label: id.to_string(),
        supports_image_input: None,
    })
}

fn openai_compatible_headers(
    api_key: Option<&str>,
    auth_style: OpenAiAuthStyle,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(api_key) = api_key {
        match auth_style {
            OpenAiAuthStyle::Bearer => {
                let header_value =
                    HeaderValue::from_str(&format!("Bearer {api_key}")).map_err(|_| {
                        "AI API key contains characters that cannot be sent in an HTTP header"
                            .to_string()
                    })?;
                headers.insert(AUTHORIZATION, header_value);
            }
            OpenAiAuthStyle::ApiKeyHeader => {
                let header_value = HeaderValue::from_str(api_key).map_err(|_| {
                    "AI API key contains characters that cannot be sent in an HTTP header"
                        .to_string()
                })?;
                headers.insert(HeaderName::from_static("api-key"), header_value);
            }
        }
    }
    Ok(headers)
}

fn truncate_error_body(value: &str) -> String {
    const MAX_ERROR_BODY_CHARS: usize = 600;
    let trimmed = value.trim();
    if trimmed.chars().count() <= MAX_ERROR_BODY_CHARS {
        return trimmed.to_string();
    }
    let truncated: String = trimmed.chars().take(MAX_ERROR_BODY_CHARS).collect();
    format!("{truncated}...")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_proposal_requires_non_empty_command() {
        let error = plan_command_proposal(CommandProposalRequest {
            prompt: "Check logs".to_string(),
            command: "   ".to_string(),
            reason: "Inspects recent errors.".to_string(),
            context_label: "Local - Terminal".to_string(),
            selected_output: None,
        })
        .expect_err("empty command is rejected");

        assert_eq!(error, "proposed command is required");
    }

    #[test]
    fn read_only_command_still_requires_approval_without_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Check disk pressure".to_string(),
            command: "Get-PSDrive -PSProvider FileSystem".to_string(),
            reason: "Reads local filesystem capacity.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.approval_required);
        assert!(!plan.extra_confirmation_required);
        assert_eq!(plan.risk_label, "Approval required");
    }

    #[test]
    fn destructive_command_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Clean build artifacts".to_string(),
            command: "rm -rf ./target".to_string(),
            reason: "Deletes build output.".to_string(),
            context_label: "Workspace - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.approval_required);
        assert!(plan.extra_confirmation_required);
        assert_eq!(plan.risk_label, "Extra confirmation");
    }

    #[test]
    fn credential_touching_command_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Inspect SSH key permissions".to_string(),
            command: "ls -la ~/.ssh/id_ed25519".to_string(),
            reason: "Reads SSH key metadata.".to_string(),
            context_label: "Bastion - Terminal".to_string(),
            selected_output: None,
        })
        .expect("proposal is planned");

        assert!(plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("credentials")));
    }

    #[test]
    fn selected_output_is_not_extra_confirmation_unless_sensitive() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Explain this output".to_string(),
            command: "Get-Content .\\service.log -Tail 50".to_string(),
            reason: "Reads a small log tail.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: Some("INFO service healthy".to_string()),
        })
        .expect("proposal is planned");

        assert!(!plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("Selected terminal output")));
    }

    #[test]
    fn sensitive_selected_output_requires_extra_confirmation() {
        let plan = plan_command_proposal(CommandProposalRequest {
            prompt: "Explain this output".to_string(),
            command: "Get-Content .\\service.log -Tail 50".to_string(),
            reason: "Reads a small log tail.".to_string(),
            context_label: "PowerShell - Terminal".to_string(),
            selected_output: Some("Authorization: Bearer abc123".to_string()),
        })
        .expect("proposal is planned");

        assert!(plan.extra_confirmation_required);
        assert!(plan
            .safety_notes
            .iter()
            .any(|note| note.contains("Selected output may contain credentials")));
    }

    #[test]
    fn chat_endpoint_uses_openai_compatible_path_once() {
        assert_eq!(
            chat_completions_endpoint(
                "https://api.deepseek.com/v1",
                "deepseek-chat",
                OpenAiEndpointStyle::ChatCompletions,
            )
            .expect("endpoint builds"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_endpoint(
                "https://api.deepseek.com/v1/chat/completions",
                "deepseek-chat",
                OpenAiEndpointStyle::ChatCompletions,
            )
            .expect("endpoint is kept"),
            "https://api.deepseek.com/v1/chat/completions"
        );
    }

    #[test]
    fn responses_endpoint_uses_responses_path_once() {
        assert_eq!(
            responses_endpoint(
                "https://api.openai.com/v1",
                OpenAiEndpointStyle::ChatCompletions,
            )
            .expect("endpoint builds"),
            "https://api.openai.com/v1/responses"
        );
        assert_eq!(
            responses_endpoint(
                "https://api.openai.com/v1/chat/completions",
                OpenAiEndpointStyle::ChatCompletions,
            )
            .expect("endpoint is rewritten"),
            "https://api.openai.com/v1/responses"
        );
        assert_eq!(
            responses_endpoint(
                "https://api.openai.com/v1/responses",
                OpenAiEndpointStyle::ChatCompletions,
            )
            .expect("endpoint is kept"),
            "https://api.openai.com/v1/responses"
        );
    }

    #[test]
    fn model_list_endpoints_follow_provider_strategy() {
        assert_eq!(
            model_list_endpoint(
                "http://localhost:11434/v1",
                AiProviderModelListStrategy::OllamaTags,
            )
            .expect("Ollama tags endpoint builds"),
            "http://localhost:11434/api/tags"
        );
        assert_eq!(
            model_list_endpoint(
                "https://opencode.ai/zen/go/v1/chat/completions",
                AiProviderModelListStrategy::OpenAiCompatible,
            )
            .expect("OpenAI compatible models endpoint builds"),
            "https://opencode.ai/zen/go/v1/models"
        );
        assert_eq!(
            model_list_endpoint(
                "https://gateway.example.com",
                AiProviderModelListStrategy::OpenAiCompatible,
            )
            .expect("OpenAI compatible bare base endpoint builds"),
            "https://gateway.example.com/v1/models"
        );
        assert_eq!(
            model_list_endpoint(
                "https://generativelanguage.googleapis.com/v1beta/openai",
                AiProviderModelListStrategy::OpenAiCompatible,
            )
            .expect("OpenAI compatible nested base endpoint builds"),
            "https://generativelanguage.googleapis.com/v1beta/openai/models"
        );
    }

    #[test]
    fn provider_model_list_parsers_skip_blank_ids() {
        let ollama = parse_ollama_tags_models(
            r#"{"models":[{"name":"qwen3:latest"},{"model":"gemma3"},{"name":"  "}]}"#,
        )
        .expect("Ollama tags parse");
        assert_eq!(
            ollama,
            vec![
                AiProviderModelOption {
                    id: "qwen3:latest".to_string(),
                    label: "qwen3:latest".to_string(),
                    supports_image_input: None,
                },
                AiProviderModelOption {
                    id: "gemma3".to_string(),
                    label: "gemma3".to_string(),
                    supports_image_input: None,
                },
            ]
        );

        let compatible = parse_openai_compatible_models(
            r#"{"object":"list","data":[{"id":"deepseek-v4-pro"},{"id":""},{"id":"kimi-k2.6"}]}"#,
        )
        .expect("OpenAI compatible models parse");
        assert_eq!(
            compatible
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["deepseek-v4-pro", "kimi-k2.6"]
        );
    }

    #[test]
    fn azure_responses_endpoint_uses_openai_v1() {
        assert_eq!(
            responses_endpoint(
                "https://example.openai.azure.com",
                OpenAiEndpointStyle::Azure
            )
            .expect("native endpoint builds"),
            "https://example.openai.azure.com/openai/v1/responses"
        );
        assert_eq!(
            responses_endpoint(
                "https://example.openai.azure.com/openai/v1",
                OpenAiEndpointStyle::Azure,
            )
            .expect("v1 endpoint builds"),
            "https://example.openai.azure.com/openai/v1/responses"
        );
    }

    #[test]
    fn azure_chat_endpoint_accepts_v1_or_native_resource_url() {
        assert_eq!(
            chat_completions_endpoint(
                "https://example.openai.azure.com/openai/v1",
                "gpt-5.4",
                OpenAiEndpointStyle::Azure,
            )
            .expect("v1 endpoint builds"),
            "https://example.openai.azure.com/openai/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_endpoint(
                "https://example.openai.azure.com",
                "deployment name",
                OpenAiEndpointStyle::Azure,
            )
            .expect("native endpoint builds"),
            "https://example.openai.azure.com/openai/deployments/deployment+name/chat/completions?api-version=2024-10-21"
        );
    }

    #[test]
    fn agent_messages_include_history_context_and_selected_output() {
        let messages = build_agent_messages(
            "What failed?".to_string(),
            "Bastion - Terminal".to_string(),
            None,
            "high".to_string(),
            Some("OS: Ubuntu 24.04 LTS".to_string()),
            Some("ERROR service unavailable".to_string()),
            None,
            true,
            None,
            vec![],
            vec![
                AgentChatMessage {
                    role: "user".to_string(),
                    content: "Earlier question".to_string(),
                    reasoning_content: None,
                },
                AgentChatMessage {
                    role: "ignored".to_string(),
                    content: "skip me".to_string(),
                    reasoning_content: None,
                },
            ],
            None,
        );

        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, "system");
        assert_eq!(messages[1].role, "user");
        let content = text_content(&messages[2]);
        assert!(content.contains("Bastion - Terminal"));
        assert!(content.contains("Reasoning effort: high"));
        assert!(content.contains("OS: Ubuntu 24.04 LTS"));
        assert!(content.contains("ERROR service unavailable"));
    }

    #[test]
    fn agent_messages_include_page_context_separately_from_terminal_output() {
        let messages = build_agent_messages(
            "What should I add next?".to_string(),
            "Dashboard - Default view".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            Some(AgentPageContext {
                source_label: "Dashboard Default view".to_string(),
                text: "Active widgets: Hash Calculator, Quick Tools".to_string(),
            }),
            true,
            None,
            vec![],
            vec![],
            None,
        );

        let content = text_content(&messages[1]);
        assert!(content.contains("Dashboard - Default view"));
        assert!(content.contains("Active page context: Dashboard Default view"));
        assert!(content.contains("Active widgets: Hash Calculator, Quick Tools"));
        assert!(!content.contains("Selected terminal output"));
    }

    #[test]
    fn agent_messages_can_attach_screenshot_context() {
        let messages = build_agent_messages(
            "What is visible?".to_string(),
            "Router - URL view".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            true,
            Some(AgentScreenshotContext {
                source_label: "Router screenshot".to_string(),
                data_url: "data:image/png;base64,abcd".to_string(),
            }),
            vec![],
            vec![],
            None,
        );

        match &messages[1].content {
            OpenAiCompatibleContent::Parts(parts) => assert_eq!(parts.len(), 2),
            OpenAiCompatibleContent::Text(_) => panic!("screenshot context should use parts"),
        }
    }

    #[test]
    fn agent_messages_can_attach_multiple_image_contexts() {
        let messages = build_agent_messages(
            "Compare these.".to_string(),
            "Workspace".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            true,
            None,
            vec![
                AgentScreenshotContext {
                    source_label: "First".to_string(),
                    data_url: "data:image/jpeg;base64,one".to_string(),
                },
                AgentScreenshotContext {
                    source_label: "Second".to_string(),
                    data_url: "data:image/jpeg;base64,two".to_string(),
                },
            ],
            vec![],
            None,
        );

        match &messages[1].content {
            OpenAiCompatibleContent::Parts(parts) => assert_eq!(parts.len(), 3),
            OpenAiCompatibleContent::Text(_) => panic!("image contexts should use parts"),
        }
    }

    #[test]
    fn agent_messages_omit_screenshot_context_when_model_is_text_only() {
        let messages = build_agent_messages(
            "What is visible?".to_string(),
            "Router - URL view".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            false,
            Some(AgentScreenshotContext {
                source_label: "Router screenshot".to_string(),
                data_url: "data:image/png;base64,abcd".to_string(),
            }),
            vec![],
            vec![],
            None,
        );

        match &messages[1].content {
            OpenAiCompatibleContent::Text(content) => {
                assert!(content.contains("User request"));
                assert!(!content.contains("Attached screenshot source"));
            }
            OpenAiCompatibleContent::Parts(_) => {
                panic!("text-only models must not receive image parts")
            }
        }
    }

    #[test]
    fn responses_input_converts_image_and_file_parts() {
        let messages = build_agent_messages(
            "Review this.".to_string(),
            "Workspace".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            true,
            Some(AgentScreenshotContext {
                source_label: "Screenshot".to_string(),
                data_url: "data:image/png;base64,abcd".to_string(),
            }),
            vec![],
            vec![],
            None,
        );
        let input = responses_input_from_messages(
            messages,
            vec![AgentFileContext {
                source_label: "notes.txt".to_string(),
                file_data: Some("SGVsbG8=".to_string()),
                data_url: None,
                mime_type: Some("text/plain".to_string()),
                text: None,
            }],
        );

        assert_eq!(
            input[0].get("role").and_then(Value::as_str),
            Some("developer")
        );
        let user_content = input[1]
            .get("content")
            .and_then(Value::as_array)
            .expect("user content parts are present");
        assert!(user_content
            .iter()
            .any(|part| part.get("type").and_then(Value::as_str) == Some("input_image")));
        let file_content = input[2]
            .get("content")
            .and_then(Value::as_array)
            .expect("file content parts are present");
        assert_eq!(
            file_content[0].get("type").and_then(Value::as_str),
            Some("input_file")
        );
        assert_eq!(
            file_content[0].get("file_data").and_then(Value::as_str),
            Some("data:text/plain;base64,SGVsbG8=")
        );
    }

    #[test]
    fn responses_parser_extracts_text_and_tool_calls() {
        let response = json!({
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "Tool result explained."}]
                },
                {
                    "type": "function_call",
                    "call_id": "call_123",
                    "name": "current_time",
                    "arguments": "{}"
                }
            ]
        });

        assert_eq!(
            extract_responses_output_text(&response).as_deref(),
            Some("Tool result explained.")
        );
        let tool_calls = extract_responses_tool_calls(&response);
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_123");
        assert_eq!(tool_calls[0].function.name, "current_time");
    }

    #[test]
    fn responses_stream_parser_uses_done_text_and_function_call_id() {
        let mut state = ResponsesStreamState::default();

        apply_responses_stream_event(
            &mut state,
            &json!({
                "type": "response.output_item.added",
                "item": {
                    "id": "fc_123",
                    "type": "function_call",
                    "call_id": "call_123",
                    "name": "current_time"
                }
            }),
        );
        apply_responses_stream_event(
            &mut state,
            &json!({
                "type": "response.function_call_arguments.done",
                "item_id": "fc_123",
                "arguments": "{}"
            }),
        );
        let done_deltas = apply_responses_stream_event(
            &mut state,
            &json!({
                "type": "response.output_item.done",
                "item": {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "It is 11:34 PM."}]
                }
            }),
        );

        assert_eq!(
            done_deltas.content_delta.as_deref(),
            Some("It is 11:34 PM.")
        );
        assert_eq!(state.content.as_deref(), Some("It is 11:34 PM."));
        let tool_calls = state.into_tool_calls();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_123");
        assert_eq!(tool_calls[0].function.name, "current_time");
    }

    #[test]
    fn streamed_final_answer_requires_visible_content() {
        let provider = provider_for("deepseek").expect("DeepSeek provider is wired");
        let provider = match provider {
            AgentProviderAdapter::OpenAi(provider) => provider,
            AgentProviderAdapter::GitHubCopilot(_) => panic!("DeepSeek should use OpenAI adapter"),
        };

        let error = require_streamed_assistant_content(&provider, "   ")
            .expect_err("empty streamed assistant turns are rejected");

        assert_eq!(error, "DeepSeek response did not include assistant content");
        assert!(require_streamed_assistant_content(&provider, "It is 11:34 PM.").is_ok());
    }

    #[test]
    fn deepseek_tool_turn_serializes_reasoning_content_and_tool_result() {
        let assistant_message = OpenAiCompatibleMessage {
            role: "assistant".to_string(),
            content: OpenAiCompatibleContent::Text("Let me check the current time.".to_string()),
            reasoning_content: Some(
                "The user asked for current time, so I need the current_time tool.".to_string(),
            ),
            tool_call_id: None,
            tool_calls: Some(vec![OpenAiAssistantToolCall {
                id: "call_time".to_string(),
                tool_type: "function".to_string(),
                function: OpenAiAssistantToolCallFunction {
                    name: "current_time".to_string(),
                    arguments: "{}".to_string(),
                },
            }]),
        };
        let tool_message = OpenAiCompatibleMessage {
            role: "tool".to_string(),
            content: OpenAiCompatibleContent::Text("2026-05-12T23:00:00+08:00".to_string()),
            reasoning_content: None,
            tool_call_id: Some("call_time".to_string()),
            tool_calls: None,
        };

        let assistant_json =
            serde_json::to_value(&assistant_message).expect("assistant tool-call turn serializes");
        let tool_json = serde_json::to_value(&tool_message).expect("tool result serializes");

        assert_eq!(assistant_json["role"], "assistant");
        assert_eq!(
            assistant_json["reasoning_content"],
            "The user asked for current time, so I need the current_time tool."
        );
        assert_eq!(assistant_json["tool_calls"][0]["id"], "call_time");
        assert_eq!(assistant_json["tool_calls"][0]["type"], "function");
        assert_eq!(
            assistant_json["tool_calls"][0]["function"]["name"],
            "current_time"
        );
        assert_eq!(tool_json["role"], "tool");
        assert_eq!(tool_json["tool_call_id"], "call_time");
        assert_eq!(tool_json["content"], "2026-05-12T23:00:00+08:00");
        assert!(tool_json.get("reasoning_content").is_none());
    }

    #[test]
    fn deepseek_chat_request_serializes_thinking_effort() {
        let request = OpenAiCompatibleChatRequest {
            model: "deepseek-v4-flash".to_string(),
            messages: vec![OpenAiCompatibleMessage {
                role: "user".to_string(),
                content: OpenAiCompatibleContent::Text("Hello".to_string()),
                reasoning_content: None,
                tool_call_id: None,
                tool_calls: None,
            }],
            stream: true,
            tools: vec![],
            tool_choice: None,
            thinking: deepseek_thinking("deepseek", "max"),
        };

        let json = serde_json::to_value(&request).expect("request serializes");

        assert_eq!(json["thinking"]["type"], "enabled");
        assert_eq!(json["thinking"]["reasoning_effort"], "max");
    }

    #[test]
    fn non_deepseek_chat_request_omits_thinking_effort() {
        let request = OpenAiCompatibleChatRequest {
            model: "gpt-5.5".to_string(),
            messages: vec![OpenAiCompatibleMessage {
                role: "user".to_string(),
                content: OpenAiCompatibleContent::Text("Hello".to_string()),
                reasoning_content: None,
                tool_call_id: None,
                tool_calls: None,
            }],
            stream: true,
            tools: vec![],
            tool_choice: None,
            thinking: deepseek_thinking("openai", "max"),
        };

        let json = serde_json::to_value(&request).expect("request serializes");

        assert!(json.get("thinking").is_none());
    }

    #[test]
    fn ai_widget_initial_size_caps_compact_games() {
        let body = json!({
            "source": "const game = 'tetris'; window.addEventListener('keydown', () => {});",
            "permissions": {"network": false, "pollSeconds": null},
            "htmlShim": null
        });

        let (width, height) = normalize_ai_widget_initial_size(
            "script",
            "Tetris",
            "A playable game with keyboard controls.",
            "Games",
            &body,
            12,
            3,
        );

        assert_eq!(width, 6);
        assert_eq!(height, 4);
    }

    #[test]
    fn ai_widget_initial_size_preserves_wide_non_game_widgets() {
        let body = json!({
            "source": "document.getElementById('root').textContent = 'Connection health report';",
            "permissions": {"network": false, "pollSeconds": null},
            "htmlShim": null
        });

        let (width, height) = normalize_ai_widget_initial_size(
            "script",
            "Connection Health",
            "A wide operational report.",
            "Operations",
            &body,
            10,
            5,
        );

        assert_eq!(width, 10);
        assert_eq!(height, 5);
    }

    #[test]
    fn dashboard_create_widget_schema_has_valid_secret_field_branch() {
        let schema = dashboard_create_widget_schema();
        let field_branches = schema
            .pointer("/properties/settingsSchema/properties/fields/items/anyOf")
            .and_then(Value::as_array)
            .expect("settings field schema uses per-field branches");
        let secret_branch = field_branches
            .iter()
            .find(|branch| {
                branch
                    .pointer("/properties/type/enum")
                    .and_then(Value::as_array)
                    .is_some_and(|values| values == &[json!("secret")])
            })
            .expect("secret settings field branch is present");

        assert!(!secret_branch.pointer("/properties/defaultValue").is_some());
        assert!(!secret_branch
            .pointer("/required")
            .and_then(Value::as_array)
            .expect("secret branch lists required properties")
            .contains(&json!("defaultValue")));
    }

    #[test]
    fn dashboard_update_custom_widget_tool_accepts_structured_body_patch() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "dashboard": true
        }))
        .expect("tool settings deserialize");

        let tools = ai_tool_definitions(&settings);
        let tool = tools
            .iter()
            .find(|tool| tool.function.name == "dashboard_update_custom_widget")
            .expect("dashboard update custom widget tool exists");

        assert!(tool.function.description.contains("Prefer patch.body"));
        assert!(tool
            .function
            .parameters
            .pointer("/properties/patch/properties/body/anyOf")
            .is_some());
        assert!(tool
            .function
            .parameters
            .pointer("/properties/patch/properties/bodyJson")
            .is_some());
    }

    #[test]
    fn dashboard_widget_tool_schema_exposes_script_libraries() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "dashboard": true
        }))
        .expect("tool settings deserialize");

        let tools = ai_tool_definitions(&settings);
        let create_tool = tools
            .iter()
            .find(|tool| tool.function.name == "dashboard_create_widget")
            .expect("dashboard create widget tool exists");
        let update_tool = tools
            .iter()
            .find(|tool| tool.function.name == "dashboard_update_custom_widget")
            .expect("dashboard update custom widget tool exists");

        assert!(create_tool
            .function
            .parameters
            .pointer("/properties/body/anyOf/4/properties/libraries")
            .is_some());
        assert!(update_tool
            .function
            .parameters
            .pointer("/properties/patch/properties/body/anyOf/4/properties/libraries")
            .is_some());
        assert!(create_tool
            .function
            .parameters
            .pointer("/properties/body/anyOf/4/required")
            .and_then(Value::as_array)
            .is_some_and(|required| required.contains(&json!("libraries"))));
        assert!(update_tool
            .function
            .parameters
            .pointer("/properties/patch/properties/body/anyOf/4/required")
            .and_then(Value::as_array)
            .is_some_and(|required| required.contains(&json!("libraries"))));

        let enum_values = create_tool
            .function
            .parameters
            .pointer("/properties/body/anyOf/4/properties/libraries/items/enum")
            .and_then(Value::as_array)
            .expect("script libraries are enumerated");
        for library in ["mermaid", "animejs", "echarts", "chartjs", "qrcode", "three"] {
            assert!(
                enum_values.contains(&json!(library)),
                "script library enum should include {library}"
            );
        }
        assert!(create_tool.function.description.contains("For Three.js widgets"));
        assert!(create_tool.function.description.contains("KK.onViewportResize"));
        assert!(create_tool.function.description.contains("kk-shell"));
        assert!(create_tool.function.description.contains("chartjs, echarts, leaflet"));
    }

    fn openai_provider(provider_kind: &str) -> OpenAiCompatibleProvider {
        match providers::provider_for(provider_kind).expect("provider should exist") {
            AgentProviderAdapter::OpenAi(provider) => provider,
            AgentProviderAdapter::GitHubCopilot(_) => {
                panic!("{provider_kind} is not an OpenAI-compatible provider")
            }
        }
    }

    #[test]
    fn explicit_strict_tool_flags_are_only_sent_to_openai_family_providers() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "dashboard": true,
            "currentTime": true
        }))
        .expect("tool settings deserialize");
        let tools = ai_tool_definitions(&settings);
        assert!(
            tools.iter().any(|tool| tool.function.strict),
            "shared tools include strict-capable definitions"
        );

        for provider_kind in ["openai", "azure-openai"] {
            let provider = openai_provider(provider_kind);
            let provider_tools = provider.tool_definitions_for_provider(&tools);
            assert!(
                provider_tools.iter().any(|tool| tool.function.strict),
                "{provider_kind} should keep explicit strict tool flags"
            );
        }

        for provider_kind in [
            "deepseek",
            "gemini",
            "grok",
            "litellm",
            "nvidia",
            "ollama",
            "opencode",
            "openai-compatible",
            "openrouter",
        ] {
            let provider = openai_provider(provider_kind);
            let provider_tools = provider.tool_definitions_for_provider(&tools);
            assert!(
                provider_tools.iter().all(|tool| !tool.function.strict),
                "{provider_kind} should omit explicit strict tool flags"
            );
        }
    }

    #[test]
    fn explicit_strict_tool_schemas_satisfy_openai_object_requirements() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "dashboard": true,
            "currentTime": true
        }))
        .expect("tool settings deserialize");
        let tools = ai_tool_definitions(&settings);
        let strict_tools: Vec<_> = tools
            .iter()
            .filter(|tool| tool.function.strict)
            .collect();
        assert!(!strict_tools.is_empty(), "strict tools should be present");

        for tool in strict_tools {
            let mut errors = Vec::new();
            collect_openai_strict_schema_errors(
                &tool.function.parameters,
                format!("{}.parameters", tool.function.name),
                &mut errors,
            );
            assert!(
                errors.is_empty(),
                "{} strict schema violates OpenAI object requirements: {}",
                tool.function.name,
                errors.join("; ")
            );
        }
    }

    fn collect_openai_strict_schema_errors(schema: &Value, path: String, errors: &mut Vec<String>) {
        if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
            if schema.get("additionalProperties") != Some(&Value::Bool(false)) {
                errors.push(format!("{path} is missing additionalProperties=false"));
            }

            let required = schema
                .get("required")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<std::collections::BTreeSet<_>>()
                });
            let property_names = properties
                .keys()
                .map(String::as_str)
                .collect::<std::collections::BTreeSet<_>>();
            if required.as_ref() != Some(&property_names) {
                let required_names = required
                    .unwrap_or_default()
                    .into_iter()
                    .collect::<Vec<_>>()
                    .join(",");
                let property_names = property_names.into_iter().collect::<Vec<_>>().join(",");
                errors.push(format!(
                    "{path} required [{required_names}] does not match properties [{property_names}]"
                ));
            }

            for (name, child) in properties {
                collect_openai_strict_schema_errors(
                    child,
                    format!("{path}.properties.{name}"),
                    errors,
                );
            }
        }

        if let Some(items) = schema.get("items") {
            collect_openai_strict_schema_errors(items, format!("{path}.items"), errors);
        }
        for keyword in ["anyOf", "oneOf", "allOf"] {
            if let Some(branches) = schema.get(keyword).and_then(Value::as_array) {
                for (index, branch) in branches.iter().enumerate() {
                    collect_openai_strict_schema_errors(
                        branch,
                        format!("{path}.{keyword}.{index}"),
                        errors,
                    );
                }
            }
        }
    }

    #[test]
    fn agent_messages_tell_assistant_to_edit_existing_dashboard_widget_source() {
        let messages = build_agent_messages(
            "Fix the widget below.".to_string(),
            "Dashboard - Default".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            true,
            None,
            vec![],
            vec![],
            None,
        );

        let system_content = text_content(&messages[0]);
        assert!(system_content.contains("use dashboard_load_state"));
        assert!(system_content.contains("patch.body"));
        assert!(system_content.contains("Do not ask the user to paste widget source"));
        assert!(system_content.contains("For Three.js widgets"));
        assert!(system_content.contains("KK.getViewport()"));
        assert!(system_content.contains("kk-shell"));
        assert!(system_content.contains("chartjs, echarts, leaflet"));
    }

    #[test]
    fn tool_definitions_include_secret_entry_request_tool() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "dashboard": true
        }))
        .expect("tool settings deserialize");

        let tools = ai_tool_definitions(&settings);
        let tool = tools
            .iter()
            .find(|tool| tool.function.name == "request_secret_entry")
            .expect("secret entry request tool is available");

        assert!(tool
            .function
            .description
            .contains("without exposing the secret"));
        assert_eq!(
            tool.function.parameters.pointer("/properties/kind/enum"),
            Some(&json!(["widgetSecret", "aiApiKey"]))
        );
    }

    #[test]
    fn request_secret_entry_tool_builds_widget_secret_directive() {
        let result = request_secret_entry_tool(
            json!({
                "kind": "widgetSecret",
                "instanceId": "inst-123",
                "fieldKey": "apiKey",
                "label": "API key",
                "description": "Used to fetch population data",
                "placeholder": null
            }),
            "openrouter",
            None,
        );
        let value: Value = serde_json::from_str(&result).expect("tool result is JSON");

        assert_eq!(value["ok"], true);
        assert_eq!(value["ownerId"], "dashboard-widget-secret:inst-123:apiKey");
        assert!(value["secretRequestMarkdown"]
            .as_str()
            .unwrap()
            .contains("```kkterm-secret-request"));
        assert!(!result.contains("secret\":\""));
    }

    #[test]
    fn request_secret_entry_tool_uses_active_ai_provider_owner() {
        let result = request_secret_entry_tool(
            json!({
                "kind": "aiApiKey",
                "label": "OpenRouter API key"
            }),
            "openrouter",
            None,
        );
        let value: Value = serde_json::from_str(&result).expect("tool result is JSON");

        assert_eq!(value["ok"], true);
        assert_eq!(value["ownerId"], "ai-provider:openrouter");
        assert!(value["secretRequestMarkdown"]
            .as_str()
            .unwrap()
            .contains("\"ownerId\":\"ai-provider:openrouter\""));
    }

    #[test]
    fn agent_messages_include_extension_creation_guardrails() {
        let messages = build_agent_messages(
            "Create a Connection cleanup helper.".to_string(),
            "Workspace".to_string(),
            Some("extensionCreation".to_string()),
            "medium".to_string(),
            None,
            None,
            None,
            true,
            None,
            vec![],
            vec![],
            None,
        );

        let system_content = text_content(&messages[0]);
        let request_content = text_content(&messages[1]);
        assert!(system_content.contains("EXTENSION DRAFT MODE"));
        assert!(system_content.contains("Do not say that KKTerm installed"));
        assert!(system_content.contains("require explicit user review"));
        assert!(request_content.contains("Assistant intent: extensionCreation"));
    }

    #[test]
    fn agent_messages_explain_widget_secret_request_tool_workflow() {
        let messages = build_agent_messages(
            "Create a widget that needs an API key.".to_string(),
            "Dashboard - Default".to_string(),
            None,
            "medium".to_string(),
            None,
            None,
            None,
            true,
            None,
            vec![],
            vec![],
            None,
        );

        let system_content = text_content(&messages[0]);
        assert!(system_content.contains("After dashboard_create_widget creates a widget with a secret field, call request_secret_entry"));
        assert!(system_content.contains("the returned instance.id as instanceId"));
    }

    #[test]
    fn assistant_tool_safety_blocks_destructive_shell_commands() {
        assert!(is_destructive_command(r"Remove-Item -Recurse .\logs"));
        assert!(is_destructive_command("del important.txt"));
        assert!(!is_destructive_command("Get-ChildItem ."));
    }

    #[test]
    fn prompt_permission_mode_blocks_mutating_tools() {
        assert!(tool_requires_allow_all("shell_command"));
        assert!(tool_requires_allow_all("dashboard_create_widget"));
        assert!(tool_requires_allow_all("dashboard_reset"));
        assert!(tool_requires_allow_all("connection_create"));
        assert!(tool_requires_allow_all("connection_open"));
        assert!(tool_requires_allow_all("connection_update"));
        assert!(tool_requires_allow_all("connection_delete"));
        assert!(tool_requires_allow_all("session_terminal_send_text"));
        assert!(tool_requires_allow_all("session_remote_desktop_send_text"));
        assert!(tool_requires_allow_all("session_remote_desktop_keypress"));
        assert!(tool_requires_allow_all(
            "session_remote_desktop_mouse_click"
        ));
        assert!(tool_requires_allow_all("session_file_browser_delete"));
        assert!(!tool_requires_allow_all("dashboard_load_state"));
        assert!(!tool_requires_allow_all("connection_list"));
        assert!(!tool_requires_allow_all("session_state"));
        assert!(!tool_requires_allow_all("session_terminal_read_buffer"));
        assert!(!tool_requires_allow_all(
            "session_remote_desktop_screenshot"
        ));
        assert!(!tool_requires_allow_all("session_file_browser_list"));
        assert!(!tool_requires_allow_all("current_time"));

        let result = tool_permission_required_result("dashboard_reset");
        let value: Value = serde_json::from_str(&result).expect("permission result is JSON");
        assert_eq!(value["ok"], false);
        assert_eq!(value["error"], "permissionRequired");
        assert_eq!(value["permissionMode"], "prompt");
    }

    #[test]
    fn tool_definitions_include_connection_management_tools() {
        let settings: AiAssistantToolSettings = serde_json::from_value(json!({
            "connections": true,
            "sessions": true
        }))
        .expect("tool settings deserialize");

        let tools = ai_tool_definitions(&settings);
        let names: Vec<&str> = tools.iter().map(|tool| tool.function.name).collect();

        assert!(names.contains(&"connection_list"));
        assert!(names.contains(&"connection_create"));
        assert!(names.contains(&"connection_open"));
        assert!(names.contains(&"connection_update"));
        assert!(names.contains(&"connection_delete"));
        assert!(names.contains(&"session_state"));
        assert!(names.contains(&"session_terminal_read_buffer"));
        assert!(names.contains(&"session_terminal_send_text"));
        assert!(names.contains(&"session_remote_desktop_screenshot"));
        assert!(names.contains(&"session_remote_desktop_send_text"));
        assert!(names.contains(&"session_remote_desktop_keypress"));
        assert!(names.contains(&"session_remote_desktop_mouse_click"));
        assert!(names.contains(&"session_file_browser_list"));
        assert!(names.contains(&"session_file_browser_create_folder"));
        assert!(names.contains(&"session_file_browser_rename"));
        assert!(names.contains(&"session_file_browser_delete"));
    }

    #[test]
    fn assistant_file_tool_paths_stay_inside_app_data() {
        let root = std::env::temp_dir().join(format!("kkterm-ai-tool-test-{}", std::process::id()));
        let nested = root.join("nested");
        std::fs::create_dir_all(&nested).expect("test app data directory is created");
        let inside = nested.join("log.txt");
        std::fs::write(&inside, "hello").expect("test file is written");

        let safe = safe_app_data_path(&root, "nested/log.txt").expect("inside path is allowed");
        assert_eq!(
            safe,
            inside.canonicalize().expect("inside path canonicalizes")
        );
        assert!(safe_app_data_path(&root, "../outside.txt").is_none());

        std::fs::remove_dir_all(&root).expect("test directory is removed");
    }

    #[test]
    fn deepseek_provider_uses_openai_compatible_adapter() {
        let provider = provider_for("deepseek").expect("DeepSeek provider is wired");

        match provider {
            AgentProviderAdapter::OpenAi(provider) => {
                assert_eq!(provider.provider_kind, "deepseek");
                assert!(provider.requires_api_key);
            }
            AgentProviderAdapter::GitHubCopilot(_) => panic!("DeepSeek should use OpenAI adapter"),
        }
    }

    #[test]
    fn github_copilot_provider_is_wired() {
        let provider = provider_for("github-copilot").expect("GitHub Copilot provider is wired");

        assert_eq!(provider.provider_kind(), "github-copilot");
    }

    #[test]
    fn opencode_provider_is_wired() {
        let provider = provider_for("opencode").expect("OpenCode provider is wired");

        assert_eq!(provider.provider_kind(), "opencode");
    }

    #[test]
    fn github_copilot_sdk_options_use_stored_token_only() {
        let app_data_dir = PathBuf::from("C:/kkterm/app-data");
        let options = build_copilot_sdk_client_options(app_data_dir.clone(), "ghu_test-token");

        assert_eq!(options.cwd, app_data_dir);
        assert_eq!(options.copilot_home, Some(app_data_dir.join("copilot")));
        assert_eq!(options.github_token.as_deref(), Some("ghu_test-token"));
        assert_eq!(options.use_logged_in_user, Some(false));
    }

    #[test]
    fn github_copilot_model_options_preserve_account_catalog_metadata() {
        let model = CopilotSdkModel {
            billing: None,
            capabilities: github_copilot_sdk::ModelCapabilities {
                limits: None,
                supports: Some(github_copilot_sdk::ModelCapabilitiesSupports {
                    reasoning_effort: Some(true),
                    vision: Some(false),
                }),
            },
            default_reasoning_effort: Some("medium".to_string()),
            id: "gpt-4.1".to_string(),
            model_picker_category: None,
            model_picker_price_category: None,
            name: "GPT-4.1".to_string(),
            policy: None,
            supported_reasoning_efforts: vec!["low".to_string(), "medium".to_string()],
        };

        let option = copilot_model_option_from_sdk_model(&model).expect("valid model option");

        assert_eq!(
            option,
            CopilotModelOption {
                id: "gpt-4.1".to_string(),
                label: "GPT-4.1".to_string(),
                supports_image_input: Some(false),
            }
        );
    }

    #[test]
    fn openai_compatible_headers_include_bearer_key_when_present() {
        let headers = openai_compatible_headers(Some("sk-test"), OpenAiAuthStyle::Bearer)
            .expect("headers build");

        assert_eq!(
            headers
                .get(AUTHORIZATION)
                .expect("authorization header exists")
                .to_str()
                .expect("header is valid"),
            "Bearer sk-test"
        );
    }

    #[test]
    fn azure_headers_use_api_key_header() {
        let headers = openai_compatible_headers(Some("az-test"), OpenAiAuthStyle::ApiKeyHeader)
            .expect("headers build");

        assert_eq!(
            headers
                .get("api-key")
                .expect("api-key header exists")
                .to_str()
                .expect("header is valid"),
            "az-test"
        );
    }

    fn text_content(message: &OpenAiCompatibleMessage) -> &str {
        match &message.content {
            OpenAiCompatibleContent::Text(content) => content,
            OpenAiCompatibleContent::Parts(_) => "",
        }
    }
}
