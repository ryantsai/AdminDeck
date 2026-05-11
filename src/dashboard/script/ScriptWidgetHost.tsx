import { useMemo, useState } from "react";
import type { ScriptBody } from "../types";
import { buildSrcdoc } from "./permissions";

export function ScriptWidgetHost({ bodyJson }: { bodyJson: string }) {
  const [reloadKey] = useState(0);
  const parsed = useMemo<ScriptBody | null>(() => {
    try { return JSON.parse(bodyJson) as ScriptBody; } catch { return null; }
  }, [bodyJson]);

  if (!parsed) {
    return <div className="dw-script-error">Invalid script widget body.</div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const srcdoc = useMemo(() => buildSrcdoc(parsed), [parsed]);

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
