import * as Icons from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";
import { useDashboardStore } from "../state/dashboardStore";
import { ACCENT_PALETTE } from "../registry/palette";
import {
  dashboardWidgetSecretOwnerId,
  isWidgetSecretRef,
  parseWidgetSettingsValuesJson,
  settingsValuesWithDefaults,
  validateWidgetSettingsSchemaJson,
} from "../schema";
import type {
  AccentName, DashboardWidgetInstance, IconName,
  WidgetPreset, WidgetSettingsField, WidgetSettingsSchema,
} from "../types";
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
  const settingsSchema = customSource
    ? parseSettingsSchema(customSource.settingsSchemaJson)
    : null;
  const settingsValues = settingsSchema
    ? parseSettingsValues(settingsSchema, instance.settingsValuesJson)
    : {};

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
        <h4>{t("dashboard.titleLabel")}</h4>
        <input
          defaultValue={instance.customTitle ?? ""}
          placeholder={t("dashboard.titlePlaceholder")}
          onBlur={(e) => {
            const value = e.target.value.trim();
            updateInstance(instance.id, { customTitle: value.length === 0 ? null : value });
          }}
        />
      </section>

      {customSource ? (
        <section>
          <h4>{t("dashboard.widgetSettings")}</h4>
          {settingsSchema ? (
            settingsSchema.fields.length > 0 ? (
              <WidgetSettingsFields
                schema={settingsSchema}
                values={settingsValues}
                instanceId={instance.id}
                onChange={(key, value) => {
                  const next = { ...settingsValues, [key]: value };
                  void updateInstance(instance.id, { settingsValuesJson: JSON.stringify(next) });
                }}
              />
            ) : (
              <p className="dw-muted">{t("dashboard.widgetSettingsEmpty")}</p>
            )
          ) : (
            <p className="dw-muted">{t("dashboard.widgetSettingsInvalid")}</p>
          )}
        </section>
      ) : null}

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

function parseSettingsSchema(settingsSchemaJson: string): WidgetSettingsSchema | null {
  const parsed = validateWidgetSettingsSchemaJson(settingsSchemaJson);
  return parsed.ok ? parsed.value : null;
}

function parseSettingsValues(
  schema: WidgetSettingsSchema,
  settingsValuesJson: string,
): Record<string, unknown> {
  const parsed = parseWidgetSettingsValuesJson(settingsValuesJson);
  return settingsValuesWithDefaults(schema, parsed.ok ? parsed.value : {});
}

function WidgetSettingsFields({
  schema,
  values,
  instanceId,
  onChange,
}: {
  schema: WidgetSettingsSchema;
  values: Record<string, unknown>;
  instanceId: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="dw-stack-fields">
      {schema.fields.map((field) => (
        <WidgetSettingsFieldControl
          field={field}
          key={field.key}
          value={values[field.key]}
          instanceId={instanceId}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

function WidgetSettingsFieldControl({
  field,
  value,
  instanceId,
  onChange,
}: {
  field: WidgetSettingsField;
  value: unknown;
  instanceId: string;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [secretDraft, setSecretDraft] = useState("");
  const [secretError, setSecretError] = useState("");

  if (field.type === "boolean") {
    return (
      <label className="dw-field">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="dw-field">
        <span>{field.label}</span>
        <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="dw-field">
        <span>{field.label}</span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={typeof value === "number" || value === "" ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      </label>
    );
  }

  if (field.type === "secret") {
    const secretRef = isWidgetSecretRef(value) ? value : null;
    const ownerId = dashboardWidgetSecretOwnerId(instanceId, field.key);

    async function saveSecret() {
      const secret = secretDraft.trim();
      if (!secret) return;
      setSecretError("");
      try {
        if (isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: { kind: "widgetSecret", ownerId, secret },
          });
        }
        onChange({
          type: "secretRef",
          ownerId,
          hasSecret: true,
          updatedAt: new Date().toISOString(),
        });
        setSecretDraft("");
      } catch (error) {
        setSecretError(error instanceof Error ? error.message : String(error));
      }
    }

    async function clearSecret() {
      setSecretError("");
      try {
        if (isTauriRuntime()) {
          await invokeCommand("delete_secret", {
            request: { kind: "widgetSecret", ownerId },
          });
        }
        onChange(null);
        setSecretDraft("");
      } catch (error) {
        setSecretError(error instanceof Error ? error.message : String(error));
      }
    }

    return (
      <label className="dw-field">
        <span>{field.label}</span>
        {secretRef ? <small className="dw-muted">{t("dashboard.secretStored")}</small> : null}
        <input
          type="password"
          placeholder={field.placeholder ?? t("dashboard.secretPlaceholder")}
          value={secretDraft}
          onChange={(event) => setSecretDraft(event.target.value)}
          onBlur={() => { void saveSecret(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveSecret();
            }
          }}
        />
        {secretRef ? (
          <button type="button" className="dw-secondary-button" onClick={() => { void clearSecret(); }}>
            {t("dashboard.secretClear")}
          </button>
        ) : null}
        {secretError ? <small className="dw-muted">{secretError}</small> : null}
      </label>
    );
  }

  return (
    <label className="dw-field">
      <span>{field.label}</span>
      <input
        type="text"
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
