import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const geminiProvider: AiProviderDefinition = {
  kind: "gemini",
  label: "Google Gemini",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  defaultModel: "gemini-2.5-pro",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "Google AI Studio API key",
  apiKeyUrl: "https://aistudio.google.com/app/apikey",
  modelOptions: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Most capable", supportsImageInput: true },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Fast, low cost", supportsImageInput: true },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Previous gen fast", supportsImageInput: true },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "Stable legacy", supportsImageInput: true },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "openAiCompatible"],
};
