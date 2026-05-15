import { BACKGROUND_PRESETS, isBackgroundPresetId, resolveBackgroundPreset } from "./backgroundPresets";

// There must be exactly 16 presets (8 solid + 8 gradient), matching the Rust whitelist.
const presetCount: 16 = BACKGROUND_PRESETS.length as 16;
void presetCount;

// resolveBackgroundPreset always returns a definition (falls back to the first entry).
const resolved: { id: string; labelKey: string; css: string } = resolveBackgroundPreset("does-not-exist");
void resolved;

// isBackgroundPresetId narrows to a known id.
const maybeId: string = "mist";
if (isBackgroundPresetId(maybeId)) {
  const known: (typeof BACKGROUND_PRESETS)[number]["id"] = maybeId;
  void known;
}
