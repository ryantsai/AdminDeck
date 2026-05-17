import {
  defaultWidgetPresentationForPreset,
  WIDGET_PRESETS,
  type WidgetPreset,
} from "../types";
import { PRESET_RENDERERS } from "./presetRegistry";

if (WIDGET_PRESETS.includes("mono" as WidgetPreset)) {
  throw new Error("Mono should not be offered as a Dashboard widget preset.");
}

const presetCount: 3 = WIDGET_PRESETS.length;
void presetCount;

if (WIDGET_PRESETS.includes("tile" as WidgetPreset)) {
  throw new Error("Tile should not be offered as a Dashboard widget preset.");
}

if (WIDGET_PRESETS.includes("action" as WidgetPreset)) {
  throw new Error("Action should not be offered as a Dashboard widget preset.");
}

if (!defaultWidgetPresentationForPreset("ambient").hideTitle) {
  throw new Error("Ambient widgets should hide their title by default.");
}

const ambientHideTitleDefault: true = defaultWidgetPresentationForPreset("ambient").hideTitle;
void ambientHideTitleDefault;

for (const preset of WIDGET_PRESETS) {
  if (!PRESET_RENDERERS[preset]) {
    throw new Error(`Dashboard preset renderer missing for ${preset}.`);
  }
}
