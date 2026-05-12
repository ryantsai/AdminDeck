use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use futures::StreamExt;
use tauri::ipc::Channel;
use tauri::Manager;

use crate::dashboard_ids::new_dashboard_id;
use crate::dashboard_storage as ds;
use crate::storage::{AiAssistantToolSettings, AiProviderSettings, Storage};

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentScreenshotContext {
    source_label: String,
    data_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileContext {
    source_label: String,
    file_data: Option<String>,
    data_url: Option<String>,
    mime_type: Option<String>,
    text: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPageContext {
    source_label: String,
    text: String,
}

#[derive(Deserialize)]
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
    ReasoningDelta { delta: String },
    ContentDelta { delta: String },
    ToolCallStart { tool_id: String, tool_name: String },
    ToolCallEnd { tool_id: String, tool_name: String },
    Done { model: String, provider_kind: String },
}

pub async fn run_agent(
    app: tauri::AppHandle,
    settings: AiProviderSettings,
    api_key: Option<String>,
    request: AgentRunRequest,
) -> Result<AgentRunResponse, String> {
    let provider = provider_for(settings.provider_kind())?;
    provider.run(app, settings, api_key, request).await
}

pub async fn run_agent_streaming(
    app: tauri::AppHandle,
    settings: AiProviderSettings,
    api_key: Option<String>,
    request: AgentRunRequest,
    channel: Channel<Value>,
) -> Result<(), String> {
    let provider = provider_for(settings.provider_kind())?;
    provider.run_streaming(app, settings, api_key, request, channel).await
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
    ) -> Result<(), String>;
}

struct OpenAiCompatibleProvider {
    provider_kind: &'static str,
    label: &'static str,
    requires_api_key: bool,
    endpoint_style: OpenAiEndpointStyle,
    auth_style: OpenAiAuthStyle,
    default_api: OpenAiApiStyle,
}

fn provider_for(kind: &str) -> Result<OpenAiCompatibleProvider, String> {
    match kind {
        "azure-openai" => Ok(OpenAiCompatibleProvider {
            provider_kind: "azure-openai",
            label: "Azure OpenAI",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::Azure,
            auth_style: OpenAiAuthStyle::ApiKeyHeader,
            default_api: OpenAiApiStyle::Responses,
        }),
        "deepseek" => Ok(OpenAiCompatibleProvider {
            provider_kind: "deepseek",
            label: "DeepSeek",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::ChatCompletions,
        }),
        "grok" => Ok(OpenAiCompatibleProvider {
            provider_kind: "grok",
            label: "Grok",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::ChatCompletions,
        }),
        "litellm" => Ok(OpenAiCompatibleProvider {
            provider_kind: "litellm",
            label: "LiteLLM",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::Responses,
        }),
        "openai" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai",
            label: "OpenAI",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::Responses,
        }),
        "openrouter" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openrouter",
            label: "OpenRouter",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::Responses,
        }),
        "ollama" => Ok(OpenAiCompatibleProvider {
            provider_kind: "ollama",
            label: "Ollama",
            requires_api_key: false,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::Responses,
        }),
        "nvidia" => Ok(OpenAiCompatibleProvider {
            provider_kind: "nvidia",
            label: "NVIDIA",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::Responses,
        }),
        "openai-compatible" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai-compatible",
            label: "OpenAI compatible",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
            default_api: OpenAiApiStyle::ChatCompletions,
        }),
        "anthropic" => Err(
            "Anthropic support needs a provider adapter; DeepSeek and OpenAI-compatible providers are wired first."
                .to_string(),
        ),
        "github-copilot" => Err(
            "GitHub Copilot support needs the Copilot SDK OAuth bridge before AI Assistant can chat."
                .to_string(),
        ),
        _ => Err("AI provider is not supported by the agent runner".to_string()),
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
    ) -> Result<(), String> {
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
    channel
        .send(serde_json::to_value(event).map_err(|e| e.to_string())?)
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
                break;
            }
            let chunk: ChatSseChunk =
                serde_json::from_str(data).map_err(|e| format!("SSE parse error: {e}"))?;
            for choice in chunk.choices {
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
                break;
            }

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
        let client = reqwest::Client::new();
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let mut content = String::new();
        let mut reasoning_content: Option<String> = None;
        let mut exhausted = true;

        for _ in 0..10 {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiCompatibleChatRequest {
                    model: settings.model().to_string(),
                    messages: messages.clone(),
                    stream: false,
                    tools: tool_definitions.clone(),
                    tool_choice: (!tool_definitions.is_empty()).then(|| "auto".to_string()),
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;

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
                let result = run_ai_tool(settings.tools(), &app_data_dir, &app, &tool_call).await;
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
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiCompatibleChatRequest {
                    model: settings.model().to_string(),
                    messages: messages.clone(),
                    stream: false,
                    tools: vec![],
                    tool_choice: None,
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;

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
        let client = reqwest::Client::new();
        let tool_definitions = if request.allow_tools {
            ai_tool_definitions(settings.tools())
        } else {
            Vec::new()
        };
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to locate KKTerm app data: {error}"))?;
        let mut content = String::new();
        let mut reasoning_content: Option<String> = None;
        let mut exhausted = true;

        for _ in 0..10 {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiResponsesRequest {
                    model: settings.model().to_string(),
                    input: input.clone(),
                    stream: false,
                    store: false,
                    tools: responses_tool_definitions(&tool_definitions),
                    tool_choice: (!tool_definitions.is_empty()).then(|| "auto".to_string()),
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;

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
                let result = run_ai_tool(settings.tools(), &app_data_dir, &app, &tool_call).await;
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": tool_call.id,
                    "output": result,
                }));
            }
        }

        if exhausted {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiResponsesRequest {
                    model: settings.model().to_string(),
                    input: input.clone(),
                    stream: false,
                    store: false,
                    tools: vec![],
                    tool_choice: None,
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| format!("failed to read {} response: {error}", self.label))?;

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
    ) -> Result<(), String> {
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
        let client = reqwest::Client::new();
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

        for _ in 0..10 {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiCompatibleChatRequest {
                    model: model.clone(),
                    messages: messages.clone(),
                    stream: true,
                    tools: tool_definitions.clone(),
                    tool_choice: (!tool_definitions.is_empty()).then(|| "auto".to_string()),
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
                return Err(format!(
                    "{} returned HTTP {}: {}",
                    self.label,
                    status.as_u16(),
                    truncate_error_body(&response_text)
                ));
            }

            let (content, tool_calls, streamed_reasoning) =
                stream_chat_completions(response, &channel).await?;

            if tool_calls.is_empty() {
                require_streamed_assistant_content(self, &content)?;
                emit_stream(
                    &channel,
                    &AiStreamEvent::Done {
                        model: model.clone(),
                        provider_kind: self.provider_kind.to_string(),
                    },
                )?;
                return Ok(());
            }

            messages.push(OpenAiCompatibleMessage {
                role: "assistant".to_string(),
                content: OpenAiCompatibleContent::Text(content.clone()),
                reasoning_content: streamed_reasoning
                    .filter(|r| !r.trim().is_empty()),
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
                emit_stream(
                    &channel,
                    &AiStreamEvent::ToolCallStart {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                    },
                )?;
                let result = run_ai_tool(settings.tools(), &app_data_dir, &app, tool_call).await;
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
                    },
                )?;
            }
        }

        if exhausted {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiCompatibleChatRequest {
                    model: model.clone(),
                    messages: messages.clone(),
                    stream: true,
                    tools: vec![],
                    tool_choice: None,
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
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
        }

        emit_stream(
            &channel,
            &AiStreamEvent::Done {
                model,
                provider_kind: self.provider_kind.to_string(),
            },
        )
    }

    async fn run_responses_streaming(
        &self,
        app: tauri::AppHandle,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
        channel: Channel<Value>,
    ) -> Result<(), String> {
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
        let client = reqwest::Client::new();
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
        let resp_tool_defs = responses_tool_definitions(&tool_definitions);

        for _ in 0..10 {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiResponsesRequest {
                    model: model.clone(),
                    input: input.clone(),
                    stream: true,
                    store: false,
                    tools: resp_tool_defs.clone(),
                    tool_choice: (!tool_definitions.is_empty()).then(|| "auto".to_string()),
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
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
                input.push(json!({"type": "output_text", "output_text": output}));
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
                return Ok(());
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
                let result = run_ai_tool(settings.tools(), &app_data_dir, &app, tool_call).await;
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
                    },
                )?;
            }
        }

        if exhausted {
            let response = client
                .post(endpoint.clone())
                .headers(openai_compatible_headers(
                    api_key.as_deref(),
                    self.auth_style,
                )?)
                .json(&OpenAiResponsesRequest {
                    model: model.clone(),
                    input: input.clone(),
                    stream: true,
                    store: false,
                    tools: vec![],
                    tool_choice: None,
                })
                .send()
                .await
                .map_err(|error| format!("failed to reach {}: {error}", self.label))?;

            let status = response.status();
            if !status.is_success() {
                let response_text = response
                    .text()
                    .await
                    .map_err(|error| format!("failed to read {} response: {error}", self.label))?;
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
        }

        emit_stream(
            &channel,
            &AiStreamEvent::Done {
                model,
                provider_kind: self.provider_kind.to_string(),
            },
        )
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

fn require_streamed_assistant_content(
    provider: &OpenAiCompatibleProvider,
    content: &str,
) -> Result<(), String> {
    if content.trim().is_empty() {
        Err(format!(
            "{} response did not include assistant content",
            provider.label
        ))
    } else {
        Ok(())
    }
}

fn responses_tool_definitions(tools: &[OpenAiToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": tool.tool_type,
                "name": tool.function.name,
                "description": tool.function.description,
                "parameters": tool.function.parameters.clone(),
            })
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
            json!({"type":"object","properties":{"viewId":{"type":"string"},"kind":{"type":"string","enum":["builtIn","content","script"]},"sourceId":{"type":"string"},"preset":{"type":"string","enum":["panel","ambient","glass","tile","hero","mono","stack","action","band"]},"accentName":{"type":"string","enum":["blue","indigo","teal","green","amber","red","purple","pink","slate","cyan","orange","rose","emerald","sky"]},"iconName":{"type":"string","enum":["Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun","Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar","Database","Globe","Lock","Key","Mail","Mic","Monitor","Music","Package","Phone","Pin","Power","Printer","Radio","Search","Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash","Truck","User","Users","Video","Volume","Watch","Wifi","Wind","Zap","Layers","List","Grid"]},"gridX":{"type":"integer","minimum":0,"maximum":11},"gridY":{"type":"integer","minimum":0},"gridW":{"type":"integer","minimum":1,"maximum":12},"gridH":{"type":"integer","minimum":1}},"required":["viewId","kind","sourceId","preset","accentName","iconName","gridX","gridY","gridW","gridH"]}),
        ));
        tools.push(tool_definition(
            "dashboard_update_instance",
            "Update a widget instance's preset, accent, icon, custom title, or grid position.",
            json!({"type":"object","properties":{"id":{"type":"string"},"patch":{"type":"object","properties":{"preset":{"type":"string","enum":["panel","ambient","glass","tile","hero","mono","stack","action","band"]},"accentName":{"type":"string","enum":["blue","indigo","teal","green","amber","red","purple","pink","slate","cyan","orange","rose","emerald","sky"]},"iconName":{"type":"string","enum":["Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun","Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar","Database","Globe","Lock","Key","Mail","Mic","Monitor","Music","Package","Phone","Pin","Power","Printer","Radio","Search","Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash","Truck","User","Users","Video","Volume","Watch","Wifi","Wind","Zap","Layers","List","Grid"]},"customTitle":{"type":["string","null"]},"gridX":{"type":"integer"},"gridY":{"type":"integer"},"gridW":{"type":"integer"},"gridH":{"type":"integer"}}}},"required":["id","patch"]}),
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
            "dashboard_create_custom_widget",
            "Create a new AI-authored custom widget (content or script kind). bodyJson must be a JSON string matching the selected kind. For content use shape markdown, kvList, checklist, or stat. For script use source plus permissions.",
            json!({"type":"object","properties":{"kind":{"type":"string","enum":["content","script"]},"title":{"type":"string"},"summary":{"type":"string"},"category":{"type":"string"},"bodyJson":{"type":"string"},"createdBy":{"type":"string","enum":["user","agent"]}},"required":["kind","title","summary","category","bodyJson","createdBy"]}),
        ));
        tools.push(tool_definition(
            "dashboard_update_custom_widget",
            "Update an existing custom widget's title, summary, category, or body JSON.",
            json!({"type":"object","properties":{"id":{"type":"string"},"patch":{"type":"object","properties":{"title":{"type":"string"},"summary":{"type":"string"},"category":{"type":"string"},"bodyJson":{"type":"string"}}}},"required":["id","patch"]}),
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
    tools
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
        },
    }
}

async fn run_ai_tool(
    settings: &AiAssistantToolSettings,
    app_data_dir: &Path,
    app: &tauri::AppHandle,
    call: &OpenAiToolCall,
) -> String {
    let args: Value = serde_json::from_str(&call.function.arguments).unwrap_or_else(|_| json!({}));
    match call.function.name.as_str() {
        "current_time" if settings.current_time() => current_time_tool(),
        "web_search" if settings.web_search() => web_search_tool(args).await,
        "web_fetch" if settings.web_fetch() => web_fetch_tool(args).await,
        "app_data_file_search" if settings.app_data_file_search() => {
            app_data_file_search_tool(app_data_dir, args)
        }
        "app_data_file_read" if settings.app_data_file_read() => {
            app_data_file_read_tool(app_data_dir, args)
        }
        "shell_command" if settings.shell_command() => shell_command_tool(app_data_dir, args),
        name if settings.dashboard() && name.starts_with("dashboard_") => {
            dashboard_tool(app, name, args)
        }
        _ => "Tool is disabled in AI Assistant settings.".to_string(),
    }
}

fn dashboard_tool(app: &tauri::AppHandle, name: &str, args: Value) -> String {
    let storage = app.state::<Storage>();
    let result: Result<Value, String> = storage.with_connection_infallible(|conn| {
        match name {
            "dashboard_load_state" => {
                ds::load_state(conn)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_create_view" => {
                let title = arg_string(&args, "title");
                if title.is_empty() {
                    return Err("dashboard_create_view requires title".to_string());
                }
                let grid_density = args.get("gridDensity").and_then(Value::as_str).map(str::to_owned);
                let id = new_dashboard_id("view");
                ds::create_view(conn, &id, &title, grid_density.as_deref())
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_update_view" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_update_view requires id".to_string());
                }
                let patch: ds::ViewPatch = serde_json::from_value(
                    args.get("patch").cloned().unwrap_or(Value::Null)
                ).map_err(|e| format!("invalid patch: {e}"))?;
                ds::update_view(conn, &id, &patch)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_remove_view" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_remove_view requires id".to_string());
                }
                ds::remove_view(conn, &id)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_reorder_views" => {
                let ordered_ids: Vec<String> = args.get("orderedIds")
                    .and_then(Value::as_array)
                    .map(|arr| arr.iter().filter_map(Value::as_str).map(str::to_owned).collect())
                    .unwrap_or_default();
                ds::reorder_views(conn, &ordered_ids)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
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
                let grid_w = args.get("gridW").and_then(Value::as_i64).unwrap_or(4);
                let grid_h = args.get("gridH").and_then(Value::as_i64).unwrap_or(3);
                let id = new_dashboard_id("inst");
                ds::add_instance(conn, &id, &view_id, &kind, &source_id, &preset, &accent_name, &icon_name, grid_x, grid_y, grid_w, grid_h)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_update_instance" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_update_instance requires id".to_string());
                }
                let patch: ds::InstancePatch = serde_json::from_value(
                    args.get("patch").cloned().unwrap_or(Value::Null)
                ).map_err(|e| format!("invalid patch: {e}"))?;
                ds::update_instance(conn, &id, &patch)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_remove_instance" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_remove_instance requires id".to_string());
                }
                ds::remove_instance(conn, &id)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_apply_layout" => {
                let view_id = arg_string(&args, "viewId");
                if view_id.is_empty() {
                    return Err("dashboard_apply_layout requires viewId".to_string());
                }
                let layout: Vec<ds::LayoutEntry> = args.get("layout")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();
                ds::apply_layout(conn, &view_id, &layout)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_create_custom_widget" => {
                let kind = arg_string(&args, "kind");
                let title = arg_string(&args, "title");
                let summary = arg_string(&args, "summary");
                let category = arg_string(&args, "category");
                let body_json = arg_string(&args, "bodyJson");
                let created_by = arg_string(&args, "createdBy");
                let id = new_dashboard_id("cw");
                ds::create_custom_widget(conn, &id, &kind, &title, &summary, &category, &body_json, &created_by)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_update_custom_widget" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_update_custom_widget requires id".to_string());
                }
                let patch: ds::CustomWidgetPatch = serde_json::from_value(
                    args.get("patch").cloned().unwrap_or(Value::Null)
                ).map_err(|e| format!("invalid patch: {e}"))?;
                ds::update_custom_widget(conn, &id, &patch)
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_remove_custom_widget" => {
                let id = arg_string(&args, "id");
                if id.is_empty() {
                    return Err("dashboard_remove_custom_widget requires id".to_string());
                }
                let force = args.get("forceDeleteInstances").and_then(Value::as_bool).unwrap_or(false);
                ds::remove_custom_widget(conn, &id, force)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
            }
            "dashboard_reset" => {
                ds::reset_dashboard(conn)
                    .map(|_| json!({"ok": true}))
                    .map_err(|e| format!("{e:?}"))
            }
            _ => Err(format!("unknown dashboard tool: {name}")),
        }
    });
    match result {
        Ok(v) => serde_json::to_string(&v).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => format!("{{\"error\":\"{}\"}}", e.replace('"', "\\\"")),
    }
}

fn current_time_tool() -> String {
    time::OffsetDateTime::now_local()
        .ok()
        .and_then(|t| t.format(&time::format_description::well_known::Rfc3339).ok())
        .unwrap_or_else(|| {
            let utc = time::OffsetDateTime::now_utc();
            utc.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_else(|_| utc.unix_timestamp().to_string())
        })
}

async fn web_search_tool(args: Value) -> String {
    let query = arg_string(&args, "query");
    if query.is_empty() {
        return "web_search requires query.".to_string();
    }
    let url = format!("https://duckduckgo.com/html/?q={}", url_encode(&query));
    match reqwest::get(url).await {
        Ok(response) => match response.text().await {
            Ok(text) => strip_html(&text).chars().take(4000).collect(),
            Err(error) => format!("Failed to read search response: {error}"),
        },
        Err(error) => format!("Web search failed: {error}"),
    }
}

async fn web_fetch_tool(args: Value) -> String {
    let url = arg_string(&args, "url");
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return "web_fetch only accepts http:// or https:// URLs.".to_string();
    }
    match reqwest::get(url).await {
        Ok(response) => match response.text().await {
            Ok(text) => strip_html(&text).chars().take(8000).collect(),
            Err(error) => format!("Failed to read page: {error}"),
        },
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

#[derive(Deserialize)]
struct OpenAiToolCall {
    id: String,
    function: OpenAiToolCallFunction,
}

#[derive(Deserialize)]
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
        "TOOLS: When you need to search the web, fetch URLs, read files, check the current time, or run shell commands, you MUST use the provided function-calling mechanism. Always make the actual function call alongside your explanation. Do not describe what you plan to do with a tool without calling it — invoke the tool in the same response.".to_string(),
        "DASHBOARD TOOLS: When the active page context is Dashboard and the user asks to create, customize, arrange, or remove Dashboard widgets or views, use the dashboard_* tools. To create a new user-requested widget on the active view, usually call dashboard_create_custom_widget followed by dashboard_add_instance.".to_string(),
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
        apply_responses_stream_event(
            &mut state,
            &json!({
                "type": "response.output_item.done",
                "item": {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "It is 11:34 PM."}]
                }
            }),
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

        let error = require_streamed_assistant_content(&provider, "   ")
            .expect_err("empty streamed assistant turns are rejected");

        assert_eq!(
            error,
            "DeepSeek response did not include assistant content"
        );
        assert!(require_streamed_assistant_content(&provider, "It is 11:34 PM.").is_ok());
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
    fn assistant_tool_safety_blocks_destructive_shell_commands() {
        assert!(is_destructive_command(r"Remove-Item -Recurse .\logs"));
        assert!(is_destructive_command("del important.txt"));
        assert!(!is_destructive_command("Get-ChildItem ."));
    }

    #[test]
    fn assistant_file_tool_paths_stay_inside_app_data() {
        let root =
            std::env::temp_dir().join(format!("kkterm-ai-tool-test-{}", std::process::id()));
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

        assert_eq!(provider.provider_kind, "deepseek");
        assert!(provider.requires_api_key);
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
