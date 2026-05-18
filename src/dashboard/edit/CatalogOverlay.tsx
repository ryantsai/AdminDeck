import * as Icons from "lucide-react";
import { Trash2, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeleteConfirmationDialog } from "../../app/DeleteConfirmationDialog";
import { useDashboardStore } from "../state/dashboardStore";
import { BUILT_IN_WIDGETS } from "../registry/builtInRegistry";
import { resolveAccent } from "../registry/palette";
import type { AccentName, IconName, WidgetKind, WidgetPreset } from "../types";
import { CATALOG_GROUPS, getCatalogGroup } from "./catalogModel";

export interface CatalogOverlayProps { viewId: string; onClose: () => void; }

interface CatalogEntry {
  id: string;
  kind: WidgetKind;
  title: string;
  summary: string;
  category: string;
  defaultPreset: WidgetPreset;
  defaultAccent: AccentName;
  defaultIcon: IconName;
  defaultSize: { w: number; h: number };
  isCustom: boolean;
  createdBy?: "user" | "agent";
}

export function CatalogOverlay({ viewId, onClose }: CatalogOverlayProps) {
  const { t } = useTranslation();
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const instances = useDashboardStore((s) => s.instances);
  const addInstance = useDashboardStore((s) => s.addInstance);
  const removeCustomWidget = useDashboardStore((s) => s.removeCustomWidget);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<(typeof CATALOG_GROUPS)[number]>("builtIn");
  const [deleteTarget, setDeleteTarget] = useState<CatalogEntry | null>(null);

  const entries: CatalogEntry[] = useMemo(() => {
    const builtIns: CatalogEntry[] = BUILT_IN_WIDGETS.map((w) => ({
      id: w.id,
      kind: "builtIn" as WidgetKind,
      title: t(w.titleKey),
      summary: t(w.summaryKey),
      category: w.category,
      defaultPreset: w.defaultPreset,
      defaultAccent: w.defaultAccent,
      defaultIcon: w.defaultIcon,
      defaultSize: w.defaultSize,
      isCustom: false,
    }));
    const customs: CatalogEntry[] = [...customWidgets]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .map((c) => ({
        id: c.id,
        kind: c.kind as WidgetKind,
        title: c.title,
        summary: c.summary,
        category: c.category,
        defaultPreset: "ambient" as WidgetPreset,
        defaultAccent: "blue" as AccentName,
        defaultIcon: "Bot" as IconName,
        defaultSize: { w: 3, h: 3 },
        isCustom: true,
        createdBy: c.createdBy,
      }));
    return [...builtIns, ...customs];
  }, [customWidgets, t]);

  const visible = useMemo(() => entries.filter((e) => {
    if (getCatalogGroup(e) !== group) return false;
    if (!query) return true;
    const hay = `${e.title} ${e.summary}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  }), [entries, group, query]);

  const groupLabel = (catalogGroup: (typeof CATALOG_GROUPS)[number]) =>
    catalogGroup === "builtIn"
      ? t("dashboard.catalogGroupBuiltIn")
      : t("dashboard.catalogGroupCustom");

  async function onAdd(entry: CatalogEntry) {
    await addInstance({
      viewId,
      kind: entry.kind,
      sourceId: entry.id,
      preset: entry.defaultPreset,
      accentName: entry.defaultAccent,
      iconName: entry.defaultIcon,
      gridX: 0,
      gridY: Number.MAX_SAFE_INTEGER, // RGL will pack to bottom
      gridW: entry.defaultSize.w,
      gridH: entry.defaultSize.h,
    });
    onClose();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    await removeCustomWidget(deleteTarget.id, true);
    setDeleteTarget(null);
  }

  return (
    <div className="dw-catalog-backdrop" onClick={onClose}>
      <div className="dw-catalog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t("dashboard.catalogTitle")}</h2>
          <input
            placeholder={t("dashboard.catalogSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button onClick={onClose} aria-label={t("common.close")} title={t("common.close")}>
            <X width={14} height={14} />
          </button>
        </header>
        <nav className="dw-catalog-tabs">
          {CATALOG_GROUPS.map((catalogGroup) => (
            <button
              key={catalogGroup}
              className={group === catalogGroup ? "active" : ""}
              onClick={() => setGroup(catalogGroup)}
            >
              {groupLabel(catalogGroup)}
            </button>
          ))}
        </nav>
        <div className="dw-catalog-grid">
          {visible.map((entry) => {
            const accent = resolveAccent(entry.defaultAccent);
            const alreadyOnView = instances.some(
              (i) => i.viewId === viewId && i.sourceId === entry.id && i.kind === entry.kind,
            );
            const IconCmp = (Icons as unknown as Record<string, React.ComponentType<{ width?: number; height?: number }>>)[entry.defaultIcon] ?? Icons.Hash;
            return (
              <button
                key={entry.id}
                className="dw-catalog-card"
                onClick={() => onAdd(entry)}
                style={{
                  "--w-accent": accent.color,
                  "--w-accent-soft": accent.soft,
                } as CSSProperties}
              >
                {entry.isCustom && (
                  <span
                    className="dw-catalog-delete"
                    aria-label={t("dashboard.deleteCustomWidget", { name: entry.title })}
                    title={t("dashboard.deleteCustomWidget", { name: entry.title })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(entry);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setDeleteTarget(entry);
                      }
                    }}
                  >
                    <Trash2 width={12} height={12} />
                  </span>
                )}
                <span className="dw-catalog-thumb">
                  <IconCmp width={36} height={36} />
                </span>
                <h4>{entry.title}</h4>
                <p>{entry.summary}</p>
                <div className="dw-catalog-meta">
                  <span className={`dw-catalog-tag dw-catalog-tag--${getCatalogGroup(entry)}`}>{groupLabel(getCatalogGroup(entry))}</span>
                  {entry.createdBy === "agent" && <span className="dw-badge dw-badge--ai">AI</span>}
                  {alreadyOnView && <span className="dw-badge dw-badge--check">✓</span>}
                </div>
              </button>
            );
          })}
          {visible.length === 0 && <p className="dw-empty">{t("dashboard.catalogNoMatches")}</p>}
        </div>
        {deleteTarget && (
          <DeleteConfirmationDialog
            confirmLabel={t("dashboard.deleteCustomWidgetConfirm")}
            message={t("dashboard.deleteCustomWidgetBody", { name: deleteTarget.title })}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void handleDeleteConfirm()}
            title={t("dashboard.deleteCustomWidgetTitle")}
          />
        )}
      </div>
    </div>
  );
}
