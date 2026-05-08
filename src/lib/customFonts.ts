import { convertFileSrc } from "@tauri-apps/api/core";
import { defaultAppearanceSettings } from "../app-defaults";
import type { AppearanceSettings, CustomFont } from "../types";
import { invokeCommand, isTauriRuntime } from "./tauri";

const CUSTOM_FONT_FALLBACK = '"Segoe UI", ui-sans-serif, system-ui, sans-serif';
const REMOVED_BUNDLED_FONT = '"JF Open Huninn", "Microsoft JhengHei UI", "Microsoft YaHei UI", "Segoe UI", sans-serif';

const loadedFontFamilies = new Set<string>();

export interface CustomFontOption extends CustomFont {
  cssFamily: string;
  cssValue: string;
}

export function customFontCssFamily(path: string) {
  return `AdminDeck Custom Font ${hashPath(path)}`;
}

export function customFontCssValue(path: string) {
  return `"${customFontCssFamily(path)}", ${CUSTOM_FONT_FALLBACK}`;
}

export function toCustomFontOptions(fonts: CustomFont[]): CustomFontOption[] {
  return fonts.map((font) => ({
    ...font,
    cssFamily: customFontCssFamily(font.path),
    cssValue: customFontCssValue(font.path),
  }));
}

export async function listCustomFontOptions() {
  if (!isTauriRuntime()) {
    return [];
  }
  const fonts = await invokeCommand("list_custom_fonts");
  const options = toCustomFontOptions(fonts);
  void loadCustomFontOptions(options);
  return options;
}

export async function loadCustomFontOptions(fonts: CustomFontOption[]) {
  if (typeof document === "undefined" || !document.fonts) {
    return;
  }

  await Promise.allSettled(
    fonts.map(async (font) => {
      if (loadedFontFamilies.has(font.cssFamily)) {
        return;
      }
      const face = new FontFace(
        font.cssFamily,
        `url("${convertFileSrc(font.path)}") format("${fontFormat(font.extension)}")`,
      );
      await face.load();
      document.fonts.add(face);
      loadedFontFamilies.add(font.cssFamily);
    }),
  );
}

export function normalizeAvailableAppearance(
  settings: AppearanceSettings,
  customFonts: CustomFontOption[],
): AppearanceSettings {
  if (settings.appFontFamily === REMOVED_BUNDLED_FONT) {
    return defaultAppearanceSettings;
  }

  if (!settings.customFontPath) {
    return settings;
  }

  const customFont = customFonts.find((font) => font.path === settings.customFontPath);
  if (!customFont) {
    return defaultAppearanceSettings;
  }

  if (settings.appFontFamily !== customFont.cssValue) {
    return {
      ...settings,
      appFontFamily: customFont.cssValue,
    };
  }

  return settings;
}

function fontFormat(extension: string) {
  switch (extension.toLowerCase()) {
    case "otf":
      return "opentype";
    case "woff":
      return "woff";
    case "woff2":
      return "woff2";
    case "ttf":
    default:
      return "truetype";
  }
}

function hashPath(path: string) {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
