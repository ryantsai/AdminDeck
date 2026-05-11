import { Settings as SettingsIcon, X as XIcon } from "lucide-react";
import * as Icons from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
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

  const controls: ReactNode = (
    <span className="dw-controls">
      <button
        className="dw-ctrl"
        onClick={(e) => { e.stopPropagation(); onCustomize(instance, e.currentTarget); }}
        aria-label={t("dashboard.customize")}
        title={t("dashboard.customize")}
      >
        <SettingsIcon width={12} height={12} />
      </button>
      <button
        className="dw-ctrl danger"
        onClick={(e) => { e.stopPropagation(); void removeInstance(instance.id); }}
        aria-label={t("dashboard.removeWidget")}
        title={t("dashboard.removeWidget")}
      >
        <XIcon width={12} height={12} />
      </button>
    </span>
  );

  const style: CSSProperties = {
    // expose CSS variables consumed by preset chrome
    ["--w-accent" as unknown as string]: accent.color,
    ["--w-accent-soft" as unknown as string]: accent.soft,
  } as CSSProperties;

  return (
    <div className={`dw-instance${editMode ? " dw-edit" : ""}`} style={style}>
      <Render
        title={fallbackTitle}
        icon={<IconCmp width={14} height={14} />}
        body={<WidgetBody instance={instance} />}
        controls={controls}
        editMode={editMode}
      />
    </div>
  );
}
