import { invokeCommand, isTauriRuntime } from "../../lib/tauri";
import { validateCustomWidgetBodyJson } from "../schema";
import type {
  DashboardCustomWidget, DashboardLoadState, DashboardView, DashboardWidgetInstance,
  CustomWidgetPatch, InstancePatch, LayoutEntry, ViewPatch,
  WidgetKind, WidgetCustomKind, WidgetPreset, AccentName, IconName, GridDensity,
} from "../types";

let previewIdCounter = 0;
let previewState: DashboardLoadState | null = null;

function createPreviewId(prefix: string) {
  previewIdCounter += 1;
  return `preview-${prefix}-${previewIdCounter}`;
}

function clonePreviewState(state: DashboardLoadState): DashboardLoadState {
  return {
    views: state.views.map((view) => ({ ...view })),
    instances: state.instances.map((instance) => ({ ...instance })),
    customWidgets: state.customWidgets.map((widget) => ({ ...widget })),
  };
}

function browserPreviewState() {
  if (!previewState) {
    const viewId = createPreviewId("view");
    previewState = {
      views: [{ id: viewId, title: "Default", sortOrder: 0, gridDensity: "default" }],
      instances: [
        {
          id: createPreviewId("inst"),
          viewId,
          kind: "builtIn",
          sourceId: "appLauncher",
          preset: "panel",
          accentName: "blue",
          iconName: "Wrench",
          customTitle: null,
          glass: false,
          actionDirection: undefined,
          gridX: 0,
          gridY: 0,
          gridW: 4,
          gridH: 3,
          sortOrder: 0,
        },
      ],
      customWidgets: [],
    };
  }
  return previewState;
}

export async function loadDashboardState(): Promise<DashboardLoadState> {
  if (!isTauriRuntime()) {
    return clonePreviewState(browserPreviewState());
  }
  return invokeCommand("dashboard_load_state");
}

export async function createView(title: string, gridDensity?: GridDensity): Promise<DashboardView> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const view = {
      id: createPreviewId("view"),
      title,
      sortOrder: state.views.length,
      gridDensity: gridDensity ?? "default",
    };
    state.views.push(view);
    return { ...view };
  }
  return invokeCommand("dashboard_create_view", { title, gridDensity });
}

export async function updateView(id: string, patch: ViewPatch): Promise<DashboardView> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const view = state.views.find((item) => item.id === id);
    if (!view) {
      throw new Error("Dashboard view not found.");
    }
    Object.assign(view, patch);
    return { ...view };
  }
  return invokeCommand("dashboard_update_view", { id, patch });
}

export async function removeView(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    state.views = state.views.filter((view) => view.id !== id);
    state.instances = state.instances.filter((instance) => instance.viewId !== id);
    return;
  }
  await invokeCommand("dashboard_remove_view", { id });
}

export async function reorderViews(orderedIds: string[]): Promise<void> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const byId = new Map(state.views.map((view) => [view.id, view]));
    state.views = orderedIds.flatMap((id, index) => {
      const view = byId.get(id);
      if (!view) {
        return [];
      }
      view.sortOrder = index;
      return [view];
    });
    return;
  }
  await invokeCommand("dashboard_reorder_views", { orderedIds });
}

export async function addInstance(input: {
  viewId: string; kind: WidgetKind; sourceId: string;
  preset: WidgetPreset; accentName: AccentName; iconName: IconName;
  gridX: number; gridY: number; gridW: number; gridH: number;
}): Promise<DashboardWidgetInstance> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const instance: DashboardWidgetInstance = {
      id: createPreviewId("inst"),
      customTitle: null,
      sortOrder: state.instances.filter((item) => item.viewId === input.viewId).length,
      ...input,
    };
    state.instances.push(instance);
    return { ...instance };
  }
  return invokeCommand("dashboard_add_instance", input);
}

export async function updateInstance(id: string, patch: InstancePatch): Promise<DashboardWidgetInstance> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const instance = state.instances.find((item) => item.id === id);
    if (!instance) {
      throw new Error("Dashboard widget instance not found.");
    }
    Object.assign(instance, patch);
    return { ...instance };
  }
  return invokeCommand("dashboard_update_instance", { id, patch });
}

export async function removeInstance(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    state.instances = state.instances.filter((instance) => instance.id !== id);
    return;
  }
  await invokeCommand("dashboard_remove_instance", { id });
}

export async function applyLayout(viewId: string, layout: LayoutEntry[]): Promise<void> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const byId = new Map(layout.map((entry) => [entry.id, entry]));
    state.instances = state.instances.map((instance) => {
      if (instance.viewId !== viewId || !byId.has(instance.id)) {
        return instance;
      }
      return { ...instance, ...byId.get(instance.id)! };
    });
    return;
  }
  await invokeCommand("dashboard_apply_layout", { viewId, layout });
}

export async function createCustomWidget(input: {
  kind: WidgetCustomKind; title: string; summary: string;
  category: string; bodyJson: string; createdBy: "user" | "agent";
}): Promise<DashboardCustomWidget> {
  if (!isTauriRuntime()) {
    const validation = validateCustomWidgetBodyJson(input.kind, input.bodyJson);
    if (!validation.ok) {
      throw new Error(`Invalid Dashboard custom widget body: ${validation.reason}`);
    }
    const state = browserPreviewState();
    const widget = { id: createPreviewId("cw"), ...input };
    state.customWidgets.push(widget);
    return { ...widget };
  }
  return invokeCommand("dashboard_create_custom_widget", input);
}

export async function updateCustomWidget(id: string, patch: CustomWidgetPatch): Promise<DashboardCustomWidget> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const widget = state.customWidgets.find((item) => item.id === id);
    if (!widget) {
      throw new Error("Dashboard custom widget not found.");
    }
    if (patch.bodyJson !== undefined) {
      const validation = validateCustomWidgetBodyJson(widget.kind, patch.bodyJson);
      if (!validation.ok) {
        throw new Error(`Invalid Dashboard custom widget body: ${validation.reason}`);
      }
    }
    Object.assign(widget, patch);
    return { ...widget };
  }
  return invokeCommand("dashboard_update_custom_widget", { id, patch });
}

export async function removeCustomWidget(id: string, forceDeleteInstances: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    const state = browserPreviewState();
    const referenced = state.instances.some((instance) => instance.sourceId === id);
    if (referenced && !forceDeleteInstances) {
      throw new Error("Dashboard custom widget is still used by widget instances.");
    }
    state.customWidgets = state.customWidgets.filter((widget) => widget.id !== id);
    if (forceDeleteInstances) {
      state.instances = state.instances.filter((instance) => instance.sourceId !== id);
    }
    return;
  }
  await invokeCommand("dashboard_remove_custom_widget", { id, forceDeleteInstances });
}

export async function resetDashboard(): Promise<void> {
  if (!isTauriRuntime()) {
    previewState = null;
    return;
  }
  await invokeCommand("dashboard_reset");
}
