import { Edit3, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantPageContext } from "../ai/AssistantPanel";
import { ariaHidden } from "../lib/aria";
import { invokeCommand, type McpServer } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import { BackgroundPopover } from "./edit/BackgroundPopover";
import { CatalogOverlay } from "./edit/CatalogOverlay";
import { CustomizePopover } from "./edit/CustomizePopover";
import "./dashboard.css";
import { libraryCatalogForAi } from "./script/widgetLibraries";
import { useDashboardStore } from "./state/dashboardStore";
import type { DashboardWidgetInstance, GridDensity } from "./types";
import { DashboardBackgroundHost } from "./view/DashboardBackgroundHost";
import { DashboardCanvas, DENSITY_SETTINGS } from "./view/DashboardCanvas";

export function DashboardPage({
  dashboardActive,
  onAssistantContextChange,
}: {
  dashboardActive: boolean;
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
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const appliedLandingPref = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void invokeCommand("mcp_list_servers", undefined)
      .then((list) => {
        if (!cancelled) setMcpServers(list);
      })
      .catch(() => {
        if (!cancelled) setMcpServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const activeCustomSourceIds = useMemo(
    () => new Set(viewInstances.filter((instance) => instance.kind !== "builtIn").map((instance) => instance.sourceId)),
    [viewInstances],
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
        summary: widget.summary,
        activeOnView: activeCustomSourceIds.has(widget.id),
      })),
      mcpServers: mcpServers.map((server) => ({
        id: server.id,
        name: server.name,
        url: server.url,
        status: server.lastStatus,
        tools: server.tools,
      })),
    };
    onAssistantContextChange({
      contextKind: "dashboard",
      contextLabel: `${t("dashboard.title")} - ${activeView.title}`,
      connectionLabel: t("dashboard.assistantContextLabel"),
      sourceLabel: t("dashboard.assistantContextSource", { view: activeView.title }),
      text: [
        t("dashboard.assistantContextIntro"),
        "For a user request to create a visible Dashboard widget, use dashboard_create_widget with activeView.id so the widget is validated and placed on the selected view in one step.",
        "For a user request to fix or edit an existing AI-authored widget, use dashboard_load_state to read the current customWidgets[].bodyJson and instances[].sourceId, then call dashboard_update_custom_widget. Prefer patch.body over patch.bodyJson so you can submit structured content/script bodies without manual JSON escaping.",
        "Prefer content widgets for static notes, checklists, stats, and key/value summaries. Use script widgets only when live JavaScript behavior is required.",
        "When using a script widget, provide JavaScript source only. Do not generate a full HTML document or include <script> tags; create DOM nodes inside #root instead.",
        "Choose preset, accentName, iconName, and grid size intentionally from the widget purpose. Default to panel for ordinary tools, tile or stat-like content for compact metrics, action for launch/action surfaces, and hero only for rare high-priority summaries.",
        "Be boundary-aware: choose a gridW/gridH that fits the actual controls and content without inner scrollbars. Simple timers/counters should normally be at least 4x3; forms, image widgets, and lists should be larger, commonly 5x4 or more.",
        "Use calm app-style accents: blue/teal/slate/emerald for normal utility widgets, amber for warnings, red/rose only for destructive or error-oriented widgets. Keep labels concise and controls dense, aligned, and consistent with KKTerm's desktop UI.",
        "Never create low-contrast UI. Use the script host's CSS variables and default text styles unless there is a strong reason to override them; if you set backgrounds, explicitly keep text readable.",
        "If the widget needs per-instance persistent options, include settingsSchema.fields in dashboard_create_widget. KKTerm renders that schema in the widget settings UI and stores instance values; script widgets can read non-secret values with KK.getSettings() and save via KK.setSetting(key, value).",
        "Passwords, API keys, tokens, and similar sensitive options must use settingsSchema field type secret. KKTerm stores those values in the OS keychain as widgetSecret entries; Dashboard instance JSON stores only secretRef objects. Scripts read a secret only when needed with await KK.getSecret('fieldKey').",
        "For script widgets that display remote images or fetch remote data, set permissions.network to true. Use normal http/https anchors or KK.openExternal(url) for external website links; links open in the user's external browser, not inside the widget iframe.",
        "Script widgets can read and save local files through native OS dialogs. await KK.readLocalFile({ filters: [{ name: 'CSV', extensions: ['csv'] }] }) returns { name, bytes: Uint8Array } or null if the user cancels. await KK.saveFile(filename, bytesUint8Array, filtersOptional) returns the saved path or null if cancelled. Use these for PDF export, CSV import, config viewers, etc.",
        "Script widgets can call tools on user-configured Remote MCP servers via KK.callMcpTool(serverName, toolName, args). The server name is the user-assigned name from mcpServers below; the tool name and argument schema come from that server's tools list. Returns { content, isError }. Reference servers by name, not internal id, so the widget keeps working if the server is removed and re-added.",
        "Script widgets can request curated npm libraries via a body.libraries string array. The libraries load before the widget source and expose documented globals (see catalog below). Strongly prefer these bundled libraries over loading CDN scripts or hand-rolling equivalent logic: when the catalog covers the need (for example mermaid for diagrams, three for 3D scenes, animejs for property animation, echarts or chartjs for charts, marked for markdown, prism for syntax highlighting, leaflet for maps, qrcode for QR codes, mathjs for expressions, papaparse for CSV, dayjs for dates), declare its key in body.libraries instead of writing your own renderer or fetching a copy from unpkg/jsdelivr/cdnjs. Use a runtime CDN load (permissions.network true plus an injected script tag) only when no catalog entry fits the request, and hand-roll the algorithm in source only when neither a bundled library nor a small CDN-loadable library is suitable. Only list libraries you actually use; do not declare more than 8. The 64KB source budget applies to your code, not to library bytes.",
        "Available widget libraries:",
        libraryCatalogForAi(),
        "",
        JSON.stringify(dashboardSnapshot, null, 2),
      ].join("\n"),
    });
  }, [activeView, viewInstances, activeCustomSourceIds, customWidgets, mcpServers, onAssistantContextChange, t]);

  if (!ready || !activeView) {
    return (
      <div
        className={`dashboard-loading${dashboardActive ? "" : " dashboard-page-hidden"}`}
        {...ariaHidden(!dashboardActive)}
      >
        {t("common.loading")}
      </div>
    );
  }

  return (
    <main
      className={`dashboard-page${dashboardActive ? "" : " dashboard-page-hidden"}`}
      {...ariaHidden(!dashboardActive)}
    >
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="crumb">{t("dashboard.title")}</span>
        </div>
        <div className="dashboard-view-pills">
          {views.map((v) => {
            const isActiveView = v.id === activeView.id;
            const isEditingView = editingViewId === v.id;
            const renameInputLabel = t("dashboard.renameView");

            return (
              <div
                key={v.id}
                className={`dashboard-pill${isActiveView ? " active" : ""}${isEditingView ? " editing" : ""}`}
              >
                {isEditingView ? (
                  <input
                    aria-label={renameInputLabel}
                    className="dashboard-pill-rename"
                    defaultValue={v.title}
                    autoFocus
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
                  <button
                    className="dashboard-pill-main"
                    onClick={() => setActiveView(v.id)}
                    onDoubleClick={() => {
                      setActiveView(v.id);
                      setEditingViewId(v.id);
                    }}
                    type="button"
                  >
                    {v.title}
                  </button>
                )}
                {views.length > 1 && (
                  <button
                    aria-label={t("dashboard.removeView")}
                    className="dashboard-pill-close"
                    onClick={() => void removeView(v.id)}
                    type="button"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
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
        <DashboardBackgroundHost
          activeView={activeView}
          dashboardActive={dashboardActive}
          views={views}
        />
        <DashboardCanvas
          view={activeView}
          instances={viewInstances}
          onCustomize={(instance, anchor) => setCustomize({ instance, rect: anchor.getBoundingClientRect() })}
          onOpenBackground={() => setBackgroundOpen(true)}
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
      {backgroundOpen && (
        <BackgroundPopover view={activeView} onClose={() => setBackgroundOpen(false)} />
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
