import { useState } from "react";
import { DatabaseBackup, FolderOpen, Languages, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const setUrlSettings = useWorkspaceStore((state) => state.setUrlSettings);
  const setAiProviderSettings = useWorkspaceStore(
    (state) => state.setAiProviderSettings,
  );
  const closeAllTabs = useWorkspaceStore((state) => state.closeAllTabs);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function updateAutoBackup(enabled: boolean) {
    const nextSettings = { ...generalSettings, autoBackupEnabled: enabled };
    setGeneralSettings(nextSettings);
    setStatus("");
    setError("");
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const saved = await invokeCommand("update_general_settings", {
        request: nextSettings,
      });
      setGeneralSettings(saved);
      setStatus(t("settings.autoBackupSaved"));
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
    const confirmed = window.confirm(t("settings.importSettingsConfirm"));
    if (!confirmed) {
      return;
    }

    try {
      const path = await selectSettingsImportFile({
        title: t("settings.importSettings"),
        filterName: t("settings.settingsExportFilter"),
      });
      if (!path) {
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
      setUrlSettings(snapshot.urlSettings);
      setAiProviderSettings(snapshot.aiProviderSettings);
      window.dispatchEvent(
        new CustomEvent("admindeck:connection-tree-invalidated"),
      );
      setStatus(
        t("settings.importSettingsComplete", {
          filename: snapshot.backup.filename,
        }),
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : String(importError),
      );
    }
  }

  const lastBackup = formatBackupDate(generalSettings.lastBackupAt);

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div>
          <p className="panel-label">{t("settings.sectionGeneral")}</p>
          <h2>{t("settings.generalDefaults")}</h2>
        </div>
      </div>

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

      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={generalSettings.autoBackupEnabled}
            onChange={(event) =>
              void updateAutoBackup(event.currentTarget.checked)
            }
          />
          {t("settings.autoBackup")}
        </label>
        <small className="field-hint">{t("settings.autoBackupHint")}</small>
        <small className="field-hint">
          {t("settings.lastBackup", {
            value: lastBackup ?? t("settings.lastBackupNever"),
          })}
        </small>
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
          onClick={() => void handleImportSettings()}
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
      </div>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
    </section>
  );
}
