import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const anthropicProvider: AiProviderDefinition = {
  kind: "anthropic",
  label: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  defaultModel: "claude-sonnet-4-6",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "Anthropic API key",
  apiKeyUrl: "https://console.anthropic.com/settings/keys",
  modelOptions: [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", note: "Most capable", supportsImageInput: true },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced", supportsImageInput: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fast", supportsImageInput: true },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 snapshot", supportsImageInput: true },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "mcpReady"],
};
