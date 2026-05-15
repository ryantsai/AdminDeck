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
  defaultDashboardSettings,
  defaultRdpSettings,
  defaultGeneralSettings,
  defaultSftpSettings,
  defaultSshSettings,
  defaultTerminalSettings,
  defaultUrlSettings,
  defaultVncSettings,
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
import { useDashboardStore } from "../dashboard/state/dashboardStore";
import {
  AI_PROVIDER_SECRET_OWNER_ID,
  allAiProviderSecretOwnerIds,
} from "../lib/settings";
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
  const setDashboardSettings = useWorkspaceStore(
    (state) => state.setDashboardSettings,
  );
  const setAppearanceSettings = useWorkspaceStore(
    (state) => state.setAppearanceSettings,
  );
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);
  const setUrlSettings = useWorkspaceStore((state) => state.setUrlSettings);
  const setRdpSettings = useWorkspaceStore((state) => state.setRdpSettings);
  const setVncSettings = useWorkspaceStore((state) => state.setVncSettings);
  const setAiProviderSettings = useWorkspaceStore(
    (state) => state.setAiProviderSettings,
  );
  const closeAllTabs = useWorkspaceStore((state) => state.closeAllTabs);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  const setAiProviderHasApiKey = useWorkspaceStore(
    (state) => state.setAiProviderHasApiKey,
  );
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [draft, setDraft] = useState(generalSettings);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [dashboardResetDialogOpen, setDashboardResetDialogOpen] = useState(false);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(generalSettings);

  useEffect(() => {
    setDraft(generalSettings);
  }, [generalSettings]);

  async function handleSave() {
    try {
      const saved = isTauriRuntime()
        ? await invokeCommand("update_general_settings", { request: draft })
        : draft;
      setGeneralSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.generalDefaultsSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(saveError instanceof Error ? saveError.message : String(saveError), { tone: "error" });
    }
  }

  async function handleBackupSettings() {
    try {
      const backup = await invokeCommand("backup_settings_database");
      setGeneralSettings({
        ...generalSettings,
        lastBackupAt: backup.createdAt,
      });
      showStatusBarNotice(t("settings.backupSettingsComplete", { filename: backup.filename }), { tone: "success" });
    } catch (backupError) {
      showStatusBarNotice(backupError instanceof Error ? backupError.message : String(backupError), { tone: "error" });
    }
  }

  async function handleOpenDatabaseFolder() {
    try {
      const path = await invokeCommand("get_database_folder");
      await openFilesystemPath(path);
    } catch (openError) {
      showStatusBarNotice(openError instanceof Error ? openError.message : String(openError), { tone: "error" });
    }
  }

  async function handleImportSettings() {
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
      setDashboardSettings(snapshot.dashboardSettings);
      setAppearanceSettings(snapshot.appearanceSettings);
      setSshSettings(snapshot.sshSettings);
      setSftpSettings(snapshot.sftpSettings);
      setUrlSettings(snapshot.urlSettings);
      setRdpSettings(snapshot.rdpSettings);
      setVncSettings(snapshot.vncSettings);
      setAiProviderSettings(snapshot.aiProviderSettings);
      window.dispatchEvent(
        new CustomEvent("kkterm:connection-tree-invalidated"),
      );
      showStatusBarNotice(t("settings.importSettingsComplete", { filename: snapshot.backup.filename }), { tone: "success" });
      setImportDialogOpen(false);
    } catch (importError) {
      showStatusBarNotice(importError instanceof Error ? importError.message : String(importError), { tone: "error" });
    }
  }

  async function handleResetAllSettings() {
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
          url,
          rdp,
          vnc,
          aiProvider,
          dashboardSettings,
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
          invokeCommand("update_url_settings", { request: defaultUrlSettings }),
          invokeCommand("update_rdp_settings", { request: defaultRdpSettings }),
          invokeCommand("update_vnc_settings", { request: defaultVncSettings }),
          invokeCommand("update_ai_provider_settings", {
            request: defaultAiProviderSettings,
          }),
          invokeCommand("update_dashboard_settings", {
            request: defaultDashboardSettings,
          }),
        ]);
        await Promise.all(
          Array.from(
            new Set([AI_PROVIDER_SECRET_OWNER_ID, ...allAiProviderSecretOwnerIds()]),
          ).map((ownerId) =>
            invokeCommand("delete_secret", {
              request: {
                kind: "aiApiKey",
                ownerId,
              },
            }),
          ),
        );
        setGeneralSettings(general);
        setTerminalSettings(terminal);
        setAppearanceSettings(appearance);
        setSshSettings(ssh);
        setSftpSettings(sftp);
        setUrlSettings(url);
        setRdpSettings(rdp);
        setVncSettings(vnc);
        setAiProviderSettings(aiProvider);
        setDashboardSettings(dashboardSettings);
      } else {
        setGeneralSettings(defaultGeneralSettings);
        setDashboardSettings(defaultDashboardSettings);
        setTerminalSettings(defaultTerminalSettings);
        setAppearanceSettings(defaultAppearanceSettings);
        setSshSettings(defaultSshSettings);
        setSftpSettings(defaultSftpSettings);
        setUrlSettings(defaultUrlSettings);
        setRdpSettings(defaultRdpSettings);
        setVncSettings(defaultVncSettings);
        setAiProviderSettings(defaultAiProviderSettings);
      }

      setCurrentLanguage(detectLanguage());
      setAiProviderHasApiKey(false);
      window.dispatchEvent(
new CustomEvent("kkterm:connection-tree-invalidated"),
      );
      showStatusBarNotice(t("settings.resetAllSettingsComplete"), { tone: "success" });
      setResetDialogOpen(false);
    } catch (resetError) {
      showStatusBarNotice(resetError instanceof Error ? resetError.message : String(resetError), { tone: "error" });
    }
  }

  async function handleResetDashboard() {
    try {
      await useDashboardStore.getState().resetDashboard();
      showStatusBarNotice(t("settings.dashboardResetDone"), { tone: "success" });
      setDashboardResetDialogOpen(false);
    } catch (resetError) {
      showStatusBarNotice(resetError instanceof Error ? resetError.message : String(resetError), { tone: "error" });
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
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.autoUpdateChecksEnabled}
              onChange={(checked) =>
                setDraft((s) => ({ ...s, autoUpdateChecksEnabled: checked }))
              }
            />
            <span>
              <strong>{t("settings.autoUpdateChecks")}</strong>
              <small>{t("settings.autoUpdateChecksHint")}</small>
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
          <button
            className="secondary-button danger"
            type="button"
            onClick={() => setDashboardResetDialogOpen(true)}
          >
            <RotateCcw size={16} />
            {t("settings.dashboardReset")}
          </button>
        </div>
      </fieldset>

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
      {dashboardResetDialogOpen ? (
        <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
          <div
            aria-label={t("settings.dashboardResetTitle")}
            aria-modal="true"
            className="connection-dialog settings-reset-dialog"
            role="dialog"
          >
            <header className="connection-dialog-header compact">
              <div>
                <p className="panel-label">{t("settings.sectionGeneral")}</p>
                <h2>{t("settings.dashboardResetTitle")}</h2>
              </div>
            </header>
            <p className="field-hint">{t("settings.dashboardResetBody")}</p>
            <div className="dialog-actions">
              <button
                className="secondary-button danger"
                onClick={() => void handleResetDashboard()}
                type="button"
              >
                <RotateCcw size={15} />
                {t("settings.dashboardResetConfirm")}
              </button>
              <button
                className="toolbar-button"
                onClick={() => setDashboardResetDialogOpen(false)}
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
