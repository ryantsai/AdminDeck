import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  listCustomFontOptions,
  normalizeAvailableAppearance,
  type CustomFontOption,
} from "../lib/customFonts";
import { invokeCommand, isTauriRuntime, openFilesystemPath } from "../lib/tauri";
import { defaultAppearanceSettings } from "../sample-data";
import { useWorkspaceStore } from "../store";
import type { AppearanceSettings as AppearanceSettingsType, ColorScheme } from "../types";

const APP_UI_FONT_OPTIONS = [
  {
    labelKey: "settings.satoshiDefault",
    value: defaultAppearanceSettings.appFontFamily,
  },
  {
    labelKey: "settings.segoeUi",
    value: '"Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  {
    labelKey: "settings.arial",
    value: 'Arial, "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.microsoftJhengHeiUi",
    value: '"Microsoft JhengHei UI", "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.microsoftYaHeiUi",
    value: '"Microsoft YaHei UI", "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.yuGothicUi",
    value: '"Yu Gothic UI", "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.malgunGothic",
    value: '"Malgun Gothic", "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.tahoma",
    value: 'Tahoma, "Segoe UI", sans-serif',
  },
  {
    labelKey: "settings.consolas",
    value: 'Consolas, "Segoe UI", sans-serif',
  },
] as const;

const COLOR_SCHEME_OPTIONS: { value: ColorScheme; labelKey: string }[] = [
  { value: "default", labelKey: "settings.schemeDefault" },
  { value: "dark", labelKey: "settings.schemeDark" },
  { value: "light", labelKey: "settings.schemeLight" },
  { value: "mac", labelKey: "settings.schemeMac" },
  { value: "orange", labelKey: "settings.schemeOrange" },
  { value: "purple", labelKey: "settings.schemePurple" },
  { value: "pink", labelKey: "settings.schemePink" },
];

const SCHEME_PREVIEW_LABELS = ["settings.appBg", "settings.surface", "settings.text", "settings.accent", "settings.green"] as const;

const SCHEME_PREVIEW_COLORS: Record<ColorScheme, string[]> = {
  default: ["#eef1f5", "#ffffff", "#17202b", "#2563eb", "#15915f"],
  dark: ["#1a1d24", "#2b303b", "#e4e7ee", "#4b8bff", "#3fb87b"],
  light: ["#ffffff", "#f5f7fa", "#0a1628", "#1d4ed8", "#0d6b3d"],
  mac: ["#ececec", "#ffffff", "#1d1d1f", "#0071e3", "#34c759"],
  orange: ["#fff5ec", "#ffffff", "#1a1a1a", "#e87a00", "#2d8a4e"],
  purple: ["#1e1836", "#2d2650", "#e8e4f4", "#a78bfa", "#4ade80"],
  pink: ["#fff0f5", "#ffffff", "#2d1b3a", "#c026d3", "#15803d"],
};

export function AppearanceSettings({ onResetLayout }: { onResetLayout: () => void }) {
  const { t } = useTranslation();
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const setAppearanceSettings = useWorkspaceStore((state) => state.setAppearanceSettings);
  const [customFonts, setCustomFonts] = useState<CustomFontOption[]>([]);

  async function applyAppearance(settings: AppearanceSettingsType) {
    setAppearanceSettings(settings);
    if (isTauriRuntime()) {
      invokeCommand("update_appearance_settings", { request: settings }).catch(() => undefined);
    }
  }

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      return () => {
        disposed = true;
      };
    }

    void listCustomFontOptions()
      .then((fonts) => {
        if (disposed) return;
        setCustomFonts(fonts);
        const normalized = normalizeAvailableAppearance(appearanceSettings, fonts);
        if (JSON.stringify(normalized) !== JSON.stringify(appearanceSettings)) {
          void applyAppearance(normalized);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [appearanceSettings]);

  async function handleOpenCustomFontsFolder() {
    if (!isTauriRuntime()) {
      return;
    }
    const folder = await invokeCommand("get_custom_fonts_folder");
    await openFilesystemPath(folder);
  }

  const previewColors = SCHEME_PREVIEW_COLORS[appearanceSettings.colorScheme];
  const knownFontSelected = APP_UI_FONT_OPTIONS.some((option) => option.value === appearanceSettings.appFontFamily);
  const customFontSelected = customFonts.some((font) => font.cssValue === appearanceSettings.appFontFamily);

  return (
    <section className="settings-card settings-section">
      <div className="settings-section-header">
        <div>
          <p className="panel-label">{t("settings.sectionAppearance")}</p>
          <h2>{t("settings.appearanceInterface")}</h2>
        </div>
      </div>
      <div className="form-grid appearance-font-grid">
        <label>
          <span>{t("settings.appUiFontFamily")}</span>
          <div className="input-with-button">
            <select
              onChange={(event) => {
                const selectedValue = event.currentTarget.value;
                const selectedCustomFont = customFonts.find((font) => font.cssValue === selectedValue);
                void applyAppearance({
                  ...appearanceSettings,
                  appFontFamily: selectedValue,
                  customFontPath: selectedCustomFont?.path,
                });
              }}
              value={appearanceSettings.appFontFamily}
            >
              {knownFontSelected || customFontSelected ? null : (
                <option value={appearanceSettings.appFontFamily}>{t("settings.customFont")}</option>
              )}
              {APP_UI_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
              {customFonts.length > 0 ? <optgroup label={t("settings.customFonts")}>{customFonts.map((font) => (
                <option key={font.path} value={font.cssValue}>
                  {font.name}
                </option>
              ))}</optgroup> : null}
            </select>
            <button
              aria-label={t("settings.openCustomFontsFolder")}
              className="toolbar-button"
              onClick={() => void handleOpenCustomFontsFolder()}
              title={t("settings.openCustomFontsFolder")}
              type="button"
            >
              <FolderOpen size={15} />
              {t("settings.openCustomFontsFolder")}
            </button>
          </div>
          <small className="field-hint">
            {customFonts.length > 0 ? t("settings.customFontsHint") : t("settings.noCustomFonts")}
          </small>
        </label>
        <label>
          <span>{t("settings.colorScheme")}</span>
          <select
            onChange={(event) => {
              const colorScheme = event.currentTarget.value as ColorScheme;
              void applyAppearance({
                ...appearanceSettings,
                colorScheme,
              });
            }}
            value={appearanceSettings.colorScheme}
          >
            {COLOR_SCHEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="color-scheme-preview" aria-label={t("settings.colorSchemePreview")}>
        <span className="color-scheme-preview-label">{t("settings.colorSchemePreview")}</span>
        <div className="color-scheme-preview-swatches">
          {previewColors.map((color, i) => (
            <div
              key={i}
              className="color-scheme-preview-swatch"
              style={{ background: color }}
            >
              <span className="color-scheme-preview-swatch-label">
                {t(SCHEME_PREVIEW_LABELS[i])}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="settings-reset-layout">
        <div>
          <strong>{t("settings.layout")}</strong>
          <span>{t("settings.resetLayoutDescription")}</span>
        </div>
        <button className="toolbar-button" onClick={onResetLayout} type="button">
          <RotateCcw size={15} />
          {t("settings.resetLayout")}
        </button>
      </div>
    </section>
  );
}
