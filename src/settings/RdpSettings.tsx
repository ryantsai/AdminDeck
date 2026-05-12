import { Monitor, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { RdpColorDepth, RdpPerformanceProfile } from "../types";
import { SettingsSectionHeader } from "./shared";
import { ToggleSwitch } from "./ToggleSwitch";

export function RdpSettings() {
  const { t } = useTranslation();
  const rdpSettings = useWorkspaceStore((state) => state.rdpSettings);
  const setRdpSettings = useWorkspaceStore((state) => state.setRdpSettings);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [draft, setDraft] = useState(rdpSettings);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(rdpSettings);

  useEffect(() => {
    setDraft(rdpSettings);
  }, [rdpSettings]);

  async function handleSave() {
    try {
      const saved = isTauriRuntime()
        ? await invokeCommand("update_rdp_settings", { request: draft })
        : draft;
      setRdpSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.rdpSettingsSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(saveError instanceof Error ? saveError.message : String(saveError), { tone: "error" });
    }
  }

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button className="toolbar-button" disabled={!hasChanges} onClick={() => void handleSave()} type="button">
            <Save size={15} />
            {t("settings.save")}
          </button>
        }
        icon={<Monitor size={18} />}
        label={t("settings.sectionRdp")}
        title={t("settings.qualityDefaults")}
      />
      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.display")}</legend>
        <div className="form-grid two-columns">
          <label>
            <span>{t("settings.colorDepth")}</span>
            <select
              value={draft.colorDepth}
              onChange={(event) => {
                const colorDepth = Number(event.currentTarget.value) as RdpColorDepth;
                setDraft((settings) => ({
                  ...settings,
                  colorDepth,
                }));
              }}
            >
              <option value={32}>{t("settings.rdpColorDepth32")}</option>
              <option value={24}>{t("settings.rdpColorDepth24")}</option>
              <option value={16}>{t("settings.rdpColorDepth16")}</option>
              <option value={15}>{t("settings.rdpColorDepth15")}</option>
            </select>
          </label>
          <label>
            <span>{t("settings.performanceFlags")}</span>
            <select
              value={draft.performanceProfile}
              onChange={(event) => {
                const performanceProfile = event.currentTarget.value as RdpPerformanceProfile;
                setDraft((settings) => ({
                  ...settings,
                  performanceProfile,
                }));
              }}
            >
              <option value="balanced">{t("settings.rdpPerformanceBalanced")}</option>
              <option value="quality">{t("settings.rdpPerformanceQuality")}</option>
              <option value="speed">{t("settings.rdpPerformanceSpeed")}</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.networkPerformance")}</legend>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.redirectClipboard}
              onChange={(checked) => setDraft((settings) => ({ ...settings, redirectClipboard: checked }))}
            />
            <span>
              <strong>{t("settings.rdpRedirectClipboard")}</strong>
              <small>{t("settings.rdpRedirectClipboardHint")}</small>
            </span>
          </label>
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.redirectDrives}
              onChange={(checked) => setDraft((settings) => ({ ...settings, redirectDrives: checked }))}
            />
            <span>
              <strong>{t("settings.rdpRedirectDrives")}</strong>
              <small>{t("settings.rdpRedirectDrivesHint")}</small>
            </span>
          </label>
          <label className="settings-toggle-row">
            <ToggleSwitch
              checked={draft.bitmapCache}
              onChange={(checked) => setDraft((settings) => ({ ...settings, bitmapCache: checked }))}
            />
            <span>
              <strong>{t("settings.bitmapCache")}</strong>
              <small>{t("settings.rdpBitmapCacheHint")}</small>
            </span>
          </label>
        </div>
      </fieldset>
    </section>
  );
}
