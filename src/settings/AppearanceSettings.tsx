import { useEffect, useState } from "react";
import { FolderOpen, Palette, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  listCustomFontOptions,
  loadCustomFontOptions,
  normalizeAvailableAppearance,
  type CustomFontOption,
} from "../lib/customFonts";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { defaultAppearanceSettings } from "../app-defaults";
import { useWorkspaceStore } from "../store";
import type { AppearanceSettings as AppearanceSettingsType, ColorScheme } from "../types";
import { SettingsSectionHeader } from "./shared";

const APP_UI_FONT_OPTIONS = [
  {
    labelKey: "settings.interDefault",
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
  { value: "green-kuai-kuai", labelKey: "settings.schemeGreenKuaiKuai" },
  { value: "blue-see", labelKey: "settings.schemeBlueSee" },
  { value: "confetti", labelKey: "settings.schemeConfetti" },
  { value: "bubble-tea", labelKey: "settings.schemeBubbleTea" },
];

type SchemePreviewColor = { color: string; labelKey: string };

const SCHEME_PREVIEW_COLORS: Record<ColorScheme, SchemePreviewColor[]> = {
  default: [
    { color: "#eef1f5", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#17202b", labelKey: "settings.text" },
    { color: "#2563eb", labelKey: "settings.accent" },
    { color: "#15915f", labelKey: "settings.green" },
    { color: "#202936", labelKey: "settings.navToolbar" },
    { color: "#d8e1ef", labelKey: "settings.toolbarText" },
  ],
  dark: [
    { color: "#1a1d24", labelKey: "settings.appBg" },
    { color: "#2b303b", labelKey: "settings.surface" },
    { color: "#e4e7ee", labelKey: "settings.text" },
    { color: "#4b8bff", labelKey: "settings.accent" },
    { color: "#3fb87b", labelKey: "settings.green" },
    { color: "#202936", labelKey: "settings.navToolbar" },
    { color: "#d8e1ef", labelKey: "settings.toolbarText" },
  ],
  light: [
    { color: "#ffffff", labelKey: "settings.appBg" },
    { color: "#f5f7fa", labelKey: "settings.surface" },
    { color: "#0a1628", labelKey: "settings.text" },
    { color: "#1d4ed8", labelKey: "settings.accent" },
    { color: "#0d6b3d", labelKey: "settings.green" },
    { color: "#202936", labelKey: "settings.navToolbar" },
    { color: "#d8e1ef", labelKey: "settings.toolbarText" },
  ],
  mac: [
    { color: "#ececec", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#1d1d1f", labelKey: "settings.text" },
    { color: "#0071e3", labelKey: "settings.accent" },
    { color: "#34c759", labelKey: "settings.green" },
    { color: "#e4e4e8", labelKey: "settings.navToolbar" },
    { color: "#1d1d1f", labelKey: "settings.toolbarText" },
  ],
  orange: [
    { color: "#fff0d6", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#102047", labelKey: "settings.text" },
    { color: "#ff6f00", labelKey: "settings.accent" },
    { color: "#2db833", labelKey: "settings.green" },
    { color: "#ff7900", labelKey: "settings.navToolbar" },
    { color: "#ffffff", labelKey: "settings.toolbarText" },
  ],
  purple: [
    { color: "#1e1836", labelKey: "settings.appBg" },
    { color: "#2d2650", labelKey: "settings.surface" },
    { color: "#e8e4f4", labelKey: "settings.text" },
    { color: "#a78bfa", labelKey: "settings.accent" },
    { color: "#4ade80", labelKey: "settings.green" },
    { color: "#1b1536", labelKey: "settings.navToolbar" },
    { color: "#ece6ff", labelKey: "settings.toolbarText" },
  ],
  pink: [
    { color: "#fff0f5", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#2d1b3a", labelKey: "settings.text" },
    { color: "#c026d3", labelKey: "settings.accent" },
    { color: "#15803d", labelKey: "settings.green" },
    { color: "#5a2148", labelKey: "settings.navToolbar" },
    { color: "#ffe3f1", labelKey: "settings.toolbarText" },
  ],
  "green-kuai-kuai": [
    { color: "#71c83a", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#082d68", labelKey: "settings.text" },
    { color: "#d71920", labelKey: "settings.accent" },
    { color: "#62bd2f", labelKey: "settings.green" },
    { color: "#71c83a", labelKey: "settings.navToolbar" },
    { color: "#082d68", labelKey: "settings.toolbarText" },
  ],
  "blue-see": [
    { color: "#0c1929", labelKey: "settings.appBg" },
    { color: "#182840", labelKey: "settings.surface" },
    { color: "#d8e6f4", labelKey: "settings.text" },
    { color: "#4da6ff", labelKey: "settings.accent" },
    { color: "#3fb87b", labelKey: "settings.green" },
    { color: "#0a1525", labelKey: "settings.navToolbar" },
    { color: "#c8dcf0", labelKey: "settings.toolbarText" },
  ],
  confetti: [
    { color: "#fef9f0", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#2d1f3a", labelKey: "settings.text" },
    { color: "#e040b0", labelKey: "settings.accent" },
    { color: "#2eaa6a", labelKey: "settings.green" },
    { color: "#3a2550", labelKey: "settings.navToolbar" },
    { color: "#f0e0f8", labelKey: "settings.toolbarText" },
  ],
  "bubble-tea": [
    { color: "#faf3e6", labelKey: "settings.appBg" },
    { color: "#ffffff", labelKey: "settings.surface" },
    { color: "#3b2216", labelKey: "settings.text" },
    { color: "#c47a38", labelKey: "settings.accent" },
    { color: "#6b8e4e", labelKey: "settings.green" },
    { color: "#3b2216", labelKey: "settings.navToolbar" },
    { color: "#f5e6d0", labelKey: "settings.toolbarText" },
  ],
};

export function AppearanceSettings({ onResetLayout }: { onResetLayout: () => void }) {
  const { t } = useTranslation();
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const setAppearanceSettings = useWorkspaceStore((state) => state.setAppearanceSettings);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [customFonts, setCustomFonts] = useState<CustomFontOption[]>([]);
  const [draft, setDraft] = useState<AppearanceSettingsType>(appearanceSettings);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(appearanceSettings);

  useEffect(() => {
    setDraft(appearanceSettings);
  }, [appearanceSettings]);

  async function applyAppearance(settings: AppearanceSettingsType) {
    setAppearanceSettings(settings);
    if (isTauriRuntime()) {
      invokeCommand("update_appearance_settings", { request: settings }).catch(() => undefined);
    }
  }

  async function handleSave() {
    try {
      const selectedCustomFont = customFonts.find((font) => font.cssValue === draft.appFontFamily);
      if (selectedCustomFont) {
        await loadCustomFontOptions([selectedCustomFont]);
      }
      const next: AppearanceSettingsType = {
        ...draft,
        customFontPath: selectedCustomFont?.path,
      };
      const saved = isTauriRuntime()
        ? await invokeCommand("update_appearance_settings", { request: next })
        : next;
      setAppearanceSettings(saved);
      setDraft(saved);
      showStatusBarNotice(t("settings.appearanceSaved"), { tone: "success" });
    } catch (saveError) {
      showStatusBarNotice(
        saveError instanceof Error ? saveError.message : String(saveError),
        { tone: "error" },
      );
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
    await invokeCommand("open_custom_fonts_folder");
  }

  const previewColors = SCHEME_PREVIEW_COLORS[draft.colorScheme];
  const knownFontSelected = APP_UI_FONT_OPTIONS.some((option) => option.value === draft.appFontFamily);
  const customFontSelected = customFonts.some((font) => font.cssValue === draft.appFontFamily);

  return (
    <section className="settings-card settings-section">
      <SettingsSectionHeader
        actions={
          <button
            className="toolbar-button"
            disabled={!hasChanges}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={15} />
            {t("settings.save")}
          </button>
        }
        icon={<Palette size={18} />}
        label={t("settings.sectionAppearance")}
        title={t("settings.appearanceInterface")}
      />
      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.typography")}</legend>
        <div>
          <p className="field-hint">{t("settings.typographyHint")}</p>
        </div>
        <div className="form-grid appearance-font-grid">
          <label>
            <span>{t("settings.appUiFontFamily")}</span>
            <div className="input-with-button">
              <select
                onChange={(event) => {
                  const selectedValue = event.currentTarget.value;
                  setDraft((s) => ({ ...s, appFontFamily: selectedValue }));
                }}
                value={draft.appFontFamily}
              >
                {knownFontSelected || customFontSelected ? null : (
                  <option value={draft.appFontFamily}>{t("settings.customFont")}</option>
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
        </div>
      </fieldset>
      <fieldset className="settings-subsection settings-fieldset">
        <legend>{t("settings.theme")}</legend>
        <div>
          <p className="field-hint">{t("settings.themeHint")}</p>
        </div>
        <div className="form-grid appearance-font-grid">
          <label>
            <span>{t("settings.colorScheme")}</span>
            <select
              onChange={(event) => {
                const colorScheme = event.currentTarget.value as ColorScheme;
                setDraft((s) => ({ ...s, colorScheme }));
              }}
              value={draft.colorScheme}
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
            {previewColors.map((previewColor) => (
              <div
                key={previewColor.labelKey}
                className="color-scheme-preview-swatch"
                style={{ background: previewColor.color }}
              >
                <span className="color-scheme-preview-swatch-label">
                  {t(previewColor.labelKey)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </fieldset>
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
