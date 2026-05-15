import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const githubCopilotProvider: AiProviderDefinition = {
  kind: "github-copilot",
  label: "GitHub Copilot",
  baseUrl: "https://api.githubcopilot.com",
  defaultModel: "gpt-5.4",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "GitHub OAuth token",
  apiKeyUrl: "https://github.com/settings/tokens",
  modelOptions: [
    { id: "gpt-5.5", label: "GPT-5.5", supportsImageInput: true },
    { id: "gpt-5.4", label: "GPT-5.4", supportsImageInput: true },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", supportsImageInput: true },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", supportsImageInput: true },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", supportsImageInput: true },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", supportsImageInput: true },
    { id: "claude-opus-4.7", label: "Claude Opus 4.7", supportsImageInput: true },
    { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", supportsImageInput: true },
    { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", supportsImageInput: true },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "sdkOAuth"],
};
