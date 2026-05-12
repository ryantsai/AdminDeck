import { useEffect, useState } from "react";
import { LayoutDashboard, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboardStore } from "../dashboard/state/dashboardStore";
import { useWorkspaceStore } from "../store";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import type { DashboardSettings as DashboardSettingsState } from "../types";
import { SettingsSectionHeader } from "./shared";

export function DashboardSettings() {
  const { t } = useTranslation();
  const views = useDashboardStore((s) => s.views);
  const dashboardSettings = useWorkspaceStore((s) => s.dashboardSettings);
  const setDashboardSettings = useWorkspaceStore((s) => s.setDashboardSettings);
  const showStatusBarNotice = useWorkspaceStore((s) => s.showStatusBarNotice);
  const [draft, setDraft] = useState<DashboardSettingsState>(dashboardSettings);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(dashboardSettings);

  useEffect(() => {
    setDraft(dashboardSettings);
  }, [dashboardSettings]);

  async function handleSave() {
    try {
      const saved = isTauriRuntime()
        ? await invokeCommand("update_dashboard_settings", { request: draft })
        : draft;
      setDashboardSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.dashboardSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(
        saveError instanceof Error ? saveError.message : String(saveError),
        { tone: "error" },
      );
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
        icon={<LayoutDashboard size={18} />}
        label={t("settings.sectionDashboard")}
        title={t("settings.sectionDashboard")}
      />
      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.dashboardGeneral")}</legend>
        <div className="form-grid">
          <label>
            <span>{t("settings.dashboardDefaultLanding")}</span>
            <select
              value={draft.defaultLandingView}
              onChange={(e) =>
                setDraft((s) => ({ ...s, defaultLandingView: e.target.value }))
              }
            >
              <option value="lastActive">{t("settings.dashboardLandingLast")}</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
    </section>
  );
}
