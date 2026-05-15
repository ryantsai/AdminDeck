import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const openAiProvider: AiProviderDefinition = {
  kind: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-5.5",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "OpenAI API key",
  apiKeyUrl: "https://platform.openai.com/api-keys",
  modelOptions: [
    { id: "gpt-5.5", label: "GPT-5.5", note: "Flagship reasoning and coding", supportsImageInput: true },
    { id: "gpt-5.5-2026-04-23", label: "GPT-5.5 snapshot", supportsImageInput: true },
    { id: "gpt-5.4", label: "GPT-5.4", note: "Coding and professional work", supportsImageInput: true },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", note: "Fast, lower cost", supportsImageInput: true },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", note: "Smallest", supportsImageInput: true },
    { id: "gpt-5.2", label: "GPT-5.2", note: "Previous frontier", supportsImageInput: true },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", note: "Agentic coding", supportsImageInput: true },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", supportsImageInput: true },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
};
