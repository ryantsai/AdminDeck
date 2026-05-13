import type { AiProviderKind, AiProviderSettings, AiReasoningEffort } from "../../types";

export type AiProviderCapability =
  | "chat"
  | "imageInput"
  | "streaming"
  | "toolCalling"
  | "mcpReady"
  | "localRuntime"
  | "openAiCompatible"
  | "sdkOAuth";

export type AiModelOption = {
  id: string;
  label: string;
  note?: string;
  supportsImageInput?: boolean;
};

export type AiProviderSettingsField = "baseUrl" | "model" | "reasoningEffort" | "apiKey";

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
  settingsFields: AiProviderSettingsField[];
  capabilities: AiProviderCapability[];
};

export type AiProviderDefaults = Pick<
  AiProviderSettings,
  | "providerKind"
  | "baseUrl"
  | "model"
  | "reasoningEffort"
  | "outputLanguage"
  | "allowInsecureTls"
  | "cliExecutionPolicy"
  | "claudeCliPath"
  | "codexCliPath"
>;
