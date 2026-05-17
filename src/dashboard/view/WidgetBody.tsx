import { useTranslation } from "react-i18next";
import { useDashboardStore } from "../state/dashboardStore";
import { getBuiltInWidget } from "../registry/builtInRegistry";
import { ContentWidgetRenderer } from "../content/ContentWidgetRenderer";
import { ScriptWidgetHost } from "../script/ScriptWidgetHost";
import type { DashboardWidgetInstance } from "../types";
import type { NativeContextMenuPosition } from "../../lib/nativeContextMenu";

export function WidgetBody({
  instance,
  onWidgetContextMenu,
}: {
  instance: DashboardWidgetInstance;
  onWidgetContextMenu: (position: NativeContextMenuPosition) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const customWidgets = useDashboardStore((s) => s.customWidgets);

  if (instance.kind === "builtIn") {
    const entry = getBuiltInWidget(instance.sourceId);
    if (!entry) {
      return (
        <div className="dw-missing">
          {t("dashboard.missingBuiltInWidget", { sourceId: instance.sourceId })}
        </div>
      );
    }
    const { Body } = entry;
    return <Body instance={instance} />;
  }
  const cw = customWidgets.find((c) => c.id === instance.sourceId);
  if (!cw) {
    return (
      <div className="dw-missing">
        {t("dashboard.missingCustomWidget", { sourceId: instance.sourceId })}
      </div>
    );
  }

  if (cw.kind === "content") return <ContentWidgetRenderer bodyJson={cw.bodyJson} />;
  if (cw.kind === "script") {
    return (
      <ScriptWidgetHost
        bodyJson={cw.bodyJson}
        instance={instance}
        onWidgetContextMenu={onWidgetContextMenu}
        settingsSchemaJson={cw.settingsSchemaJson}
      />
    );
  }
  return null;
}
