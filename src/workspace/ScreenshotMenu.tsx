import { Camera } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { menuButtonAria } from "../lib/aria";
import { showNativeContextMenu } from "../lib/nativeContextMenu";
import { invokeCommand, isTauriRuntime, type CaptureScreenshotRequest } from "../lib/tauri";
import { useWorkspaceStore } from "../store";

type ScreenshotRect = CaptureScreenshotRequest;

type ScreenshotRegionState = {
  bounds: DOMRect;
  pointerId?: number;
  start?: { x: number; y: number };
  current?: { x: number; y: number };
};

export function ScreenshotMenu({
  buttonClassName = "icon-button",
  targetRef,
  targetLabel: _targetLabel,
  onPreCapture,
}: {
  buttonClassName?: string;
  targetRef: RefObject<HTMLElement | null>;
  targetLabel?: string;
  onPreCapture?: () => void;
}) {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [menuOpen, setMenuOpen] = useState(false);
  const [regionState, setRegionState] = useState<ScreenshotRegionState | null>(null);
  const [copiedStatus, setCopiedStatus] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const regionTargetRef = useRef<HTMLDivElement | null>(null);
  const regionSelectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function captureRect(rect: ScreenshotRect) {
    if (!isTauriRuntime()) {
      showStatusBarNotice(t("workspace.screenshotsRequireRuntime"), { tone: "warning" });
      return;
    }

    try {
      await waitForScreenshotSurface();
      await invokeCommand("capture_screenshot_to_clipboard", { request: rect });
      setCopiedStatus(t("workspace.copied"));
      showStatusBarNotice(t("workspace.copied"), { tone: "success" });
      window.setTimeout(() => setCopiedStatus(""), 1600);
    } catch (error) {
      showStatusBarNotice(
        t("workspace.screenshotCaptureError", {
          message: error instanceof Error ? error.message : String(error),
        }),
        { tone: "error" },
      );
    }
  }

  function targetBounds() {
    const target = targetRef.current;
    if (!target) {
      return null;
    }
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return bounds;
  }

  function handleEntirePanel() {
    setMenuOpen(false);
    const bounds = targetBounds();
    if (!bounds) {
      return;
    }
    void captureRect(rectFromBounds(bounds));
  }

  function handleRegion() {
    setMenuOpen(false);
    const bounds = targetBounds();
    if (!bounds) {
      return;
    }
    setRegionState({ bounds });
  }

  async function handleButtonClick(event: ReactMouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const opened = await showNativeContextMenu(
      [
        {
          kind: "item",
          label: t("workspace.copyRegion"),
          action: handleRegion,
        },
        {
          kind: "item",
          label: t("workspace.copyEntirePanel"),
          action: handleEntirePanel,
        },
      ],
      {
        x: bounds.left,
        y: bounds.bottom,
      },
    );
    if (opened) {
      setMenuOpen(false);
      return;
    }
    setMenuOpen((open) => !open);
  }

  function handleRegionPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState || !pointInBounds(event.clientX, event.clientY, regionState.bounds)) {
      return;
    }
    const point = clampPointToBounds(event.clientX, event.clientY, regionState.bounds);
    event.currentTarget.setPointerCapture(event.pointerId);
    setRegionState({
      ...regionState,
      pointerId: event.pointerId,
      start: point,
      current: point,
    });
  }

  function handleRegionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState?.start || regionState.pointerId !== event.pointerId) {
      return;
    }
    setRegionState({
      ...regionState,
      current: clampPointToBounds(event.clientX, event.clientY, regionState.bounds),
    });
  }

  function handleRegionPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState?.start || regionState.pointerId !== event.pointerId) {
      return;
    }
    const current = clampPointToBounds(event.clientX, event.clientY, regionState.bounds);
    const rect = rectFromPoints(regionState.start, current);
    setRegionState(null);

    if (rect.width < 4 || rect.height < 4) {
      return;
    }
    void captureRect(rect);
  }

  function handleRegionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setRegionState(null);
    }
  }

  const selectionRect =
    regionState?.start && regionState.current
      ? rectFromPoints(regionState.start, regionState.current)
      : null;

  useLayoutEffect(() => {
    const node = regionTargetRef.current;
    if (!node || !regionState) {
      return;
    }

    node.style.height = `${regionState.bounds.height}px`;
    node.style.left = `${regionState.bounds.left}px`;
    node.style.top = `${regionState.bounds.top}px`;
    node.style.width = `${regionState.bounds.width}px`;
  }, [
    regionState?.bounds.height,
    regionState?.bounds.left,
    regionState?.bounds.top,
    regionState?.bounds.width,
  ]);

  useLayoutEffect(() => {
    const node = regionSelectionRef.current;
    if (!node || !selectionRect) {
      return;
    }

    node.style.height = `${selectionRect.height}px`;
    node.style.left = `${selectionRect.x}px`;
    node.style.top = `${selectionRect.y}px`;
    node.style.width = `${selectionRect.width}px`;
  }, [selectionRect?.height, selectionRect?.width, selectionRect?.x, selectionRect?.y]);

  return (
    <>
      <div className="terminal-menu-wrapper screenshot-menu-wrapper" ref={menuRef}>
        <button
          aria-label={t("workspace.takeScreenshot")}
          {...menuButtonAria(menuOpen)}
          className={buttonClassName}
          onClick={(event) => void handleButtonClick(event)}
          onMouseEnter={() => onPreCapture?.()}
          title={copiedStatus || t("workspace.takeScreenshot")}
          type="button"
        >
          <Camera size={13} />
        </button>
        {menuOpen ? (
          <div className="terminal-menu screenshot-menu" role="menu">
            <button
              className="terminal-menu-item"
              onClick={handleRegion}
              role="menuitem"
              type="button"
            >
              {t("workspace.copyRegion")}
            </button>
            <button
              className="terminal-menu-item"
              onClick={handleEntirePanel}
              role="menuitem"
              type="button"
            >
              {t("workspace.copyEntirePanel")}
            </button>
          </div>
        ) : null}
      </div>
      {regionState ? (
        <div
          aria-label={t("workspace.selectRegion")}
          className="screenshot-region-overlay"
          onKeyDown={handleRegionKeyDown}
          onPointerDown={handleRegionPointerDown}
          onPointerMove={handleRegionPointerMove}
          onPointerUp={handleRegionPointerUp}
          role="application"
          tabIndex={-1}
        >
          <div className="screenshot-region-target" ref={regionTargetRef} />
          {selectionRect ? (
            <div className="screenshot-region-selection" ref={regionSelectionRef} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function rectFromBounds(bounds: DOMRect): ScreenshotRect {
  return {
    x: Math.max(0, Math.round(bounds.left)),
    y: Math.max(0, Math.round(bounds.top)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function rectFromPoints(
  start: { x: number; y: number },
  current: { x: number; y: number },
): ScreenshotRect {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(Math.abs(current.x - start.x))),
    height: Math.max(1, Math.round(Math.abs(current.y - start.y))),
  };
}

function pointInBounds(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function clampPointToBounds(x: number, y: number, bounds: DOMRect) {
  return {
    x: Math.min(Math.max(x, bounds.left), bounds.right),
    y: Math.min(Math.max(y, bounds.top), bounds.bottom),
  };
}

async function waitForScreenshotSurface() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 90));
}
