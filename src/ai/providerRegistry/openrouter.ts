import { HOSTED_PROVIDER_SETTINGS_FIELDS, STANDARD_REASONING_EFFORTS } from "./shared";
import type { AiProviderDefinition } from "./types";

export const openRouterProvider: AiProviderDefinition = {
  kind: "openrouter",
  label: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-5.5",
  defaultReasoningEffort: "medium",
  reasoningEfforts: [...STANDARD_REASONING_EFFORTS],
  requiresApiKey: true,
  allowsCustomBaseUrl: false,
  allowsCustomModel: true,
  apiKeyLabel: "OpenRouter API key",
  apiKeyUrl: "https://openrouter.ai/settings/keys",
  modelOptions: [
    { id: "openai/gpt-5.5", label: "OpenAI GPT-5.5", supportsImageInput: true },
    { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", supportsImageInput: true },
    { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", supportsImageInput: true },
    { id: "x-ai/grok-4-fast", label: "Grok 4 Fast", supportsImageInput: true },
    { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", supportsImageInput: false },
    { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", supportsImageInput: false },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", supportsImageInput: true },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", supportsImageInput: false },
    { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B A22B", supportsImageInput: false },
  ],
  settingsFields: HOSTED_PROVIDER_SETTINGS_FIELDS,
  capabilities: ["chat", "imageInput", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
};
