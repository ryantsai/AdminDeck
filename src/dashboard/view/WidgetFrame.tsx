import { Check as CheckIcon, Settings as SettingsIcon, X as XIcon } from "lucide-react";
import * as Icons from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardStore } from "../state/dashboardStore";
import { getBuiltInWidget } from "../registry/builtInRegistry";
import { PRESET_RENDERERS } from "../registry/presetRegistry";
import { resolveAccent } from "../registry/palette";
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
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    return () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!shouldSpaceWarp) return;
    const timer = setTimeout(() => clearAgentCreatedReveal(instance.id), 1000);
    return () => clearTimeout(timer);
  }, [clearAgentCreatedReveal, instance.id, shouldSpaceWarp]);

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirming) {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
      setConfirming(false);
      void removeInstance(instance.id);
    } else {
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  }

  const controls: ReactNode = (
    <span className="dw-controls">
      <button
        className="dw-ctrl"
        onClick={(e) => { e.stopPropagation(); onCustomize(instance, e.currentTarget); }}
        aria-label={t("dashboard.customize")}
        title={t("dashboard.customize")}
        type="button"
      >
        <SettingsIcon width={12} height={12} />
      </button>
      {editMode ? (
        <button
          className={`dw-ctrl danger${confirming ? " confirming" : ""}`}
          onClick={handleRemoveClick}
          aria-label={
            confirming
              ? t("dashboard.removeConfirmHint")
              : t("dashboard.removeWidget", { name: fallbackTitle })
          }
          title={
            confirming
              ? t("dashboard.removeConfirmHint")
              : t("dashboard.removeWidget", { name: fallbackTitle })
          }
          type="button"
        >
          {confirming ? <CheckIcon width={12} height={12} /> : <XIcon width={12} height={12} />}
        </button>
      ) : null}
    </span>
  );

  const style: CSSProperties = {
    // expose CSS variables consumed by preset chrome
    ["--w-accent" as unknown as string]: accent.color,
    ["--w-accent-soft" as unknown as string]: accent.soft,
    ["--w-title-text" as unknown as string]: accent.titleText,
  } as CSSProperties;

  const className = [
    "dw-instance",
    instance.kind !== "builtIn" ? "dw-custom-widget" : "",
    shouldSpaceWarp ? "dw-reveal-space-warp" : "",
    editMode ? "dw-edit" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className} style={style}>
      <Render
        title={fallbackTitle}
        icon={<IconCmp width={14} height={14} />}
        body={<WidgetBody instance={instance} />}
        controls={controls}
        editMode={editMode}
        glass={instance.glass}
        hideTitle={instance.hideTitle}
        actionDirection={instance.actionDirection}
      />
    </div>
  );
}
