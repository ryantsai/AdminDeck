import { Camera, FolderOpen, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  invokeCommand,
  isTauriRuntime,
  openFilesystemPath,
  selectScreenshotFolder,
} from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import { SettingsSectionHeader } from "./shared";

export function ScreenshotSettings() {
  const { t } = useTranslation();
  const screenshotSettings = useWorkspaceStore((state) => state.screenshotSettings);
  const setScreenshotSettings = useWorkspaceStore((state) => state.setScreenshotSettings);
  const [draft, setDraft] = useState(screenshotSettings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(screenshotSettings);

  useEffect(() => {
    setDraft(screenshotSettings);
  }, [screenshotSettings]);

  async function handleChooseFolder() {
    setStatus("");
    setError("");
    try {
      const folder = await selectScreenshotFolder({
        defaultPath: draft.folderPath,
        title: t("settings.chooseFolder"),
      });
      if (folder) {
        setDraft({ folderPath: folder });
      }
    } catch (chooseError) {
      setError(chooseError instanceof Error ? chooseError.message : String(chooseError));
    }
  }

  async function handleOpenFolder() {
    setStatus("");
    setError("");
    try {
      await openFilesystemPath(draft.folderPath);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  async function handleSave() {
    setStatus("");
    setError("");
    try {
      const saved = isTauriRuntime()
        ? await invokeCommand("update_screenshot_settings", { request: draft })
        : draft;
      setScreenshotSettings(saved);
      setDraft(saved);
      window.dispatchEvent(new Event("admindeck:screenshots-changed"));
      setStatus(t("settings.screenshotsSaved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

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
        icon={<Camera size={18} />}
        label={t("settings.sectionScreenshots")}
        title={t("settings.screenshots")}
      />

      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.screenshotFolder")}</legend>
        <div>
          <p className="field-hint">{t("settings.screenshotFolderHint")}</p>
        </div>
        <div className="form-grid">
          <label>
            <span>{t("settings.screenshotFolderPath")}</span>
            <input
              value={draft.folderPath}
              onChange={(event) => setDraft({ folderPath: event.currentTarget.value })}
            />
          </label>
        </div>
        <div className="settings-data-actions">
          <button className="secondary-button" onClick={() => void handleChooseFolder()} type="button">
            <FolderOpen size={16} />
            {t("settings.chooseFolder")}
          </button>
          <button className="secondary-button" onClick={() => void handleOpenFolder()} type="button">
            <FolderOpen size={16} />
            {t("settings.openScreenshotFolder")}
          </button>
        </div>
      </fieldset>

      {status ? <p className="settings-status success">{status}</p> : null}
      {error ? <p className="settings-status error">{error}</p> : null}
    </section>
  );
}
