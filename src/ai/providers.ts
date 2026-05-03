import type { AiProviderKind, AiProviderSettings, AiReasoningEffort } from "../types";

export type AiProviderCapability =
  | "chat"
  | "streaming"
  | "toolCalling"
  | "mcpReady"
  | "localRuntime"
  | "openAiCompatible";

export type AiModelOption = {
  id: string;
  label: string;
  note?: string;
};

export type AiProviderDefinition = {
  kind: AiProviderKind;
  label: string;
  baseUrl: string;
  defaultModel: string;
  defaultReasoningEffort: AiReasoningEffort;
  reasoningEfforts: AiReasoningEffort[];
  requiresApiKey: boolean;
  allowsCustomBaseUrl: boolean;
  allowsCustomModel: boolean;
  apiKeyLabel: string;
  modelOptions: AiModelOption[];
  capabilities: AiProviderCapability[];
};

export const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
  {
    kind: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5",
    defaultReasoningEffort: "medium",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: false,
    allowsCustomModel: true,
    apiKeyLabel: "OpenAI API key",
    modelOptions: [
      { id: "gpt-5.5", label: "GPT-5.5", note: "Latest flagship" },
      { id: "gpt-5.4", label: "GPT-5.4", note: "Strong coding" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", note: "Fast, lower cost" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", note: "Smallest" },
      { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", note: "Agentic coding" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    defaultReasoningEffort: "medium",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: false,
    allowsCustomModel: true,
    apiKeyLabel: "Anthropic API key",
    modelOptions: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", note: "Most capable" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fast" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 snapshot" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "mcpReady"],
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-5.5",
    defaultReasoningEffort: "medium",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: false,
    allowsCustomModel: true,
    apiKeyLabel: "OpenRouter API key",
    modelOptions: [
      { id: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
  },
  {
    kind: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    defaultReasoningEffort: "high",
    reasoningEfforts: ["default", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: false,
    allowsCustomModel: true,
    apiKeyLabel: "DeepSeek API key",
    modelOptions: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", note: "Default" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "Higher capability" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "openAiCompatible"],
  },
  {
    kind: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen3",
    defaultReasoningEffort: "default",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: false,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    apiKeyLabel: "Ollama API key",
    modelOptions: [
      { id: "qwen3", label: "Qwen3", note: "Local general use" },
      { id: "gpt-oss", label: "gpt-oss", note: "Open-weight" },
      { id: "deepseek-r1", label: "DeepSeek-R1", note: "Local reasoning" },
      { id: "gemma3", label: "Gemma 3" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "localRuntime", "openAiCompatible"],
  },
  {
    kind: "nvidia",
    label: "NVIDIA",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "bytedance/seed-oss-36b-instruct",
    defaultReasoningEffort: "medium",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: false,
    allowsCustomModel: true,
    apiKeyLabel: "NVIDIA API key",
    modelOptions: [
      { id: "bytedance/seed-oss-36b-instruct", label: "Seed OSS 36B Instruct" },
      { id: "abacusai/dracarys-llama-3.1-70b-instruct", label: "Dracarys Llama 3.1 70B" },
      { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "openAiCompatible"],
  },
  {
    kind: "openai-compatible",
    label: "OpenAI Compatible",
    baseUrl: "",
    defaultModel: "gpt-5.5",
    defaultReasoningEffort: "medium",
    reasoningEfforts: ["default", "low", "medium", "high", "max"],
    requiresApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    apiKeyLabel: "API key",
    modelOptions: [
      { id: "gpt-5.5", label: "GPT-5.5 compatible" },
      { id: "llama-3.3-70b-instruct", label: "Llama 3.3 70B compatible" },
      { id: "qwen3", label: "Qwen3 compatible" },
    ],
    capabilities: ["chat", "streaming", "toolCalling", "mcpReady", "openAiCompatible"],
  },
];

export function getAiProviderDefinition(kind: AiProviderKind) {
  return (
    AI_PROVIDER_DEFINITIONS.find((definition) => definition.kind === kind) ??
    AI_PROVIDER_DEFINITIONS[0]
  );
}

export function providerDefaultsFor(kind: AiProviderKind): AiProviderSettings {
  const definition = getAiProviderDefinition(kind);
  return {
    providerKind: definition.kind,
    baseUrl: definition.baseUrl,
    model: definition.defaultModel,
    reasoningEffort: definition.defaultReasoningEffort,
    cliExecutionPolicy: "suggestOnly",
    claudeCliPath: "",
    codexCliPath: "",
  };
}

export function normalizeAiProviderDraft(draft: AiProviderSettings): AiProviderSettings {
  const definition = getAiProviderDefinition(draft.providerKind);
  const baseUrl = (definition.allowsCustomBaseUrl ? draft.baseUrl : definition.baseUrl).trim();
  const model = draft.model.trim() || definition.defaultModel;
  const reasoningEffort = normalizeReasoningEffort(
    draft.reasoningEffort,
    definition.reasoningEfforts,
    definition.defaultReasoningEffort,
  );

  if (!baseUrl) {
    throw new Error("Provider endpoint is required.");
  }
  if (!model) {
    throw new Error("Model is required.");
  }

  return {
    ...draft,
    providerKind: definition.kind,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    reasoningEffort,
    cliExecutionPolicy: "suggestOnly",
    claudeCliPath: draft.claudeCliPath?.trim() ?? "",
    codexCliPath: draft.codexCliPath?.trim() ?? "",
  };
}

export function providerNeedsApiKey(settings: AiProviderSettings) {
  return getAiProviderDefinition(settings.providerKind).requiresApiKey;
}

export function validateAiProviderForChat(
  settings: AiProviderSettings,
  hasApiKey: boolean,
): AiProviderSettings {
  const normalized = normalizeAiProviderDraft(settings);
  const definition = getAiProviderDefinition(normalized.providerKind);
  if (definition.requiresApiKey && !hasApiKey) {
    throw new Error(`${definition.label} needs an API key before AI Assistant can chat.`);
  }
  return normalized;
}

function normalizeReasoningEffort(
  value: AiReasoningEffort | undefined,
  supported: AiReasoningEffort[],
  fallback: AiReasoningEffort,
) {
  const normalized = value ?? fallback;
  return supported.includes(normalized) ? normalized : fallback;
}
