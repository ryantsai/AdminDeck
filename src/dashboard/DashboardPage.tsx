import { Edit3, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantPageContext } from "../ai/AssistantPanel";
import { CatalogOverlay } from "./edit/CatalogOverlay";
import { CustomizePopover } from "./edit/CustomizePopover";
import "./dashboard.css";
import { useDashboardStore } from "./state/dashboardStore";
import type { DashboardWidgetInstance, GridDensity } from "./types";
import { DashboardCanvas } from "./view/DashboardCanvas";

export function DashboardPage({
  onAssistantContextChange,
}: {
  onAssistantContextChange: (context: AssistantPageContext) => void;
}) {
  const { t } = useTranslation();
  const ready = useDashboardStore((s) => s.ready);
  const load = useDashboardStore((s) => s.load);
  const views = useDashboardStore((s) => s.views);
  const instances = useDashboardStore((s) => s.instances);
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const activeViewId = useDashboardStore((s) => s.activeViewId);
  const setActiveView = useDashboardStore((s) => s.setActiveView);
  const editMode = useDashboardStore((s) => s.editMode);
  const toggleEditMode = useDashboardStore((s) => s.toggleEditMode);
  const setViewDensity = useDashboardStore((s) => s.setViewDensity);
  const createView = useDashboardStore((s) => s.createView);
  const renameView = useDashboardStore((s) => s.renameView);
  const removeView = useDashboardStore((s) => s.removeView);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [customize, setCustomize] = useState<{ instance: DashboardWidgetInstance; rect: DOMRect } | null>(null);

  useEffect(() => {
    if (!ready) void load();
  }, [ready, load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && editMode) toggleEditMode();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, toggleEditMode]);

  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];
  const viewInstances = activeView ? instances.filter((i) => i.viewId === activeView.id) : [];

  useEffect(() => {
    if (!activeView) return;
    const widgetLines = viewInstances.length > 0
      ? viewInstances.map((i) => `- ${i.customTitle ?? i.sourceId} (${i.kind})`)
      : [`- ${t("dashboard.emptyTitle")}: ${t("dashboard.emptyHint")}`];
    onAssistantContextChange({
      contextLabel: `${t("dashboard.title")} - ${activeView.title}`,
      connectionLabel: t("dashboard.assistantContextLabel"),
      sourceLabel: t("dashboard.assistantContextSource", { view: activeView.title }),
      text: [
        `${t("dashboard.title")}: ${activeView.title}`,
        t("dashboard.assistantContextIntro"),
        "",
        ...widgetLines,
        "",
        `customWidgets: ${customWidgets.map((c) => c.title).join(", ") || "none"}`,
      ].join("\n"),
    });
  }, [activeView, viewInstances, customWidgets, onAssistantContextChange, t]);

  if (!ready || !activeView) return <div className="dashboard-loading">{t("common.loading")}</div>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="crumb">{t("dashboard.title")}</span>
          <h1>{activeView.title}</h1>
        </div>
        <div className="dashboard-view-pills">
          {views.map((v) => (
            <button
              key={v.id}
              className={`dashboard-pill${v.id === activeView.id ? " active" : ""}`}
              onClick={() => setActiveView(v.id)}
              onDoubleClick={() => {
                const next = window.prompt(t("dashboard.renameView"), v.title);
                if (next && next.trim()) void renameView(v.id, next.trim());
              }}
            >
              {v.title}
              {views.length > 1 && (
                <span
                  className="dashboard-pill-close"
                  onClick={(e) => { e.stopPropagation(); void removeView(v.id); }}
                  role="button"
                  aria-label={t("dashboard.removeView")}
                >×</span>
              )}
            </button>
          ))}
          <button
            className="dashboard-pill-add"
            onClick={async () => {
              const title = window.prompt(t("dashboard.newViewPrompt"), `View ${views.length + 1}`);
              if (title && title.trim()) await createView(title.trim());
            }}
          >
            <Plus size={12} /> {t("dashboard.addView")}
          </button>
        </div>
        <div className="dashboard-actions">
          {editMode && (
            <DensityControl
              value={activeView.gridDensity}
              onChange={(d) => void setViewDensity(activeView.id, d)}
            />
          )}
          <button className="btn-ghost" onClick={toggleEditMode}>
            <Edit3 size={13} /> {editMode ? t("dashboard.editDone") : t("dashboard.editLayout")}
          </button>
          <button className="btn-primary" onClick={() => setCatalogOpen(true)}>
            <Plus size={13} /> {t("dashboard.addWidgetLabel")}
          </button>
        </div>
      </header>

      <DashboardCanvas
        view={activeView}
        instances={viewInstances}
        onCustomize={(instance, anchor) => setCustomize({ instance, rect: anchor.getBoundingClientRect() })}
      />

      {catalogOpen && (
        <CatalogOverlay viewId={activeView.id} onClose={() => setCatalogOpen(false)} />
      )}
      {customize && (
        <CustomizePopover
          instance={customize.instance}
          anchorRect={customize.rect}
          onClose={() => setCustomize(null)}
        />
      )}
    </main>
  );
}

function DensityControl({ value, onChange }: { value: GridDensity; onChange: (v: GridDensity) => void }) {
  const { t } = useTranslation();
  return (
    <div className="dashboard-density">
      {(["compact", "default", "roomy"] as const).map((d) => (
        <button
          key={d}
          className={d === value ? "active" : ""}
          onClick={() => onChange(d)}
        >{t(`dashboard.density.${d}`)}</button>
      ))}
    </div>
  );
}
