// Provider adapters live in one file per provider; Rust still requires this explicit module registry.
mod azure_openai;
mod deepseek;
mod gemini;
mod grok;
mod litellm;
mod nvidia;
mod ollama;
mod openai;
mod openai_compatible;
mod openrouter;

use super::OpenAiCompatibleProvider;

pub(super) fn provider_for(kind: &str) -> Result<OpenAiCompatibleProvider, String> {
    match kind {
        "azure-openai" => Ok(azure_openai::provider()),
        "deepseek" => Ok(deepseek::provider()),
        "gemini" => Ok(gemini::provider()),
        "grok" => Ok(grok::provider()),
        "litellm" => Ok(litellm::provider()),
        "openai" => Ok(openai::provider()),
        "openrouter" => Ok(openrouter::provider()),
        "ollama" => Ok(ollama::provider()),
        "nvidia" => Ok(nvidia::provider()),
        "openai-compatible" => Ok(openai_compatible::provider()),
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
