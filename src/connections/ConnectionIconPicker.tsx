import { ImagePlus, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ConnectionIcon,
  PREDEFINED_CONNECTION_ICON_TYPES,
  connectionIconSrcForConnection,
} from "./ConnectionIcon";
import { connectionTypeLabel } from "./utils";
import { blobToDataUrl, resizeImageBlobToIconDataUrl } from "./iconImage";
import { ariaPressed, dialogButtonAria } from "../lib/aria";
import type { ConnectionType } from "../types";

const MAX_SOURCE_ICON_FILE_BYTES = 8 * 1024 * 1024;

export function ConnectionIconPicker({
  customIconDataUrls,
  iconDataUrl,
  localShell,
  onChange,
  type,
}: {
  customIconDataUrls: string[];
  iconDataUrl?: string | null;
  localShell?: string;
  onChange: (iconDataUrl: string | null) => void;
  type: ConnectionType;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentIconDataUrl = iconDataUrl ?? null;
  const defaultIconSrc = connectionIconSrcForConnection({ localShell, type });
  const reusableIconDataUrls = useMemo(
    () => customIconDataUrls.filter((dataUrl) => dataUrl !== currentIconDataUrl),
    [customIconDataUrls, currentIconDataUrl],
  );

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

  async function selectPredefinedIcon(src: string) {
    setError("");
    if (src === defaultIconSrc) {
      onChange(null);
      setOpen(false);
      return;
    }

    try {
      onChange(await imageSourceToDataUrl(src));
      setOpen(false);
    } catch {
      setError(t("connections.iconReadError"));
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setError("");
    if (file.size > MAX_SOURCE_ICON_FILE_BYTES) {
      setError(t("connections.iconFileTooLarge"));
      return;
    }
    try {
      onChange(await resizeImageBlobToIconDataUrl(file));
      setOpen(false);
    } catch {
      setError(t("connections.iconReadError"));
    }
  }

  return (
    <div className="connection-icon-editor" ref={rootRef}>
      <button
        aria-label={t("connections.editIcon")}
        className="connection-icon-edit-button"
        onClick={() => {
          setError("");
          setOpen((current) => !current);
        }}
        type="button"
        {...dialogButtonAria(open)}
      >
        <ConnectionIcon iconDataUrl={currentIconDataUrl} localShell={localShell} size={38} type={type} />
        <span className="connection-icon-edit-glyph" aria-hidden="true">
          <Pencil size={12} />
        </span>
      </button>
      {open ? (
        <div className="connection-icon-popover" role="dialog" aria-label={t("connections.iconPickerLabel")}>
          <div className="connection-icon-picker-section">
            <p>{t("connections.predefinedIcons")}</p>
            <div className="connection-icon-grid">
              <IconChoiceButton
                active={!currentIconDataUrl}
                ariaLabel={t("connections.useDefaultIcon")}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <ConnectionIcon localShell={localShell} size={22} type={type} />
              </IconChoiceButton>
              {PREDEFINED_CONNECTION_ICON_TYPES.map((iconType) => {
                const src = connectionIconSrcForConnection({ type: iconType });
                const label = connectionTypeLabel(iconType);
                return (
                  <IconChoiceButton
                    active={false}
                    ariaLabel={t("connections.selectPredefinedIcon", { icon: label })}
                    key={iconType}
                    onClick={() => void selectPredefinedIcon(src)}
                  >
                    <ConnectionIcon size={22} type={iconType} />
                  </IconChoiceButton>
                );
              })}
              <IconChoiceButton
                active={false}
                ariaLabel={t("connections.selectPredefinedIcon", { icon: t("connections.wsl") })}
                onClick={() =>
                  void selectPredefinedIcon(connectionIconSrcForConnection({ localShell: "wsl.exe", type: "local" }))
                }
              >
                <ConnectionIcon localShell="wsl.exe" size={22} type="local" />
              </IconChoiceButton>
            </div>
          </div>
          {currentIconDataUrl ? (
            <div className="connection-icon-picker-section">
              <p>{t("connections.customImage")}</p>
              <div className="connection-icon-current">
                <IconChoiceButton
                  active
                  ariaLabel={t("connections.currentCustomIcon")}
                  onClick={() => setOpen(false)}
                >
                  <img alt="" aria-hidden="true" src={currentIconDataUrl} />
                </IconChoiceButton>
                <button
                  aria-label={t("connections.removeCustomIcon")}
                  className="connection-icon-remove-button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : null}
          {reusableIconDataUrls.length > 0 ? (
            <div className="connection-icon-picker-section">
              <p>{t("connections.savedImages")}</p>
              <div className="connection-icon-grid">
                {reusableIconDataUrls.map((dataUrl, index) => (
                  <IconChoiceButton
                    active={false}
                    ariaLabel={t("connections.selectSavedIcon", { index: index + 1 })}
                    key={`${dataUrl}-${index}`}
                    onClick={() => {
                      onChange(dataUrl);
                      setOpen(false);
                    }}
                  >
                    <img alt="" aria-hidden="true" src={dataUrl} />
                  </IconChoiceButton>
                ))}
              </div>
            </div>
          ) : null}
          <div className="connection-icon-picker-actions">
            <button className="toolbar-button" onClick={() => fileInputRef.current?.click()} type="button">
              <ImagePlus size={15} />
              {t("connections.chooseImage")}
            </button>
            <button className="toolbar-button" onClick={() => onChange(null)} type="button">
              <RotateCcw size={15} />
              {t("connections.useDefaultIcon")}
            </button>
          </div>
          <input
            accept="image/*"
            aria-label={t("connections.chooseImage")}
            className="connection-icon-file-input"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function IconChoiceButton({
  active,
  ariaLabel,
  children,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="connection-icon-choice"
      onClick={onClick}
      type="button"
      {...ariaPressed(active)}
    >
      {children}
    </button>
  );
}

async function imageSourceToDataUrl(src: string) {
  if (src.startsWith("data:image/")) {
    return src;
  }
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("icon fetch failed");
  }
  return blobToDataUrl(await response.blob());
}
