import { shouldShowStoredAiProviderKeyMask } from "./aiProviderKeyField.ts";

if (
  shouldShowStoredAiProviderKeyMask({
    apiKeyDraft: "",
    hasProviderApiKey: false,
    isInputFocused: false,
  })
) {
  throw new Error("Provider API key field must stay empty when the selected provider has no saved key.");
}

if (
  !shouldShowStoredAiProviderKeyMask({
    apiKeyDraft: "",
    hasProviderApiKey: true,
    isInputFocused: false,
  })
) {
  throw new Error("Provider API key field should show a mask when the selected provider has a saved key.");
}

if (
  shouldShowStoredAiProviderKeyMask({
    apiKeyDraft: "typed-key",
    hasProviderApiKey: true,
    isInputFocused: false,
  })
) {
  throw new Error("Typed provider API key drafts should not be replaced by the stored-key mask.");
}
