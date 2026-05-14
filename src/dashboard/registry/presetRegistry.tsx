import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { WidgetPreset } from "../types";

export interface PresetChromeProps {
  title: string;
  summary?: string;
  icon: ReactNode;
  body: ReactNode;
  controls?: ReactNode;
  editMode: boolean;
  glass?: boolean;
  actionDirection?: "vertical" | "horizontal";
}

function PanelTitle({ title, summary }: { title: string; summary?: string }) {
  const [showTip, setShowTip] = useState(false);
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => clearTimer, []);

  function handleEnter() {
    if (!summary) return;
    clearTimer();
    timer.current = window.setTimeout(() => setShowTip(true), 3000);
  }

  function handleLeave() {
    clearTimer();
    setShowTip(false);
  }

  return (
    <div
      className="dw-title-group"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <h3 className="dw-title">{title}</h3>
      {showTip && summary ? (
        <span className="dw-subtitle-tip" role="tooltip">{summary}</span>
      ) : null}
    </div>
  );
}

function PanelChrome({ title, summary, icon, body, controls, editMode }: PresetChromeProps) {
  return (
    <div className="dw-preset dw-preset-panel">
      <div className={`dw-head${editMode ? " drag-handle" : ""}`}>
        <span className="dw-icon">{icon}</span>
        <PanelTitle title={title} summary={summary} />
        {controls}
      </div>
      <div className="dw-body">{body}</div>
    </div>
  );
}

function AmbientChrome({ title, body, controls, editMode, glass }: PresetChromeProps) {
  return (
    <div className={`dw-preset dw-preset-ambient${glass ? " dw-preset-ambient--glass" : ""}${editMode ? " drag-handle" : ""}`}>
      <div className="dw-ambient-label">
        <span className="dw-dot" />
        {title}
        {controls}
      </div>
      {body}
    </div>
  );
}

function TileChrome({ title, icon, body, controls, editMode }: PresetChromeProps) {
  return (
    <div className={`dw-preset dw-preset-tile${editMode ? " drag-handle" : ""}`}>
      <div className="dw-tile-head">
        <span className="dw-tile-label">{title}</span>
        <span className="dw-tile-icon">{icon}</span>
        {controls}
      </div>
      <div className="dw-tile-body">{body}</div>
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

function MonoChrome({ title, body, controls, editMode }: PresetChromeProps) {
  return (
    <div className="dw-preset dw-preset-mono">
      <div className={`dw-mono-head${editMode ? " drag-handle" : ""}`}>
        <span className="dw-mono-lights"><span/><span/><span/></span>
        <span className="dw-mono-title">{title}</span>
        {controls}
      </div>
      <div className="dw-mono-body">{body}</div>
    </div>
  );
}

function ActionChrome({ title, icon, body, controls, editMode, actionDirection }: PresetChromeProps) {
  if (actionDirection === "horizontal") {
    return (
      <div className={`dw-preset dw-preset-action dw-preset-action--horizontal${editMode ? " drag-handle" : ""}`}>
        <span className="dw-action-icon">{icon}</span>
        <div className="dw-action-body">
          <h3 className="dw-action-title">{title}</h3>
          {body}
        </div>
        {controls}
      </div>
    );
  }
  return (
    <div className={`dw-preset dw-preset-action${editMode ? " drag-handle" : ""}`}>
      <span className="dw-action-icon">{icon}</span>
      <div className="dw-action-body">
        <h3 className="dw-action-title">{title}</h3>
        {body}
      </div>
      {controls}
    </div>
  );
}

export const PRESET_RENDERERS: Record<WidgetPreset, (p: PresetChromeProps) => ReactElement> = {
  panel: PanelChrome,
  ambient: AmbientChrome,
  tile: TileChrome,
  hero: HeroChrome,
  mono: MonoChrome,
  action: ActionChrome,
};
