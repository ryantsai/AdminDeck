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
  { id: "g-dawn",     labelKey: "dashboard.backgroundPresets.gDawn",    css: "linear-gradient(135deg, #f3efe7, #e8eef3)" },
  { id: "g-fog",      labelKey: "dashboard.backgroundPresets.gFog",     css: "linear-gradient(135deg, #eceef1, #dfe3e9)" },
  { id: "g-meadow",   labelKey: "dashboard.backgroundPresets.gMeadow",  css: "linear-gradient(135deg, #eef2ec, #e3ebe6)" },
  { id: "g-dusk",     labelKey: "dashboard.backgroundPresets.gDusk",    css: "linear-gradient(135deg, #eceaf2, #e5e8ee)" },
  { id: "g-linen",    labelKey: "dashboard.backgroundPresets.gLinen",   css: "linear-gradient(135deg, #f4f1ea, #ebe7de)" },
  { id: "g-horizon",  labelKey: "dashboard.backgroundPresets.gHorizon", css: "linear-gradient(135deg, #e8eef3, #f0f2f5)" },
  { id: "g-petal",    labelKey: "dashboard.backgroundPresets.gPetal",   css: "linear-gradient(135deg, #f3ecef, #ece9f1)" },
  { id: "g-twilight", labelKey: "dashboard.backgroundPresets.gTwilight",css: "linear-gradient(135deg, #2c3040, #23262f)" },
] as const;

export function resolveBackgroundPreset(id: string): BackgroundPresetDefinition {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? BACKGROUND_PRESETS[0];
}

export function isBackgroundPresetId(value: string): value is (typeof BACKGROUND_PRESETS)[number]["id"] {
  return BACKGROUND_PRESETS.some((preset) => preset.id === value);
}
