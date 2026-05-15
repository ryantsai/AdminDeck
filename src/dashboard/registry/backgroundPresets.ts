export interface BackgroundPresetDefinition {
  id: string;
  labelKey: string;       // i18n key under dashboard.backgroundPresets.*
  css: string;            // literal CSS `background` value
}

export const BACKGROUND_PRESETS: readonly BackgroundPresetDefinition[] = [
  { id: "mist",       labelKey: "dashboard.backgroundPresets.mist",     css: "#eceef1" },
  { id: "sand",       labelKey: "dashboard.backgroundPresets.sand",     css: "#f3efe7" },
  { id: "sage",       labelKey: "dashboard.backgroundPresets.sage",     css: "#e9efe9" },
  { id: "sky",        labelKey: "dashboard.backgroundPresets.sky",      css: "#e8eef3" },
  { id: "blush",      labelKey: "dashboard.backgroundPresets.blush",    css: "#f3ecef" },
  { id: "lavender",   labelKey: "dashboard.backgroundPresets.lavender", css: "#eceaf2" },
  { id: "slate",      labelKey: "dashboard.backgroundPresets.slate",    css: "#e5e8ee" },
  { id: "graphite",   labelKey: "dashboard.backgroundPresets.graphite", css: "#2a2e37" },
  { id: "g-dawn",     labelKey: "dashboard.backgroundPresets.gDawn",    css: "linear-gradient(135deg, #f7d6b4 0%, #e9edf2 50%, #b7d1ea 100%)" },
  { id: "g-fog",      labelKey: "dashboard.backgroundPresets.gFog",     css: "linear-gradient(135deg, #f8fafc 0%, #d7dee8 48%, #aeb8c8 100%)" },
  { id: "g-meadow",   labelKey: "dashboard.backgroundPresets.gMeadow",  css: "linear-gradient(135deg, #f4efc8 0%, #d7ead7 48%, #98c7ad 100%)" },
  { id: "g-dusk",     labelKey: "dashboard.backgroundPresets.gDusk",    css: "linear-gradient(135deg, #f0d4df 0%, #d7d2ee 52%, #aeb8d3 100%)" },
  { id: "g-linen",    labelKey: "dashboard.backgroundPresets.gLinen",   css: "linear-gradient(135deg, #fff4da 0%, #eadfc8 48%, #cbb891 100%)" },
  { id: "g-horizon",  labelKey: "dashboard.backgroundPresets.gHorizon", css: "linear-gradient(135deg, #c6e4f5 0%, #eef2f5 45%, #f4d1a6 100%)" },
  { id: "g-petal",    labelKey: "dashboard.backgroundPresets.gPetal",   css: "linear-gradient(135deg, #f7ccd9 0%, #eee0f3 48%, #c8d7f0 100%)" },
  { id: "g-twilight", labelKey: "dashboard.backgroundPresets.gTwilight",css: "linear-gradient(135deg, #46506a 0%, #2c3040 48%, #171a22 100%)" },
] as const;

export function resolveBackgroundPreset(id: string): BackgroundPresetDefinition {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? BACKGROUND_PRESETS[0];
}

export function isBackgroundPresetId(value: string): value is (typeof BACKGROUND_PRESETS)[number]["id"] {
  return BACKGROUND_PRESETS.some((preset) => preset.id === value);
}
