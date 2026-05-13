use super::super::{
    OpenAiApiStyle, OpenAiAuthStyle, OpenAiCompatibleProvider, OpenAiEndpointStyle,
};

pub(super) fn provider() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        provider_kind: "ollama",
        label: "Ollama",
        requires_api_key: false,
        endpoint_style: OpenAiEndpointStyle::ChatCompletions,
        auth_style: OpenAiAuthStyle::Bearer,
        default_api: OpenAiApiStyle::Responses,
    }
}
