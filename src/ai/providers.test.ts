import { providerDefaultsFor, validateAiProviderForChat } from "./providers";

const copilotSettings = providerDefaultsFor("github-copilot");

try {
  validateAiProviderForChat(copilotSettings, false);
  throw new Error("GitHub Copilot should be blocked until the SDK OAuth bridge exists.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Copilot SDK OAuth bridge")) {
    throw new Error(`GitHub Copilot should fail with the SDK OAuth bridge requirement, got: ${message}`);
  }
}
