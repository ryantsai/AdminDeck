import type { ContentBody, ScriptBody, WidgetCustomKind } from "./types";

const MAX_CONTENT_BODY_BYTES = 32 * 1024;
const MAX_SCRIPT_SOURCE_BYTES = 64 * 1024;
const MIN_POLL_SECONDS = 1;

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
      return { ok: true, value: { shape: "markdown", data: { source: value.data.source } } };
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
    default:
      return { ok: false, reason: "invalidContentShape" };
  }
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
  const rawPollSeconds = value.permissions.pollSeconds;
  if (rawPollSeconds !== undefined && typeof rawPollSeconds !== "number") {
    return { ok: false, reason: "invalidPollSeconds" };
  }
  const pollSeconds = rawPollSeconds;
  if (pollSeconds !== undefined && (!Number.isInteger(pollSeconds) || pollSeconds < MIN_POLL_SECONDS)) {
    return { ok: false, reason: "invalidPollSeconds" };
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
    },
  };
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
