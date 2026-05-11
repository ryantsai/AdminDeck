import {
  Bot,
  Check,
  Copy,
  FileText,
  Hash,
  Network,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store";
import {
  calculateIpv4Subnet,
  calculateTextHashes,
  DASHBOARD_BUILTIN_WIDGETS,
  normalizeAgentWidgetDefinition,
  transformQuickTool,
} from "./widgets";
import type {
  DashboardWidgetCategory,
  DashboardWidgetDefinition,
  QuickToolId,
} from "./widgets";

const CUSTOM_WIDGET_STORAGE_KEY = "kkterm.dashboard.customWidgets.v1";
const SELECTED_WIDGET_STORAGE_KEY = "kkterm.dashboard.selectedWidgets.v1";

const DEFAULT_WIDGET_IDS = [
  "hash-calculator",
  "ipv4-subnet-calculator",
  "quick-tools",
];

const CATEGORY_ORDER: DashboardWidgetCategory[] = [
  "hash",
  "network",
  "quick",
  "report",
];

const QUICK_TOOL_OPTIONS: QuickToolId[] = [
  "urlEncode",
  "urlDecode",
  "base64Encode",
  "base64Decode",
  "unixToIso",
];

export function DashboardPage() {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [customWidgets, setCustomWidgets] = useState(loadCustomWidgets);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState(loadSelectedWidgetIds);
  const [categoryFilter, setCategoryFilter] = useState<DashboardWidgetCategory | "all">("all");
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  const widgets = useMemo(
    () => [...DASHBOARD_BUILTIN_WIDGETS, ...customWidgets],
    [customWidgets],
  );
  const selectedWidgets = selectedWidgetIds
    .map((id) => widgets.find((widget) => widget.id === id))
    .filter((widget): widget is DashboardWidgetDefinition => Boolean(widget));
  const visibleCatalogWidgets =
    categoryFilter === "all"
      ? widgets
      : widgets.filter((widget) => widget.category === categoryFilter);

  useEffect(() => {
    persistSelectedWidgetIds(selectedWidgetIds);
  }, [selectedWidgetIds]);

  useEffect(() => {
    persistCustomWidgets(customWidgets);
  }, [customWidgets]);

  function addWidget(widgetId: string) {
    setSelectedWidgetIds((current) =>
      current.includes(widgetId) ? current : [...current, widgetId],
    );
  }

  function removeWidget(widgetId: string) {
    setSelectedWidgetIds((current) => current.filter((id) => id !== widgetId));
  }

  function deleteCustomWidget(widgetId: string) {
    setCustomWidgets((current) => current.filter((widget) => widget.id !== widgetId));
    removeWidget(widgetId);
    showStatusBarNotice(t("dashboard.widgetDeleted"), { tone: "success" });
  }

  function saveAgentWidget(widget: DashboardWidgetDefinition) {
    if (DASHBOARD_BUILTIN_WIDGETS.some((entry) => entry.id === widget.id)) {
      showStatusBarNotice(t("dashboard.agentWidgetBuiltInId"), { tone: "error" });
      return;
    }
    setCustomWidgets((current) => [
      ...current.filter((entry) => entry.id !== widget.id),
      widget,
    ]);
    addWidget(widget.id);
    setAgentDialogOpen(false);
    showStatusBarNotice(t("dashboard.agentWidgetSaved"), { tone: "success" });
  }

  return (
    <main className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-header">
        <div>
          <p className="panel-label">{t("dashboard.moduleLabel")}</p>
          <h1 id="dashboard-title">{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
        <button
          className="primary-button dashboard-agent-button"
          onClick={() => setAgentDialogOpen(true)}
          type="button"
        >
          <Bot size={15} />
          {t("dashboard.addAgentWidget")}
        </button>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-catalog" aria-label={t("dashboard.catalog")}>
          <div className="dashboard-catalog-header">
            <h2>{t("dashboard.catalog")}</h2>
            <span>{t("dashboard.widgetCount", { count: widgets.length })}</span>
          </div>
          <div className="dashboard-category-tabs" aria-label={t("dashboard.categoriesLabel")}>
            <button
              className={categoryFilter === "all" ? "active" : ""}
              onClick={() => setCategoryFilter("all")}
              type="button"
            >
              {t("dashboard.categoryAll")}
            </button>
            {CATEGORY_ORDER.map((category) => (
              <button
                key={category}
                className={categoryFilter === category ? "active" : ""}
                onClick={() => setCategoryFilter(category)}
                type="button"
              >
                {t(categoryKey(category))}
              </button>
            ))}
          </div>
          <div className="dashboard-widget-list">
            {visibleCatalogWidgets.map((widget) => {
              const selected = selectedWidgetIds.includes(widget.id);
              return (
                <article className="dashboard-catalog-item" key={widget.id}>
                  <div className="dashboard-widget-icon">{widgetIcon(widget.category)}</div>
                  <div>
                    <strong>{widgetTitle(widget, t)}</strong>
                    <p>{widgetSummary(widget, t)}</p>
                  </div>
                  <button
                    className={`dashboard-add-widget ${selected ? "selected" : ""}`}
                    aria-label={t(
                      selected
                        ? "dashboard.widgetAlreadySelected"
                        : "dashboard.addWidget",
                      { name: widgetTitle(widget, t) },
                    )}
                    disabled={selected}
                    onClick={() => addWidget(widget.id)}
                    type="button"
                  >
                    {selected ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                </article>
              );
            })}
          </div>
        </aside>
        <section className="dashboard-playground" aria-label={t("dashboard.playground")}>
          <div className="dashboard-playground-header">
            <div>
              <h2>{t("dashboard.playground")}</h2>
              <p>{t("dashboard.playgroundHint")}</p>
            </div>
          </div>
          {selectedWidgets.length > 0 ? (
            <div className="dashboard-widget-grid">
              {selectedWidgets.map((widget) => (
                <DashboardWidgetCard
                  key={widget.id}
                  onDeleteCustomWidget={deleteCustomWidget}
                  onRemove={removeWidget}
                  widget={widget}
                />
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <Wrench size={28} />
              <h2>{t("dashboard.emptyTitle")}</h2>
              <p>{t("dashboard.emptyHint")}</p>
            </div>
          )}
        </section>
      </div>
      {agentDialogOpen ? (
        <AgentWidgetDialog
          onClose={() => setAgentDialogOpen(false)}
          onSave={saveAgentWidget}
        />
      ) : null}
    </main>
  );
}

function DashboardWidgetCard({
  onDeleteCustomWidget,
  onRemove,
  widget,
}: {
  onDeleteCustomWidget: (widgetId: string) => void;
  onRemove: (widgetId: string) => void;
  widget: DashboardWidgetDefinition;
}) {
  const { t } = useTranslation();
  return (
    <article className="dashboard-widget-card">
      <header>
        <div className="dashboard-widget-card-title">
          <span className="dashboard-widget-icon">{widgetIcon(widget.category)}</span>
          <div>
            <h3>{widgetTitle(widget, t)}</h3>
            <p>{widgetSummary(widget, t)}</p>
          </div>
        </div>
        <div className="dashboard-widget-actions">
          {widget.createdBy === "agent" ? (
            <button
              className="icon-button"
              aria-label={t("dashboard.deleteCustomWidget", {
                name: widgetTitle(widget, t),
              })}
              onClick={() => onDeleteCustomWidget(widget.id)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
          <button
            className="icon-button"
            aria-label={t("dashboard.removeWidget", { name: widgetTitle(widget, t) })}
            onClick={() => onRemove(widget.id)}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      </header>
      {widget.kind === "hashCalculator" ? <HashCalculatorWidget /> : null}
      {widget.kind === "subnetCalculator" ? <SubnetCalculatorWidget /> : null}
      {widget.kind === "quickTools" ? <QuickToolsWidget /> : null}
      {widget.kind === "report" || widget.kind === "agent" ? (
        <ReportWidget body={widget.body ?? t("dashboard.reportBody")} />
      ) : null}
    </article>
  );
}

function HashCalculatorWidget() {
  const { t } = useTranslation();
  const [input, setInput] = useState(t("dashboard.hashSample"));
  const [hashes, setHashes] = useState<Awaited<ReturnType<typeof calculateTextHashes>>>();

  useEffect(() => {
    let disposed = false;
    void calculateTextHashes(input).then((nextHashes) => {
      if (!disposed) {
        setHashes(nextHashes);
      }
    });
    return () => {
      disposed = true;
    };
  }, [input]);

  return (
    <div className="dashboard-widget-body">
      <label className="dashboard-field">
        <span>{t("dashboard.hashInput")}</span>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
        />
      </label>
      <dl className="dashboard-output-grid">
        <OutputRow label={t("dashboard.characters")} value={hashes?.characters ?? "--"} />
        <OutputRow label={t("dashboard.bytes")} value={hashes?.bytes ?? "--"} />
        <OutputRow label={t("dashboard.sha1")} value={hashes?.sha1 || t("dashboard.hashUnavailable")} />
        <OutputRow label={t("dashboard.sha256")} value={hashes?.sha256 || t("dashboard.hashUnavailable")} />
      </dl>
    </div>
  );
}

function SubnetCalculatorWidget() {
  const { t } = useTranslation();
  const [input, setInput] = useState(t("dashboard.subnetSample"));
  const result = calculateIpv4Subnet(input);

  return (
    <div className="dashboard-widget-body">
      <label className="dashboard-field">
        <span>{t("dashboard.subnetInput")}</span>
        <input value={input} onChange={(event) => setInput(event.target.value)} />
      </label>
      {result.ok ? (
        <dl className="dashboard-output-grid">
          <OutputRow label={t("dashboard.networkAddress")} value={result.networkAddress} />
          <OutputRow label={t("dashboard.broadcastAddress")} value={result.broadcastAddress} />
          <OutputRow label={t("dashboard.firstUsable")} value={result.firstUsableAddress} />
          <OutputRow label={t("dashboard.lastUsable")} value={result.lastUsableAddress} />
          <OutputRow label={t("dashboard.subnetMask")} value={result.subnetMask} />
          <OutputRow label={t("dashboard.wildcardMask")} value={result.wildcardMask} />
          <OutputRow label={t("dashboard.totalAddresses")} value={result.totalAddresses} />
          <OutputRow label={t("dashboard.usableHosts")} value={result.usableHosts} />
        </dl>
      ) : (
        <p className="dashboard-error">{t(`dashboard.subnetError.${result.reason}`)}</p>
      )}
    </div>
  );
}

function QuickToolsWidget() {
  const { t } = useTranslation();
  const [toolId, setToolId] = useState<QuickToolId>("urlEncode");
  const [input, setInput] = useState(t("dashboard.quickSample"));
  const result = transformQuickTool(toolId, input);

  return (
    <div className="dashboard-widget-body">
      <div className="dashboard-field-row">
        <label className="dashboard-field">
          <span>{t("dashboard.quickTool")}</span>
          <select
            value={toolId}
            onChange={(event) => setToolId(event.target.value as QuickToolId)}
          >
            {QUICK_TOOL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`dashboard.quickToolOptions.${option}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="dashboard-field">
        <span>{t("dashboard.quickInput")}</span>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
        />
      </label>
      <label className="dashboard-field">
        <span>{t("dashboard.quickOutput")}</span>
        <textarea readOnly value={result.output} rows={3} />
      </label>
      {!result.ok ? (
        <p className="dashboard-error">{t(`dashboard.quickToolErrors.${result.reason}`)}</p>
      ) : null}
    </div>
  );
}

function ReportWidget({ body }: { body: string }) {
  return (
    <div className="dashboard-report-body">
      {body.split(/\r?\n/).map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </div>
  );
}

function AgentWidgetDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (widget: DashboardWidgetDefinition) => void;
}) {
  const { t } = useTranslation();
  const [rawJson, setRawJson] = useState(t("dashboard.agentWidgetExample"));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const result = normalizeAgentWidgetDefinition(rawJson);
    if (!result.ok) {
      setError(t(`dashboard.agentWidgetErrors.${result.reason}`));
      return;
    }
    setError(null);
    onSave(result.widget);
  }

  return (
    <div className="dialog-backdrop dashboard-dialog-backdrop">
      <section
        className="dashboard-agent-dialog"
        aria-labelledby="dashboard-agent-dialog-title"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <h2 id="dashboard-agent-dialog-title">{t("dashboard.agentWidgetDialogTitle")}</h2>
            <p>{t("dashboard.agentWidgetDialogHint")}</p>
          </div>
          <button
            className="icon-button"
            aria-label={t("common.close")}
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>
        <label className="dashboard-field">
          <span>{t("dashboard.agentWidgetJson")}</span>
          <textarea
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            rows={12}
            spellCheck={false}
          />
        </label>
        {error ? <p className="dashboard-error">{error}</p> : null}
        <div className="dashboard-dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button className="primary-button" onClick={handleSave} type="button">
            {t("dashboard.saveWidget")}
          </button>
        </div>
      </section>
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button
          className="dashboard-copy-button"
          aria-label={t("dashboard.copyValue", { label })}
          onClick={() => void navigator.clipboard?.writeText(value)}
          type="button"
        >
          <Copy size={13} />
        </button>
      </dd>
    </div>
  );
}

function widgetTitle(
  widget: DashboardWidgetDefinition,
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  return widget.titleKey ? t(widget.titleKey) : (widget.title ?? widget.id);
}

function widgetSummary(
  widget: DashboardWidgetDefinition,
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  return widget.summaryKey ? t(widget.summaryKey) : (widget.summary ?? "");
}

function widgetIcon(category: DashboardWidgetCategory) {
  switch (category) {
    case "hash":
      return <Hash size={16} />;
    case "network":
      return <Network size={16} />;
    case "quick":
      return <Wrench size={16} />;
    case "report":
      return <FileText size={16} />;
  }
}

function categoryKey(category: DashboardWidgetCategory) {
  return `dashboard.categories.${category}`;
}

function loadCustomWidgets(): DashboardWidgetDefinition[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CUSTOM_WIDGET_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isStoredAgentWidget);
  } catch {
    return [];
  }
}

function persistCustomWidgets(widgets: DashboardWidgetDefinition[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CUSTOM_WIDGET_STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    // Custom Dashboard widgets are convenience UI state; storage failures should not break the module.
  }
}

function loadSelectedWidgetIds() {
  if (typeof window === "undefined") {
    return DEFAULT_WIDGET_IDS;
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SELECTED_WIDGET_STORAGE_KEY) ?? "null",
    );
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? parsed
      : DEFAULT_WIDGET_IDS;
  } catch {
    return DEFAULT_WIDGET_IDS;
  }
}

function persistSelectedWidgetIds(widgetIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SELECTED_WIDGET_STORAGE_KEY, JSON.stringify(widgetIds));
  } catch {
    // Selected Dashboard widgets are convenience UI state.
  }
}

function isStoredAgentWidget(value: unknown): value is DashboardWidgetDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }
  const widget = value as Partial<DashboardWidgetDefinition>;
  return (
    typeof widget.id === "string" &&
    widget.kind === "agent" &&
    widget.createdBy === "agent" &&
    typeof widget.title === "string" &&
    typeof widget.summary === "string" &&
    typeof widget.body === "string" &&
    CATEGORY_ORDER.includes(widget.category as DashboardWidgetCategory)
  );
}
