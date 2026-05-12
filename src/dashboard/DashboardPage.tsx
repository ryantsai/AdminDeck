import { Edit3, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantPageContext } from "../ai/AssistantPanel";
import { useWorkspaceStore } from "../store";
import { CatalogOverlay } from "./edit/CatalogOverlay";
import { CustomizePopover } from "./edit/CustomizePopover";
import "./dashboard.css";
import { useDashboardStore } from "./state/dashboardStore";
import type { DashboardWidgetInstance, GridDensity } from "./types";
import { DashboardCanvas, DENSITY_SETTINGS } from "./view/DashboardCanvas";

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
  const defaultLandingView = useWorkspaceStore((s) => s.dashboardSettings.defaultLandingView);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [customize, setCustomize] = useState<{ instance: DashboardWidgetInstance; rect: DOMRect } | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const appliedLandingPref = useRef(false);

  useEffect(() => {
    if (!ready) void load();
  }, [ready, load]);

  useEffect(() => {
    if (!ready || views.length === 0 || appliedLandingPref.current) return;
    if (defaultLandingView !== "lastActive") {
      const target = views.find((v) => v.id === defaultLandingView);
      if (target) {
        appliedLandingPref.current = true;
        setActiveView(target.id);
      }
    }
  }, [defaultLandingView, ready, views, setActiveView]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && editMode) toggleEditMode();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, toggleEditMode]);

  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];
  const customizeInstance =
    customize ? instances.find((instance) => instance.id === customize.instance.id) : null;
  const viewInstances = useMemo(
    () => (activeView ? instances.filter((i) => i.viewId === activeView.id) : []),
    [activeView, instances],
  );
  const densitySettings = DENSITY_SETTINGS[activeView?.gridDensity ?? "default"];
  const canvasGridStyle = {
    "--dw-row-height": `${densitySettings.rowHeight}px`,
    "--dw-grid-gap-x": `${densitySettings.margin[0]}px`,
    "--dw-grid-gap-y": `${densitySettings.margin[1]}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!activeView) return;
    const dashboardSnapshot = {
      page: "dashboard",
      activeView: {
        id: activeView.id,
        title: activeView.title,
        gridDensity: activeView.gridDensity,
      },
      instances: viewInstances.map((instance) => ({
        id: instance.id,
        kind: instance.kind,
        sourceId: instance.sourceId,
        customTitle: instance.customTitle,
        preset: instance.preset,
        accentName: instance.accentName,
        iconName: instance.iconName,
        gridX: instance.gridX,
        gridY: instance.gridY,
        gridW: instance.gridW,
        gridH: instance.gridH,
      })),
      customWidgets: customWidgets.map((widget) => ({
        id: widget.id,
        kind: widget.kind,
        title: widget.title,
        category: widget.category,
      })),
    };
    onAssistantContextChange({
      contextKind: "dashboard",
      contextLabel: `${t("dashboard.title")} - ${activeView.title}`,
      connectionLabel: t("dashboard.assistantContextLabel"),
      sourceLabel: t("dashboard.assistantContextSource", { view: activeView.title }),
      text: [
        t("dashboard.assistantContextIntro"),
        "For a user request to create a Dashboard widget, use dashboard_create_custom_widget first, then dashboard_add_instance with activeView.id.",
        "Prefer content widgets for static notes, checklists, stats, and key/value summaries. Use script widgets only when live JavaScript behavior is needed.",
        "",
        JSON.stringify(dashboardSnapshot, null, 2),
      ].join("\n"),
    });
  }, [activeView, viewInstances, customWidgets, onAssistantContextChange, t]);

  if (!ready || !activeView) return <div className="dashboard-loading">{t("common.loading")}</div>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="crumb">{t("dashboard.title")}</span>
        </div>
        <div className="dashboard-view-pills">
          {views.map((v) => (
            <button
              key={v.id}
              className={`dashboard-pill${v.id === activeView.id ? " active" : ""}`}
              onClick={() => setActiveView(v.id)}
              onDoubleClick={() => {
                setActiveView(v.id);
                setEditingViewId(v.id);
              }}
            >
              {editingViewId === v.id ? (
                <input
                  className="dashboard-pill-rename"
                  defaultValue={v.title}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const next = e.currentTarget.value.trim();
                    if (next) void renameView(v.id, next);
                    setEditingViewId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const next = e.currentTarget.value.trim();
                      if (next) void renameView(v.id, next);
                      setEditingViewId(null);
                    } else if (e.key === "Escape") {
                      setEditingViewId(null);
                    }
                  }}
                />
              ) : (
                v.title
              )}
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
              const newView = await createView(t("dashboard.newViewName", { count: views.length + 1 }));
              if (newView) setEditingViewId(newView.id);
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

      <div className={`dw-canvas-scroll${editMode ? " is-editing" : ""}`} style={canvasGridStyle}>
        <DashboardCanvas
          view={activeView}
          instances={viewInstances}
          onCustomize={(instance, anchor) => setCustomize({ instance, rect: anchor.getBoundingClientRect() })}
        />
      </div>

      {catalogOpen && (
        <CatalogOverlay viewId={activeView.id} onClose={() => setCatalogOpen(false)} />
      )}
      {customize && customizeInstance && (
        <CustomizePopover
          instance={customizeInstance}
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
