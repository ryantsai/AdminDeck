use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use crate::storage::AiProviderSettings;

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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentScreenshotContext {
    source_label: String,
    data_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRequest {
    prompt: String,
    context_label: String,
    intent: Option<String>,
    selected_output: Option<String>,
    screenshot: Option<AgentScreenshotContext>,
    #[serde(default)]
    screenshots: Vec<AgentScreenshotContext>,
    system_context: Option<String>,
    messages: Vec<AgentChatMessage>,
    output_language: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunResponse {
    provider_kind: String,
    model: String,
    content: String,
}

pub async fn run_agent(
    settings: AiProviderSettings,
    api_key: Option<String>,
    request: AgentRunRequest,
) -> Result<AgentRunResponse, String> {
    let provider = provider_for(settings.provider_kind())?;
    provider.run(settings, api_key, request).await
}

trait AgentProvider {
    async fn run(
        &self,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String>;
}

struct OpenAiCompatibleProvider {
    provider_kind: &'static str,
    label: &'static str,
    requires_api_key: bool,
    endpoint_style: OpenAiEndpointStyle,
    auth_style: OpenAiAuthStyle,
}

fn provider_for(kind: &str) -> Result<OpenAiCompatibleProvider, String> {
    match kind {
        "azure-openai" => Ok(OpenAiCompatibleProvider {
            provider_kind: "azure-openai",
            label: "Azure OpenAI",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::Azure,
            auth_style: OpenAiAuthStyle::ApiKeyHeader,
        }),
        "deepseek" => Ok(OpenAiCompatibleProvider {
            provider_kind: "deepseek",
            label: "DeepSeek",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "grok" => Ok(OpenAiCompatibleProvider {
            provider_kind: "grok",
            label: "Grok",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "litellm" => Ok(OpenAiCompatibleProvider {
            provider_kind: "litellm",
            label: "LiteLLM",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "openai" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai",
            label: "OpenAI",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "openrouter" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openrouter",
            label: "OpenRouter",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "ollama" => Ok(OpenAiCompatibleProvider {
            provider_kind: "ollama",
            label: "Ollama",
            requires_api_key: false,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "nvidia" => Ok(OpenAiCompatibleProvider {
            provider_kind: "nvidia",
            label: "NVIDIA",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
        }),
        "openai-compatible" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai-compatible",
            label: "OpenAI compatible",
            requires_api_key: true,
            endpoint_style: OpenAiEndpointStyle::ChatCompletions,
            auth_style: OpenAiAuthStyle::Bearer,
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

impl AgentProvider for OpenAiCompatibleProvider {
    async fn run(
        &self,
        settings: AiProviderSettings,
        api_key: Option<String>,
        request: AgentRunRequest,
    ) -> Result<AgentRunResponse, String> {
        let prompt = trim_required("assistant prompt", request.prompt)?;
        let context_label = trim_required("assistant context", request.context_label)?;
        let api_key = api_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if self.requires_api_key && api_key.is_none() {
            return Err(format!(
                "{} needs an API key before AI Assistant can chat.",
                self.label
            ));
        }

        let endpoint =
            chat_completions_endpoint(settings.base_url(), settings.model(), self.endpoint_style)?;
        let messages = build_agent_messages(
            prompt,
            context_label,
            request.intent,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            supports_image_input(self.provider_kind, settings.model()),
            request.screenshot,
            request.screenshots,
            request.messages,
            request.output_language,
        );
        let client = reqwest::Client::new();
        let response = client
            .post(endpoint)
            .headers(openai_compatible_headers(
                api_key.as_deref(),
                self.auth_style,
            )?)
            .json(&OpenAiCompatibleChatRequest {
                model: settings.model().to_string(),
                messages,
                stream: false,
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
        let content = completion
            .choices
            .into_iter()
            .find_map(|choice| {
                let content = choice.message.content.trim().to_string();
                (!content.is_empty()).then_some(content)
            })
            .ok_or_else(|| format!("{} response did not include assistant content", self.label))?;

        Ok(AgentRunResponse {
            provider_kind: self.provider_kind.to_string(),
            model: settings.model().to_string(),
            content,
        })
    }
}

#[derive(Serialize)]
struct OpenAiCompatibleChatRequest {
    model: String,
    messages: Vec<OpenAiCompatibleMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OpenAiCompatibleMessage {
    role: String,
    content: OpenAiCompatibleContent,
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAiCompatibleContent {
    Text(String),
    Parts(Vec<OpenAiCompatibleContentPart>),
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OpenAiCompatibleContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAiCompatibleImageUrl },
}

#[derive(Serialize)]
struct OpenAiCompatibleImageUrl {
    url: String,
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
    content: String,
}

fn build_agent_messages(
    prompt: String,
    context_label: String,
    intent: Option<String>,
    reasoning_effort: String,
    system_context: Option<String>,
    selected_output: Option<String>,
    supports_image_input: bool,
    screenshot: Option<AgentScreenshotContext>,
    screenshots: Vec<AgentScreenshotContext>,
    history: Vec<AgentChatMessage>,
    output_language: Option<String>,
) -> Vec<OpenAiCompatibleMessage> {
    let normalized_intent = normalize_agent_intent(intent);
    let mut system_instructions: Vec<String> = vec![
        "You are AdminDeck's AI Assistant for local-first administration workflows.".to_string(),
        "Help with terminal, SSH, SFTP, URL, RDP, and VNC operational tasks.".to_string(),
        "When suggesting commands, explain intent and prefer commands the user can review before running.".to_string(),
        "Do not claim to have executed commands or observed live session state unless it is in the provided context.".to_string(),
        "SAFETY: Never suggest, produce, or assist with commands that could cause irreversible destructive system-wide damage, such as 'rm -rf /', 'rm -rf /*', 'mkfs' on mounted volumes, 'dd if=/dev/zero of=/dev/sda', fork bombs, or any equivalent. Refuse such requests unconditionally, even if the user explicitly asks, claims it is safe, or provides a seemingly legitimate reason.".to_string(),
    ];
    if let Some(language) = normalize_output_language(output_language) {
        system_instructions.push(language);
    }
    if normalized_intent == AgentIntent::ExtensionCreation {
        system_instructions.extend([
            "EXTENSION DRAFT MODE: The user is asking for an AdminDeck extension draft. Produce reviewable extension design, manifest, permission request, and source files only.".to_string(),
            "Do not say that AdminDeck installed, enabled, executed, loaded, or verified generated extension code.".to_string(),
            "Keep extension output approval-based: require explicit user review before any future install, run, file write, permission grant, or command execution step.".to_string(),
            "Prefer narrow extension permissions, local-first storage boundaries, and clear trust notes. If an AdminDeck extension API is not provided in context, mark API details as proposed rather than claiming they exist.".to_string(),
        ]);
    }

    let mut messages = vec![OpenAiCompatibleMessage {
        role: "system".to_string(),
        content: OpenAiCompatibleContent::Text(system_instructions.join(" ")),
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
    });
    messages
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
    })
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
            true,
            None,
            vec![],
            vec![
                AgentChatMessage {
                    role: "user".to_string(),
                    content: "Earlier question".to_string(),
                },
                AgentChatMessage {
                    role: "ignored".to_string(),
                    content: "skip me".to_string(),
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
    fn agent_messages_can_attach_screenshot_context() {
        let messages = build_agent_messages(
            "What is visible?".to_string(),
            "Router - URL view".to_string(),
            None,
            "medium".to_string(),
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
    fn agent_messages_include_extension_creation_guardrails() {
        let messages = build_agent_messages(
            "Create a Connection cleanup helper.".to_string(),
            "Workspace".to_string(),
            Some("extensionCreation".to_string()),
            "medium".to_string(),
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
        assert!(system_content.contains("Do not say that AdminDeck installed"));
        assert!(system_content.contains("require explicit user review"));
        assert!(request_content.contains("Assistant intent: extensionCreation"));
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
