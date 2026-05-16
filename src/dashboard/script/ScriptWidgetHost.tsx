import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadWidgetLibraries } from "./widgetLibraries";

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
  const requestedLibKey = useMemo(() => (parsed?.libraries ?? []).join("|"), [parsed]);
  useEffect(() => {
    if (!parsed) {
      setLibraries(null);
      setLibraryError(null);
      return;
    }
    if (!parsed.libraries || parsed.libraries.length === 0) {
      setLibraries([]);
      setLibraryError(null);
      return;
    }
    let cancelled = false;
    setLibraries(null);
    setLibraryError(null);
    loadWidgetLibraries(parsed.libraries)
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
  }, [parsed, requestedLibKey]);
  const srcdoc = useMemo(
    () => (parsed && libraries ? buildSrcdoc(parsed, settingsValuesJson, libraries) : ""),
    [parsed, settingsValuesJson, libraries],
  );

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
