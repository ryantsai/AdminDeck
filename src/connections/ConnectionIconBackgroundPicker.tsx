import { Palette, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ariaPressed, dialogButtonAria } from "../lib/aria";

const CONNECTION_ICON_BACKGROUND_COLORS = [
  { name: "blue", color: "#2563eb" },
  { name: "indigo", color: "#4f46e5" },
  { name: "teal", color: "#0d9488" },
  { name: "green", color: "#15915f" },
  { name: "amber", color: "#d97706" },
  { name: "red", color: "#dc2626" },
  { name: "purple", color: "#7c3aed" },
  { name: "pink", color: "#db2777" },
  { name: "slate", color: "#475569" },
  { name: "cyan", color: "#0891b2" },
  { name: "orange", color: "#ea580c" },
  { name: "rose", color: "#e11d48" },
  { name: "emerald", color: "#059669" },
  { name: "sky", color: "#0284c7" },
];

export function ConnectionIconBackgroundPicker({
  color,
  onChange,
}: {
  color?: string | null;
  onChange: (color: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentColor = color ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="connection-icon-bg-editor" ref={rootRef}>
      <button
        aria-label={t("connections.editIconBackground")}
        className="connection-icon-bg-edit-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
        {...dialogButtonAria(open)}
      >
        <span
          aria-hidden="true"
          className={currentColor ? "connection-icon-bg-preview active" : "connection-icon-bg-preview"}
          style={{ "--connection-icon-bg-preview": currentColor ?? "transparent" } as CSSProperties}
        >
          <Palette size={15} />
        </span>
      </button>
      {open ? (
        <div className="connection-icon-bg-popover" role="dialog" aria-label={t("connections.iconBackground")}>
          <p>{t("connections.iconBackground")}</p>
          <div className="connection-icon-bg-grid">
            <ColorChoiceButton
              active={!currentColor}
              ariaLabel={t("connections.transparentIconBackground")}
              color={null}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            {CONNECTION_ICON_BACKGROUND_COLORS.map((accent) => (
              <ColorChoiceButton
                active={currentColor?.toLowerCase() === accent.color.toLowerCase()}
                ariaLabel={t("connections.selectIconBackground", { color: accent.name })}
                color={accent.color}
                key={accent.name}
                onClick={() => {
                  onChange(accent.color);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            className="toolbar-button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            type="button"
          >
            <RotateCcw size={15} />
            {t("common.reset")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ColorChoiceButton({
  active,
  ariaLabel,
  color,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  color: string | null;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={color ? "connection-icon-bg-choice" : "connection-icon-bg-choice transparent"}
      onClick={onClick}
      style={{ "--connection-icon-bg-choice": color ?? "transparent" } as CSSProperties}
      type="button"
      {...ariaPressed(active)}
    />
  );
}
