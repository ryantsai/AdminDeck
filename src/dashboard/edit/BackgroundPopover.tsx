import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauriRuntime } from "../../lib/tauri";
import { BACKGROUND_PRESETS } from "../registry/backgroundPresets";
import { importBackgroundImage } from "../state/persistence";
import { useDashboardStore } from "../state/dashboardStore";
import { BACKGROUND_FITS, type BackgroundFit, type DashboardBackground, type DashboardView } from "../types";

type Mode = "default" | "preset" | "media";

function modeOf(background: DashboardBackground | null): Mode {
  if (!background) return "default";
  return background.kind === "preset" ? "preset" : "media";
}

function isMediaBackground(
  background: DashboardBackground | null,
): background is Extract<DashboardBackground, { kind: "image" | "video" }> {
  return background?.kind === "image" || background?.kind === "video";
}

function mediaKindForFile(file: string): "image" | "video" {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(file) ? "video" : "image";
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
  const mediaBackground = isMediaBackground(background) ? background : null;

  function applyDefault() {
    setMode("default");
    void setViewBackground(view.id, null);
  }

  function applyPreset(presetId: string) {
    setMode("preset");
    void setViewBackground(view.id, { kind: "preset", preset: presetId });
  }

  type MediaBackground = Extract<DashboardBackground, { kind: "image" | "video" }>;
  function applyMediaPatch(patch: Partial<Omit<MediaBackground, "kind">>) {
    const base: MediaBackground = mediaBackground ?? { kind: "image", file: "", fit: "fill", dim: 0 };
    if (!base.file && !patch.file) return;
    void setViewBackground(view.id, { ...base, ...patch });
  }

  async function chooseMedia() {
    setImportError("");
    try {
      let sourcePath: string | null = null;
      if (isTauriRuntime()) {
        const selected = await openDialog({
          directory: false,
          multiple: false,
          title: t("dashboard.backgroundChooseMedia"),
          filters: [{
            name: t("dashboard.backgroundMediaFilter"),
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "mp4", "webm", "mov", "m4v", "ogv"],
          }],
        });
        sourcePath = typeof selected === "string" ? selected : null;
      } else {
        sourcePath = "preview-media.png";
      }
      if (!sourcePath) return;
      const file = await importBackgroundImage(sourcePath);
      await loadBackgroundImage(file);
      setMode("media");
      const base = mediaBackground ?? { fit: "fill" as BackgroundFit, dim: 0 };
      void setViewBackground(view.id, { kind: mediaKindForFile(file), file, fit: base.fit, dim: base.dim });
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
        <button className={mode === "media" ? "active" : ""} onClick={() => setMode("media")}>
          {t("dashboard.backgroundModeMedia")}
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

      {mode === "media" && (
        <div className="dw-bg-image">
          <div className="dw-bg-image-actions">
            <button className="dw-secondary-button" onClick={() => { void chooseMedia(); }}>
              {t("dashboard.backgroundChooseMedia")}
            </button>
            {mediaBackground && (
              <button className="dw-secondary-button" onClick={removeImage}>
                {t("dashboard.backgroundRemoveImage")}
              </button>
            )}
          </div>
          {importError && <small className="dw-muted">{importError}</small>}
          {mediaBackground && (
            <>
              <label className="dw-field">
                <span>{t("dashboard.backgroundFitLabel")}</span>
                <select
                  value={mediaBackground.fit}
                  onChange={(e) => applyMediaPatch({ fit: e.target.value as BackgroundFit })}
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
                  value={mediaBackground.dim}
                  onChange={(e) => applyMediaPatch({ dim: Number(e.target.value) })}
                />
                <small className="dw-muted">{mediaBackground.dim}</small>
              </label>
            </>
          )}
          {!mediaBackground && <p className="dw-muted">{t("dashboard.backgroundMediaHint")}</p>}
        </div>
      )}
    </div>
  );
}
