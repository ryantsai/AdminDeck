import type { DashboardWidgetInstance } from "../types";
import { BUILT_IN_WIDGETS, type BuiltInWidgetBodyProps } from "../registry/builtInRegistry";
import type { Connection, WorkspaceTab } from "../../types";
import { createConnectionWidgetTab } from "./ConnectionWidgetBody";
import { createUrlWidgetTab, normalizeUrlWidgetConfig } from "./UrlViewerBody";

const instance: DashboardWidgetInstance = {
  id: "inst-test",
  viewId: "view-test",
  kind: "builtIn",
  sourceId: "connectionPane",
  preset: "panel",
  accentName: "teal",
  iconName: "Server",
  customTitle: null,
  gridX: 0,
  gridY: 0,
  gridW: 8,
  gridH: 5,
  sortOrder: 0,
};

const connection: Connection = {
  id: "conn-test",
  name: "Bastion",
  host: "bastion.local",
  user: "ops",
  type: "ssh",
  status: "idle",
};

const bodyProps: BuiltInWidgetBodyProps = { instance };
const connectionTab: WorkspaceTab = createConnectionWidgetTab(instance.id, connection);
const urlConfig = normalizeUrlWidgetConfig({
  url: "example.com",
  reloadSeconds: -1,
});
const urlTab = createUrlWidgetTab(instance.id, urlConfig, 1);
const builtInIds = BUILT_IN_WIDGETS.map((entry) => entry.id);

if (!builtInIds.includes("connectionPane") || !builtInIds.includes("urlViewer")) {
  throw new Error("Dashboard built-in registry is missing the Connection Pane or URL Viewer widgets.");
}

void bodyProps;
void connectionTab;
void urlTab;
