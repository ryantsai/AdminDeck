import { invokeCommand } from "../../lib/tauri";
import type {
  DashboardCustomWidget, DashboardLoadState, DashboardView, DashboardWidgetInstance,
  CustomWidgetPatch, InstancePatch, LayoutEntry, ViewPatch,
  WidgetKind, WidgetCustomKind, WidgetPreset, AccentName, IconName, GridDensity,
} from "../types";

export async function loadDashboardState(): Promise<DashboardLoadState> {
  return invokeCommand("dashboard_load_state");
}

export async function createView(title: string, gridDensity?: GridDensity): Promise<DashboardView> {
  return invokeCommand("dashboard_create_view", { title, gridDensity });
}

export async function updateView(id: string, patch: ViewPatch): Promise<DashboardView> {
  return invokeCommand("dashboard_update_view", { id, patch });
}

export async function removeView(id: string): Promise<void> {
  await invokeCommand("dashboard_remove_view", { id });
}

export async function reorderViews(orderedIds: string[]): Promise<void> {
  await invokeCommand("dashboard_reorder_views", { orderedIds });
}

export async function addInstance(input: {
  viewId: string; kind: WidgetKind; sourceId: string;
  preset: WidgetPreset; accentName: AccentName; iconName: IconName;
  gridX: number; gridY: number; gridW: number; gridH: number;
}): Promise<DashboardWidgetInstance> {
  return invokeCommand("dashboard_add_instance", input);
}

export async function updateInstance(id: string, patch: InstancePatch): Promise<DashboardWidgetInstance> {
  return invokeCommand("dashboard_update_instance", { id, patch });
}

export async function removeInstance(id: string): Promise<void> {
  await invokeCommand("dashboard_remove_instance", { id });
}

export async function applyLayout(viewId: string, layout: LayoutEntry[]): Promise<void> {
  await invokeCommand("dashboard_apply_layout", { viewId, layout });
}

export async function createCustomWidget(input: {
  kind: WidgetCustomKind; title: string; summary: string;
  category: string; bodyJson: string; createdBy: "user" | "agent";
}): Promise<DashboardCustomWidget> {
  return invokeCommand("dashboard_create_custom_widget", input);
}

export async function updateCustomWidget(id: string, patch: CustomWidgetPatch): Promise<DashboardCustomWidget> {
  return invokeCommand("dashboard_update_custom_widget", { id, patch });
}

export async function removeCustomWidget(id: string, forceDeleteInstances: boolean): Promise<void> {
  await invokeCommand("dashboard_remove_custom_widget", { id, forceDeleteInstances });
}

export async function resetDashboard(): Promise<void> {
  await invokeCommand("dashboard_reset");
}
