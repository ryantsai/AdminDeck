export type WidgetKind = "builtIn" | "content" | "script";
export type WidgetCustomKind = "content" | "script";

export const WIDGET_PRESETS = [
  "panel", "ambient", "hero",
] as const;
export type WidgetPreset = (typeof WIDGET_PRESETS)[number];

export const DEFAULT_WIDGET_PRESENTATION_BY_PRESET = {
  panel: { hideTitle: false },
  ambient: { hideTitle: true },
  hero: { hideTitle: false },
} as const satisfies Record<WidgetPreset, { hideTitle: boolean }>;

export function defaultWidgetPresentationForPreset<T extends WidgetPreset>(preset: T) {
  return DEFAULT_WIDGET_PRESENTATION_BY_PRESET[preset];
}

const TRANSLUCENT_BUILT_IN_WIDGET_IDS = new Set(["appLauncher", "connectionPane"]);

export function defaultBodyOpacityForInstance(instance: {
  kind: WidgetKind;
  sourceId: string;
}): number {
  if (instance.kind === "builtIn" && TRANSLUCENT_BUILT_IN_WIDGET_IDS.has(instance.sourceId)) {
    return 70;
  }
  return 100;
}

export function effectiveBodyOpacity(instance: {
  kind: WidgetKind;
  sourceId: string;
  bodyOpacity?: number | null;
}): number {
  return instance.bodyOpacity ?? defaultBodyOpacityForInstance(instance);
}

export const ACCENT_NAMES = [
  "default", "blue", "indigo", "teal", "green", "amber", "red", "purple", "pink",
  "slate", "cyan", "orange", "rose", "emerald", "sky",
] as const;
export type AccentName = (typeof ACCENT_NAMES)[number];

export const ICON_NAMES = [
  "Hash","Network","Terminal","Server","Cpu","Activity","Bolt","Sun",
  "Bell","Bot","Wrench","Folder","Clock","Doc","Cloud","Calendar",
  "Database","Globe","Lock","Key","Mail","Mic","Monitor","Music",
  "Package","Phone","Pin","Power","Printer","Radio","Search",
  "Settings","Shield","ShoppingCart","Star","Tag","Tool","Trash",
  "Truck","User","Users","Video","Volume","Watch","Wifi","Wind",
  "Zap","Layers","List","Grid",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const GRID_DENSITIES = ["compact", "default", "roomy"] as const;
export type GridDensity = (typeof GRID_DENSITIES)[number];

export const BACKGROUND_FITS = ["fill", "fit", "stretch", "tile", "center"] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

export type DashboardBackground =
  | { kind: "preset"; preset: string }
  | { kind: "image"; file: string; fit: BackgroundFit; dim: number }
  | { kind: "video"; file: string; fit: BackgroundFit; dim: number }
  | { kind: "dynamic"; dynamic: string };

export interface DashboardView {
  id: string;
  title: string;
  sortOrder: number;
  gridDensity: GridDensity;
  background: DashboardBackground | null;
  tabColor: string | null;
}

export interface DashboardWidgetInstance {
  id: string;
  viewId: string;
  kind: WidgetKind;
  sourceId: string;
  preset: WidgetPreset;
  accentName: AccentName;
  iconName: IconName;
  customTitle: string | null;
  glass?: boolean;
  hideTitle?: boolean;
  bodyOpacity?: number | null;
  settingsValuesJson: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  sortOrder: number;
}

export interface DashboardCustomWidget {
  id: string;
  kind: WidgetCustomKind;
  title: string;
  summary: string;
  category: string;
  bodyJson: string;
  settingsSchemaJson: string;
  createdBy: "user" | "agent";
  createdAt: string;
}

export interface DashboardLoadState {
  views: DashboardView[];
  instances: DashboardWidgetInstance[];
  customWidgets: DashboardCustomWidget[];
}

export interface InstancePatch {
  preset?: WidgetPreset;
  accentName?: AccentName;
  iconName?: IconName;
  customTitle?: string | null;
  glass?: boolean;
  hideTitle?: boolean;
  bodyOpacity?: number | null;
  settingsValuesJson?: string;
  gridX?: number;
  gridY?: number;
  gridW?: number;
  gridH?: number;
}

export interface ViewPatch {
  title?: string;
  gridDensity?: GridDensity;
  sortOrder?: number;
  background?: DashboardBackground | null;
  tabColor?: string | null;
}

export interface CustomWidgetPatch {
  title?: string;
  summary?: string;
  category?: string;
  bodyJson?: string;
  settingsSchemaJson?: string;
}

export interface LayoutEntry {
  id: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

export type ContentShape = "markdown" | "kvList" | "checklist" | "stat";

export type ContentTableAlign = "start" | "center" | "end";

export interface ContentTableColumn {
  key: string;
  label: string;
  align?: ContentTableAlign;
}

export interface ContentTable {
  columns: ContentTableColumn[];
  rows: Record<string, string>[];
}

export type ContentChart =
  | { kind: "sparkline"; points: number[]; caption?: string }
  | { kind: "bar"; series: { label: string; value: number }[]; caption?: string }
  | { kind: "donut"; series: { label: string; value: number }[]; caption?: string };

export type ContentLayoutDirection = "row" | "col" | "grid";

/// Leaf body = a content shape that is NOT itself a layout. Mirrors the
/// Rust `ContentLeafBody` to keep nested layouts excluded at the type level.
export type ContentLeafBody =
  | { shape: "markdown"; data: { source: string; mode?: "markdown" | "html" } }
  | { shape: "kvList"; data: { rows: { label: string; value: string }[] } }
  | { shape: "checklist"; data: { items: { label: string; done?: boolean }[] } }
  | { shape: "stat"; data: { value: string; unit?: string; delta?: string; caption?: string } }
  | { shape: "table"; data: ContentTable }
  | { shape: "chart"; data: ContentChart };

export interface ContentLiveBinding {
  target: string;
  source: string;
}

export interface ContentLive {
  fetch: { url: string; refreshSec?: number };
  /// Opaque render body — `shape` and `data` are validated, but `data`'s
  /// inner fields may be incomplete since bindings fill them at runtime.
  render: { shape: ContentLeafBody["shape"]; data: Record<string, unknown> };
  bindings: ContentLiveBinding[];
}

export type ContentBody =
  | ContentLeafBody
  | { shape: "layout"; data: { direction: ContentLayoutDirection; children: ContentLeafBody[] } }
  | { shape: "live"; data: ContentLive };

export type ScriptLifecycleKind = "static" | "periodic" | "animation" | "realtime";

export interface ScriptLifecycle {
  kind: ScriptLifecycleKind;
  minTickMs?: number;
}

export interface ScriptBody {
  source: string;
  permissions: { network: boolean; pollSeconds?: number };
  htmlShim?: string;
  libraries?: string[];
  /// Declared runtime lifecycle. `animation` arms a stall watchdog in the
  /// host; other kinds are reserved for future invariants. Absent ⇒ static.
  lifecycle?: ScriptLifecycle;
}

export type WidgetSettingsField =
  | {
      type: "text";
      key: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      type: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      defaultValue?: number;
    }
  | {
      type: "boolean";
      key: string;
      label: string;
      defaultValue?: boolean;
    }
  | {
      type: "select";
      key: string;
      label: string;
      options: { label: string; value: string }[];
      defaultValue?: string;
    }
  | {
      type: "secret";
      key: string;
      label: string;
      placeholder?: string;
    };

export interface WidgetSettingsSchema {
  fields: WidgetSettingsField[];
}

export interface WidgetSecretRef {
  type: "secretRef";
  ownerId: string;
  hasSecret: boolean;
  updatedAt?: string;
}
