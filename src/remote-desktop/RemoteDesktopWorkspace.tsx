import { connectionIconForType, connectionSubtitle, connectionToolbarTitle, connectionTypeLabel } from "../connections/utils";
import { ScreenshotMenu } from "../workspace/ScreenshotMenu";

import { documentHasRdpBlockingOverlay } from "../workspace/nativeOverlay";
import { Bot, Keyboard, Monitor, RotateCcw } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { invokeCommand, isTauriRuntime, type AssistantScreenshot } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type {
  RdpConnectionOptions,
  RdpSettings,
  VncConnectionOptions,
  VncSettings,
  WorkspaceTab,
} from "../types";
import { registerRdpTextSender, unregisterRdpTextSender } from "../workspace/paneRegistry";

type VncSessionEvent =
  | { kind: "connected"; sessionId: string; name: string }
  | { kind: "resolution"; sessionId: string; width: number; height: number }
  | {
      kind: "rawImage";
      sessionId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rgba: string;
    }
  | {
      kind: "copy";
      sessionId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      sourceX: number;
      sourceY: number;
    }
  | { kind: "bell"; sessionId: string }
  | {
      kind: "setCursor";
      sessionId: string;
      width: number;
      height: number;
      hotX: number;
      hotY: number;
      rgba: string;
    }
  | { kind: "clipboardText"; sessionId: string; text: string }
  | { kind: "error"; sessionId: string; message: string }
  | { kind: "disconnected"; sessionId: string };

const RDP_ESTABLISHING_STATE = 2;
const RDP_PRE_CAPTURE_INTERVAL_MS = 800;

export function RemoteDesktopWorkspace({
  isActive,
  tab,
}: {
  isActive: boolean;
  tab: WorkspaceTab;
}) {
  const { t } = useTranslation();
  const connection = tab.connection;
  const typeLabel = connection ? connectionTypeLabel(connection.type) : t("remoteDesktop.typeLabel");
  const Icon = connection ? connectionIconForType(connection.type) : Monitor;
  const toolbarTitle = tab.toolbarTitle ?? (connection ? connectionToolbarTitle(connection) : tab.title);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionStartedRef = useRef(false);
  const sessionStartingRef = useRef(false);
  const rdpConnectionCountedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const lastBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const displaySyncInFlightRef = useRef(false);
  const rdpVisibleRef = useRef(false);
  const rdpControlRef = useRef("");
  const rdpSuppressionCaptureInFlightRef = useRef(false);
  const rdpPreCaptureInFlightRef = useRef(false);
  const rdpStatusPollInFlightRef = useRef(false);
  const preCachedSnapshotRef = useRef<AssistantScreenshot | null>(null);
  const preCaptureLastRef = useRef(0);
  const vncButtonMaskRef = useRef(0);
  const vncPendingPointerRef = useRef<{ x: number; y: number; buttonMask: number } | null>(null);
  const vncPointerRafRef = useRef<number | null>(null);
  const visibilityRef = useRef({ isActive, suppressed: false });
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore((state) => state.markConnectionSessionEnded);
  const setAssistantContextSnippet = useWorkspaceStore(
    (state) => state.setAssistantContextSnippet,
  );
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const rdpPreCaptureSignal = useWorkspaceStore((state) => state.rdpPreCaptureSignal);
  const rdpSettings = useWorkspaceStore((state) => state.rdpSettings);
  const vncSettings = useWorkspaceStore((state) => state.vncSettings);
  const [suppressed, setSuppressed] = useState(false);
  const [rdpError, setRdpError] = useState("");
  const [rdpSnapshot, setRdpSnapshot] = useState<AssistantScreenshot | null>(null);
  const [rdpStatus, setRdpStatus] = useState("");
  const [rdpStartKey, setRdpStartKey] = useState(0);
  const [vncHasDisplay, setVncHasDisplay] = useState(false);
  const canStartRdp = connection?.type === "rdp";
  const canStartVnc = connection?.type === "vnc";

  const computeBounds = () => {
    const node = hostRef.current;
    if (!node) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  };

  const boundsEqual = (
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number },
  ) =>
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height;

  const markRdpConnectionStarted = () => {
    if (!connection || rdpConnectionCountedRef.current) {
      return;
    }
    rdpConnectionCountedRef.current = true;
    markConnectionSessionStarted(connection.id);
  };

  const markRdpConnectionEnded = () => {
    if (!connection || !rdpConnectionCountedRef.current) {
      return;
    }
    rdpConnectionCountedRef.current = false;
    markConnectionSessionEnded(connection.id);
  };

  const handleRdpDisconnectedStatus = (connectionState: number) => {
    markRdpConnectionEnded();
    displayReadyRef.current = false;
    rdpVisibleRef.current = false;
    setRdpStatus(
      connectionState === RDP_ESTABLISHING_STATE
        ? t("remoteDesktop.connecting")
        : t("remoteDesktop.disconnected"),
    );
  };

  const readSettledBounds = () =>
    new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      let previous = computeBounds();
      let stableFrames = 0;
      let attempts = 0;
      const tick = () => {
        const next = computeBounds();
        attempts += 1;
        if (!next) {
          if (attempts >= 8) {
            resolve(null);
            return;
          }
          window.requestAnimationFrame(tick);
          return;
        }
        if (previous && boundsEqual(previous, next)) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }
        previous = next;
        if (stableFrames >= 2 || attempts >= 10) {
          resolve(next);
          return;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });

  const captureVisibleRdpSnapshot = async () => {
    if (
      !canStartRdp ||
      !isTauriRuntime() ||
      !sessionStartedRef.current ||
      !rdpVisibleRef.current ||
      !displayReadyRef.current
    ) {
      return null;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return null;
    }
    return invokeCommand("capture_screenshot_for_assistant", {
      request: bounds,
    });
  };

  const captureTargetScreenshotForAssistant = async () => {
    if (!isTauriRuntime()) {
      showStatusBarNotice(t("workspace.screenshotsRequireRuntime"), { tone: "warning" });
      return;
    }
    const target = hostRef.current;
    if (!target) {
      return;
    }
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    try {
      const screenshot = await invokeCommand("capture_screenshot_for_assistant", {
        request: {
          x: Math.max(0, Math.round(bounds.left)),
          y: Math.max(0, Math.round(bounds.top)),
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
        },
      });
      setAssistantContextSnippet({
        id: `remote-desktop-screenshot-${Date.now()}`,
        kind: "screenshot",
        sourceLabel: `${tab.title} ${typeLabel} ${t("workspace.screenshot")}`,
        imageDataUrl: screenshot.dataUrl,
        width: screenshot.width,
        height: screenshot.height,
        capturedAt: new Date().toISOString(),
      });
      showStatusBarNotice(t("workspace.sentToAi"), { tone: "success" });
    } catch (error) {
      showStatusBarNotice(
        t("workspace.screenshotCaptureError", {
          message: error instanceof Error ? error.message : String(error),
        }),
        { tone: "error" },
      );
    }
  };

  const triggerPreCapture = () => {
    if (!canStartRdp || !isActive || !rdpVisibleRef.current) {
      return;
    }
    const now = Date.now();
    if (
      rdpPreCaptureInFlightRef.current ||
      now - preCaptureLastRef.current < RDP_PRE_CAPTURE_INTERVAL_MS
    ) {
      return;
    }
    preCaptureLastRef.current = now;
    rdpPreCaptureInFlightRef.current = true;
    void captureVisibleRdpSnapshot()
      .then((snapshot) => {
        if (snapshot) {
          preCachedSnapshotRef.current = snapshot;
        }
      })
      .catch(() => {
        // Speculative pre-capture can miss; the overlay path still falls back to capture-on-open.
      })
      .finally(() => {
        rdpPreCaptureInFlightRef.current = false;
      });
  };

  const pushRdpVisibility = () => {
    const sessionId = sessionIdRef.current;
    if (!sessionStartedRef.current || !sessionId) {
      return;
    }
    const wantsVisible = visibilityRef.current.isActive && !visibilityRef.current.suppressed;
    const visible = wantsVisible && displayReadyRef.current;
    const bounds = wantsVisible ? computeBounds() : lastBoundsRef.current ?? computeBounds();
    if (!bounds) {
      return;
    }
    const previous = lastBoundsRef.current;
    const boundsChanged = !previous || !boundsEqual(previous, bounds);
    if (wantsVisible && displayReadyRef.current && boundsChanged) {
      displayReadyRef.current = false;
      rdpVisibleRef.current = false;
      setRdpStatus(t("remoteDesktop.preparingDisplay"));
      void invokeCommand("set_rdp_visibility", {
        request: { sessionId, visible: false, ...(previous ?? bounds) },
      }).catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
      attemptRdpDisplaySync();
      return;
    }
    void invokeCommand("set_rdp_visibility", {
      request: { sessionId, visible, ...bounds },
    })
      .then(() => {
        rdpVisibleRef.current = visible;
        if (visible) {
          setRdpSnapshot(null);
        }
      })
      .catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
    if (!visible) {
      if (wantsVisible) {
        attemptRdpDisplaySync();
      }
      return;
    }
    if (boundsChanged) {
      lastBoundsRef.current = bounds;
      void invokeCommand("update_rdp_bounds", {
        request: { sessionId, ...bounds },
      }).catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
    }
  };

  const attemptRdpDisplaySync = () => {
    const sessionId = sessionIdRef.current;
    if (
      !sessionStartedRef.current ||
      !sessionId ||
      !visibilityRef.current.isActive ||
      visibilityRef.current.suppressed ||
      displayReadyRef.current ||
      displaySyncInFlightRef.current
    ) {
      return;
    }
    const bounds = computeBounds() ?? lastBoundsRef.current;
    if (!bounds) {
      return;
    }
    displaySyncInFlightRef.current = true;
    void invokeCommand("sync_rdp_display_size", {
      request: { sessionId, ...bounds },
    })
      .then((result) => {
        if (sessionIdRef.current !== result.sessionId) {
          return;
        }
        if (result.displaySynced) {
          markRdpConnectionStarted();
          displayReadyRef.current = true;
          lastBoundsRef.current = bounds;
          setRdpStatus(
            result.connectionState === RDP_ESTABLISHING_STATE
              ? t("remoteDesktop.connecting")
              : t("remoteDesktop.connected"),
          );
          pushRdpVisibility();
        } else if (result.connected) {
          markRdpConnectionStarted();
          setRdpStatus(t("remoteDesktop.preparingDisplay"));
        } else {
          handleRdpDisconnectedStatus(result.connectionState);
        }
      })
      .catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        displaySyncInFlightRef.current = false;
      });
  };

  const resetRdpSessionRefs = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sessionStartedRef.current = false;
    sessionStartingRef.current = false;
    rdpConnectionCountedRef.current = false;
    sessionIdRef.current = null;
    lastBoundsRef.current = null;
    displayReadyRef.current = false;
    displaySyncInFlightRef.current = false;
    rdpVisibleRef.current = false;
    rdpControlRef.current = "";
    rdpSuppressionCaptureInFlightRef.current = false;
    rdpPreCaptureInFlightRef.current = false;
    rdpStatusPollInFlightRef.current = false;
    setRdpSnapshot(null);
  };

  const resetVncSessionRefs = () => {
    sessionStartedRef.current = false;
    sessionStartingRef.current = false;
    sessionIdRef.current = null;
    vncButtonMaskRef.current = 0;
    vncPendingPointerRef.current = null;
    if (vncPointerRafRef.current !== null) {
      window.cancelAnimationFrame(vncPointerRafRef.current);
      vncPointerRafRef.current = null;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    setVncHasDisplay(false);
  };

  const handleReconnect = () => {
    if ((!canStartRdp && !canStartVnc) || !connection || !isTauriRuntime()) {
      return;
    }
    const sessionId = sessionIdRef.current;
    const hadCountedSession = canStartRdp
      ? rdpConnectionCountedRef.current
      : sessionStartedRef.current;
    const ownedSession = sessionStartingRef.current || sessionStartedRef.current;
    if (canStartVnc) {
      resetVncSessionRefs();
    } else {
      resetRdpSessionRefs();
    }
    setRdpError("");
    setRdpStatus(t("remoteDesktop.reconnecting"));
    if (ownedSession && sessionId) {
      void invokeCommand(canStartVnc ? "close_vnc_session" : "close_rdp_session", {
        request: { sessionId },
      });
    }
    if (hadCountedSession) {
      markConnectionSessionEnded(connection.id);
    }
    setRdpStartKey((key) => key + 1);
  };

  const handleSendCtrlAltDelete = () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !sessionStartedRef.current || !isTauriRuntime()) {
      return;
    }
    const command = canStartVnc ? "send_vnc_ctrl_alt_delete" : "send_rdp_ctrl_alt_delete";
    void invokeCommand(command, { request: { sessionId } }).catch((error) => {
      setRdpError(error instanceof Error ? error.message : String(error));
    });
  };

  const scheduleBoundsPush = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      if (!visibilityRef.current.isActive || visibilityRef.current.suppressed) {
        const bounds = lastBoundsRef.current ?? computeBounds();
        if (!bounds) {
          return;
        }
        void invokeCommand("set_rdp_visibility", {
          request: { sessionId, visible: false, ...bounds },
        })
          .then(() => {
            rdpVisibleRef.current = false;
          })
          .catch((error) => {
            setRdpError(error instanceof Error ? error.message : String(error));
          });
        return;
      }
      const bounds = computeBounds();
      if (!bounds) {
        return;
      }
      if (!displayReadyRef.current) {
        lastBoundsRef.current = bounds;
        attemptRdpDisplaySync();
        return;
      }
      const previous = lastBoundsRef.current;
      if (
        previous &&
        boundsEqual(previous, bounds)
      ) {
        return;
      }
      if (!rdpVisibleRef.current) {
        displayReadyRef.current = false;
        setRdpStatus(t("remoteDesktop.preparingDisplay"));
        attemptRdpDisplaySync();
        return;
      }
      lastBoundsRef.current = bounds;
      void invokeCommand("update_rdp_bounds", {
        request: { sessionId, ...bounds },
      }).catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
    });
  };

  useEffect(() => {
    if (!canStartRdp || !connection || !isTauriRuntime() || sessionStartedRef.current || sessionStartingRef.current) {
      return;
    }
    let disposed = false;
    let sessionId = "";
    const rdpPaneId = tab.panes[0]?.id;
    let registeredRdpSender:
      | ((text: string, pressEnter: boolean) => Promise<void>)
      | null = null;
    void readSettledBounds().then((bounds) => {
      if (disposed || !bounds) {
        return;
      }
      sessionId = `rdp-${tab.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionIdRef.current = sessionId;
      sessionStartingRef.current = true;
      displayReadyRef.current = false;
      displaySyncInFlightRef.current = false;
      rdpVisibleRef.current = false;
      lastBoundsRef.current = bounds;
      rdpControlRef.current = "";
      setRdpStatus((current) => (current === t("remoteDesktop.reconnecting") ? current : t("remoteDesktop.connecting")));
      void invokeCommand("start_rdp_session", {
        request: {
          sessionId,
          host: connection.host,
          user: connection.user,
          port: connection.port,
          secretOwnerId: connection.id,
          options: resolveRdpOptions(rdpSettings, connection.rdpOptions),
          ...bounds,
        },
      })
        .then((started) => {
          sessionStartingRef.current = false;
          if (disposed) {
            void invokeCommand("close_rdp_session", { request: { sessionId: started.sessionId } });
            return;
          }
          sessionStartedRef.current = true;
          rdpControlRef.current = started.control;
          setRdpStatus(t("remoteDesktop.preparingDisplay"));
          if (rdpPaneId) {
            const startedSessionId = started.sessionId;
            registeredRdpSender = async (text, pressEnter) => {
              await invokeCommand("send_rdp_text", {
                request: {
                  sessionId: startedSessionId,
                  text,
                  pressEnter,
                },
              });
            };
            registerRdpTextSender(rdpPaneId, registeredRdpSender);
          }
          attemptRdpDisplaySync();
        })
        .catch((error) => {
          sessionStartingRef.current = false;
          sessionStartedRef.current = false;
          if (!disposed) {
            setRdpStatus("");
            setRdpError(error instanceof Error ? error.message : String(error));
          }
        });
    });

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ownsSession = sessionStartingRef.current || sessionStartedRef.current;
      sessionStartingRef.current = false;
      const counted = rdpConnectionCountedRef.current;
      sessionStartedRef.current = false;
      rdpConnectionCountedRef.current = false;
      displayReadyRef.current = false;
      displaySyncInFlightRef.current = false;
      rdpVisibleRef.current = false;
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = null;
      }
      if (rdpPaneId && registeredRdpSender) {
        unregisterRdpTextSender(rdpPaneId, registeredRdpSender);
        registeredRdpSender = null;
      }
      if (ownsSession) {
        void invokeCommand("close_rdp_session", { request: { sessionId } });
      }
      if (counted) {
        markConnectionSessionEnded(connection.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdpStartKey]);

  useEffect(() => {
    if (!canStartVnc || !connection || !isTauriRuntime() || sessionStartedRef.current || sessionStartingRef.current) {
      return;
    }
    let disposed = false;
    let startTimer = 0;
    const sessionId = `vnc-${tab.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionIdRef.current = sessionId;
    sessionStartingRef.current = true;
    setRdpStatus((current) => (current === t("remoteDesktop.reconnecting") ? current : t("remoteDesktop.connecting")));
    setRdpError("");

    startTimer = window.setTimeout(() => {
      void invokeCommand("start_vnc_session", {
        request: {
          sessionId,
          host: connection.host,
          port: connection.port,
          secretOwnerId: connection.id,
          options: resolveVncOptions(vncSettings, connection.vncOptions),
        },
      })
        .then((started) => {
          sessionStartingRef.current = false;
          if (disposed) {
            void invokeCommand("close_vnc_session", { request: { sessionId: started.sessionId } });
            return;
          }
          sessionStartedRef.current = true;
          setRdpStatus(t("remoteDesktop.connected"));
          markConnectionSessionStarted(connection.id);
        })
        .catch((error) => {
          sessionStartingRef.current = false;
          sessionStartedRef.current = false;
          if (!disposed) {
            setRdpStatus("");
            setRdpError(error instanceof Error ? error.message : String(error));
          }
        });
      });

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      const ownsSession = sessionStartingRef.current || sessionStartedRef.current;
      sessionStartingRef.current = false;
      const started = sessionStartedRef.current;
      sessionStartedRef.current = false;
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = null;
      }
      if (ownsSession) {
        void invokeCommand("close_vnc_session", { request: { sessionId } });
      }
      if (started) {
        markConnectionSessionEnded(connection.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdpStartKey, canStartVnc]);

  useEffect(() => {
    visibilityRef.current = { isActive, suppressed };
  }, [isActive, suppressed]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }
    const node = hostRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => scheduleBoundsPush());
    observer.observe(node);
    window.addEventListener("resize", scheduleBoundsPush);
    window.addEventListener("scroll", scheduleBoundsPush, true);
    const repushOnNativeMove = () => {
      lastBoundsRef.current = null;
      scheduleBoundsPush();
    };
    const moveUnlisten = listen("tauri://move", repushOnNativeMove).catch(() => null);
    const resizeUnlisten = listen("tauri://resize", repushOnNativeMove).catch(() => null);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBoundsPush);
      window.removeEventListener("scroll", scheduleBoundsPush, true);
      void moveUnlisten.then((dispose) => dispose?.());
      void resizeUnlisten.then((dispose) => dispose?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }
    const updateSuppression = () => {
      if (!documentHasRdpBlockingOverlay(hostRef.current)) {
        rdpSuppressionCaptureInFlightRef.current = false;
        visibilityRef.current = { ...visibilityRef.current, suppressed: false };
        setSuppressed(false);
        return;
      }
      if (visibilityRef.current.suppressed || rdpSuppressionCaptureInFlightRef.current) {
        return;
      }
      const cached = preCachedSnapshotRef.current;
      if (cached) {
        preCachedSnapshotRef.current = null;
        if (documentHasRdpBlockingOverlay(hostRef.current)) {
          setRdpSnapshot(cached);
          visibilityRef.current = { ...visibilityRef.current, suppressed: true };
          setSuppressed(true);
        }
        return;
      }
      rdpSuppressionCaptureInFlightRef.current = true;
      void captureVisibleRdpSnapshot()
        .then((snapshot) => {
          if (!documentHasRdpBlockingOverlay(hostRef.current)) {
            visibilityRef.current = { ...visibilityRef.current, suppressed: false };
            setSuppressed(false);
            return;
          }
          if (snapshot) {
            setRdpSnapshot(snapshot);
          }
          visibilityRef.current = { ...visibilityRef.current, suppressed: true };
          setSuppressed(true);
        })
        .catch(() => {
          if (documentHasRdpBlockingOverlay(hostRef.current)) {
            visibilityRef.current = { ...visibilityRef.current, suppressed: true };
            setSuppressed(true);
          }
        })
        .finally(() => {
          rdpSuppressionCaptureInFlightRef.current = false;
        });
    };
    updateSuppression();
    const observer = new MutationObserver(updateSuppression);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp]);

  useEffect(() => {
    if (!canStartRdp || rdpPreCaptureSignal === 0) {
      return;
    }
    triggerPreCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdpPreCaptureSignal]);

  useEffect(() => {
    if (!canStartRdp || !isActive || !isTauriRuntime()) {
      return;
    }
    triggerPreCapture();
    const intervalId = window.setInterval(triggerPreCapture, RDP_PRE_CAPTURE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp, isActive]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    pushRdpVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp, isActive, suppressed]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (!sessionStartedRef.current || !sessionId || rdpStatusPollInFlightRef.current) {
        return;
      }

      rdpStatusPollInFlightRef.current = true;
      void invokeCommand("get_rdp_session_status", {
        request: { sessionId },
      })
        .then((status) => {
          if (!displayReadyRef.current) {
            attemptRdpDisplaySync();
          }
          if (sessionIdRef.current !== status.sessionId) {
            return;
          }
          if (status.connected) {
            markRdpConnectionStarted();
            if (displayReadyRef.current) {
              setRdpStatus(t("remoteDesktop.connected"));
            }
          } else {
            handleRdpDisconnectedStatus(status.connectionState);
          }
        })
        .catch((error) => {
          setRdpError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          rdpStatusPollInFlightRef.current = false;
        });
    }, displayReadyRef.current ? 2000 : 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canStartRdp]);

  useEffect(() => {
    if (!canStartVnc || !isTauriRuntime()) {
      return;
    }
    let disposed = false;
    let dispose: (() => void) | undefined;
    void listen<VncSessionEvent>("vnc-session-event", (event) => {
      if (disposed) {
        return;
      }
      if (event.payload.sessionId !== sessionIdRef.current) {
        return;
      }
      handleVncSessionEvent(event.payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      dispose = unlisten;
    });
    return () => {
      disposed = true;
      dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartVnc]);

  useEffect(() => {
    if (!canStartVnc || !isTauriRuntime()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (!sessionStartedRef.current || !sessionId) {
        return;
      }

      void invokeCommand("get_vnc_session_status", {
        request: { sessionId },
      })
        .then((status) => {
          if (!status.connected && sessionIdRef.current === status.sessionId) {
            setRdpStatus(t("remoteDesktop.disconnected"));
          }
        })
        .catch((error) => {
          setRdpError(error instanceof Error ? error.message : String(error));
        });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canStartVnc]);

  const handleVncSessionEvent = (event: VncSessionEvent) => {
    if (event.kind === "connected") {
      setRdpStatus(t("remoteDesktop.waitingFramebuffer"));
      return;
    }
    if (event.kind === "resolution") {
      resizeVncCanvas(event.width, event.height);
      setVncHasDisplay(true);
      setRdpStatus(t("remoteDesktop.connected"));
      return;
    }
    if (event.kind === "rawImage") {
      setVncHasDisplay(true);
      drawVncImage(event);
      return;
    }
    if (event.kind === "copy") {
      copyVncImage(event);
      return;
    }
    if (event.kind === "setCursor") {
      applyVncCursor(event);
      return;
    }
    if (event.kind === "error") {
      setRdpError(event.message);
      setRdpStatus(t("remoteDesktop.disconnected"));
      return;
    }
    if (event.kind === "disconnected") {
      setRdpStatus(t("remoteDesktop.disconnected"));
    }
  };

  const resizeVncCanvas = (width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const drawVncImage = (event: Extract<VncSessionEvent, { kind: "rawImage" }>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    if (canvas.width < event.x + event.width || canvas.height < event.y + event.height) {
      resizeVncCanvas(
        Math.max(canvas.width, event.x + event.width),
        Math.max(canvas.height, event.y + event.height),
      );
    }
    const imageData = new ImageData(
      new Uint8ClampedArray(decodeBase64Bytes(event.rgba)),
      event.width,
      event.height,
    );
    context.putImageData(imageData, event.x, event.y);
  };

  const applyVncCursor = (event: Extract<VncSessionEvent, { kind: "setCursor" }>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (event.width === 0 || event.height === 0) {
      canvas.style.cursor = "none";
      return;
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = event.width;
    offscreen.height = event.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) {
      return;
    }
    const bytes = decodeBase64Bytes(event.rgba);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), event.width, event.height), 0, 0);
    const dataUrl = offscreen.toDataURL("image/png");
    canvas.style.cursor = `url("${dataUrl}") ${event.hotX} ${event.hotY}, default`;
  };

  const copyVncImage = (event: Extract<VncSessionEvent, { kind: "copy" }>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || event.width <= 0 || event.height <= 0) {
      return;
    }
    const imageData = context.getImageData(event.sourceX, event.sourceY, event.width, event.height);
    context.putImageData(imageData, event.x, event.y);
  };

  const vncPointForEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const content = vncRenderedContentRect(rect, canvas.width, canvas.height);
    const scaleX = canvas.width / Math.max(1, content.width);
    const scaleY = canvas.height / Math.max(1, content.height);
    return {
      x: Math.max(
        0,
        Math.min(canvas.width - 1, Math.round((event.clientX - content.left) * scaleX)),
      ),
      y: Math.max(
        0,
        Math.min(canvas.height - 1, Math.round((event.clientY - content.top) * scaleY)),
      ),
    };
  };

  const flushVncPointer = () => {
    vncPointerRafRef.current = null;
    const pending = vncPendingPointerRef.current;
    const sessionId = sessionIdRef.current;
    if (!pending || !sessionId || !sessionStartedRef.current) {
      return;
    }
    vncPendingPointerRef.current = null;
    void invokeCommand("send_vnc_pointer_event", {
      request: { sessionId, ...pending },
    }).catch((error) => {
      setRdpError(error instanceof Error ? error.message : String(error));
    });
  };

  const sendVncPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    buttonMask?: number,
    immediate = false,
  ) => {
    if (!sessionStartedRef.current) {
      return;
    }
    const point = vncPointForEvent(event);
    const mask = buttonMask ?? vncButtonMaskRef.current;
    vncPendingPointerRef.current = { x: point.x, y: point.y, buttonMask: mask };
    if (immediate) {
      if (vncPointerRafRef.current !== null) {
        window.cancelAnimationFrame(vncPointerRafRef.current);
        vncPointerRafRef.current = null;
      }
      flushVncPointer();
      return;
    }
    if (vncPointerRafRef.current === null) {
      vncPointerRafRef.current = window.requestAnimationFrame(flushVncPointer);
    }
  };

  const handleVncPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    vncButtonMaskRef.current = pointerButtonMask(event.button);
    sendVncPointer(event, vncButtonMaskRef.current, true);
  };

  const handleVncPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    vncButtonMaskRef.current = 0;
    sendVncPointer(event, 0, true);
  };

  const handleVncWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const pointerEvent = event as unknown as ReactPointerEvent<HTMLCanvasElement>;
    const wheelMask = event.deltaY < 0 ? 8 : 16;
    sendVncPointer(pointerEvent, wheelMask, true);
    window.setTimeout(() => sendVncPointer(pointerEvent, 0, true), 20);
  };

  const handleVncKey = (event: ReactKeyboardEvent<HTMLCanvasElement>, down: boolean) => {
    const key = vncKeysymForEvent(event);
    const sessionId = sessionIdRef.current;
    if (!sessionId || !key || !sessionStartedRef.current) {
      return;
    }
    event.preventDefault();
    void invokeCommand("send_vnc_key_event", {
      request: { sessionId, key, down },
    }).catch((error) => {
      setRdpError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <section
      className={isActive ? "terminal-workspace remote-desktop-shell active" : "terminal-workspace remote-desktop-shell"}
      ref={workspaceRef}
    >
      <article className="terminal-pane remote-desktop-pane">
        <header>
          <span>
            <Icon size={13} />
            {toolbarTitle}
          </span>
          <div className="terminal-pane-actions">
            {tab.subtitle ? <small>{tab.subtitle}</small> : null}
          {rdpStatus ? <span className="webview-toolbar-status">{rdpStatus}</span> : null}
          {canStartRdp || canStartVnc ? (
            <button
              aria-label={`${t("remoteDesktop.sendCtrlAltDel")} ${typeLabel} ${t("remoteDesktop.session")}`}
              className="terminal-pane-action"
              disabled={!isTauriRuntime() || !sessionStartedRef.current}
              onClick={handleSendCtrlAltDelete}
              title={t("remoteDesktop.sendCtrlAltDel")}
              type="button"
            >
              <Keyboard size={13} />
            </button>
          ) : null}
          {canStartRdp || canStartVnc ? (
            <button
              aria-label={`${t("remoteDesktop.reconnect")} ${typeLabel} ${t("remoteDesktop.session")}`}
              className="terminal-pane-action"
              disabled={!isTauriRuntime()}
              onClick={handleReconnect}
              title={t("remoteDesktop.reconnect")}
              type="button"
            >
              <RotateCcw size={13} />
            </button>
          ) : null}
          <ScreenshotMenu
            buttonClassName="terminal-pane-action"
            targetRef={connection?.type === "rdp" || connection?.type === "vnc" ? hostRef : workspaceRef}
          />
          {canStartRdp || canStartVnc ? (
            <button
              aria-label={t("workspace.sendEntirePanelToAi")}
              className="terminal-pane-action"
              disabled={!isTauriRuntime()}
              onClick={() => void captureTargetScreenshotForAssistant()}
              title={t("workspace.sendEntirePanelToAi")}
              type="button"
            >
              <Bot size={13} />
            </button>
          ) : null}
        
        </div>
        </header>
      <div
        className="remote-desktop-workspace"
        ref={hostRef}
      >
        {connection?.type === "rdp" && rdpSnapshot ? (
          <img
            alt=""
            className="rdp-suppression-snapshot"
            height={rdpSnapshot.height}
            src={rdpSnapshot.dataUrl}
            width={rdpSnapshot.width}
          />
        ) : null}
        {connection?.type === "vnc" ? (
          <canvas
            aria-label={`${tab.title} ${t("remoteDesktop.displayAria")}`}
            className={vncHasDisplay ? "vnc-display ready" : "vnc-display"}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => handleVncKey(event, true)}
            onKeyUp={(event) => handleVncKey(event, false)}
            onPointerDown={handleVncPointerDown}
            onPointerMove={sendVncPointer}
            onPointerUp={handleVncPointerUp}
            onWheel={handleVncWheel}
            ref={canvasRef}
            tabIndex={0}
          />
        ) : null}
        <div className="remote-desktop-placeholder" hidden={vncHasDisplay || Boolean(rdpSnapshot)}>
          <Icon size={34} />
          <h2>{connection?.name ?? typeLabel}</h2>
          <p>{connection ? `${typeLabel} ${connectionSubtitle(connection)}` : typeLabel}</p>
          {connection?.type === "rdp" ? (
            !isTauriRuntime() ? (
              <small>{t("remoteDesktop.rdpDesktopRequired")}</small>
            ) : rdpError ? (
              <small className="form-error">{rdpError}</small>
            ) : (
              <small>{t("remoteDesktop.rdpActiveX")}</small>
            )
          ) : connection?.type === "vnc" ? (
            !isTauriRuntime() ? (
              <small>{t("remoteDesktop.vncDesktopRequired")}</small>
            ) : rdpError ? (
              <small className="form-error">{rdpError}</small>
            ) : (
              <small>{t("remoteDesktop.vncFramebuffer")}</small>
            )
          ) : (
            <small>{t("remoteDesktop.transportUnavailable")}</small>
          )}
        </div>
      </div>
      </article>
    </section>
  );
}

function vncRenderedContentRect(rect: DOMRect, intrinsicWidth: number, intrinsicHeight: number) {
  const width = Math.max(1, intrinsicWidth);
  const height = Math.max(1, intrinsicHeight);
  const boxAspect = rect.width / Math.max(1, rect.height);
  const contentAspect = width / height;
  if (contentAspect > boxAspect) {
    const contentHeight = rect.width / contentAspect;
    return {
      left: rect.left,
      top: rect.top + (rect.height - contentHeight) / 2,
      width: rect.width,
      height: contentHeight,
    };
  }
  const contentWidth = rect.height * contentAspect;
  return {
    left: rect.left + (rect.width - contentWidth) / 2,
    top: rect.top,
    width: contentWidth,
    height: rect.height,
  };
}

function decodeBase64Bytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pointerButtonMask(button: number) {
  if (button === 1) {
    return 2;
  }
  if (button === 2) {
    return 4;
  }
  return 1;
}

function resolveRdpOptions(
  defaults: RdpSettings,
  overrides?: RdpConnectionOptions,
): RdpSettings {
  if (!overrides || overrides.inheritDefaults) {
    return defaults;
  }
  return {
    colorDepth: overrides.colorDepth ?? defaults.colorDepth,
    redirectClipboard: overrides.redirectClipboard ?? defaults.redirectClipboard,
    redirectDrives: overrides.redirectDrives ?? defaults.redirectDrives,
    bitmapCache: overrides.bitmapCache ?? defaults.bitmapCache,
    performanceProfile: overrides.performanceProfile ?? defaults.performanceProfile,
  };
}

function resolveVncOptions(
  defaults: VncSettings,
  overrides?: VncConnectionOptions,
): VncSettings {
  if (!overrides || overrides.inheritDefaults) {
    return defaults;
  }
  return {
    sharedSession: overrides.sharedSession ?? defaults.sharedSession,
    viewOnly: overrides.viewOnly ?? defaults.viewOnly,
    colorLevel: overrides.colorLevel ?? defaults.colorLevel,
    preferredEncoding: overrides.preferredEncoding ?? defaults.preferredEncoding,
  };
}

function vncKeysymForEvent(event: ReactKeyboardEvent<HTMLCanvasElement>) {
  if (event.key.length === 1) {
    return event.key.charCodeAt(0);
  }
  const specialKeys: Record<string, number> = {
    Backspace: 0xff08,
    Tab: 0xff09,
    Enter: 0xff0d,
    Escape: 0xff1b,
    Delete: 0xffff,
    Home: 0xff50,
    ArrowLeft: 0xff51,
    ArrowUp: 0xff52,
    ArrowRight: 0xff53,
    ArrowDown: 0xff54,
    PageUp: 0xff55,
    PageDown: 0xff56,
    End: 0xff57,
    Insert: 0xff63,
    Shift: 0xffe1,
    Control: 0xffe3,
    Alt: 0xffe9,
    Meta: 0xffe7,
  };
  return specialKeys[event.key] ?? 0;
}
