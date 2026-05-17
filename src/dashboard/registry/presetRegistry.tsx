import type { ReactElement, ReactNode } from "react";
import type { WidgetPreset } from "../types";

export interface PresetChromeProps {
  title: string;
  icon: ReactNode;
  body: ReactNode;
  controls?: ReactNode;
  editMode: boolean;
  glass?: boolean;
  hideTitle?: boolean;
}

function PanelChrome({ title, icon, body, controls, editMode }: PresetChromeProps) {
  return (
    <div className="dw-preset dw-preset-panel">
      <div className={`dw-head${editMode ? " drag-handle" : ""}`}>
        <span className="dw-icon">{icon}</span>
        <h3 className="dw-title">{title}</h3>
        {controls}
      </div>
      <div className="dw-body">{body}</div>
    </div>
  );
}

function AmbientChrome({ title, body, controls, editMode, glass, hideTitle }: PresetChromeProps) {
  return (
    <div className={`dw-preset dw-preset-ambient${glass ? " dw-preset-ambient--glass" : ""}${editMode ? " drag-handle" : ""}`}>
      {hideTitle ? controls : (
        <div className="dw-ambient-label">
          <span className="dw-dot" />
          {title}
          {controls}
        </div>
      )}
      {body}
    </div>
  );
}

function HeroChrome({ title, icon, body, controls, editMode }: PresetChromeProps) {
  return (
    <div className="dw-preset dw-preset-hero">
      <div className={`dw-hero-head${editMode ? " drag-handle" : ""}`}>
        <span className="dw-hero-icon">{icon}</span>
        <h3 className="dw-hero-title">{title}</h3>
        {controls}
      </div>
      <div className="dw-hero-body">{body}</div>
    </div>
  );
}

export const PRESET_RENDERERS: Record<WidgetPreset, (p: PresetChromeProps) => ReactElement> = {
  panel: PanelChrome,
  ambient: AmbientChrome,
  hero: HeroChrome,
};
