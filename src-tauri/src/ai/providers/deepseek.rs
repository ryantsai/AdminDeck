use super::super::{
    OpenAiApiStyle, OpenAiAuthStyle, OpenAiCompatibleProvider, OpenAiEndpointStyle,
};

pub(super) fn provider() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        provider_kind: "deepseek",
        label: "DeepSeek",
        requires_api_key: true,
        endpoint_style: OpenAiEndpointStyle::ChatCompletions,
        auth_style: OpenAiAuthStyle::Bearer,
        default_api: OpenAiApiStyle::ChatCompletions,
    }
}
