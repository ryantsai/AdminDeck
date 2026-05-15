import { groupCredentialsForSettings } from "./credentialGroups.ts";
import { aiProviderSecretOwnerId } from "../lib/settings.ts";
import type { StoredCredentialSummary } from "../types";

if (aiProviderSecretOwnerId("openai") !== "ai-provider:openai") {
  throw new Error("OpenAI should use its own AI provider key owner.");
}

if (aiProviderSecretOwnerId("openrouter") !== "ai-provider:openrouter") {
  throw new Error("OpenRouter should use its own AI provider key owner.");
}

if (aiProviderSecretOwnerId("openai") === aiProviderSecretOwnerId("openrouter")) {
  throw new Error("AI provider keys must not share one keychain owner.");
}

const rows: StoredCredentialSummary[] = [
  {
    id: "ai",
    kind: "aiApiKey",
    secretKind: "aiApiKey",
    ownerId: "openai-compatible-provider",
    label: "AI key",
    metadataSource: "settings",
    exists: true,
  },
  {
    id: "widget",
    kind: "widgetSecret",
    secretKind: "widgetSecret",
    ownerId: "dashboard-widget-secret:inst:key",
    label: "Widget key",
    metadataSource: "dashboardWidgetInstance",
    exists: true,
  },
];

const grouped = groupCredentialsForSettings(rows);

if (grouped.widgetCredentials.length !== 1 || grouped.widgetCredentials[0]?.id !== "widget") {
  throw new Error("Widget credentials should be exposed in their own Settings group.");
}

if (grouped.storedCredentials.length !== 1 || grouped.storedCredentials[0]?.id !== "ai") {
  throw new Error("Non-widget credentials should remain in the general Settings group.");
}
