import { useState } from "react";
import { DatabaseBackup, Download, Languages, Upload } from "lucide-react";
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
  selectSettingsExportFile,
  selectSettingsImportFile,
} from "../lib/tauri";
import { useWorkspaceStore } from "../store";

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

  async function handleExportSettings() {
    setStatus("");
    setError("");
    try {
      const path = await selectSettingsExportFile({
        title: t("settings.exportSettings"),
        filterName: t("settings.settingsExportFilter"),
      });
      if (!path) {
        return;
      }
      await invokeCommand("export_settings_database", { path });
      setStatus(t("settings.exportSettingsComplete"));
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : String(exportError),
      );
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
      </div>

      <div
        className="settings-data-actions"
        aria-label={t("settings.settingsDataActions")}
      >
        <button
          className="secondary-button"
          type="button"
          onClick={() => void handleExportSettings()}
        >
          <Download size={16} />
          {t("settings.exportSettings")}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void handleImportSettings()}
        >
          <Upload size={16} />
          {t("settings.importSettings")}
        </button>
        <div className="settings-data-note">
          <DatabaseBackup size={16} />
          <span>{t("settings.settingsDataHint")}</span>
        </div>
      </div>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
    </section>
  );
}
