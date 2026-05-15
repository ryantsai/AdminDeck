import { CONFIGURABLE_ENDPOINT_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const azureOpenAiProvider: AiProviderDefinition = {
  kind: "azure-openai",
  label: "Azure OpenAI",
  baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
  defaultModel: "gpt-5.4",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: true,
  allowsCustomModel: true,
  apiKeyLabel: "Azure OpenAI key",
  apiKeyUrl: "https://portal.azure.com/",
  modelOptions: [
    { id: "gpt-5.5", label: "GPT-5.5", note: "Newest Azure model", supportsImageInput: true },
    { id: "gpt-5.5-2026-04-23", label: "GPT-5.5 snapshot", supportsImageInput: true },
    { id: "gpt-5.4", label: "GPT-5.4", supportsImageInput: true },
    { id: "gpt-5.4-pro", label: "GPT-5.4 Pro", supportsImageInput: true },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", supportsImageInput: true },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", supportsImageInput: true },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", supportsImageInput: true },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", supportsImageInput: true },
    { id: "gpt-5.2", label: "GPT-5.2", supportsImageInput: true },
  ],
  settingsFields: CONFIGURABLE_ENDPOINT_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
};
