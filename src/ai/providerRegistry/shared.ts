import type { AiProviderSettingsField } from "./types";

export const HOSTED_PROVIDER_SETTINGS_FIELDS: AiProviderSettingsField[] = [
  "model",
  "reasoningEffort",
  "apiKey",
];

export const HOSTED_PROVIDER_WITHOUT_KEY_SETTINGS_FIELDS: AiProviderSettingsField[] = [
  "model",
  "reasoningEffort",
];

export const CONFIGURABLE_ENDPOINT_SETTINGS_FIELDS: AiProviderSettingsField[] = [
  "baseUrl",
  "model",
  "reasoningEffort",
  "apiKey",
];

export const CONFIGURABLE_ENDPOINT_WITHOUT_KEY_FIELDS: AiProviderSettingsField[] = [
  "baseUrl",
  "model",
  "reasoningEffort",
];

export const STANDARD_REASONING_EFFORTS = ["default", "low", "medium", "high", "max"] as const;
export const HIGH_REASONING_EFFORTS = ["default", "high", "max"] as const;
