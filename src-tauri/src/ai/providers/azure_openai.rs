use super::super::{
    OpenAiApiStyle, OpenAiAuthStyle, OpenAiCompatibleProvider, OpenAiEndpointStyle,
};

pub(super) fn provider() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        provider_kind: "azure-openai",
        label: "Azure OpenAI",
        requires_api_key: true,
        endpoint_style: OpenAiEndpointStyle::Azure,
        auth_style: OpenAiAuthStyle::ApiKeyHeader,
        default_api: OpenAiApiStyle::Responses,
    }
}
