import { create } from "zustand";
import * as persistence from "./persistence";
import { useWorkspaceStore } from "../../store";
import type {
  DashboardCustomWidget, DashboardView, DashboardWidgetInstance,
  GridDensity, InstancePatch, LayoutEntry, WidgetCustomKind,
  WidgetKind, WidgetPreset, AccentName, IconName, CustomWidgetPatch, DashboardBackground,
} from "../types";

interface DashboardStoreState {
  ready: boolean;
  loading: boolean;
  views: DashboardView[];
  instances: DashboardWidgetInstance[];
  customWidgets: DashboardCustomWidget[];
  agentCreatedRevealInstanceIds: string[];
  activeViewId: string | null;
  editMode: boolean;
  lastError: string | null;
  load: () => Promise<void>;
  setActiveView: (id: string) => void;
  toggleEditMode: () => void;
  createView: (title: string) => Promise<DashboardView | null>;
  renameView: (id: string, title: string) => Promise<void>;
  setViewDensity: (id: string, density: GridDensity) => Promise<void>;
  setViewBackground: (id: string, background: DashboardBackground | null) => Promise<void>;
  setViewTabColor: (id: string, tabColor: string | null) => Promise<void>;
  backgroundImages: Record<string, string>;
  loadBackgroundImage: (file: string) => Promise<void>;
  removeView: (id: string) => Promise<void>;
  addInstance: (input: {
    viewId: string; kind: WidgetKind; sourceId: string;
    preset: WidgetPreset; accentName: AccentName; iconName: IconName;
    gridX: number; gridY: number; gridW: number; gridH: number;
  }) => Promise<DashboardWidgetInstance | null>;
  updateInstance: (id: string, patch: InstancePatch) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
  applyLayout: (viewId: string, layout: LayoutEntry[]) => void;
  createCustomWidget: (input: {
    kind: WidgetCustomKind; title: string; summary: string;
    category: string; bodyJson: string; settingsSchemaJson?: string; createdBy: "user" | "agent";
  }) => Promise<DashboardCustomWidget | null>;
  updateCustomWidget: (id: string, patch: CustomWidgetPatch) => Promise<void>;
  removeCustomWidget: (id: string, forceDeleteInstances: boolean) => Promise<void>;
  clearAgentCreatedReveal: (id: string) => void;
  resetDashboard: () => Promise<void>;
}

let layoutTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLayout: { viewId: string; layout: LayoutEntry[] } | null = null;

function scheduleLayoutFlush(set: (fn: (s: DashboardStoreState) => Partial<DashboardStoreState>) => void) {
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(async () => {
    if (!pendingLayout) return;
    const { viewId, layout } = pendingLayout;
    pendingLayout = null;
    try {
      await persistence.applyLayout(viewId, layout);
    } catch (e) {
      set((s) => ({ ...s, lastError: String(e) }));
    }
  }, 300);
}

export const useDashboardStore = create<DashboardStoreState>((set, get) => ({
  ready: false,
  loading: false,
  views: [],
  instances: [],
  customWidgets: [],
  agentCreatedRevealInstanceIds: [],
  activeViewId: null,
  editMode: false,
  lastError: null,
  backgroundImages: {},

  load: async () => {
    set({ loading: true });
    try {
      const state = await persistence.loadDashboardState();
      const previous = get();
      const currentActiveViewId = get().activeViewId;
      const defaultLandingView =
        useWorkspaceStore.getState().dashboardSettings.defaultLandingView;
      const preferred =
        defaultLandingView !== "lastActive"
          ? state.views.find((view) => view.id === defaultLandingView)?.id
          : undefined;
      const activeViewId =
        preferred
        ?? (currentActiveViewId && state.views.some((view) => view.id === currentActiveViewId)
          ? currentActiveViewId
          : (state.views[0]?.id ?? null));
      const previousInstanceIds = new Set(previous.instances.map((instance) => instance.id));
      const previousCustomWidgetIds = new Set(previous.customWidgets.map((widget) => widget.id));
      const newlyCreatedAgentWidgetIds = new Set(
        previous.ready
          ? state.customWidgets
              .filter((widget) => widget.createdBy === "agent" && !previousCustomWidgetIds.has(widget.id))
              .map((widget) => widget.id)
          : [],
      );
      const agentCreatedRevealInstanceIds = previous.ready
        ? state.instances
            .filter(
              (instance) =>
                !previousInstanceIds.has(instance.id)
                && newlyCreatedAgentWidgetIds.has(instance.sourceId),
            )
            .map((instance) => instance.id)
        : [];
      set({
        ...state,
        agentCreatedRevealInstanceIds,
        activeViewId,
        ready: true,
        loading: false,
        lastError: null,
      });
    } catch (e) {
      set({ lastError: String(e), loading: false });
    }
  },

  setActiveView: (id) => set({ activeViewId: id }),
  toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),

  createView: async (title) => {
    try {
      const view = await persistence.createView(title);
      set((s) => ({ views: [...s.views, view], activeViewId: view.id }));
      return view;
    } catch (e) { set({ lastError: String(e) }); return null; }
  },

  renameView: async (id, title) => {
    try {
      const updated = await persistence.updateView(id, { title });
      set((s) => ({ views: s.views.map((v) => (v.id === id ? updated : v)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  setViewDensity: async (id, density) => {
    try {
      const updated = await persistence.updateView(id, { gridDensity: density });
      set((s) => ({ views: s.views.map((v) => (v.id === id ? updated : v)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  setViewBackground: async (id, background) => {
    try {
      const updated = await persistence.updateView(id, { background });
      set((s) => ({ views: s.views.map((v) => (v.id === id ? updated : v)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  setViewTabColor: async (id, tabColor) => {
    try {
      const updated = await persistence.updateView(id, { tabColor });
      set((s) => ({ views: s.views.map((v) => (v.id === id ? updated : v)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  loadBackgroundImage: async (file) => {
    if (!file || get().backgroundImages[file]) return;
    try {
      const dataUrl = await persistence.loadBackgroundImage(file);
      set((s) => ({ backgroundImages: { ...s.backgroundImages, [file]: dataUrl } }));
    } catch (e) {
      set({ lastError: String(e) });
    }
  },

  removeView: async (id) => {
    try {
      await persistence.removeView(id);
      set((s) => {
        const views = s.views.filter((v) => v.id !== id);
        const instances = s.instances.filter((i) => i.viewId !== id);
        const activeViewId = s.activeViewId === id ? (views[0]?.id ?? null) : s.activeViewId;
        return { views, instances, activeViewId };
      });
    } catch (e) { set({ lastError: String(e) }); }
  },

  addInstance: async (input) => {
    try {
      const inst = await persistence.addInstance(input);
      set((s) => ({ instances: [...s.instances, inst] }));
      return inst;
    } catch (e) { set({ lastError: String(e) }); return null; }
  },

  updateInstance: async (id, patch) => {
    try {
      const updated = await persistence.updateInstance(id, patch);
      set((s) => ({ instances: s.instances.map((i) => (i.id === id ? updated : i)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  removeInstance: async (id) => {
    try {
      await persistence.removeInstance(id);
      set((s) => ({ instances: s.instances.filter((i) => i.id !== id) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  applyLayout: (viewId, layout) => {
    set((s) => {
      const byId = new Map(layout.map((l) => [l.id, l]));
      const instances = s.instances.map((i) =>
        byId.has(i.id)
          ? { ...i, gridX: byId.get(i.id)!.gridX, gridY: byId.get(i.id)!.gridY,
                  gridW: byId.get(i.id)!.gridW, gridH: byId.get(i.id)!.gridH }
          : i,
      );
      return { instances };
    });
    pendingLayout = { viewId, layout };
    scheduleLayoutFlush(set);
  },

  createCustomWidget: async (input) => {
    try {
      const cw = await persistence.createCustomWidget(input);
      set((s) => ({ customWidgets: [...s.customWidgets, cw] }));
      return cw;
    } catch (e) { set({ lastError: String(e) }); return null; }
  },

  updateCustomWidget: async (id, patch) => {
    try {
      const updated = await persistence.updateCustomWidget(id, patch);
      set((s) => ({ customWidgets: s.customWidgets.map((c) => (c.id === id ? updated : c)) }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  removeCustomWidget: async (id, force) => {
    try {
      await persistence.removeCustomWidget(id, force);
      set((s) => ({
        customWidgets: s.customWidgets.filter((c) => c.id !== id),
        instances: force ? s.instances.filter((i) => i.sourceId !== id) : s.instances,
      }));
    } catch (e) { set({ lastError: String(e) }); }
  },

  clearAgentCreatedReveal: (id) => {
    set((s) => ({
      agentCreatedRevealInstanceIds: s.agentCreatedRevealInstanceIds.filter((instanceId) => instanceId !== id),
    }));
  },

  resetDashboard: async () => {
    try {
      await persistence.resetDashboard();
      await get().load();
    } catch (e) { set({ lastError: String(e) }); }
  },
}));
