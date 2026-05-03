use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
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
pub struct AgentRunRequest {
    prompt: String,
    context_label: String,
    selected_output: Option<String>,
    system_context: Option<String>,
    messages: Vec<AgentChatMessage>,
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
}

fn provider_for(kind: &str) -> Result<OpenAiCompatibleProvider, String> {
    match kind {
        "deepseek" => Ok(OpenAiCompatibleProvider {
            provider_kind: "deepseek",
            label: "DeepSeek",
            requires_api_key: true,
        }),
        "openai" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai",
            label: "OpenAI",
            requires_api_key: true,
        }),
        "openrouter" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openrouter",
            label: "OpenRouter",
            requires_api_key: true,
        }),
        "ollama" => Ok(OpenAiCompatibleProvider {
            provider_kind: "ollama",
            label: "Ollama",
            requires_api_key: false,
        }),
        "nvidia" => Ok(OpenAiCompatibleProvider {
            provider_kind: "nvidia",
            label: "NVIDIA",
            requires_api_key: true,
        }),
        "openai-compatible" => Ok(OpenAiCompatibleProvider {
            provider_kind: "openai-compatible",
            label: "OpenAI compatible",
            requires_api_key: true,
        }),
        "anthropic" => Err(
            "Anthropic support needs a provider adapter; DeepSeek and OpenAI-compatible providers are wired first."
                .to_string(),
        ),
        _ => Err("AI provider is not supported by the agent runner".to_string()),
    }
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

        let endpoint = chat_completions_endpoint(settings.base_url())?;
        let messages = build_agent_messages(
            prompt,
            context_label,
            settings.reasoning_effort().to_string(),
            request.system_context,
            request.selected_output,
            request.messages,
        );
        let client = reqwest::Client::new();
        let response = client
            .post(endpoint)
            .headers(openai_compatible_headers(api_key.as_deref())?)
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
    content: String,
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
    reasoning_effort: String,
    system_context: Option<String>,
    selected_output: Option<String>,
    history: Vec<AgentChatMessage>,
) -> Vec<OpenAiCompatibleMessage> {
    let mut messages = vec![OpenAiCompatibleMessage {
        role: "system".to_string(),
        content: [
            "You are AdminDeck's AI Assistant for local-first administration workflows.",
            "Help with terminal, SSH, SFTP, URL, RDP, and VNC operational tasks.",
            "When suggesting commands, explain intent and prefer commands the user can review before running.",
            "Do not claim to have executed commands or observed live session state unless it is in the provided context.",
            "Reponse in user's query language, when responding in Chinese, always respond in Traditional Chinese (Taiwan) and avoid Mainland China IT terminology.",
        ]
        .join(" "),
    }];

    messages.extend(
        history
            .into_iter()
            .filter_map(to_openai_compatible_history_message),
    );

    let mut user_content = format!(
        "Active context: {context_label}\nReasoning effort: {reasoning_effort}\n\nUser request:\n{prompt}"
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
    messages.push(OpenAiCompatibleMessage {
        role: "user".to_string(),
        content: user_content,
    });
    messages
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
        content,
    })
}

fn chat_completions_endpoint(base_url: &str) -> Result<String, String> {
    let base_url = trim_required("AI provider endpoint", base_url.to_string())?;
    let base_url = base_url.trim_end_matches('/');
    if base_url.ends_with("/chat/completions") {
        Ok(base_url.to_string())
    } else {
        Ok(format!("{base_url}/chat/completions"))
    }
}

fn openai_compatible_headers(api_key: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(api_key) = api_key {
        let header_value = HeaderValue::from_str(&format!("Bearer {api_key}")).map_err(|_| {
            "AI API key contains characters that cannot be sent in an HTTP header".to_string()
        })?;
        headers.insert(AUTHORIZATION, header_value);
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
            chat_completions_endpoint("https://api.deepseek.com/v1").expect("endpoint builds"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_endpoint("https://api.deepseek.com/v1/chat/completions")
                .expect("endpoint is kept"),
            "https://api.deepseek.com/v1/chat/completions"
        );
    }

    #[test]
    fn agent_messages_include_history_context_and_selected_output() {
        let messages = build_agent_messages(
            "What failed?".to_string(),
            "Bastion - Terminal".to_string(),
            "high".to_string(),
            Some("OS: Ubuntu 24.04 LTS".to_string()),
            Some("ERROR service unavailable".to_string()),
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
        );

        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, "system");
        assert_eq!(messages[1].role, "user");
        assert!(messages[2].content.contains("Bastion - Terminal"));
        assert!(messages[2].content.contains("Reasoning effort: high"));
        assert!(messages[2].content.contains("OS: Ubuntu 24.04 LTS"));
        assert!(messages[2].content.contains("ERROR service unavailable"));
    }

    #[test]
    fn deepseek_provider_uses_openai_compatible_adapter() {
        let provider = provider_for("deepseek").expect("DeepSeek provider is wired");

        assert_eq!(provider.provider_kind, "deepseek");
        assert!(provider.requires_api_key);
    }

    #[test]
    fn openai_compatible_headers_include_bearer_key_when_present() {
        let headers = openai_compatible_headers(Some("sk-test")).expect("headers build");

        assert_eq!(
            headers
                .get(AUTHORIZATION)
                .expect("authorization header exists")
                .to_str()
                .expect("header is valid"),
            "Bearer sk-test"
        );
    }
}
