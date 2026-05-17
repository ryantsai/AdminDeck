import * as Icons from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ariaSelected } from "../../lib/aria";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";
import { ToggleSwitch } from "../../settings/ToggleSwitch";
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
  WidgetSettingsField, WidgetSettingsSchema,
} from "../types";
import { defaultWidgetPresentationForPreset, ICON_NAMES, WIDGET_PRESETS } from "../types";

export interface CustomizePopoverProps {
  instance: DashboardWidgetInstance;
  anchorRect: DOMRect;
  onClose: () => void;
}

type SectionKey = "common" | "widget" | "advanced";

const POPOVER_MARGIN = 8;
const POPOVER_WIDTH = 440;

export function CustomizePopover({ instance, anchorRect, onClose }: CustomizePopoverProps) {
  const { t } = useTranslation();
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; visible: boolean }>({
    top: anchorRect.bottom + 6,
    left: anchorRect.left,
    visible: false,
  });
  const [section, setSection] = useState<SectionKey>("common");

  const customSource =
    instance.kind !== "builtIn" ? customWidgets.find((c) => c.id === instance.sourceId) : undefined;
  const settingsSchema = useMemo(
    () => (customSource ? parseSettingsSchema(customSource.settingsSchemaJson) : null),
    [customSource],
  );
  const hasWidgetSettings = Boolean(customSource);
  const hasAdvanced = instance.kind !== "builtIn";

  const sections = useMemo(() => {
    const list: { key: SectionKey; label: string }[] = [
      { key: "common", label: t("dashboard.customizeSectionCommon") },
    ];
    if (hasWidgetSettings) {
      list.push({ key: "widget", label: t("dashboard.customizeSectionWidget") });
    }
    if (hasAdvanced) {
      list.push({ key: "advanced", label: t("dashboard.advanced") });
    }
    return list;
  }, [hasWidgetSettings, hasAdvanced, t]);

  useEffect(() => {
    if (!sections.some((s) => s.key === section)) {
      setSection("common");
    }
  }, [section, sections]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const height = rect.height;
    const width = rect.width;
    const below = anchorRect.bottom + 6;
    const above = anchorRect.top - height - 6;
    const fitsBelow = below + height + POPOVER_MARGIN <= window.innerHeight;
    const top = fitsBelow ? below : Math.max(POPOVER_MARGIN, above);
    let left = Math.min(anchorRect.left, window.innerWidth - width - POPOVER_MARGIN);
    left = Math.max(POPOVER_MARGIN, left);
    setPosition({ top, left, visible: true });
  }, [anchorRect, section]);

  return (
    <div
      ref={ref}
      className="dw-customize"
      style={{
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        visibility: position.visible ? "visible" : "hidden",
      }}
    >
      <nav className="dw-customize-tabs" role="tablist" aria-label={t("dashboard.customize")}>
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            {...ariaSelected(section === s.key)}
            className={section === s.key ? "active" : ""}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="dw-customize-pane" role="tabpanel">
        {section === "common" ? <CommonSection instance={instance} /> : null}
        {section === "widget" ? (
          <WidgetSection schema={settingsSchema} instance={instance} />
        ) : null}
        {section === "advanced" ? <AdvancedSection instance={instance} /> : null}
      </div>
    </div>
  );
}

function CommonSection({ instance }: { instance: DashboardWidgetInstance }) {
  const { t } = useTranslation();
  const updateInstance = useDashboardStore((s) => s.updateInstance);

  return (
    <>
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

      <section>
        <h4>{t("dashboard.presetLabel")}</h4>
        <div className="dw-preset-picker">
          {WIDGET_PRESETS.map((p) => (
            <button
              key={p}
              className={instance.preset === p ? "active" : ""}
              onClick={() => updateInstance(instance.id, {
                preset: p,
                ...defaultWidgetPresentationForPreset(p),
              })}
            >
              {t(`dashboard.preset.${p}`)}
            </button>
          ))}
        </div>
      </section>

      {instance.preset === "ambient" ? (
        <section>
          <label className="dw-field dw-field-row">
            <span>{t("dashboard.glassBackground")}</span>
            <ToggleSwitch
              checked={instance.glass === true}
              onChange={(checked) => updateInstance(instance.id, { glass: checked })}
            />
          </label>
          <label className="dw-field dw-field-row">
            <span>{t("dashboard.hideTitle")}</span>
            <ToggleSwitch
              checked={instance.hideTitle === true}
              onChange={(checked) => updateInstance(instance.id, { hideTitle: checked })}
            />
          </label>
        </section>
      ) : null}

      <section>
        <h4>{t("dashboard.accent")}</h4>
        <div className="dw-accent-picker">
          {ACCENT_PALETTE.map((p) => {
            const label = p.name === "default" ? t("dashboard.accentDefault") : p.name;
            return (
              <button
                key={p.name}
                className={instance.accentName === p.name ? "active" : ""}
                style={{ background: p.color }}
                title={label}
                aria-label={label}
                onClick={() => updateInstance(instance.id, { accentName: p.name as AccentName })}
              />
            );
          })}
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
    </>
  );
}

function WidgetSection({
  schema,
  instance,
}: {
  schema: WidgetSettingsSchema | null;
  instance: DashboardWidgetInstance;
}) {
  const { t } = useTranslation();
  const updateInstance = useDashboardStore((s) => s.updateInstance);
  const settingsValues = useMemo(
    () => (schema ? parseSettingsValues(schema, instance.settingsValuesJson) : {}),
    [schema, instance.settingsValuesJson],
  );

  if (!schema) {
    return (
      <section>
        <h4>{t("dashboard.widgetSettings")}</h4>
        <p className="dw-muted">{t("dashboard.widgetSettingsInvalid")}</p>
      </section>
    );
  }

  return (
    <section>
      <h4>{t("dashboard.widgetSettings")}</h4>
      {schema.fields.length > 0 ? (
        <WidgetSettingsFields
          schema={schema}
          values={settingsValues}
          instanceId={instance.id}
          onChange={(key, value) => {
            const next = { ...settingsValues, [key]: value };
            void updateInstance(instance.id, { settingsValuesJson: JSON.stringify(next) });
          }}
        />
      ) : (
        <p className="dw-muted">{t("dashboard.widgetSettingsEmpty")}</p>
      )}
    </section>
  );
}

function AdvancedSection({ instance }: { instance: DashboardWidgetInstance }) {
  const customWidgets = useDashboardStore((s) => s.customWidgets);
  const updateCustomWidget = useDashboardStore((s) => s.updateCustomWidget);
  const customSource =
    instance.kind !== "builtIn" ? customWidgets.find((c) => c.id === instance.sourceId) : undefined;

  if (!customSource) return null;

  if (instance.kind === "script") {
    return (
      <ScriptAdvanced
        bodyJson={customSource.bodyJson}
        onUpdate={(next) => updateCustomWidget(customSource.id, { bodyJson: next })}
      />
    );
  }
  if (instance.kind === "content") {
    return <pre className="dw-source-view">{customSource.bodyJson}</pre>;
  }
  return null;
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
      <label className="dw-field dw-field-row">
        <span>{field.label}</span>
        <ToggleSwitch
          checked={value === true}
          onChange={(checked) => onChange(checked)}
        />
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
      <label className="dw-field dw-field-row">
        <span>{t("dashboard.scriptNetwork")}</span>
        <ToggleSwitch
          checked={parsed.permissions.network}
          onChange={(checked) => {
            const next = { ...parsed, permissions: { ...parsed.permissions, network: checked } };
            onUpdate(JSON.stringify(next));
          }}
        />
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
