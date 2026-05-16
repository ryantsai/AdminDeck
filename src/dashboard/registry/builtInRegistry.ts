import type { ComponentType } from "react";
import type { AccentName, IconName, WidgetPreset } from "../types";
import { AppLauncherBody } from "../widgets/AppLauncherBody";
import { ConnectionWidgetBody } from "../widgets/ConnectionWidgetBody";
import type { DashboardWidgetInstance } from "../types";

export interface BuiltInWidgetBodyProps {
  instance: DashboardWidgetInstance;
}

export interface BuiltInWidgetEntry {
  id: string;
  titleKey: string;
  summaryKey: string;
  category: string;
  defaultPreset: WidgetPreset;
  defaultAccent: AccentName;
  defaultIcon: IconName;
  defaultSize: { w: number; h: number };
  Body: ComponentType<BuiltInWidgetBodyProps>;
}

export const BUILT_IN_WIDGETS: BuiltInWidgetEntry[] = [
  {
    id: "appLauncher",
    titleKey: "appLauncher.title",
    summaryKey: "appLauncher.subtitle",
    category: "shortcut",
    defaultPreset: "panel",
    defaultAccent: "blue",
    defaultIcon: "Wrench",
    defaultSize: { w: 4, h: 3 },
    Body: AppLauncherBody,
  },
  {
    id: "connectionPane",
    titleKey: "dashboard.connectionPaneTitle",
    summaryKey: "dashboard.connectionPaneSummary",
    category: "connection",
    defaultPreset: "panel",
    defaultAccent: "teal",
    defaultIcon: "Server",
    defaultSize: { w: 8, h: 5 },
    Body: ConnectionWidgetBody,
  },
];

export function getBuiltInWidget(id: string): BuiltInWidgetEntry | undefined {
  return BUILT_IN_WIDGETS.find((w) => w.id === id);
}
