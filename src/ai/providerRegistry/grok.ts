import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const grokProvider: AiProviderDefinition = {
  kind: "grok",
  label: "Grok (xAI)",
  baseUrl: "https://api.x.ai/v1",
  defaultModel: "grok-4-fast",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "xAI API key",
  apiKeyUrl: "https://console.x.ai/",
  modelOptions: [
    { id: "grok-4-fast", label: "Grok 4 Fast", note: "Latest fast alias", supportsImageInput: true },
    { id: "grok-4-fast-reasoning", label: "Grok 4 Fast Reasoning", supportsImageInput: true },
    { id: "grok-4-fast-reasoning-latest", label: "Grok 4 Fast Reasoning Latest", supportsImageInput: true },
    { id: "grok-code-fast-1", label: "Grok Code Fast 1", note: "Coding", supportsImageInput: false },
    { id: "grok-4", label: "Grok 4", supportsImageInput: true },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
};
