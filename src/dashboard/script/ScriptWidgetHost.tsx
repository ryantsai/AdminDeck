import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScriptBody } from "../types";
import { parseJsonObject, validateScriptWidgetBody } from "../schema";
import { buildSrcdoc } from "./permissions";

export function ScriptWidgetHost({ bodyJson }: { bodyJson: string }) {
  const { t } = useTranslation();
  const { key: reloadKey } = useScriptReloadHandle();
  const parsed = useMemo<ScriptBody | null>(() => {
    const json = parseJsonObject(bodyJson);
    if (!json.ok) return null;
    const body = validateScriptWidgetBody(json.value);
    return body.ok ? body.value : null;
  }, [bodyJson]);
  const srcdoc = useMemo(() => (parsed ? buildSrcdoc(parsed) : ""), [parsed]);

  if (!parsed) {
    return <div className="dw-script-error">{t("dashboard.invalidScriptWidgetBody")}</div>;
  }

  return (
    <iframe
      key={reloadKey}
      title="dashboard-script"
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
      onLoad={() => { /* intentionally empty; postMessage listener attached at WidgetFrame level if needed */ }}
    />
  );
}

export function useScriptReloadHandle() {
  const [key, setKey] = useState(0);
  return { key, reload: () => setKey((k) => k + 1) };
}
