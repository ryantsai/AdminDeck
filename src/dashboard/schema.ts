import type {
  ContentBody, ContentChart, ContentLeafBody, ContentLive, ContentTable,
  ScriptBody, WidgetCustomKind,
  WidgetSecretRef, WidgetSettingsField, WidgetSettingsSchema,
} from "./types";

const MAX_CONTENT_BODY_BYTES = 32 * 1024;
const MAX_TABLE_COLUMNS = 12;
const MAX_TABLE_ROWS = 200;
const MAX_CHART_POINTS = 200;
const MAX_LAYOUT_CHILDREN = 12;
const MAX_SCRIPT_SOURCE_BYTES = 64 * 1024;
const MAX_SETTINGS_SCHEMA_BYTES = 16 * 1024;
const MAX_SETTINGS_VALUES_BYTES = 32 * 1024;
const MIN_POLL_SECONDS = 1;
const MAX_SETTINGS_FIELDS = 20;
const MAX_SELECT_OPTIONS = 40;
const MAX_WIDGET_LIBRARIES = 8;
const SETTINGS_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const LIBRARY_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function encodedLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function parseJsonObject(value: string): ValidationResult<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, reason: "invalidJson" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: "invalidObject" };
  }
  return { ok: true, value: parsed };
}

export function validateContentWidgetBody(value: unknown): ValidationResult<ContentBody> {
  if (!isRecord(value) || typeof value.shape !== "string" || !isRecord(value.data)) {
    return { ok: false, reason: "invalidContentShape" };
  }

  switch (value.shape) {
    case "markdown": {
      if (!isNonEmptyString(value.data.source)) {
        return { ok: false, reason: "invalidContentData" };
      }
      if (
        value.data.mode !== undefined &&
        value.data.mode !== "markdown" &&
        value.data.mode !== "html"
      ) {
        return { ok: false, reason: "invalidContentData" };
      }
      const mode = value.data.mode === "html" ? "html" : "markdown";
      return { ok: true, value: { shape: "markdown", data: { source: value.data.source, mode } } };
    }
    case "kvList": {
      if (!Array.isArray(value.data.rows) || value.data.rows.length === 0) {
        return { ok: false, reason: "invalidContentData" };
      }
      const rows = value.data.rows.map((row) => {
        if (!isRecord(row) || !isNonEmptyString(row.label) || typeof row.value !== "string") {
          return null;
        }
        return { label: row.label, value: row.value };
      });
      if (rows.some((row) => row === null)) {
        return { ok: false, reason: "invalidContentData" };
      }
      return { ok: true, value: { shape: "kvList", data: { rows: rows as { label: string; value: string }[] } } };
    }
    case "checklist": {
      if (!Array.isArray(value.data.items) || value.data.items.length === 0) {
        return { ok: false, reason: "invalidContentData" };
      }
      const items = value.data.items.map((item) => {
        if (!isRecord(item) || !isNonEmptyString(item.label)) {
          return null;
        }
        return { label: item.label, done: typeof item.done === "boolean" ? item.done : false };
      });
      if (items.some((item) => item === null)) {
        return { ok: false, reason: "invalidContentData" };
      }
      return { ok: true, value: { shape: "checklist", data: { items: items as { label: string; done: boolean }[] } } };
    }
    case "stat": {
      if (!isNonEmptyString(value.data.value)) {
        return { ok: false, reason: "invalidContentData" };
      }
      return {
        ok: true,
        value: {
          shape: "stat",
          data: {
            value: value.data.value,
            unit: typeof value.data.unit === "string" ? value.data.unit : undefined,
            delta: typeof value.data.delta === "string" ? value.data.delta : undefined,
            caption: typeof value.data.caption === "string" ? value.data.caption : undefined,
          },
        },
      };
    }
    case "table": {
      const table = parseContentTable(value.data);
      if (!table) return { ok: false, reason: "invalidContentData" };
      return { ok: true, value: { shape: "table", data: table } };
    }
    case "chart": {
      const chart = parseContentChart(value.data);
      if (!chart) return { ok: false, reason: "invalidContentData" };
      return { ok: true, value: { shape: "chart", data: chart } };
    }
    case "live": {
      const live = parseContentLive(value.data);
      if (!live) return { ok: false, reason: "invalidContentData" };
      return { ok: true, value: { shape: "live", data: live } };
    }
    case "layout": {
      const direction = value.data.direction;
      if (direction !== "row" && direction !== "col" && direction !== "grid") {
        return { ok: false, reason: "invalidContentData" };
      }
      if (!Array.isArray(value.data.children) || value.data.children.length === 0) {
        return { ok: false, reason: "invalidContentData" };
      }
      if (value.data.children.length > MAX_LAYOUT_CHILDREN) {
        return { ok: false, reason: "invalidContentData" };
      }
      const children: ContentLeafBody[] = [];
      for (const raw of value.data.children) {
        const leaf = validateContentLeafBody(raw);
        if (!leaf.ok) return leaf;
        children.push(leaf.value);
      }
      return { ok: true, value: { shape: "layout", data: { direction, children } } };
    }
    default:
      return { ok: false, reason: "invalidContentShape" };
  }
}

/// Same dispatcher as `validateContentWidgetBody` but excludes the `layout`
/// shape. Mirrors the Rust `ContentLeafBody` enum.
function validateContentLeafBody(value: unknown): ValidationResult<ContentLeafBody> {
  if (!isRecord(value) || typeof value.shape !== "string" || !isRecord(value.data)) {
    return { ok: false, reason: "invalidContentShape" };
  }
  if (value.shape === "layout" || value.shape === "live") {
    // Nested layouts and live-inside-layout are out of scope for v1.
    return { ok: false, reason: "invalidContentShape" };
  }
  // Delegate to the top-level dispatcher, then re-narrow to leaf — the
  // dispatcher returns ContentBody, but our shape guard above rules out the
  // layout and live variants.
  const dispatched = validateContentWidgetBody(value);
  if (!dispatched.ok) return dispatched;
  if (dispatched.value.shape === "layout" || dispatched.value.shape === "live") {
    return { ok: false, reason: "invalidContentShape" };
  }
  return { ok: true, value: dispatched.value };
}

const LIVE_BINDING_TARGET_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const LIVE_RENDER_SHAPES = new Set(["markdown", "kvList", "checklist", "stat", "table", "chart"]);
const MIN_LIVE_REFRESH_SEC = 5;
const MAX_LIVE_REFRESH_SEC = 60 * 60 * 24;
const MAX_LIVE_PATH_EXPRESSION_LEN = 256;

function parseContentLive(data: Record<string, unknown>): ContentLive | null {
  const fetchRaw = data.fetch;
  if (!isRecord(fetchRaw) || typeof fetchRaw.url !== "string") return null;
  if (!fetchRaw.url.startsWith("https://")) return null;
  let refreshSec: number | undefined;
  if (fetchRaw.refreshSec !== undefined && fetchRaw.refreshSec !== null) {
    if (typeof fetchRaw.refreshSec !== "number" || !Number.isInteger(fetchRaw.refreshSec)) return null;
    if (fetchRaw.refreshSec < MIN_LIVE_REFRESH_SEC || fetchRaw.refreshSec > MAX_LIVE_REFRESH_SEC) return null;
    refreshSec = fetchRaw.refreshSec;
  }
  const renderRaw = data.render;
  if (!isRecord(renderRaw) || typeof renderRaw.shape !== "string" || !LIVE_RENDER_SHAPES.has(renderRaw.shape)) {
    return null;
  }
  if (!isRecord(renderRaw.data)) return null;
  const bindingsRaw = data.bindings;
  if (!Array.isArray(bindingsRaw)) return null;
  const bindings: ContentLive["bindings"] = [];
  for (const b of bindingsRaw) {
    if (!isRecord(b)) return null;
    if (typeof b.target !== "string" || !LIVE_BINDING_TARGET_PATTERN.test(b.target)) return null;
    if (typeof b.source !== "string" || b.source.length === 0 || b.source.length > MAX_LIVE_PATH_EXPRESSION_LEN) {
      return null;
    }
    if (!isValidLivePathExpression(b.source)) return null;
    bindings.push({ target: b.target, source: b.source });
  }
  return {
    fetch: { url: fetchRaw.url, refreshSec },
    render: { shape: renderRaw.shape as ContentLeafBody["shape"], data: renderRaw.data },
    bindings,
  };
}

/// Tiny JSON-path subset, mirrors `validate_live_path_expression` in Rust:
///   identifier (.identifier | [N] | [*])*
export function isValidLivePathExpression(path: string): boolean {
  if (path.length === 0) return false;
  let i = 0;
  const bytes = path;
  while (i < bytes.length) {
    // Identifier segment: first byte alpha, then alpha/digit/_.
    if (!/[a-zA-Z]/.test(bytes[i]!)) return false;
    i++;
    while (i < bytes.length && /[a-zA-Z0-9_]/.test(bytes[i]!)) i++;
    while (i < bytes.length && bytes[i] === "[") {
      i++;
      if (i < bytes.length && bytes[i] === "*") {
        i++;
      } else {
        const digitStart = i;
        while (i < bytes.length && /[0-9]/.test(bytes[i]!)) i++;
        if (i === digitStart) return false;
      }
      if (i >= bytes.length || bytes[i] !== "]") return false;
      i++;
    }
    if (i === bytes.length) break;
    if (bytes[i] !== ".") return false;
    i++;
    if (i === bytes.length) return false;
  }
  return true;
}

/// Resolve a path expression against a fetched JSON value. Returns
/// `undefined` if any segment misses; `[*]` produces an array via
/// fan-out over remaining path.
export function resolveLivePath(value: unknown, path: string): unknown {
  return walkPath(value, path, 0);
}

function walkPath(value: unknown, path: string, cursor: number): unknown {
  if (cursor >= path.length) return value;
  // Identifier segment
  let i = cursor;
  while (i < path.length && /[a-zA-Z0-9_]/.test(path[i]!)) i++;
  const key = path.slice(cursor, i);
  if (key.length === 0) return undefined;
  if (!isRecord(value)) return undefined;
  let cur: unknown = (value as Record<string, unknown>)[key];
  // Indexer chain
  while (i < path.length && path[i] === "[") {
    i++;
    if (path[i] === "*") {
      i++;
      if (path[i] !== "]") return undefined;
      i++;
      if (!Array.isArray(cur)) return undefined;
      // Fan-out remaining path across each element. If we're at end of
      // path, return the array as-is; otherwise expect a `.subkey` next.
      if (i >= path.length) return cur;
      if (path[i] === ".") {
        const restStart = i + 1;
        return cur.map((el) => walkPath(el, path, restStart));
      }
      return undefined;
    }
    // Numeric index
    const dStart = i;
    while (i < path.length && /[0-9]/.test(path[i]!)) i++;
    if (i === dStart) return undefined;
    const idx = Number.parseInt(path.slice(dStart, i), 10);
    if (path[i] !== "]") return undefined;
    i++;
    if (!Array.isArray(cur)) return undefined;
    cur = (cur as unknown[])[idx];
  }
  if (i >= path.length) return cur;
  if (path[i] !== ".") return undefined;
  return walkPath(cur, path, i + 1);
}

function parseContentTable(data: Record<string, unknown>): ContentTable | null {
  if (!Array.isArray(data.columns) || data.columns.length === 0 || data.columns.length > MAX_TABLE_COLUMNS) {
    return null;
  }
  if (!Array.isArray(data.rows) || data.rows.length > MAX_TABLE_ROWS) {
    return null;
  }
  const seenKeys = new Set<string>();
  const columns: ContentTable["columns"] = [];
  for (const raw of data.columns) {
    if (!isRecord(raw) || !isNonEmptyString(raw.key) || !isNonEmptyString(raw.label)) return null;
    if (raw.align !== undefined && raw.align !== null && raw.align !== "start" && raw.align !== "center" && raw.align !== "end") {
      return null;
    }
    if (seenKeys.has(raw.key)) return null;
    seenKeys.add(raw.key);
    columns.push({
      key: raw.key,
      label: raw.label,
      align: raw.align === "start" || raw.align === "center" || raw.align === "end" ? raw.align : undefined,
    });
  }
  const rows: ContentTable["rows"] = [];
  for (const raw of data.rows) {
    if (!isRecord(raw)) return null;
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "string") return null;
      row[k] = v;
    }
    rows.push(row);
  }
  return { columns, rows };
}

function parseContentChart(data: Record<string, unknown>): ContentChart | null {
  const kind = data.kind;
  if (kind === "sparkline") {
    if (!Array.isArray(data.points) || data.points.length === 0 || data.points.length > MAX_CHART_POINTS) return null;
    const points: number[] = [];
    for (const p of data.points) {
      if (typeof p !== "number" || !Number.isFinite(p)) return null;
      points.push(p);
    }
    return {
      kind: "sparkline",
      points,
      caption: typeof data.caption === "string" ? data.caption : undefined,
    };
  }
  if (kind === "bar" || kind === "donut") {
    if (!Array.isArray(data.series) || data.series.length === 0 || data.series.length > MAX_CHART_POINTS) return null;
    const series: { label: string; value: number }[] = [];
    for (const entry of data.series) {
      if (!isRecord(entry) || !isNonEmptyString(entry.label)) return null;
      if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) return null;
      if (kind === "donut" && entry.value < 0) return null;
      series.push({ label: entry.label, value: entry.value });
    }
    return {
      kind,
      series,
      caption: typeof data.caption === "string" ? data.caption : undefined,
    };
  }
  return null;
}

export function validateScriptWidgetBody(value: unknown): ValidationResult<ScriptBody> {
  if (!isRecord(value) || typeof value.source !== "string" || !isRecord(value.permissions)) {
    return { ok: false, reason: "invalidScriptBody" };
  }
  if (value.source.trim().length === 0) {
    return { ok: false, reason: "invalidScriptBody" };
  }
  if (encodedLength(value.source) > MAX_SCRIPT_SOURCE_BYTES) {
    return { ok: false, reason: "scriptTooLarge" };
  }
  const domMountValidation = validateScriptDomMounts(
    value.source,
    typeof value.htmlShim === "string" ? value.htmlShim : undefined,
  );
  if (!domMountValidation.ok) {
    return domMountValidation;
  }
  const rawPollSeconds = value.permissions.pollSeconds;
  if (rawPollSeconds !== undefined && rawPollSeconds !== null && typeof rawPollSeconds !== "number") {
    return { ok: false, reason: "invalidPollSeconds" };
  }
  const pollSeconds = rawPollSeconds === null ? undefined : rawPollSeconds;
  if (pollSeconds !== undefined && (!Number.isInteger(pollSeconds) || pollSeconds < MIN_POLL_SECONDS)) {
    return { ok: false, reason: "invalidPollSeconds" };
  }
  let libraries: string[] | undefined;
  if (value.libraries !== undefined && value.libraries !== null) {
    if (!Array.isArray(value.libraries) || value.libraries.length > MAX_WIDGET_LIBRARIES) {
      return { ok: false, reason: "invalidLibraries" };
    }
    const seen = new Set<string>();
    const list: string[] = [];
    for (const entry of value.libraries) {
      if (typeof entry !== "string" || !LIBRARY_KEY_PATTERN.test(entry)) {
        return { ok: false, reason: "invalidLibraries" };
      }
      if (seen.has(entry)) continue;
      seen.add(entry);
      list.push(entry);
    }
    libraries = list.length > 0 ? list : undefined;
  }
  let lifecycle: ScriptBody["lifecycle"];
  if (value.lifecycle !== undefined && value.lifecycle !== null) {
    if (!isRecord(value.lifecycle)) {
      return { ok: false, reason: "invalidScriptBody" };
    }
    const kind = value.lifecycle.kind;
    if (kind !== "static" && kind !== "periodic" && kind !== "animation" && kind !== "realtime") {
      return { ok: false, reason: "invalidScriptBody" };
    }
    const rawMinTick = value.lifecycle.minTickMs;
    let minTickMs: number | undefined;
    if (rawMinTick !== undefined && rawMinTick !== null) {
      if (
        typeof rawMinTick !== "number" ||
        !Number.isInteger(rawMinTick) ||
        rawMinTick < 16 ||
        rawMinTick > 60_000
      ) {
        return { ok: false, reason: "invalidScriptBody" };
      }
      minTickMs = rawMinTick;
    }
    lifecycle = { kind, minTickMs };
  }
  return {
    ok: true,
    value: {
      source: value.source,
      permissions: {
        network: value.permissions.network === true,
        pollSeconds,
      },
      htmlShim: typeof value.htmlShim === "string" ? value.htmlShim : undefined,
      libraries,
      lifecycle,
    },
  };
}

function validateScriptDomMounts(
  source: string,
  htmlShim: string | undefined,
): ValidationResult<undefined> {
  for (const id of extractGetElementByIdTargets(source)) {
    if (id === "root" || htmlShimContainsId(htmlShim, id) || sourceCreatesId(source, id)) {
      continue;
    }
    return { ok: false, reason: "invalidScriptDomMount" };
  }
  return { ok: true, value: undefined };
}

function extractGetElementByIdTargets(source: string): string[] {
  const ids: string[] = [];
  const expression = /document\.getElementById\s*\(\s*(["'])(.*?)\1\s*\)/g;
  for (const match of source.matchAll(expression)) {
    ids.push(match[2] ?? "");
  }
  return ids;
}

function htmlShimContainsId(htmlShim: string | undefined, id: string) {
  if (!htmlShim) return false;
  return htmlShim.includes(`id="${id}"`) || htmlShim.includes(`id='${id}'`);
}

function sourceCreatesId(source: string, id: string) {
  return [
    `.id = "${id}"`,
    `.id = '${id}'`,
    `.id="${id}"`,
    `.id='${id}'`,
    `setAttribute("id", "${id}")`,
    `setAttribute('id', '${id}')`,
    `setAttribute("id","${id}")`,
    `setAttribute('id','${id}')`,
  ].some((needle) => source.includes(needle));
}

export function validateCustomWidgetBodyJson(kind: WidgetCustomKind, bodyJson: string): ValidationResult<ContentBody | ScriptBody> {
  if (kind === "content" && encodedLength(bodyJson) > MAX_CONTENT_BODY_BYTES) {
    return { ok: false, reason: "contentTooLarge" };
  }
  if (kind === "script" && encodedLength(bodyJson) > MAX_SCRIPT_SOURCE_BYTES + 4096) {
    return { ok: false, reason: "scriptTooLarge" };
  }
  const parsed = parseJsonObject(bodyJson);
  if (!parsed.ok) {
    return parsed;
  }
  return kind === "content"
    ? validateContentWidgetBody(parsed.value)
    : validateScriptWidgetBody(parsed.value);
}

function validateSettingsKey(value: unknown): value is string {
  return typeof value === "string" && SETTINGS_KEY_PATTERN.test(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validateWidgetSettingsField(value: unknown): WidgetSettingsField | null {
  if (!isRecord(value) || typeof value.type !== "string" || !validateSettingsKey(value.key) || !isNonEmptyString(value.label)) {
    return null;
  }

  switch (value.type) {
    case "text":
      return {
        type: "text",
        key: value.key,
        label: value.label,
        placeholder: optionalString(value.placeholder),
        defaultValue: optionalString(value.defaultValue),
      };
    case "number": {
      const field: WidgetSettingsField = {
        type: "number",
        key: value.key,
        label: value.label,
      };
      if (typeof value.min === "number") field.min = value.min;
      if (typeof value.max === "number") field.max = value.max;
      if (typeof value.step === "number" && value.step > 0) field.step = value.step;
      if (typeof value.defaultValue === "number") field.defaultValue = value.defaultValue;
      return field;
    }
    case "boolean":
      return {
        type: "boolean",
        key: value.key,
        label: value.label,
        defaultValue: typeof value.defaultValue === "boolean" ? value.defaultValue : undefined,
      };
    case "select": {
      if (!Array.isArray(value.options) || value.options.length === 0 || value.options.length > MAX_SELECT_OPTIONS) {
        return null;
      }
      const options = value.options.map((option) => {
        if (!isRecord(option) || !isNonEmptyString(option.label) || typeof option.value !== "string") {
          return null;
        }
        return { label: option.label, value: option.value };
      });
      if (options.some((option) => option === null)) return null;
      return {
        type: "select",
        key: value.key,
        label: value.label,
        options: options as { label: string; value: string }[],
        defaultValue: optionalString(value.defaultValue),
      };
    }
    case "secret":
      if ("defaultValue" in value) return null;
      return {
        type: "secret",
        key: value.key,
        label: value.label,
        placeholder: optionalString(value.placeholder),
      };
    default:
      return null;
  }
}

export function validateWidgetSettingsSchema(value: unknown): ValidationResult<WidgetSettingsSchema> {
  if (!isRecord(value) || !Array.isArray(value.fields) || value.fields.length > MAX_SETTINGS_FIELDS) {
    return { ok: false, reason: "invalidSettingsSchema" };
  }
  const fields = value.fields.map(validateWidgetSettingsField);
  if (fields.some((field) => field === null)) {
    return { ok: false, reason: "invalidSettingsField" };
  }
  const keys = new Set<string>();
  for (const field of fields as WidgetSettingsField[]) {
    if (keys.has(field.key)) {
      return { ok: false, reason: "duplicateSettingsKey" };
    }
    keys.add(field.key);
  }
  return { ok: true, value: { fields: fields as WidgetSettingsField[] } };
}

export function validateWidgetSettingsSchemaJson(value: string): ValidationResult<WidgetSettingsSchema> {
  if (encodedLength(value) > MAX_SETTINGS_SCHEMA_BYTES) {
    return { ok: false, reason: "settingsSchemaTooLarge" };
  }
  const parsed = parseJsonObject(value);
  if (!parsed.ok) return parsed;
  return validateWidgetSettingsSchema(parsed.value);
}

export function parseWidgetSettingsValuesJson(value: string): ValidationResult<Record<string, unknown>> {
  if (encodedLength(value) > MAX_SETTINGS_VALUES_BYTES) {
    return { ok: false, reason: "settingsValuesTooLarge" };
  }
  const parsed = parseJsonObject(value);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

export function defaultSettingsValueForField(field: WidgetSettingsField): unknown {
  if (field.type === "secret") return null;
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  if (field.type === "number") return "";
  if (field.type === "select") return field.options[0]?.value ?? "";
  return "";
}

export function settingsValuesWithDefaults(
  schema: WidgetSettingsSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const value = values[field.key];
    if (field.type === "boolean") {
      next[field.key] = typeof value === "boolean" ? value : defaultSettingsValueForField(field);
    } else if (field.type === "number") {
      next[field.key] = typeof value === "number" || value === "" ? value : defaultSettingsValueForField(field);
    } else if (field.type === "select") {
      const allowed = new Set(field.options.map((option) => option.value));
      next[field.key] = typeof value === "string" && allowed.has(value)
        ? value
        : defaultSettingsValueForField(field);
    } else if (field.type === "secret") {
      next[field.key] = isWidgetSecretRef(value) ? value : null;
    } else {
      next[field.key] = typeof value === "string" ? value : defaultSettingsValueForField(field);
    }
  }
  return next;
}

export function validateWidgetSettingsValuesForSchema(
  schema: WidgetSettingsSchema,
  values: Record<string, unknown>,
  instanceId: string,
): ValidationResult<Record<string, unknown>> {
  for (const field of schema.fields) {
    if (field.type !== "secret") continue;
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    if (!isWidgetSecretRef(value) || value.ownerId !== dashboardWidgetSecretOwnerId(instanceId, field.key)) {
      return { ok: false, reason: "invalidSecretReference" };
    }
  }
  return { ok: true, value: values };
}

export function dashboardWidgetSecretOwnerId(instanceId: string, key: string) {
  return `dashboard-widget-secret:${instanceId}:${key}`;
}

export function isWidgetSecretRef(value: unknown): value is WidgetSecretRef {
  if (!isRecord(value)) return false;
  return (
    value.type === "secretRef" &&
    typeof value.ownerId === "string" &&
    value.ownerId.length > 0 &&
    value.hasSecret === true &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string")
  );
}
