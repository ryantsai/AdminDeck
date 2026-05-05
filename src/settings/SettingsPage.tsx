import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Info,
  Languages,
  Monitor,
  Network,
  PackageOpen,
  Palette,
  RotateCcw,
  Save,
  Server,
  Settings as SettingsIcon,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  AI_PROVIDER_DEFINITIONS,
  getAiProviderDefinition,
  normalizeAiProviderDraft,
  providerDefaultsFor,
  type AiProviderDefinition,
  type AiProviderSettingsField,
} from "../ai/providers";
import { AI_PROVIDER_SECRET_OWNER_ID } from "../lib/settings";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { defaultAppearanceSettings } from "../sample-data";
import { ABOUT_PRODUCT, OPEN_SOURCE_COMPONENT_GROUPS, type OpenSourceComponent } from "./aboutData";
import { useWorkspaceStore } from "../store";
import type {
  AiProviderKind,
  AiProviderSettings,
  AiReasoningEffort,
  AppearanceSettings,
  TerminalCursorStyle,
  TerminalSettings,
} from "../types";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, switchLanguage, detectLanguage, type SupportedLanguage } from "../i18n/config";

// Re-exported for any external callers; new code should import from
// `lib/settings` directly so the keychain owner id has one source of truth.
export { AI_PROVIDER_SECRET_OWNER_ID };

type SettingsSectionId =
  | "general-settings"
  | "appearance-settings"
  | "assistant-settings"
  | "ssh-settings"
  | "terminal-settings"
  | "rdp-settings"
  | "vnc-settings"
  | "about-settings";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "general-settings",
  "appearance-settings",
  "assistant-settings",
  "ssh-settings",
  "terminal-settings",
  "rdp-settings",
  "vnc-settings",
  "about-settings",
];

type PlannedSetting = {
  label: string;
  value: string;
  hint?: string;
};

const RDP_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: "Resolution",
    value: "Fit workspace bounds",
    hint: "Maps to DesktopWidth, DesktopHeight, SmartSizing, and display sync.",
  },
  {
    label: "Color depth",
    value: "32-bit",
    hint: "Uses the ActiveX ColorDepth property.",
  },
  {
    label: "Bandwidth profile",
    value: "Auto detect",
    hint: "Uses bandwidth detection or NetworkConnectionType classes instead of a raw bitrate cap.",
  },
  {
    label: "Bitmap cache",
    value: "Persistent cache planned",
    hint: "Maps to BitmapPersistence and CachePersistenceActive.",
  },
  {
    label: "Performance flags",
    value: "Balanced",
    hint: "Controls wallpaper, full-window drag, menu animations, themes, cursors, and font smoothing.",
  },
  {
    label: "Enhanced graphics",
    value: "Prefer when supported",
    hint: "Uses RDP performance flags on capable servers.",
  },
];

const VNC_QUALITY_SETTINGS: PlannedSetting[] = [
  {
    label: "Quality",
    value: "Auto",
    hint: "Let the client adapt encoding and pixel format to link speed.",
  },
  {
    label: "Preferred encoding",
    value: "Tight, then ZRLE",
    hint: "Current client also advertises CopyRect, Raw, cursor, and desktop-size support.",
  },
  {
    label: "JPEG quality",
    value: "8 / 9",
    hint: "Useful for Tight/JPEG-style encodings.",
  },
  {
    label: "Compression",
    value: "2 / 9",
    hint: "Higher values reduce bandwidth at a CPU cost.",
  },
  {
    label: "Color level",
    value: "Full color",
    hint: "Can degrade to 256, 64, or 8 colors for slower links.",
  },
  {
    label: "Remote resize",
    value: "Follow server support",
    hint: "Depends on the VNC server supporting desktop-size updates.",
  },
];

export function SettingsPage({
  onBack,
  onResetLayout,
}: {
  onBack: () => void;
  onResetLayout: () => void;
}) {
  const { t } = useTranslation();
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const aiProviderHasApiKey = useWorkspaceStore((state) => state.aiProviderHasApiKey);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const setAppearanceSettings = useWorkspaceStore((state) => state.setAppearanceSettings);
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const [terminalDraft, setTerminalDraft] = useState(terminalSettings);
  const [appearanceDraft, setAppearanceDraft] = useState(appearanceSettings);
  const [aiDraft, setAiDraft] = useState(aiProviderSettings);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [appearanceStatus, setAppearanceStatus] = useState("");
  const [appearanceError, setAppearanceError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiError, setAiError] = useState("");
  const [activeSectionId, setActiveSectionId] =
    useState<SettingsSectionId>("general-settings");
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(detectLanguage);
  const hasTerminalChanges = JSON.stringify(terminalDraft) !== JSON.stringify(terminalSettings);
  const hasAppearanceChanges =
    JSON.stringify(appearanceDraft) !== JSON.stringify(appearanceSettings);
  const hasAiChanges =
    JSON.stringify(aiDraft) !== JSON.stringify(aiProviderSettings) || apiKeyDraft.trim().length > 0;
  const aiProviderDefinition = getAiProviderDefinition(aiDraft.providerKind);

  useEffect(() => {
    setTerminalDraft(terminalSettings);
  }, [terminalSettings]);

  useEffect(() => {
    setAppearanceDraft(appearanceSettings);
  }, [appearanceSettings]);

  useEffect(() => {
    setAiDraft(aiProviderSettings);
  }, [aiProviderSettings]);

  useEffect(() => {
    function syncActiveSectionFromHash() {
      const sectionId = window.location.hash.slice(1);
      if (isSettingsSectionId(sectionId)) {
        setActiveSectionId(sectionId);
        document.getElementById(sectionId)?.scrollIntoView();
      }
    }

    syncActiveSectionFromHash();
    window.addEventListener("hashchange", syncActiveSectionFromHash);
    return () => window.removeEventListener("hashchange", syncActiveSectionFromHash);
  }, []);

  async function handleSaveTerminalSettings() {
    try {
      setError("");
      setStatus("");
      const nextSettings = normalizeTerminalSettingsDraft(terminalDraft);
      const saved = isTauriRuntime()
        ? await invokeCommand("update_terminal_settings", { request: nextSettings })
        : nextSettings;
      setTerminalSettings(saved);
      setTerminalDraft(saved);
      setStatus(t("settings.terminalSaved"));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSaveAppearanceSettings() {
    try {
      setAppearanceError("");
      setAppearanceStatus("");
      const nextSettings = normalizeAppearanceSettingsDraft(appearanceDraft);
      const saved = isTauriRuntime()
        ? await invokeCommand("update_appearance_settings", { request: nextSettings })
        : nextSettings;
      setAppearanceSettings(saved);
      setAppearanceDraft(saved);
      setAppearanceStatus(t("settings.appearanceSaved"));
    } catch (error) {
      setAppearanceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleResetAppearanceSettings() {
    try {
      setAppearanceError("");
      setAppearanceStatus("");
      const saved = isTauriRuntime()
        ? await invokeCommand("update_appearance_settings", {
            request: defaultAppearanceSettings,
          })
        : defaultAppearanceSettings;
      setAppearanceSettings(saved);
      setAppearanceDraft(saved);
      setAppearanceStatus(t("settings.appearanceReset"));
    } catch (error) {
      setAppearanceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSaveAiProviderSettings() {
    try {
      setAiError("");
      setAiStatus("");
      const nextSettings = normalizeAiProviderDraft(aiDraft);

      if (apiKeyDraft.trim()) {
        if (isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: {
              kind: "aiApiKey",
              ownerId: AI_PROVIDER_SECRET_OWNER_ID,
              secret: apiKeyDraft.trim(),
            },
          });
        }
        setAiProviderHasApiKey(true);
        setApiKeyDraft("");
      }

      const saved = isTauriRuntime()
        ? await invokeCommand("update_ai_provider_settings", { request: nextSettings })
        : nextSettings;
      setAiProviderSettings(saved);
      setAiDraft(saved);
      setAiStatus(t("settings.aiProviderSaved"));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleClearAiProviderSettings() {
    const shouldClear = window.confirm(
      t("settings.clearAiConfirm"),
    );
    if (!shouldClear) {
      return;
    }

    try {
      setAiError("");
      setAiStatus("");
      const defaults = providerDefaultsFor("openai");
      if (isTauriRuntime()) {
        await invokeCommand("delete_secret", {
          request: {
            kind: "aiApiKey",
            ownerId: AI_PROVIDER_SECRET_OWNER_ID,
          },
        });
      }
      const saved = isTauriRuntime()
        ? await invokeCommand("update_ai_provider_settings", { request: defaults })
        : defaults;
      setAiProviderSettings(saved);
      setAiDraft(saved);
      setApiKeyDraft("");
      setAiProviderHasApiKey(false);
      setAiStatus(t("settings.aiProviderCleared"));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleAiProviderKindChange(providerKind: AiProviderKind) {
    const defaults = providerDefaultsFor(providerKind);
    setAiDraft((settings) => ({
      ...settings,
      providerKind,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      reasoningEffort: defaults.reasoningEffort,
    }));
    setApiKeyDraft("");
    setAiStatus("");
    setAiError("");
  }

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="panel-label">AdminDeck</p>
          <h1>{t("settings.title")}</h1>
        </div>
        <button className="toolbar-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          {t("settings.workspace")}
        </button>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav" aria-label={t("settings.sectionsNav")}>
          <a
            href="#general-settings"
            className={settingsNavItemClass("general-settings", activeSectionId)}
            onClick={() => setActiveSectionId("general-settings")}
          >
            <SettingsIcon size={16} />
            <span>{t("settings.sectionGeneral")}</span>
          </a>
          <a
            href="#appearance-settings"
            className={settingsNavItemClass("appearance-settings", activeSectionId)}
            onClick={() => setActiveSectionId("appearance-settings")}
          >
            <Palette size={16} />
            <span>{t("settings.sectionAppearance")}</span>
          </a>
          <a
            href="#assistant-settings"
            className={settingsNavItemClass("assistant-settings", activeSectionId)}
            onClick={() => setActiveSectionId("assistant-settings")}
          >
            <Bot size={16} />
            <span>{t("settings.sectionAiAssistant")}</span>
          </a>
          <a
            href="#ssh-settings"
            className={settingsNavItemClass("ssh-settings", activeSectionId)}
            onClick={() => setActiveSectionId("ssh-settings")}
          >
            <Server size={16} />
            <span>{t("settings.sectionSsh")}</span>
          </a>
          <a
            href="#terminal-settings"
            className={settingsNavItemClass("terminal-settings", activeSectionId)}
            onClick={() => setActiveSectionId("terminal-settings")}
          >
            <Terminal size={16} />
            <span>{t("settings.sectionTerminal")}</span>
          </a>
          <a
            href="#rdp-settings"
            className={settingsNavItemClass("rdp-settings", activeSectionId)}
            onClick={() => setActiveSectionId("rdp-settings")}
          >
            <Monitor size={16} />
            <span>{t("settings.sectionRdp")}</span>
          </a>
          <a
            href="#vnc-settings"
            className={settingsNavItemClass("vnc-settings", activeSectionId)}
            onClick={() => setActiveSectionId("vnc-settings")}
          >
            <Network size={16} />
            <span>{t("settings.sectionVnc")}</span>
          </a>
          <a
            href="#about-settings"
            className={settingsNavItemClass("about-settings", activeSectionId)}
            onClick={() => setActiveSectionId("about-settings")}
          >
            <Info size={16} />
            <span>{t("settings.sectionAbout")}</span>
          </a>
        </aside>

        <section className="settings-content" aria-label={t("settings.settingsContent")}>
          <section className="settings-card settings-section" id="general-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionGeneral")}</p>
                <h2>{t("settings.generalDefaults")}</h2>
              </div>
            </div>

            <div className="form-grid">
              <label>
                <span><Languages size={17} /> {t("settings.language")}</span>
                <select
                  value={currentLanguage}
                  onChange={(event) => {
                    const lang = event.currentTarget.value as SupportedLanguage;
                    setCurrentLanguage(lang);
                    void switchLanguage(lang);
                  }}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {t(`languages.${lang}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="settings-card settings-section" id="appearance-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionAppearance")}</p>
                <h2>{t("settings.appearanceInterface")}</h2>
              </div>
              <div className="settings-header-actions">
                <button
                  className="toolbar-button"
                  disabled={!hasAppearanceChanges}
                  onClick={() => void handleSaveAppearanceSettings()}
                  type="button"
                >
                  <Save size={15} />
                  {t("settings.save")}
                </button>
                <button
                  className="toolbar-button"
                  onClick={() => void handleResetAppearanceSettings()}
                  type="button"
                >
                  <RotateCcw size={15} />
                  {t("settings.resetFont")}
                </button>
              </div>
            </div>
            <div className="form-grid">
              <label>
                <span>{t("settings.appUiFontFamily")}</span>
                <input
                  list="app-ui-font-options"
                  onChange={(event) => {
                    const appFontFamily = event.currentTarget.value;
                    setAppearanceDraft((settings) => ({
                      ...settings,
                      appFontFamily,
                    }));
                  }}
                  value={appearanceDraft.appFontFamily}
                />
                <datalist id="app-ui-font-options">
                  <option value={defaultAppearanceSettings.appFontFamily}>{t("settings.satoshi")}</option>
                  <option value='Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'>
                    {t("settings.systemSans")}
                  </option>
                  <option value='"Segoe UI Variable", "Segoe UI", ui-sans-serif, system-ui, sans-serif'>
                    {t("settings.segoeUiVariable")}
                  </option>
                </datalist>
                <small className="field-hint">
                  {t("settings.defaultFontHint")}
                </small>
              </label>
              <SettingsSummary label={t("settings.activeUiFont")} value={appearanceDraft.appFontFamily} />
            </div>
            <div className="settings-reset-layout">
              <div>
                <strong>{t("settings.layout")}</strong>
                <span>{t("settings.resetLayoutDescription")}</span>
              </div>
              <button className="toolbar-button" onClick={onResetLayout} type="button">
                <RotateCcw size={15} />
                {t("settings.resetLayout")}
              </button>
            </div>
            <div className="settings-placeholder-list">
              <button className="settings-placeholder-item" type="button">
                <Palette size={17} />
                <span>{t("settings.colorScheme")}</span>
                <strong>{t("settings.toBeImplemented")}</strong>
              </button>
            </div>
            {appearanceStatus ? (
              <p className="settings-status success">{appearanceStatus}</p>
            ) : null}
            {appearanceError ? <p className="settings-status error">{appearanceError}</p> : null}
          </section>

          <section className="settings-card settings-section" id="assistant-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionAiAssistant")}</p>
                <h2>{t("settings.aiProvider")}</h2>
              </div>
              <div className="settings-header-actions">
                <button
                  className="toolbar-button"
                  disabled={!hasAiChanges}
                  onClick={() => void handleSaveAiProviderSettings()}
                  type="button"
                >
                  <Save size={15} />
                  {t("settings.save")}
                </button>
                <button
                  className="toolbar-button"
                  onClick={() => void handleClearAiProviderSettings()}
                  type="button"
                >
                  <Trash2 size={15} />
                  {t("settings.clearAllSettings")}
                </button>
              </div>
            </div>

            <div className="form-grid ai-provider-selector-grid">
              <label>
                <span>{t("settings.provider")}</span>
                <select
                  onChange={(event) =>
                    handleAiProviderKindChange(event.currentTarget.value as AiProviderKind)
                  }
                  value={aiDraft.providerKind}
                >
                  {AI_PROVIDER_DEFINITIONS.map((definition) => (
                    <option key={definition.kind} value={definition.kind}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ai-provider-fields">
              {aiProviderDefinition.settingsFields.map((field) => (
                <AiProviderSettingsFieldControl
                  apiKeyDraft={apiKeyDraft}
                  definition={aiProviderDefinition}
                  draft={aiDraft}
                  field={field}
                  hasApiKey={aiProviderHasApiKey}
                  key={field}
                  onApiKeyDraftChange={setApiKeyDraft}
                  onDraftChange={(patch) =>
                    setAiDraft((settings) => ({
                      ...settings,
                      ...patch,
                    }))
                  }
                />
              ))}
              <AiOutputLanguageControl
                draft={aiDraft}
                onDraftChange={(patch) =>
                  setAiDraft((settings) => ({
                    ...settings,
                    ...patch,
                  }))
                }
              />
            </div>

            <div className="settings-summary-grid compact">
              <SettingsSummary label={t("settings.activeEndpoint")} value={formatProviderHost(aiDraft.baseUrl)} />
              <SettingsSummary
                label={t("settings.capabilities")}
                value={aiProviderDefinition.capabilities
                  .map(formatAiProviderCapability)
                  .join(", ")}
              />
              <SettingsSummary
                label={t("settings.reasoning")}
                value={formatReasoningEffort(aiDraft.reasoningEffort)}
              />
            </div>
            {aiStatus ? <p className="settings-status success">{aiStatus}</p> : null}
            {aiError ? <p className="settings-status error">{aiError}</p> : null}
          </section>

          <section className="settings-card settings-section" id="ssh-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionSsh")}</p>
                <h2>{t("settings.sshDefaults")}</h2>
              </div>
            </div>
            <div className="settings-summary-grid">
              <SettingsSummary label={t("settings.defaultUser")} value={sshSettings.defaultUser} />
              <SettingsSummary label={t("settings.defaultPort")} value={String(sshSettings.defaultPort)} />
              <SettingsSummary label={t("settings.defaultKey")} value={sshSettings.defaultKeyPath || t("settings.notSet")} />
              <SettingsSummary label={t("settings.proxyJump")} value={sshSettings.defaultProxyJump || t("settings.notSet")} />
              <SettingsSummary
                label={t("settings.sftpOverwrite")}
                value={sftpSettings.overwriteBehavior === "overwrite" ? t("settings.overwrite") : t("settings.fail")}
              />
            </div>
          </section>

          <section className="settings-card settings-section" id="terminal-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionTerminal")}</p>
                <h2>{t("settings.terminalBehavior")}</h2>
              </div>
              <button
                className="toolbar-button"
                disabled={!hasTerminalChanges}
                onClick={() => void handleSaveTerminalSettings()}
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
                    setTerminalDraft((settings) => ({
                      ...settings,
                      fontFamily,
                    }));
                  }}
                  value={terminalDraft.fontFamily}
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
                    setTerminalDraft((settings) => ({
                      ...settings,
                      fontSize,
                    }));
                  }}
                  type="number"
                  value={terminalDraft.fontSize}
                />
              </label>
              <label>
                <span>{t("settings.lineHeight")}</span>
                <input
                  max={2}
                  min={1}
                  onChange={(event) => {
                    const lineHeight = Number(event.currentTarget.value);
                    setTerminalDraft((settings) => ({
                      ...settings,
                      lineHeight,
                    }));
                  }}
                  step={0.05}
                  type="number"
                  value={terminalDraft.lineHeight}
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
                    setTerminalDraft((settings) => ({
                      ...settings,
                      scrollbackLines,
                    }));
                  }}
                  step={100}
                  type="number"
                  value={terminalDraft.scrollbackLines}
                />
                <small className="field-hint">{t("settings.scrollbackHint")}</small>
              </label>
              <label>
                <span>{t("settings.cursorStyle")}</span>
                <select
                  onChange={(event) => {
                    const cursorStyle = event.currentTarget.value as TerminalCursorStyle;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      cursorStyle,
                    }));
                  }}
                  value={terminalDraft.cursorStyle}
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
                    setTerminalDraft((settings) => ({
                      ...settings,
                      defaultShell,
                    }));
                  }}
                  value={terminalDraft.defaultShell}
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
                  checked={terminalDraft.copyOnSelect}
                  onChange={(event) => {
                    const copyOnSelect = event.currentTarget.checked;
                    setTerminalDraft((settings) => ({
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
                  checked={terminalDraft.confirmMultilinePaste}
                  onChange={(event) => {
                    const confirmMultilinePaste = event.currentTarget.checked;
                    setTerminalDraft((settings) => ({
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

          <section className="settings-card settings-section" id="rdp-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionRdp")}</p>
                <h2>{t("settings.qualityDefaults")}</h2>
              </div>
            </div>
            <PlannedSettingsGrid settings={RDP_QUALITY_SETTINGS} />
          </section>

          <section className="settings-card settings-section" id="vnc-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionVnc")}</p>
                <h2>{t("settings.qualityDefaults")}</h2>
              </div>
            </div>
            <PlannedSettingsGrid settings={VNC_QUALITY_SETTINGS} />
          </section>

          <section className="settings-card settings-section" id="about-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">{t("settings.sectionAbout")}</p>
                <h2>{ABOUT_PRODUCT.name}</h2>
              </div>
              <a
                className="toolbar-button"
                href={ABOUT_PRODUCT.repositoryUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={15} />
                {t("settings.github")}
              </a>
            </div>

            <div className="about-hero">
              <div>
                <strong>{ABOUT_PRODUCT.name}</strong>
                <span>{ABOUT_PRODUCT.slogan}</span>
              </div>
              <PackageOpen size={34} />
            </div>

            <div className="settings-summary-grid">
              <SettingsSummary label={t("settings.developer")} value={ABOUT_PRODUCT.developer} />
              <SettingsSummary label={t("settings.version")} value={ABOUT_PRODUCT.version} />
              <SettingsSummary label={t("settings.license")} value={ABOUT_PRODUCT.license} />
              <SettingsSummary label={t("settings.repository")} value={ABOUT_PRODUCT.repositoryUrl} />
            </div>

            <div className="open-source-panel">
              <div className="open-source-panel-header">
                <div>
                  <strong>{t("settings.openSourceComponents")}</strong>
                  <span>
                    {t("settings.openSourceComponents")}
                  </span>
                </div>
                <span>{openSourceComponentCount()} components</span>
              </div>
              <div className="open-source-groups">
                {OPEN_SOURCE_COMPONENT_GROUPS.map((group) => (
                  <OpenSourceComponentGroup
                    components={group.components}
                    key={group.label}
                    label={group.label}
                  />
                ))}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function AiProviderSettingsFieldControl({
  apiKeyDraft,
  definition,
  draft,
  field,
  hasApiKey,
  onApiKeyDraftChange,
  onDraftChange,
}: {
  apiKeyDraft: string;
  definition: AiProviderDefinition;
  draft: AiProviderSettings;
  field: AiProviderSettingsField;
  hasApiKey: boolean;
  onApiKeyDraftChange: (value: string) => void;
  onDraftChange: (patch: Partial<AiProviderSettings>) => void;
}) {
  const { t } = useTranslation();

  switch (field) {
    case "baseUrl":
      return (
        <label>
          <span>{t("settings.endpoint")}</span>
          <input
            onChange={(event) => onDraftChange({ baseUrl: event.currentTarget.value })}
            readOnly={!definition.allowsCustomBaseUrl}
            value={draft.baseUrl}
          />
        </label>
      );
    case "model": {
      const datalistId = `ai-provider-model-options-${definition.kind}`;
      return (
        <label>
          <span>{t("settings.model")}</span>
          <input
            list={datalistId}
            onChange={(event) => onDraftChange({ model: event.currentTarget.value })}
            value={draft.model}
          />
          <datalist id={datalistId}>
            {definition.modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </datalist>
        </label>
      );
    }
    case "reasoningEffort":
      return (
        <label>
          <span>{t("settings.reasoningEffort")}</span>
          <select
            onChange={(event) =>
              onDraftChange({ reasoningEffort: event.currentTarget.value as AiReasoningEffort })
            }
            value={draft.reasoningEffort}
          >
            {definition.reasoningEfforts.map((effort) => (
              <option key={effort} value={effort}>
                {formatReasoningEffort(effort)}
              </option>
            ))}
          </select>
        </label>
      );
    case "apiKey":
      return (
        <label>
          <span>{definition.apiKeyLabel}</span>
          <input
            autoComplete="off"
            disabled={!definition.requiresApiKey}
            onChange={(event) => onApiKeyDraftChange(event.currentTarget.value)}
            placeholder={hasApiKey ? t("settings.save") : definition.apiKeyLabel}
            type="password"
            value={apiKeyDraft}
          />
        </label>
      );
    default:
      return null;
  }
}

function AiOutputLanguageControl({
  draft,
  onDraftChange,
}: {
  draft: AiProviderSettings;
  onDraftChange: (patch: Partial<AiProviderSettings>) => void;
}) {
  const { t } = useTranslation();
  const datalistId = "ai-output-language-options";
  const languageNames = SUPPORTED_LANGUAGES.map((code) => t(`languages.${code}` as never));

  return (
    <label>
      <span>{t("settings.outputLanguage")}</span>
      <input
        list={datalistId}
        onChange={(event) => onDraftChange({ outputLanguage: event.currentTarget.value })}
        placeholder={t("settings.outputLanguageUiLanguage")}
        value={draft.outputLanguage}
      />
      <datalist id={datalistId}>
        {languageNames.map((name, index) => (
          <option key={SUPPORTED_LANGUAGES[index]} value={name} />
        ))}
      </datalist>
    </label>
  );
}

function SettingsSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlannedSettingsGrid({ settings }: { settings: readonly PlannedSetting[] }) {
  return (
    <div className="settings-summary-grid">
      {settings.map((setting) => (
        <div className="settings-summary-item planned-setting" key={setting.label}>
          <span>{setting.label}</span>
          <strong>{setting.value}</strong>
          {setting.hint ? <small>{setting.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

function settingsNavItemClass(sectionId: SettingsSectionId, activeSectionId: SettingsSectionId) {
  return `settings-nav-item${sectionId === activeSectionId ? " active" : ""}`;
}

function OpenSourceComponentGroup({
  components,
  label,
}: {
  components: readonly OpenSourceComponent[];
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="open-source-group">
      <h3>{label}</h3>
      <div className="open-source-table" role="table" aria-label={`${label} components`}>
        <div className="open-source-table-row header" role="row">
          <span role="columnheader">{t("settings.component")}</span>
          <span role="columnheader">{t("settings.version")}</span>
          <span role="columnheader">{t("settings.license")}</span>
          <span role="columnheader">{t("settings.role")}</span>
        </div>
        {components.map((component) => (
          <div className="open-source-table-row" key={component.name} role="row">
            <strong role="cell">{component.name}</strong>
            <span role="cell">{component.version}</span>
            <span role="cell">{component.license}</span>
            <span role="cell">{component.role}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function openSourceComponentCount() {
  return OPEN_SOURCE_COMPONENT_GROUPS.reduce(
    (count, group) => count + group.components.length,
    0,
  );
}

function formatAiProviderCapability(capability: string) {
  switch (capability) {
    case "toolCalling":
      return "tools";
    case "mcpReady":
      return "MCP ready";
    case "localRuntime":
      return "local";
    case "openAiCompatible":
      return "OpenAI compatible";
    default:
      return capability;
  }
}

function formatReasoningEffort(effort: AiReasoningEffort) {
  switch (effort) {
    case "default":
      return "Provider default";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "max":
      return "Max";
    default:
      return effort;
  }
}

function formatProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host || "OpenAI-compatible endpoint";
  } catch {
    return "OpenAI-compatible endpoint";
  }
}

function normalizeTerminalSettingsDraft(settings: TerminalSettings): TerminalSettings {
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

function normalizeAppearanceSettingsDraft(settings: AppearanceSettings): AppearanceSettings {
  if (!settings.appFontFamily.trim()) {
    throw new Error("App UI font family is required.");
  }

  return {
    ...settings,
    appFontFamily: settings.appFontFamily.trim(),
  };
}
