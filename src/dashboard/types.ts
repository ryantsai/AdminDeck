export type WidgetKind = "builtIn" | "content" | "script";
export type WidgetCustomKind = "content" | "script";

export const WIDGET_PRESETS = [
  "panel", "ambient", "tile", "hero", "mono", "action",
] as const;
export type WidgetPreset = (typeof WIDGET_PRESETS)[number];

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
  | { kind: "video"; file: string; fit: BackgroundFit; dim: number };

export interface DashboardView {
  id: string;
  title: string;
  sortOrder: number;
  gridDensity: GridDensity;
  background: DashboardBackground | null;
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
  actionDirection?: "vertical" | "horizontal";
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
  actionDirection?: "vertical" | "horizontal";
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

export type ContentBody =
  | { shape: "markdown"; data: { source: string } }
  | { shape: "kvList"; data: { rows: { label: string; value: string }[] } }
  | { shape: "checklist"; data: { items: { label: string; done?: boolean }[] } }
  | { shape: "stat"; data: { value: string; unit?: string; delta?: string; caption?: string } };

export interface ScriptBody {
  source: string;
  permissions: { network: boolean; pollSeconds?: number };
  htmlShim?: string;
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
