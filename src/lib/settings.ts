import { useEffect } from "react";

import { useWorkspaceStore } from "../store";
import { invokeCommand, isTauriRuntime } from "./tauri";

// Stable keychain owner id for the OpenAI-compatible AI API key. Lives in the
// settings module so both bootstrap and the Settings UI can reference one
// canonical name without an App.tsx -> SettingsPage import cycle.
export const AI_PROVIDER_SECRET_OWNER_ID = "openai-compatible-provider";

// Loads persisted settings from the Tauri backend into the workspace store.
// Combines the previously separate per-key effects into one parallel load so
// new settings can be added in one place instead of cloning a useEffect each
// time. Bootstrap is best-effort: any single load failure is ignored so the
// app still renders with the in-memory defaults from `sample-data`.
export function useBootstrapSettings() {
  const setGeneralSettings = useWorkspaceStore(
    (state) => state.setGeneralSettings,
  );
  const setTerminalSettings = useWorkspaceStore(
    (state) => state.setTerminalSettings,
  );
  const setAppearanceSettings = useWorkspaceStore(
    (state) => state.setAppearanceSettings,
  );
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);
  const setAiProviderSettings = useWorkspaceStore(
    (state) => state.setAiProviderSettings,
  );
  const setAiProviderHasApiKey = useWorkspaceStore(
    (state) => state.setAiProviderHasApiKey,
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;

    const swallow = (_error: unknown) => undefined;

    void invokeCommand("get_general_settings")
      .then((settings) => {
        if (!disposed) setGeneralSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("get_terminal_settings")
      .then((settings) => {
        if (!disposed) setTerminalSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("get_appearance_settings")
      .then((settings) => {
        if (!disposed) setAppearanceSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("get_ssh_settings")
      .then((settings) => {
        if (!disposed) setSshSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("get_sftp_settings")
      .then((settings) => {
        if (!disposed) setSftpSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("get_ai_provider_settings")
      .then((settings) => {
        if (!disposed) setAiProviderSettings(settings);
      })
      .catch(swallow);

    void invokeCommand("secret_exists", {
      request: {
        kind: "aiApiKey",
        ownerId: AI_PROVIDER_SECRET_OWNER_ID,
      },
    })
      .then((presence) => {
        if (!disposed) setAiProviderHasApiKey(presence.exists);
      })
      .catch(swallow);

    return () => {
      disposed = true;
    };
  }, [
    setAiProviderHasApiKey,
    setAiProviderSettings,
    setGeneralSettings,
    setAppearanceSettings,
    setSftpSettings,
    setSshSettings,
    setTerminalSettings,
  ]);
}
