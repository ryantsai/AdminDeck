import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  describeMcpError,
  invokeCommand,
  openExternalUrl,
  pickAndReadFile,
  pickAndSaveFile,
  type WidgetFilePickFilter,
} from "../../lib/tauri";
import { useDashboardStore } from "../state/dashboardStore";
import { useWorkspaceStore } from "../../store";
import type { DashboardWidgetInstance, ScriptBody } from "../types";
import {
  parseJsonObject,
  parseWidgetSettingsValuesJson,
  settingsValuesWithDefaults,
  validateScriptWidgetBody,
  validateWidgetSettingsSchemaJson,
} from "../schema";
import { buildSrcdoc, type ResolvedWidgetLibrary } from "./permissions";
import { loadWidgetLibraries, resolveWidgetLibraryKeys } from "./widgetLibraries";
import type { NativeContextMenuPosition } from "../../lib/nativeContextMenu";

// Harden 3: cap the number of concurrently active script widgets to prevent
// too many simultaneous rAF/animation loops from saturating the renderer.
// The Map stores each active widget's React setter so that when we evict an
// older widget to make room for a newer one, we can notify the evicted
// component to flip its `capped` state and tear its iframe down. A bare
// Set<string> would silently exceed the cap because the evicted iframe
// would keep running.
//
// The cap value lives in Settings -> Dashboard
// (`dashboardSettings.maxActiveScriptWidgets`), defaults to 8, and is clamped
// 1..=100 by the Rust validator. Components pass the current value into
// `tryActivateScriptWidget`; lowering the cap enforces the new ceiling as
// hosts re-run their effect, while raising it lets later mounts claim room.
type SetCapped = (capped: boolean) => void;
const activeScriptWidgets = new Map<string, SetCapped>();

// How long to wait for the iframe's `kk.ready` signal before marking the
// widget's health as `timeout`. Long enough to ride out library injection
// + first paint on a slow WebView2 host, short enough that the assistant
// learns about silent failures inside one user turn.
const SCRIPT_WIDGET_SMOKE_TEST_MS = 2000;

// Animation-lifecycle stall watchdog: if no `kk.motionTick` arrives for this
// long while the widget is visible, flip the widget's health to `stalled`.
// Threshold is intentionally generous so a temporarily slow frame loop (gc,
// big sync work) does not false-positive; the real signal is "rAF stopped
// firing entirely" which produces an infinite gap, not a 5–6 second one.
const SCRIPT_WIDGET_MOTION_STALL_MS = 8000;
// Polling interval for the watchdog. Higher than 1 s to avoid waking React
// frequently; lower than the stall threshold so we always notice within ~3 s
// of the boundary.
const SCRIPT_WIDGET_MOTION_POLL_MS = 3000;

const BRIDGE_RATE_LIMITS_MS = {
  setSettings: 500,
  getSecret: 500,
  saveFile: 1000,
  readLocalFile: 1000,
  callMcpTool: 1000,
  getPerformanceCounters: 1000,
  widgetContextMenu: 250,
} as const;

type RateLimitedBridgeMessage = keyof typeof BRIDGE_RATE_LIMITS_MS;

function normalizeScriptWidgetCap(cap: number): number {
  return Math.max(1, Math.floor(Number.isFinite(cap) ? cap : 1));
}

function tryActivateScriptWidget(
  id: string,
  setCapped: SetCapped,
  cap: number,
): boolean {
  const normalizedCap = normalizeScriptWidgetCap(cap);
  if (activeScriptWidgets.has(id)) {
    activeScriptWidgets.set(id, setCapped);
    return true;
  }
  enforceActiveScriptWidgetCap(normalizedCap, id);
  if (activeScriptWidgets.size >= normalizedCap) return false;
  activeScriptWidgets.set(id, setCapped);
  return true;
}

function deactivateScriptWidget(id: string) {
  activeScriptWidgets.delete(id);
}

// Evict the oldest active widget (Map preserves insertion order) and notify
// it so its iframe is replaced by the capped placeholder. Returns true if
// an eviction actually happened.
function evictOldestActiveScriptWidget(exceptId: string): boolean {
  for (const [id, setCapped] of activeScriptWidgets) {
    if (id === exceptId) continue;
    activeScriptWidgets.delete(id);
    setCapped(true);
    return true;
  }
  return false;
}

function enforceActiveScriptWidgetCap(cap: number, exceptId: string) {
  while (activeScriptWidgets.size > cap) {
    if (!evictOldestActiveScriptWidget(exceptId)) break;
  }
}

function activateScriptWidgetWithEviction(
  id: string,
  setCapped: SetCapped,
  cap: number,
): boolean {
  const normalizedCap = normalizeScriptWidgetCap(cap);
  if (activeScriptWidgets.has(id)) {
    activeScriptWidgets.set(id, setCapped);
    return true;
  }
  while (activeScriptWidgets.size >= normalizedCap) {
    if (!evictOldestActiveScriptWidget(id)) break;
  }
  if (activeScriptWidgets.size >= normalizedCap) return false;
  activeScriptWidgets.set(id, setCapped);
  return true;
}

export function ScriptWidgetHost({
  bodyJson,
  instance,
  onWidgetContextMenu,
  settingsSchemaJson,
}: {
  bodyJson: string;
  instance: DashboardWidgetInstance;
  onWidgetContextMenu: (position: NativeContextMenuPosition) => void | Promise<void>;
  settingsSchemaJson: string;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeLastAcceptedRef = useRef(new Map<RateLimitedBridgeMessage, number>());
  // Last `kk.motionTick` timestamp from the iframe rAF wrapper. Reset to
  // Date.now() on iframe mount so a slow first paint doesn't immediately
  // trip the stall watchdog.
  const motionTickRef = useRef<number>(0);
  // Visibility, tracked in a ref so the stall watchdog can short-circuit
  // when the widget is off-screen without re-running its setInterval.
  const visibleRef = useRef<boolean>(true);
  const updateInstance = useDashboardStore((s) => s.updateInstance);
  const setWidgetHealth = useDashboardStore((s) => s.setWidgetHealth);
  const maxActiveScriptWidgets = useWorkspaceStore(
    (s) => s.dashboardSettings.maxActiveScriptWidgets,
  );
  const { key: reloadKey } = useScriptReloadHandle();
  const [capped, setCapped] = useState(false);
  const parsed = useMemo<ScriptBody | null>(() => {
    const json = parseJsonObject(bodyJson);
    if (!json.ok) return null;
    const body = validateScriptWidgetBody(json.value);
    return body.ok ? body.value : null;
  }, [bodyJson]);
  const settingsValuesJson = useMemo(
    () => resolveSettingsValuesJson(settingsSchemaJson, instance.settingsValuesJson),
    [settingsSchemaJson, instance.settingsValuesJson],
  );
  const [libraries, setLibraries] = useState<ResolvedWidgetLibrary[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const requestedLibraries = useMemo(
    () => (parsed ? resolveWidgetLibraryKeys(parsed.libraries, parsed.source) : []),
    [parsed],
  );
  const requestedLibKey = requestedLibraries.join("|");

  // Harden 3: register this widget in the active set. If the cap is exceeded,
  // show a lightweight placeholder instead of the full iframe. Re-runs when
  // the user changes the cap in Settings so the active set honors the current
  // ceiling and capped widgets can claim newly available room.
  useEffect(() => {
    const activated = tryActivateScriptWidget(
      instance.id,
      setCapped,
      maxActiveScriptWidgets,
    );
    setCapped(!activated);
    return () => {
      deactivateScriptWidget(instance.id);
    };
  }, [instance.id, maxActiveScriptWidgets]);

  const activateCapped = useCallback(() => {
    // Evict the oldest active widget (notifying it so its iframe tears
    // down) before taking its slot. Without the notify step the evicted
    // iframe keeps running and the cap is silently exceeded.
    const activated = activateScriptWidgetWithEviction(
      instance.id,
      setCapped,
      maxActiveScriptWidgets,
    );
    setCapped(!activated);
  }, [instance.id, maxActiveScriptWidgets]);

  useEffect(() => {
    if (!parsed || capped) {
      setLibraries(null);
      setLibraryError(null);
      return;
    }
    if (requestedLibraries.length === 0) {
      setLibraries([]);
      setLibraryError(null);
      return;
    }
    let cancelled = false;
    setLibraries(null);
    setLibraryError(null);
    loadWidgetLibraries(requestedLibraries)
      .then((resolved) => {
        if (cancelled) return;
        setLibraries(resolved);
      })
      .catch((err) => {
        if (cancelled) return;
        setLibraryError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [parsed, capped, requestedLibraries, requestedLibKey]);
  const srcdoc = useMemo(
    () => (parsed && libraries ? buildSrcdoc(parsed, settingsValuesJson, libraries) : ""),
    [parsed, settingsValuesJson, libraries],
  );

  // Harden 5 (smoke test + health bubbling): when the iframe is about to
  // mount, register the widget as `pending` and arm a 2s watchdog. The
  // message listener below transitions to `ready` or `error` on iframe
  // signals; if neither arrives within the window, the watchdog flips the
  // state to `timeout` so a silently-broken widget shows up in the AI
  // context payload as unhealthy. Cleared on unmount or reload.
  useEffect(() => {
    if (capped || !libraries) return;
    motionTickRef.current = Date.now();
    setWidgetHealth(instance.id, { state: "pending", since: Date.now() });
    const timer = window.setTimeout(() => {
      // Only escalate to timeout if the state is still pending; ready/error
      // signals already moved us out of the smoke-test window.
      const current = useDashboardStore.getState().widgetHealth[instance.id];
      if (current?.state === "pending") {
        setWidgetHealth(instance.id, { state: "timeout", since: Date.now() });
      }
    }, SCRIPT_WIDGET_SMOKE_TEST_MS);
    return () => {
      window.clearTimeout(timer);
      setWidgetHealth(instance.id, null);
    };
  }, [instance.id, capped, libraries, reloadKey, setWidgetHealth]);

  // Harden 6 (B1: motion watchdog): only enabled for widgets that declared
  // `lifecycle.kind: "animation"`. Polls the last-motion-tick ref; if the
  // tick is older than SCRIPT_WIDGET_MOTION_STALL_MS and the widget is
  // visible, flip to `stalled`. The ready→stalled→ready transition is
  // observable, so the AI sees the regression in the next context payload
  // and can offer to fix it.
  useEffect(() => {
    if (capped || !libraries || parsed?.lifecycle?.kind !== "animation") return;
    const interval = window.setInterval(() => {
      if (!visibleRef.current) return;
      const lastTick = motionTickRef.current;
      if (lastTick === 0) return;
      if (Date.now() - lastTick < SCRIPT_WIDGET_MOTION_STALL_MS) return;
      const current = useDashboardStore.getState().widgetHealth[instance.id];
      // Only escalate from ready / stalled. While pending, the smoke test
      // owns the state; while error, the error message is more useful.
      if (current?.state === "ready" || current?.state === "stalled") {
        setWidgetHealth(instance.id, { state: "stalled", since: Date.now() });
      }
    }, SCRIPT_WIDGET_MOTION_POLL_MS);
    return () => window.clearInterval(interval);
  }, [instance.id, capped, libraries, parsed, reloadKey, setWidgetHealth]);

  // Harden 2: post visibility messages to the sandbox when the iframe
  // scrolls off-screen or is occluded. Widgets can check KK.isVisible()
  // to pause expensive rAF/animation loops.
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || capped || !libraries) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio > 0.1;
          visibleRef.current = visible;
          el.contentWindow?.postMessage(
            { kk: true, type: "setVisible", visible },
            "*",
          );
        }
      },
      { threshold: [0, 0.1] },
    );
    observer.observe(el);
    // Send initial visibility.
    const rect = el.getBoundingClientRect();
    const initiallyVisible = rect.width > 0 && rect.height > 0;
    if (!initiallyVisible) {
      el.contentWindow?.postMessage(
        { kk: true, type: "setVisible", visible: false },
        "*",
      );
    }
    return () => observer.disconnect();
  }, [capped, libraries]);

  useEffect(() => {
    function allowBridgeMessage(type: RateLimitedBridgeMessage): boolean {
      const now = performance.now();
      const previous = bridgeLastAcceptedRef.current.get(type) ?? -Infinity;
      if (now - previous < BRIDGE_RATE_LIMITS_MS[type]) return false;
      bridgeLastAcceptedRef.current.set(type, now);
      return true;
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      // Health signals — handled before bridge dispatch so that a widget
      // whose runtime error fires inside a rate-limited bridge call still
      // surfaces. `ready` is idempotent; subsequent `runtimeError` events
      // after a `ready` are accepted so post-mount regressions are caught.
      if (isScriptWidgetReadyMessage(data)) {
        setWidgetHealth(instance.id, { state: "ready", since: Date.now() });
        return;
      }
      if (isScriptWidgetRuntimeErrorMessage(data)) {
        setWidgetHealth(instance.id, {
          state: "error",
          error: data.error,
          since: Date.now(),
        });
        return;
      }
      if (isScriptWidgetMotionTickMessage(data)) {
        // Just record the last-tick timestamp; the stall watchdog effect
        // polls this ref. If the widget was previously marked `stalled`
        // and the loop resumed (e.g. resize re-armed the rAF), flip back
        // to `ready` so the AI context payload reflects current truth.
        motionTickRef.current = Date.now();
        const current = useDashboardStore.getState().widgetHealth[instance.id];
        if (current?.state === "stalled") {
          setWidgetHealth(instance.id, { state: "ready", since: Date.now() });
        }
        return;
      }
      if (isScriptWidgetOpenExternalMessage(data)) {
        void openExternalUrl(data.url);
        return;
      }
      if (isScriptWidgetSettingsMessage(data)) {
        if (!allowBridgeMessage("setSettings")) return;
        let settingsJson = "{}";
        try {
          settingsJson = JSON.stringify(data.settings);
        } catch {
          return;
        }
        const values = parseWidgetSettingsValuesJson(settingsJson);
        if (values.ok) {
          void updateInstance(instance.id, { settingsValuesJson: JSON.stringify(values.value) });
        }
        return;
      }
      if (isScriptWidgetGetSecretMessage(data)) {
        if (!allowBridgeMessage("getSecret")) {
          postBridgeError(data, "secretValue", "Widget secret reads are rate limited.");
          return;
        }
        void sendSecretResponse(data);
        return;
      }
      if (isScriptWidgetSaveFileMessage(data)) {
        if (!allowBridgeMessage("saveFile")) {
          postBridgeError(data, "saveFileResult", "Widget file save requests are rate limited.");
          return;
        }
        void sendSaveFileResponse(data);
        return;
      }
      if (isScriptWidgetReadFileMessage(data)) {
        if (!allowBridgeMessage("readLocalFile")) {
          postBridgeError(data, "readLocalFileResult", "Widget file read requests are rate limited.");
          return;
        }
        void sendReadFileResponse(data);
        return;
      }
      if (isScriptWidgetCallMcpToolMessage(data)) {
        if (!allowBridgeMessage("callMcpTool")) {
          postBridgeError(data, "mcpToolResult", "Widget MCP calls are rate limited.");
          return;
        }
        void sendMcpToolResponse(data);
        return;
      }
      if (isScriptWidgetPerformanceCountersMessage(data)) {
        if (!allowBridgeMessage("getPerformanceCounters")) {
          postBridgeError(data, "performanceCountersResult", "Widget performance counter reads are rate limited.");
          return;
        }
        void sendPerformanceCountersResponse(data);
        return;
      }
      if (isScriptWidgetContextMenuMessage(data)) {
        if (!allowBridgeMessage("widgetContextMenu")) return;
        const frameRect = iframeRef.current?.getBoundingClientRect();
        if (frameRect) {
          void onWidgetContextMenu({
            x: frameRect.left + data.x,
            y: frameRect.top + data.y,
          });
        }
      }
    }

    async function sendSecretResponse(data: { requestId: string; key: string }) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        const value = await invokeCommand("dashboard_read_widget_secret", {
          instanceId: instance.id,
          key: data.key,
        });
        target.postMessage({ kk: true, type: "secretValue", requestId: data.requestId, ok: true, value }, "*");
      } catch (error) {
        target.postMessage({
          kk: true,
          type: "secretValue",
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }

    async function sendSaveFileResponse(data: {
      requestId: string;
      filename: string;
      bytes: Uint8Array;
      filters?: WidgetFilePickFilter[];
    }) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        const bytes = data.bytes instanceof Uint8Array
          ? data.bytes
          : new Uint8Array(data.bytes as unknown as ArrayBuffer);
        const path = await pickAndSaveFile(data.filename, bytes, data.filters);
        target.postMessage({
          kk: true,
          type: "saveFileResult",
          requestId: data.requestId,
          ok: true,
          path,
        }, "*");
      } catch (error) {
        target.postMessage({
          kk: true,
          type: "saveFileResult",
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }

    async function sendReadFileResponse(data: {
      requestId: string;
      filters?: WidgetFilePickFilter[];
    }) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        const result = await pickAndReadFile(data.filters);
        target.postMessage({
          kk: true,
          type: "readLocalFileResult",
          requestId: data.requestId,
          ok: true,
          file: result ? { name: result.name, bytes: result.bytes } : null,
        }, "*");
      } catch (error) {
        target.postMessage({
          kk: true,
          type: "readLocalFileResult",
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }

    async function sendMcpToolResponse(data: {
      requestId: string;
      serverIdOrName: string;
      toolName: string;
      arguments: unknown;
    }) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        const result = await invokeCommand("mcp_call_tool", {
          serverIdOrName: data.serverIdOrName,
          toolName: data.toolName,
          arguments: data.arguments,
        });
        target.postMessage({
          kk: true,
          type: "mcpToolResult",
          requestId: data.requestId,
          ok: true,
          result,
        }, "*");
      } catch (error) {
        target.postMessage({
          kk: true,
          type: "mcpToolResult",
          requestId: data.requestId,
          ok: false,
          error: describeMcpError(error),
        }, "*");
      }
    }

    function postBridgeError(
      data: { requestId: string },
      type: string,
      error: string,
    ) {
      iframeRef.current?.contentWindow?.postMessage({
        kk: true,
        type,
        requestId: data.requestId,
        ok: false,
        error,
      }, "*");
    }

    async function sendPerformanceCountersResponse(data: { requestId: string }) {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        const snapshot = await invokeCommand("get_system_performance_counters");
        target.postMessage({
          kk: true,
          type: "performanceCountersResult",
          requestId: data.requestId,
          ok: true,
          snapshot,
        }, "*");
      } catch (error) {
        target.postMessage({
          kk: true,
          type: "performanceCountersResult",
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [instance.id, onWidgetContextMenu, updateInstance, setWidgetHealth]);

  if (!parsed) {
    return <div className="dw-script-error">{t("dashboard.invalidScriptWidgetBody")}</div>;
  }

  if (capped) {
    return (
      <div
        className="dw-script-capped"
        onClick={activateCapped}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") activateCapped(); }}
        role="button"
        tabIndex={0}
      >
        {t("dashboard.scriptWidgetCapped", { max: maxActiveScriptWidgets })}
      </div>
    );
  }

  if (libraryError) {
    return (
      <div className="dw-script-error">
        {t("dashboard.widgetLibraryLoadFailed", { error: libraryError })}
      </div>
    );
  }

  if (!libraries) {
    return <div className="dw-script-loading">{t("common.loading")}</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      key={reloadKey}
      className="dw-script-frame"
      title={t("dashboard.scriptWidgetFrameTitle")}
      loading="lazy"
      sandbox="allow-scripts allow-downloads"
      srcDoc={srcdoc}
    />
  );
}

function resolveSettingsValuesJson(settingsSchemaJson: string, settingsValuesJson: string) {
  const schema = validateWidgetSettingsSchemaJson(settingsSchemaJson);
  const values = parseWidgetSettingsValuesJson(settingsValuesJson);
  if (!schema.ok) return values.ok ? JSON.stringify(values.value) : "{}";
  return JSON.stringify(settingsValuesWithDefaults(schema.value, values.ok ? values.value : {}));
}

function isScriptWidgetReadyMessage(value: unknown): value is { kk: true; type: "ready" } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown };
  return candidate.kk === true && candidate.type === "ready";
}

function isScriptWidgetRuntimeErrorMessage(value: unknown): value is {
  kk: true;
  type: "runtimeError";
  error: string;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; error?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "runtimeError" &&
    typeof candidate.error === "string"
  );
}

function isScriptWidgetMotionTickMessage(value: unknown): value is {
  kk: true;
  type: "motionTick";
  ticks: number;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; ticks?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "motionTick" &&
    typeof candidate.ticks === "number" &&
    Number.isFinite(candidate.ticks)
  );
}

function isScriptWidgetOpenExternalMessage(value: unknown): value is { kk: true; type: "openExternalUrl"; url: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; url?: unknown };
  if (candidate.kk !== true || candidate.type !== "openExternalUrl" || typeof candidate.url !== "string") {
    return false;
  }
  try {
    const url = new URL(candidate.url);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isScriptWidgetSettingsMessage(value: unknown): value is { kk: true; type: "setSettings"; settings: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; settings?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "setSettings" &&
    typeof candidate.settings === "object" &&
    candidate.settings !== null &&
    !Array.isArray(candidate.settings)
  );
}

function isScriptWidgetGetSecretMessage(value: unknown): value is { kk: true; type: "getSecret"; requestId: string; key: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; requestId?: unknown; key?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "getSecret" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.key === "string" &&
    candidate.key.length > 0
  );
}

function isFilterArray(value: unknown): value is WidgetFilePickFilter[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) =>
    entry !== null &&
    typeof entry === "object" &&
    typeof (entry as WidgetFilePickFilter).name === "string" &&
    Array.isArray((entry as WidgetFilePickFilter).extensions) &&
    (entry as WidgetFilePickFilter).extensions.every((ext) => typeof ext === "string"),
  );
}

function isScriptWidgetSaveFileMessage(value: unknown): value is {
  kk: true;
  type: "saveFile";
  requestId: string;
  filename: string;
  bytes: Uint8Array;
  filters?: WidgetFilePickFilter[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    kk?: unknown;
    type?: unknown;
    requestId?: unknown;
    filename?: unknown;
    bytes?: unknown;
    filters?: unknown;
  };
  if (candidate.kk !== true || candidate.type !== "saveFile") return false;
  if (typeof candidate.requestId !== "string" || typeof candidate.filename !== "string") return false;
  if (!candidate.filename) return false;
  const bytesOk = candidate.bytes instanceof Uint8Array || candidate.bytes instanceof ArrayBuffer;
  if (!bytesOk) return false;
  if (candidate.filters !== undefined && !isFilterArray(candidate.filters)) return false;
  return true;
}

function isScriptWidgetReadFileMessage(value: unknown): value is {
  kk: true;
  type: "readLocalFile";
  requestId: string;
  filters?: WidgetFilePickFilter[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; requestId?: unknown; filters?: unknown };
  if (candidate.kk !== true || candidate.type !== "readLocalFile") return false;
  if (typeof candidate.requestId !== "string") return false;
  if (candidate.filters !== undefined && !isFilterArray(candidate.filters)) return false;
  return true;
}

function isScriptWidgetCallMcpToolMessage(value: unknown): value is {
  kk: true;
  type: "callMcpTool";
  requestId: string;
  serverIdOrName: string;
  toolName: string;
  arguments: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    kk?: unknown;
    type?: unknown;
    requestId?: unknown;
    serverIdOrName?: unknown;
    toolName?: unknown;
  };
  return (
    candidate.kk === true &&
    candidate.type === "callMcpTool" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.serverIdOrName === "string" &&
    candidate.serverIdOrName.length > 0 &&
    typeof candidate.toolName === "string" &&
    candidate.toolName.length > 0
  );
}

function isScriptWidgetPerformanceCountersMessage(value: unknown): value is {
  kk: true;
  type: "getPerformanceCounters";
  requestId: string;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; requestId?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "getPerformanceCounters" &&
    typeof candidate.requestId === "string"
  );
}

function isScriptWidgetContextMenuMessage(value: unknown): value is {
  kk: true;
  type: "widgetContextMenu";
  x: number;
  y: number;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kk?: unknown; type?: unknown; x?: unknown; y?: unknown };
  return (
    candidate.kk === true &&
    candidate.type === "widgetContextMenu" &&
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}

export function useScriptReloadHandle() {
  const [key, setKey] = useState(0);
  return { key, reload: () => setKey((k) => k + 1) };
}
