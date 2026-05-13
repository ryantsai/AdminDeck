import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ContentBody } from "../types";
import { parseJsonObject, validateContentWidgetBody } from "../schema";

export function ContentWidgetRenderer({ bodyJson }: { bodyJson: string }) {
  const { t } = useTranslation();
  const parsed = useMemo<ContentBody | null>(() => {
    const json = parseJsonObject(bodyJson);
    if (!json.ok) return null;
    const body = validateContentWidgetBody(json.value);
    return body.ok ? body.value : null;
  }, [bodyJson]);

  if (!parsed) return <div className="dw-content-error">{t("dashboard.invalidContentWidgetBody")}</div>;

  switch (parsed.shape) {
    case "markdown":
      return <div className="dw-content-md">{parsed.data.source}</div>;
    case "kvList":
      return (
        <div className="dw-kv">
          {parsed.data.rows.map((r, i) => (
            <span key={i} className="dw-kv-row">
              <span className="dw-kv-label">{r.label}</span>
              <span className="dw-kv-value">{r.value}</span>
            </span>
          ))}
        </div>
      );
    case "checklist":
      return (
        <ul className="dw-checklist">
          {parsed.data.items.map((item, i) => (
            <li key={i} className={item.done ? "dw-done" : ""}>{item.label}</li>
          ))}
        </ul>
      );
    case "stat":
      return (
        <div className="dw-stat">
          <span className="dw-stat-value">{parsed.data.value}</span>
          {parsed.data.unit  && <span className="dw-stat-unit">{parsed.data.unit}</span>}
          {parsed.data.delta && <span className="dw-stat-delta">{parsed.data.delta}</span>}
          {parsed.data.caption && <span className="dw-stat-caption">{parsed.data.caption}</span>}
        </div>
      );
  }
}
