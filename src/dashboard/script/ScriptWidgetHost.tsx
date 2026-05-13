import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openExternalUrl } from "../../lib/tauri";
import type { ScriptBody } from "../types";
import { parseJsonObject, validateScriptWidgetBody } from "../schema";
import { buildSrcdoc } from "./permissions";

export function ScriptWidgetHost({ bodyJson }: { bodyJson: string }) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { key: reloadKey } = useScriptReloadHandle();
  const parsed = useMemo<ScriptBody | null>(() => {
    const json = parseJsonObject(bodyJson);
    if (!json.ok) return null;
    const body = validateScriptWidgetBody(json.value);
    return body.ok ? body.value : null;
  }, [bodyJson]);
  const srcdoc = useMemo(() => (parsed ? buildSrcdoc(parsed) : ""), [parsed]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!isScriptWidgetOpenExternalMessage(data)) return;
      void openExternalUrl(data.url);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!parsed) {
    return <div className="dw-script-error">{t("dashboard.invalidScriptWidgetBody")}</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      key={reloadKey}
      title="dashboard-script"
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
    />
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

export function useScriptReloadHandle() {
  const [key, setKey] = useState(0);
  return { key, reload: () => setKey((k) => k + 1) };
}
