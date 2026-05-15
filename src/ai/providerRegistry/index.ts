import { anthropicProvider } from "./anthropic";
import { azureOpenAiProvider } from "./azureOpenAi";
import { deepSeekProvider } from "./deepseek";
import { geminiProvider } from "./gemini";
import { githubCopilotProvider } from "./githubCopilot";
import { grokProvider } from "./grok";
import { liteLlmProvider } from "./litellm";
import { nvidiaProvider } from "./nvidia";
import { ollamaProvider } from "./ollama";
import { openAiCompatibleProvider } from "./openAiCompatible";
import { openAiProvider } from "./openai";
import { openRouterProvider } from "./openrouter";
import type { AiProviderDefinition } from "./types";
export { modelSupportsImageInput } from "./imageInput";

export const AI_PROVIDER_DEFINITIONS: AiProviderDefinition[] = [
  openAiProvider,
  anthropicProvider,
  openRouterProvider,
  deepSeekProvider,
  geminiProvider,
  grokProvider,
  azureOpenAiProvider,
  liteLlmProvider,
  githubCopilotProvider,
  ollamaProvider,
  nvidiaProvider,
  openAiCompatibleProvider,
];

export type {
  AiModelOption,
  AiProviderCapability,
  AiProviderDefinition,
  AiProviderSettingsField,
} from "./types";
