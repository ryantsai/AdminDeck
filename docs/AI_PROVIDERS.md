# AI Provider Integration Guide

This guide describes the expected structure for adding AI providers to KKTerm.
It covers the Rust agent runner, the TypeScript Settings/provider registry, and
localization follow-up.

## Design boundary

KKTerm currently supports AI chat through the OpenAI-compatible request/response
runtime in `src-tauri/src/ai.rs`. A new provider is a small metadata adapter when
it can use that runtime: Chat Completions or Responses-style HTTP endpoints,
Bearer or API-key-header authentication, the shared tool-calling payload shape,
and the existing model/reasoning settings.

If a provider needs a different protocol, OAuth flow, SDK bridge, request schema,
or streaming format, do **not** force it into the OpenAI-compatible adapter. Add a
proper `AgentProvider` implementation in Rust and document the new runtime shape.
That is intentionally more than a one-file provider addition.

## Rust provider structure

Rust provider metadata lives under `src-tauri/src/ai/providers/` with one file per
provider. Each OpenAI-compatible provider file must:

1. Be named with snake_case matching the provider kind where possible, for example
   `azure_openai.rs` for `azure-openai`.
2. Import the shared provider metadata types from `super::super`.
3. Export `pub(super) fn provider() -> OpenAiCompatibleProvider`.
4. Fill only provider metadata: `provider_kind`, display `label`,
   `requires_api_key`, `endpoint_style`, `auth_style`, and `default_api`.
5. Avoid request-building or HTTP-client code in the provider file unless the
   provider truly needs a new runtime implementation.

Example shape:

```rust
use super::super::{
    OpenAiApiStyle, OpenAiAuthStyle, OpenAiCompatibleProvider, OpenAiEndpointStyle,
};

pub(super) fn provider() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        provider_kind: "example-provider",
        label: "Example Provider",
        requires_api_key: true,
        endpoint_style: OpenAiEndpointStyle::ChatCompletions,
        auth_style: OpenAiAuthStyle::Bearer,
        default_api: OpenAiApiStyle::Responses,
    }
}
```

Then update `src-tauri/src/ai/providers.rs`:

1. Add `mod example_provider;` with the other provider modules.
2. Add a `match` arm in `provider_for(kind)` returning
   `Ok(example_provider::provider())`.

This explicit module registration is required by Rust's static module system. Do
not add `build.rs` code generation, `inventory`-style registration, dynamic
loading, or macro discovery only to make provider files auto-register; those are
not worth the complexity for KKTerm's current provider list. If the team later
chooses a plugin-style provider architecture, document that architecture first.

## Frontend provider registry structure

The Settings UI and frontend validation use `src/ai/providerRegistry/`. For a new
provider:

1. Add `src/ai/providerRegistry/<provider>.ts` exporting a single
   `AiProviderDefinition` constant.
2. Add the provider kind to `AiProviderKind` in `src/types.ts`.
3. Import and append the definition in `src/ai/providerRegistry/index.ts`.
4. Choose `settingsFields` from `src/ai/providerRegistry/shared.ts` rather than
   defining ad hoc field lists when possible.
5. Put known model choices in `modelOptions`; keep exact/custom model IDs in the
   existing custom model input by setting `allowsCustomModel` appropriately.
6. Set `capabilities` accurately. Use `openAiCompatible` only when the Rust
   provider uses the shared OpenAI-compatible runtime.

Provider labels, API-key labels, and model labels in provider definitions are
currently treated as provider/product names. Any new explanatory user-facing text
outside those names must go through i18n.

## Persisted settings and secrets

Provider metadata stored in SQLite is non-secret. API keys remain in the OS
keychain under the shared AI API key owner. When adding settings:

1. Extend `AiProviderSettings` in both `src-tauri/src/storage.rs` and
   `src/types.ts`.
2. Add frontend defaults in `src/app-defaults.ts` and provider normalization in
   `src/ai/providers.ts`.
3. Keep secrets out of SQLite. Do not add provider-specific API-key fields to the
   durable settings table unless the storage model is redesigned.
4. Add or update storage tests that round-trip the new persisted setting.

The insecure TLS setting is intentionally a provider setting, not a global HTTP
setting. It is off by default and is applied only to AI provider HTTP clients.

## Localization checklist

For every new user-visible Settings string:

1. Add the English key to `src/i18n/locales/en.json`.
2. Use `t()`/`useTranslation()` in React or `i18next.t()` in pure helpers.
3. Add one `docs/localization_todo/<namespace>.<keyPath>.md` file per new or
   changed English key unless every non-English locale is updated intentionally in
   the same change.
