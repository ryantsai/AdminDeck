import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauriRuntime } from "../../lib/tauri";
import { BACKGROUND_PRESETS } from "../registry/backgroundPresets";
import { importBackgroundImage } from "../state/persistence";
import { useDashboardStore } from "../state/dashboardStore";
import { BACKGROUND_FITS, type BackgroundFit, type DashboardBackground, type DashboardView } from "../types";

type Mode = "default" | "preset" | "image";

function modeOf(background: DashboardBackground | null): Mode {
  if (!background) return "default";
  return background.kind === "preset" ? "preset" : "image";
}

export interface BackgroundPopoverProps {
  view: DashboardView;
  onClose: () => void;
}

export function BackgroundPopover({ view, onClose }: BackgroundPopoverProps) {
  const { t } = useTranslation();
  const setViewBackground = useDashboardStore((s) => s.setViewBackground);
  const loadBackgroundImage = useDashboardStore((s) => s.loadBackgroundImage);
  const ref = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>(modeOf(view.background));
  const [importError, setImportError] = useState("");

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const background = view.background;
  const imageBackground = background?.kind === "image" ? background : null;

  function applyDefault() {
    setMode("default");
    void setViewBackground(view.id, null);
  }

  function applyPreset(presetId: string) {
    setMode("preset");
    void setViewBackground(view.id, { kind: "preset", preset: presetId });
  }

  type ImageBackground = Extract<DashboardBackground, { kind: "image" }>;
  function applyImagePatch(patch: Partial<Omit<ImageBackground, "kind">>) {
    const base: ImageBackground = imageBackground ?? { kind: "image", file: "", fit: "fill", dim: 0 };
    if (!base.file && !patch.file) return;
    void setViewBackground(view.id, { ...base, ...patch, kind: "image" });
  }

  async function chooseImage() {
    setImportError("");
    try {
      let sourcePath: string | null = null;
      if (isTauriRuntime()) {
        const selected = await openDialog({
          directory: false,
          multiple: false,
          title: t("dashboard.backgroundChooseImage"),
          filters: [{
            name: t("dashboard.backgroundImageFilter"),
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          }],
        });
        sourcePath = typeof selected === "string" ? selected : null;
      } else {
        sourcePath = "preview-image.png";
      }
      if (!sourcePath) return;
      const file = await importBackgroundImage(sourcePath);
      await loadBackgroundImage(file);
      setMode("image");
      const base = imageBackground ?? { fit: "fill" as BackgroundFit, dim: 0 };
      void setViewBackground(view.id, { kind: "image", file, fit: base.fit, dim: base.dim });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }

  function removeImage() {
    applyDefault();
  }

  return (
    <div ref={ref} className="dw-bg-popover">
      <header className="dw-bg-popover-head">{t("dashboard.changeBackground")}</header>

      <div className="dw-bg-seg">
        <button className={mode === "default" ? "active" : ""} onClick={applyDefault}>
          {t("dashboard.backgroundModeDefault")}
        </button>
        <button className={mode === "preset" ? "active" : ""} onClick={() => setMode("preset")}>
          {t("dashboard.backgroundModePreset")}
        </button>
        <button className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}>
          {t("dashboard.backgroundModeImage")}
        </button>
      </div>

      {mode === "default" && (
        <p className="dw-muted">{t("dashboard.backgroundDefaultHint")}</p>
      )}

      {mode === "preset" && (
        <div className="dw-bg-preset-grid">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={background?.kind === "preset" && background.preset === preset.id ? "active" : ""}
              style={{ background: preset.css }}
              title={t(preset.labelKey)}
              aria-label={t(preset.labelKey)}
              onClick={() => applyPreset(preset.id)}
            />
          ))}
        </div>
      )}

      {mode === "image" && (
        <div className="dw-bg-image">
          <div className="dw-bg-image-actions">
            <button className="dw-secondary-button" onClick={() => { void chooseImage(); }}>
              {t("dashboard.backgroundChooseImage")}
            </button>
            {imageBackground && (
              <button className="dw-secondary-button" onClick={removeImage}>
                {t("dashboard.backgroundRemoveImage")}
              </button>
            )}
          </div>
          {importError && <small className="dw-muted">{importError}</small>}
          {imageBackground && (
            <>
              <label className="dw-field">
                <span>{t("dashboard.backgroundFitLabel")}</span>
                <select
                  value={imageBackground.fit}
                  onChange={(e) => applyImagePatch({ fit: e.target.value as BackgroundFit })}
                >
                  {BACKGROUND_FITS.map((fit) => (
                    <option key={fit} value={fit}>{t(`dashboard.backgroundFit.${fit}`)}</option>
                  ))}
                </select>
              </label>
              <label className="dw-field">
                <span>{t("dashboard.backgroundDimLabel")}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={imageBackground.dim}
                  onChange={(e) => applyImagePatch({ dim: Number(e.target.value) })}
                />
                <small className="dw-muted">{imageBackground.dim}</small>
              </label>
            </>
          )}
          {!imageBackground && <p className="dw-muted">{t("dashboard.backgroundImageHint")}</p>}
        </div>
      )}
    </div>
  );
}
