export function shouldShowStoredAiProviderKeyMask({
  apiKeyDraft,
  hasProviderApiKey,
  isInputFocused,
}: {
  apiKeyDraft: string;
  hasProviderApiKey: boolean;
  isInputFocused: boolean;
}) {
  return hasProviderApiKey && !isInputFocused && apiKeyDraft.length === 0;
}
