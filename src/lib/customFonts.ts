import { defaultAppearanceSettings } from "../app-defaults";
import type { AppearanceSettings, CustomFont } from "../types";
import { invokeCommand, isTauriRuntime } from "./tauri";

const CUSTOM_FONT_FALLBACK = '"Segoe UI", ui-sans-serif, system-ui, sans-serif';

const loadedFontFamilies = new Set<string>();

export interface CustomFontOption extends CustomFont {
  cssFamily: string;
  cssValue: string;
}

export function customFontCssFamily(path: string) {
  return `KKTerm Custom Font ${hashPath(path)}`;
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
      const { dataBase64 } = await invokeCommand("load_custom_font_data", { path: font.path });
      const face = new FontFace(
        font.cssFamily,
        base64ToArrayBuffer(dataBase64),
        { display: "swap" },
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

function hashPath(path: string) {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function base64ToArrayBuffer(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
