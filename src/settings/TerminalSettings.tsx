import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { TerminalCursorStyle, TerminalSettings as TerminalSettingsType } from "../types";

function normalizeTerminalSettingsDraft(settings: TerminalSettingsType): TerminalSettingsType {
  if (!settings.fontFamily.trim()) {
    throw new Error("Font family is required.");
  }
  if (!settings.defaultShell.trim()) {
    throw new Error("Default shell is required.");
  }
  if (!Number.isFinite(settings.fontSize) || settings.fontSize < 8 || settings.fontSize > 32) {
    throw new Error("Terminal font size must be between 8 and 32.");
  }
  if (!Number.isFinite(settings.lineHeight) || settings.lineHeight < 1 || settings.lineHeight > 2) {
    throw new Error("Terminal line height must be between 1.0 and 2.0.");
  }
  if (
    !Number.isFinite(settings.scrollbackLines) ||
    settings.scrollbackLines < 100 ||
    settings.scrollbackLines > 100_000
  ) {
    throw new Error("Terminal scrollback must be between 100 and 100000 lines.");
  }

  return {
    ...settings,
    fontFamily: settings.fontFamily.trim(),
    fontSize: Math.round(settings.fontSize),
    lineHeight: Number(settings.lineHeight.toFixed(2)),
    scrollbackLines: Math.round(settings.scrollbackLines),
    defaultShell: settings.defaultShell.trim(),
  };
}

export function TerminalSettings() {
  const { t } = useTranslation();
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const [draft, setDraft] = useState(terminalSettings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(terminalSettings);

  useEffect(() => {
    setDraft(terminalSettings);
  }, [terminalSettings]);

  async function handleSave() {
    try {
      setError("");
      setStatus("");
      const nextSettings = normalizeTerminalSettingsDraft(draft);
      const saved = isTauriRuntime()
        ? await invokeCommand("update_terminal_settings", { request: nextSettings })
        : nextSettings;
      setTerminalSettings(saved);
      setDraft(saved);
      setStatus(t("settings.terminalSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-title">
          <ConnectionIcon className="settings-section-icon" size={34} type="local" />
          <div>
            <p className="panel-label">{t("settings.sectionTerminal")}</p>
            <h2>{t("settings.terminalBehavior")}</h2>
          </div>
        </div>
        <button
          className="toolbar-button"
          disabled={!hasChanges}
          onClick={() => void handleSave()}
          type="button"
        >
          <Save size={15} />
          {t("settings.save")}
        </button>
      </div>

      <div className="form-grid three-columns">
        <label>
          <span>{t("settings.fontFamily")}</span>
          <input
            onChange={(event) => {
              const fontFamily = event.currentTarget.value;
              setDraft((settings) => ({
                ...settings,
                fontFamily,
              }));
            }}
            value={draft.fontFamily}
          />
        </label>
        <label>
          <span>{t("settings.fontSize")}</span>
          <input
            inputMode="numeric"
            max={32}
            min={8}
            onChange={(event) => {
              const fontSize = Number(event.currentTarget.value);
              setDraft((settings) => ({
                ...settings,
                fontSize,
              }));
            }}
            type="number"
            value={draft.fontSize}
          />
        </label>
        <label>
          <span>{t("settings.lineHeight")}</span>
          <input
            max={2}
            min={1}
            onChange={(event) => {
              const lineHeight = Number(event.currentTarget.value);
              setDraft((settings) => ({
                ...settings,
                lineHeight,
              }));
            }}
            step={0.05}
            type="number"
            value={draft.lineHeight}
          />
        </label>
      </div>

      <div className="form-grid three-columns">
        <label>
          <span>{t("settings.scrollbackLines")}</span>
          <input
            inputMode="numeric"
            max={100000}
            min={100}
            onChange={(event) => {
              const scrollbackLines = Number(event.currentTarget.value);
              setDraft((settings) => ({
                ...settings,
                scrollbackLines,
              }));
            }}
            step={100}
            type="number"
            value={draft.scrollbackLines}
          />
          <small className="field-hint">{t("settings.scrollbackHint")}</small>
        </label>
        <label>
          <span>{t("settings.cursorStyle")}</span>
          <select
            onChange={(event) => {
              const cursorStyle = event.currentTarget.value as TerminalCursorStyle;
              setDraft((settings) => ({
                ...settings,
                cursorStyle,
              }));
            }}
            value={draft.cursorStyle}
          >
            <option value="block">{t("settings.block")}</option>
            <option value="bar">{t("settings.bar")}</option>
            <option value="underline">{t("settings.underline")}</option>
          </select>
        </label>
        <label>
          <span>{t("settings.defaultShell")}</span>
          <select
            onChange={(event) => {
              const defaultShell = event.currentTarget.value;
              setDraft((settings) => ({
                ...settings,
                defaultShell,
              }));
            }}
            value={draft.defaultShell}
          >
            <option value="powershell.exe">{t("settings.powerShell")}</option>
            <option value="cmd.exe">{t("settings.commandPrompt")}</option>
            <option value="wsl.exe">{t("settings.wsl")}</option>
          </select>
        </label>
      </div>

      <div className="settings-toggles">
        <label>
          <input
            checked={draft.copyOnSelect}
            onChange={(event) => {
              const copyOnSelect = event.currentTarget.checked;
              setDraft((settings) => ({
                ...settings,
                copyOnSelect,
              }));
            }}
            type="checkbox"
          />
          {t("settings.copyOnSelect")}
        </label>
        <label>
          <input
            checked={draft.confirmMultilinePaste}
            onChange={(event) => {
              const confirmMultilinePaste = event.currentTarget.checked;
              setDraft((settings) => ({
                ...settings,
                confirmMultilinePaste,
              }));
            }}
            type="checkbox"
          />
          {t("settings.confirmMultilinePaste")}
        </label>
      </div>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
    </section>
  );
}
