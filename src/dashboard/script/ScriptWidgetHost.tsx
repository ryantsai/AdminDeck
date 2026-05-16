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

// Harden 3: cap the number of concurrently active script widgets to prevent
// too many simultaneous rAF/animation loops from saturating the renderer.
// The Map stores each active widget's React setter so that when we evict an
// older widget to make room for a newer one, we can notify the evicted
// component to flip its `capped` state and tear its iframe down. A bare
// Set<string> would silently exceed the cap because the evicted iframe
// would keep running.
const MAX_ACTIVE_SCRIPT_WIDGETS = 3;
type SetCapped = (capped: boolean) => void;
const activeScriptWidgets = new Map<string, SetCapped>();

function tryActivateScriptWidget(id: string, setCapped: SetCapped): boolean {
  if (activeScriptWidgets.has(id)) {
    activeScriptWidgets.set(id, setCapped);
    return true;
  }
  if (activeScriptWidgets.size >= MAX_ACTIVE_SCRIPT_WIDGETS) return false;
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

export function ScriptWidgetHost({
  bodyJson,
  instance,
  settingsSchemaJson,
}: {
  bodyJson: string;
  instance: DashboardWidgetInstance;
  settingsSchemaJson: string;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const updateInstance = useDashboardStore((s) => s.updateInstance);
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
  // show a lightweight placeholder instead of the full iframe.
  useEffect(() => {
    const activated = tryActivateScriptWidget(instance.id, setCapped);
    setCapped(!activated);
    return () => {
      deactivateScriptWidget(instance.id);
    };
  }, [instance.id]);

  const activateCapped = useCallback(() => {
    // Evict the oldest active widget (notifying it so its iframe tears
    // down) before taking its slot. Without the notify step the evicted
    // iframe keeps running and the cap is silently exceeded.
    evictOldestActiveScriptWidget(instance.id);
    tryActivateScriptWidget(instance.id, setCapped);
    setCapped(false);
  }, [instance.id]);

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
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (isScriptWidgetOpenExternalMessage(data)) {
        void openExternalUrl(data.url);
        return;
      }
      if (isScriptWidgetSettingsMessage(data)) {
        const values = parseWidgetSettingsValuesJson(JSON.stringify(data.settings));
        if (values.ok) {
          void updateInstance(instance.id, { settingsValuesJson: JSON.stringify(values.value) });
        }
        return;
      }
      if (isScriptWidgetGetSecretMessage(data)) {
        void sendSecretResponse(data);
        return;
      }
      if (isScriptWidgetSaveFileMessage(data)) {
        void sendSaveFileResponse(data);
        return;
      }
      if (isScriptWidgetReadFileMessage(data)) {
        void sendReadFileResponse(data);
        return;
      }
      if (isScriptWidgetCallMcpToolMessage(data)) {
        void sendMcpToolResponse(data);
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

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [instance.id, updateInstance]);

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
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", height: "100%", cursor: "pointer",
          opacity: 0.65, fontSize: 12, userSelect: "none",
        }}
      >
        {t("dashboard.scriptWidgetCapped", { max: MAX_ACTIVE_SCRIPT_WIDGETS })}
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
      title="dashboard-script"
      sandbox="allow-scripts allow-downloads"
      srcDoc={srcdoc}
      style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
    />
  );
}

function resolveSettingsValuesJson(settingsSchemaJson: string, settingsValuesJson: string) {
  const schema = validateWidgetSettingsSchemaJson(settingsSchemaJson);
  const values = parseWidgetSettingsValuesJson(settingsValuesJson);
  if (!schema.ok) return values.ok ? JSON.stringify(values.value) : "{}";
  return JSON.stringify(settingsValuesWithDefaults(schema.value, values.ok ? values.value : {}));
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

export function useScriptReloadHandle() {
  const [key, setKey] = useState(0);
  return { key, reload: () => setKey((k) => k + 1) };
}
