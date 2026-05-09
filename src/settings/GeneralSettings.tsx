import { useEffect, useState } from "react";
import {
  DatabaseBackup,
  FolderOpen,
  Languages,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  defaultAppearanceSettings,
  defaultAiProviderSettings,
  defaultGeneralSettings,
  defaultScreenshotSettings,
  defaultSftpSettings,
  defaultSshSettings,
  defaultTerminalSettings,
  defaultUrlSettings,
} from "../app-defaults";
import {
  SUPPORTED_LANGUAGES,
  switchLanguage,
  detectLanguage,
  type SupportedLanguage,
} from "../i18n/config";
import {
  invokeCommand,
  isTauriRuntime,
  openFilesystemPath,
  selectSettingsImportFile,
} from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import { AI_PROVIDER_SECRET_OWNER_ID } from "../lib/settings";
import { SettingsSectionHeader } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";

function formatBackupDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function GeneralSettings() {
  const { t } = useTranslation();
  const [currentLanguage, setCurrentLanguage] =
    useState<SupportedLanguage>(detectLanguage);
  const generalSettings = useWorkspaceStore((state) => state.generalSettings);
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
  const setScreenshotSettings = useWorkspaceStore((state) => state.setScreenshotSettings);
  const setUrlSettings = useWorkspaceStore((state) => state.setUrlSettings);
  const setAiProviderSettings = useWorkspaceStore(
    (state) => state.setAiProviderSettings,
  );
  const closeAllTabs = useWorkspaceStore((state) => state.closeAllTabs);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  const setAiProviderHasApiKey = useWorkspaceStore(
    (state) => state.setAiProviderHasApiKey,
  );
  const [draft, setDraft] = useState(generalSettings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(generalSettings);

  useEffect(() => {
    setDraft(generalSettings);
  }, [generalSettings]);

  async function handleSave() {
    try {
      setError("");
      setStatus("");
      const saved = isTauriRuntime()
        ? await invokeCommand("update_general_settings", { request: draft })
        : draft;
      setGeneralSettings(saved);
      setDraft(saved);
      setStatus(t("settings.generalDefaultsSaved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    }
  }

  async function handleBackupSettings() {
    setStatus("");
    setError("");
    try {
      const backup = await invokeCommand("backup_settings_database");
      setGeneralSettings({
        ...generalSettings,
        lastBackupAt: backup.createdAt,
      });
      setStatus(
        t("settings.backupSettingsComplete", { filename: backup.filename }),
      );
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : String(backupError),
      );
    }
  }

  async function handleOpenDatabaseFolder() {
    setStatus("");
    setError("");
    try {
      const path = await invokeCommand("get_database_folder");
      await openFilesystemPath(path);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  async function handleImportSettings() {
    setStatus("");
    setError("");
    try {
      const path = await selectSettingsImportFile({
        title: t("settings.importSettings"),
        filterName: t("settings.settingsExportFilter"),
      });
      if (!path) {
        setImportDialogOpen(false);
        return;
      }
      closeAllTabs();
      const snapshot = await invokeCommand("import_settings_database", {
        path,
      });
      setGeneralSettings(snapshot.generalSettings);
      setTerminalSettings(snapshot.terminalSettings);
      setAppearanceSettings(snapshot.appearanceSettings);
      setSshSettings(snapshot.sshSettings);
      setSftpSettings(snapshot.sftpSettings);
      setScreenshotSettings(snapshot.screenshotSettings);
      setUrlSettings(snapshot.urlSettings);
      setAiProviderSettings(snapshot.aiProviderSettings);
      window.dispatchEvent(
        new CustomEvent("kkterm:connection-tree-invalidated"),
      );
      setStatus(
        t("settings.importSettingsComplete", {
          filename: snapshot.backup.filename,
        }),
      );
      setImportDialogOpen(false);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : String(importError),
      );
    }
  }

  async function handleResetAllSettings() {
    setStatus("");
    setError("");
    try {
      closeAllTabs();
      resetAllLayouts();

      if (isTauriRuntime()) {
        const [
          general,
          terminal,
          appearance,
          ssh,
          sftp,
          screenshots,
          url,
          aiProvider,
        ] = await Promise.all([
          invokeCommand("update_general_settings", {
            request: defaultGeneralSettings,
          }),
          invokeCommand("update_terminal_settings", {
            request: defaultTerminalSettings,
          }),
          invokeCommand("update_appearance_settings", {
            request: defaultAppearanceSettings,
          }),
          invokeCommand("update_ssh_settings", { request: defaultSshSettings }),
          invokeCommand("update_sftp_settings", { request: defaultSftpSettings }),
          invokeCommand("update_screenshot_settings", {
            request: defaultScreenshotSettings,
          }),
          invokeCommand("update_url_settings", { request: defaultUrlSettings }),
          invokeCommand("update_ai_provider_settings", {
            request: defaultAiProviderSettings,
          }),
        ]);
        await invokeCommand("delete_secret", {
          request: {
            kind: "aiApiKey",
            ownerId: AI_PROVIDER_SECRET_OWNER_ID,
          },
        });
        setGeneralSettings(general);
        setTerminalSettings(terminal);
        setAppearanceSettings(appearance);
        setSshSettings(ssh);
        setSftpSettings(sftp);
        setScreenshotSettings(screenshots);
        setUrlSettings(url);
        setAiProviderSettings(aiProvider);
      } else {
        setGeneralSettings(defaultGeneralSettings);
        setTerminalSettings(defaultTerminalSettings);
        setAppearanceSettings(defaultAppearanceSettings);
        setSshSettings(defaultSshSettings);
        setSftpSettings(defaultSftpSettings);
        setScreenshotSettings(defaultScreenshotSettings);
        setUrlSettings(defaultUrlSettings);
        setAiProviderSettings(defaultAiProviderSettings);
      }

      setCurrentLanguage(detectLanguage());
      setAiProviderHasApiKey(false);
      window.dispatchEvent(
new CustomEvent("kkterm:connection-tree-invalidated"),
      );
      setStatus(t("settings.resetAllSettingsComplete"));
      setResetDialogOpen(false);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    }
  }

  const lastBackup = formatBackupDate(generalSettings.lastBackupAt);

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button
            className="toolbar-button"
            disabled={!hasChanges}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={15} />
            {t("settings.save")}
          </button>
        }
        icon={<SettingsIcon size={18} />}
        label={t("settings.sectionGeneral")}
        title={t("settings.generalDefaults")}
      />

      <div className="form-grid general-settings-grid">
        <label>
          <span>
            <Languages size={17} /> {t("settings.language")}
          </span>
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

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.workspaceAccess")}</legend>
        <div>
          <p className="field-hint">{t("settings.workspaceAccessHint")}</p>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.showConnectedConnectionsInRail}
              onChange={(checked) =>
                setDraft((s) => ({ ...s, showConnectedConnectionsInRail: checked }))
              }
            />
            <span>
              <strong>{t("settings.connectedConnectionsRail")}</strong>
              <small>{t("settings.connectedConnectionsRailHint")}</small>
            </span>
          </label>
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.allowClipboardRead}
              onChange={(checked) =>
                setDraft((s) => ({ ...s, allowClipboardRead: checked }))
              }
            />
            <span>
              <strong>{t("settings.allowClipboardRead")}</strong>
              <small>{t("settings.allowClipboardReadHint")}</small>
            </span>
          </label>
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.minimizeToTray}
              onChange={(checked) =>
                setDraft((s) => ({ ...s, minimizeToTray: checked }))
              }
            />
            <span>
              <strong>{t("settings.minimizeToTray")}</strong>
              <small>{t("settings.minimizeToTrayHint")}</small>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.settingsData")}</legend>
        <div>
          <p className="field-hint">
            {t("settings.lastBackup", {
              value: lastBackup ?? t("settings.lastBackupNever"),
            })}
          </p>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.autoBackupEnabled}
              onChange={(checked) =>
                setDraft((s) => ({ ...s, autoBackupEnabled: checked }))
              }
            />
            <span>
              <strong>{t("settings.autoBackup")}</strong>
              <small>{t("settings.autoBackupHint")}</small>
            </span>
          </label>
        </div>
        <div
          className="settings-data-actions"
          aria-label={t("settings.settingsDataActions")}
        >
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleBackupSettings()}
          >
            <DatabaseBackup size={16} />
            {t("settings.backupSettings")}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload size={16} />
            {t("settings.importSettings")}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleOpenDatabaseFolder()}
          >
            <FolderOpen size={16} />
            {t("settings.openDatabaseFolder")}
          </button>
          <button
            className="secondary-button danger"
            type="button"
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw size={16} />
            {t("settings.resetAllSettings")}
          </button>
        </div>
      </fieldset>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
      {importDialogOpen ? (
        <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
          <div
            aria-label={t("settings.importSettings")}
            aria-modal="true"
            className="connection-dialog settings-reset-dialog"
            role="dialog"
          >
            <header className="connection-dialog-header compact">
              <div>
                <p className="panel-label">{t("settings.sectionGeneral")}</p>
                <h2>{t("settings.importSettings")}</h2>
              </div>
            </header>
            <p className="field-hint">{t("settings.importSettingsConfirm")}</p>
            <div className="dialog-actions">
              <button
                className="approve-button"
                onClick={() => void handleImportSettings()}
                type="button"
              >
                <Upload size={15} />
                {t("settings.importSettings")}
              </button>
              <button
                className="toolbar-button"
                onClick={() => setImportDialogOpen(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {resetDialogOpen ? (
        <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
          <div
            aria-label={t("settings.resetAllSettings")}
            aria-modal="true"
            className="connection-dialog settings-reset-dialog"
            role="dialog"
          >
            <header className="connection-dialog-header compact">
              <div>
                <p className="panel-label">{t("settings.sectionGeneral")}</p>
                <h2>{t("settings.resetAllSettings")}</h2>
              </div>
            </header>
            <p className="field-hint">{t("settings.resetAllSettingsConfirm")}</p>
            <div className="dialog-actions">
              <button
                className="secondary-button danger"
                onClick={() => void handleResetAllSettings()}
                type="button"
              >
                <RotateCcw size={15} />
                {t("settings.resetAllSettings")}
              </button>
              <button
                className="toolbar-button"
                onClick={() => setResetDialogOpen(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
