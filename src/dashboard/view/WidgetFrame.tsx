import { Settings as SettingsIcon, X as XIcon } from "lucide-react";
import * as Icons from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeleteConfirmationDialog } from "../../app/DeleteConfirmationDialog";
import { showNativeContextMenu, type NativeContextMenuPosition } from "../../lib/nativeContextMenu";
import { nativeMenuIcons } from "../../lib/nativeMenuIcons";
import { useDashboardStore } from "../state/dashboardStore";
import { getBuiltInWidget } from "../registry/builtInRegistry";
import { PRESET_RENDERERS } from "../registry/presetRegistry";
import { resolveAccent } from "../registry/palette";
import { effectiveBodyOpacity } from "../types";
import type { DashboardWidgetInstance } from "../types";
import { WidgetBody } from "./WidgetBody";

export interface WidgetFrameProps {
  instance: DashboardWidgetInstance;
  onCustomize: (instance: DashboardWidgetInstance, anchor: HTMLElement) => void;
}

export function WidgetFrame({ instance, onCustomize }: WidgetFrameProps) {
  const { t } = useTranslation();
  const editMode = useDashboardStore((s) => s.editMode);
  const removeInstance = useDashboardStore((s) => s.removeInstance);
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const agentCreatedRevealInstanceIds = useDashboardStore((s) => s.agentCreatedRevealInstanceIds);
  const clearAgentCreatedReveal = useDashboardStore((s) => s.clearAgentCreatedReveal);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const shouldSpaceWarp = agentCreatedRevealInstanceIds.includes(instance.id);

  const accent = resolveAccent(instance.accentName);
  const Render = PRESET_RENDERERS[instance.preset];

  const builtIn = instance.kind === "builtIn" ? getBuiltInWidget(instance.sourceId) : undefined;
  const customSource =
    instance.kind !== "builtIn" ? customWidgets.find((c) => c.id === instance.sourceId) : undefined;

  const fallbackTitle =
    instance.customTitle
    ?? (builtIn ? t(builtIn.titleKey) : undefined)
    ?? customSource?.title
    ?? t("dashboard.untitledWidget");

  const IconCmp = (Icons as unknown as Record<string, React.ComponentType<{ width?: number; height?: number }>>)[instance.iconName] ?? Icons.Hash;

  useEffect(() => {
    if (!shouldSpaceWarp) return;
    const timer = setTimeout(() => clearAgentCreatedReveal(instance.id), 1000);
    return () => clearTimeout(timer);
  }, [clearAgentCreatedReveal, instance.id, shouldSpaceWarp]);

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteConfirmOpen(true);
  }

  async function openWidgetContextMenu(position: NativeContextMenuPosition) {
    await showNativeContextMenu(
      [
        {
          kind: "item",
          label: t("dashboard.properties"),
          iconSvg: nativeMenuIcons.settings,
          action: () => {
            if (frameRef.current) onCustomize(instance, frameRef.current);
          },
        },
        {
          kind: "item",
          label: t("common.delete"),
          iconSvg: nativeMenuIcons.trash,
          action: () => setDeleteConfirmOpen(true),
        },
      ],
      position,
    );
  }

  function handleWidgetContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    void openWidgetContextMenu({ x: e.clientX, y: e.clientY });
  }

  const controls: ReactNode = (
    <span className="dw-controls">
      <button
        className="dw-ctrl dw-ctrl-properties"
        onClick={(e) => { e.stopPropagation(); onCustomize(instance, e.currentTarget); }}
        aria-label={t("dashboard.customize")}
        title={t("dashboard.customize")}
        type="button"
      >
        <SettingsIcon width={12} height={12} />
      </button>
      {editMode ? (
        <button
          className="dw-ctrl danger"
          onClick={handleRemoveClick}
          aria-label={t("dashboard.removeWidget", { name: fallbackTitle })}
          title={t("dashboard.removeWidget", { name: fallbackTitle })}
          type="button"
        >
          <XIcon width={12} height={12} />
        </button>
      ) : null}
    </span>
  );

  const style: CSSProperties = {
    // expose CSS variables consumed by preset chrome
    ["--w-accent" as unknown as string]: accent.color,
    ["--w-accent-soft" as unknown as string]: accent.soft,
    ["--w-title-text" as unknown as string]: accent.titleText,
    ["--w-body-opacity" as unknown as string]: effectiveBodyOpacity(instance),
  } as CSSProperties;

  const className = [
    "dw-instance",
    instance.kind !== "builtIn" ? "dw-custom-widget" : "",
    shouldSpaceWarp ? "dw-reveal-space-warp" : "",
    editMode ? "dw-edit" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <div
        ref={frameRef}
        className={className}
        data-dashboard-widget-instance-id={instance.id}
        onContextMenu={handleWidgetContextMenu}
        style={style}
      >
        <Render
          title={fallbackTitle}
          icon={<IconCmp width={14} height={14} />}
          body={<WidgetBody instance={instance} onWidgetContextMenu={openWidgetContextMenu} />}
          controls={controls}
          editMode={editMode}
          glass={instance.glass}
          hideTitle={instance.hideTitle}
        />
      </div>
      {deleteConfirmOpen ? (
        <DeleteConfirmationDialog
          confirmLabel={t("common.delete")}
          message={t("dashboard.deleteWidgetBody", { name: fallbackTitle })}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            void removeInstance(instance.id);
          }}
          title={t("dashboard.removeWidget", { name: fallbackTitle })}
        />
      ) : null}
    </>
  );
}
