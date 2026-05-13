import * as Icons from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardStore } from "../state/dashboardStore";
import { ACCENT_PALETTE } from "../registry/palette";
import type { AccentName, DashboardWidgetInstance, IconName, WidgetPreset } from "../types";
import { ICON_NAMES, WIDGET_PRESETS } from "../types";

export interface CustomizePopoverProps {
  instance: DashboardWidgetInstance;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function CustomizePopover({ instance, anchorRect, onClose }: CustomizePopoverProps) {
  const { t } = useTranslation();
  const updateInstance = useDashboardStore((s) => s.updateInstance);
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const updateCustomWidget = useDashboardStore((s) => s.updateCustomWidget);
  const ref = useRef<HTMLDivElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const top = anchorRect.bottom + 6;
  const left = Math.min(anchorRect.left, window.innerWidth - 320);
  const customSource =
    instance.kind !== "builtIn" ? customWidgets.find((c) => c.id === instance.sourceId) : undefined;

  return (
    <div ref={ref} className="dw-customize" style={{ top, left }}>
      <section>
        <h4>{t("dashboard.presetLabel")}</h4>
        <div className="dw-preset-picker">
          {WIDGET_PRESETS.map((p) => (
            <button
              key={p}
              className={instance.preset === p ? "active" : ""}
              onClick={() => updateInstance(instance.id, { preset: p as WidgetPreset })}
            >
              {t(`dashboard.preset.${p}`)}
            </button>
          ))}
        </div>
      </section>

      {instance.preset === "ambient" && (
        <section>
          <label className="dw-field">
            <input
              type="checkbox"
              checked={instance.glass === true}
              onChange={(e) => updateInstance(instance.id, { glass: e.target.checked })}
            />
            <span>{t("dashboard.glassBackground")}</span>
          </label>
        </section>
      )}

      {instance.preset === "action" && (
        <section>
          <h4>{t("dashboard.actionDirection")}</h4>
          <div className="dw-preset-picker">
            {(["vertical", "horizontal"] as const).map((d) => (
              <button
                key={d}
                className={(instance.actionDirection ?? "vertical") === d ? "active" : ""}
                onClick={() => updateInstance(instance.id, { actionDirection: d })}
              >
                {t(`dashboard.actionDirectionOptions.${d}`)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4>{t("dashboard.accent")}</h4>
        <div className="dw-accent-picker">
          {ACCENT_PALETTE.map((p) => (
            <button
              key={p.name}
              className={instance.accentName === p.name ? "active" : ""}
              style={{ background: p.color }}
              title={p.name}
              aria-label={p.name}
              onClick={() => updateInstance(instance.id, { accentName: p.name as AccentName })}
            />
          ))}
        </div>
      </section>

      <section>
        <h4>{t("dashboard.icon")}</h4>
        <div className="dw-icon-picker">
          {ICON_NAMES.map((name) => {
            const IconCmp = (Icons as unknown as Record<string, React.ComponentType<{ width?: number; height?: number }>>)[name];
            if (!IconCmp) return null;
            return (
              <button
                key={name}
                className={instance.iconName === name ? "active" : ""}
                title={name}
                aria-label={name}
                onClick={() => updateInstance(instance.id, { iconName: name as IconName })}
              >
                <IconCmp width={14} height={14} />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h4>{t("dashboard.title")}</h4>
        <input
          defaultValue={instance.customTitle ?? ""}
          placeholder={t("dashboard.titlePlaceholder")}
          onBlur={(e) => {
            const value = e.target.value.trim();
            updateInstance(instance.id, { customTitle: value.length === 0 ? null : value });
          }}
        />
      </section>

      <section>
        <button className="dw-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "▾ " : "▸ "}{t("dashboard.advanced")}
        </button>
        {showAdvanced && (
          <div className="dw-advanced">
            {instance.kind === "script" && customSource && (
              <ScriptAdvanced
                bodyJson={customSource.bodyJson}
                onUpdate={(next) => updateCustomWidget(customSource.id, { bodyJson: next })}
              />
            )}
            {instance.kind === "content" && customSource && (
              <pre className="dw-source-view">{customSource.bodyJson}</pre>
            )}
            {instance.kind === "builtIn" && (
              <p className="dw-muted">{t("dashboard.advancedNothing")}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ScriptAdvanced({ bodyJson, onUpdate }: { bodyJson: string; onUpdate: (next: string) => void }) {
  const { t } = useTranslation();
  let parsed: { source: string; permissions: { network: boolean; pollSeconds?: number } };
  try {
    parsed = JSON.parse(bodyJson) as { source: string; permissions: { network: boolean; pollSeconds?: number } };
  } catch {
    return <p className="dw-muted">{t("dashboard.scriptInvalidBody")}</p>;
  }
  return (
    <div className="dw-stack-fields">
      <label className="dw-field">
        <input
          type="checkbox"
          checked={parsed.permissions.network}
          onChange={(e) => {
            const next = { ...parsed, permissions: { ...parsed.permissions, network: e.target.checked } };
            onUpdate(JSON.stringify(next));
          }}
        />
        <span>{t("dashboard.scriptNetwork")}</span>
      </label>
      <label className="dw-field">
        <span>{t("dashboard.scriptPollSeconds")}</span>
        <input
          type="number"
          min={1}
          value={parsed.permissions.pollSeconds ?? ""}
          onChange={(e) => {
            const value = e.target.value === "" ? undefined : Number(e.target.value);
            const next = { ...parsed, permissions: { ...parsed.permissions, pollSeconds: value } };
            onUpdate(JSON.stringify(next));
          }}
        />
      </label>
      <details>
        <summary>{t("dashboard.scriptViewSource")}</summary>
        <pre className="dw-source-view">{parsed.source}</pre>
      </details>
    </div>
  );
}
