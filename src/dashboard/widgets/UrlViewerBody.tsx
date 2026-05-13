import { ExternalLink, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openExternalUrl } from "../../lib/tauri";
import type { WorkspaceTab } from "../../types";
import { WebViewWorkspace } from "../../webview/WebViewWorkspace";
import type { BuiltInWidgetBodyProps } from "../registry/builtInRegistry";
import { useWidgetConfig } from "./widgetLocalStorage";

export type UrlWidgetConfig = {
  url: string;
  reloadSeconds: number;
};

const DEFAULT_CONFIG: UrlWidgetConfig = {
  url: "",
  reloadSeconds: 0,
};

function storageKey(instanceId: string) {
  return `kkterm.dashboard.urlViewer.${instanceId}.v1`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeUrlWidgetConfig(value: unknown): UrlWidgetConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_CONFIG;
  }
  const candidate = value as Partial<UrlWidgetConfig>;
  return {
    url: normalizeUrl(candidate.url),
    reloadSeconds: clampNumber(candidate.reloadSeconds, DEFAULT_CONFIG.reloadSeconds, 0, 3600),
  };
}

export function createUrlWidgetTab(instanceId: string, config: UrlWidgetConfig, reloadToken: number): WorkspaceTab {
  const host = formatUrlHost(config.url);
  return {
    id: `dashboard-url-${instanceId}-${reloadToken}`,
    title: host || config.url,
    toolbarTitle: host || config.url,
    subtitle: host || config.url,
    kind: "webview",
    panes: [],
    url: config.url,
  };
}

export function UrlViewerBody({ instance }: BuiltInWidgetBodyProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useWidgetConfig(
    storageKey(instance.id),
    DEFAULT_CONFIG,
    normalizeUrlWidgetConfig,
  );
  const [draft, setDraft] = useState(config);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!config.url || config.reloadSeconds <= 0) {
      return;
    }
    const interval = window.setInterval(() => {
      setReloadToken((current) => current + 1);
    }, config.reloadSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [config.reloadSeconds, config.url]);

  const tab = useMemo(
    () => (config.url ? createUrlWidgetTab(instance.id, config, reloadToken) : null),
    [config, instance.id, reloadToken],
  );

  function updateDraft<K extends keyof UrlWidgetConfig>(key: K, value: UrlWidgetConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextConfig = normalizeUrlWidgetConfig(draft);
    setConfig(nextConfig);
    setReloadToken((current) => current + 1);
  }

  return (
    <div className="dashboard-url-widget">
      <form className="dashboard-url-controls" onSubmit={handleSubmit}>
        <label className="dw-field dashboard-url-field">
          <span>{t("dashboard.urlWidgetUrl")}</span>
          <input
            value={draft.url}
            onChange={(event) => updateDraft("url", event.currentTarget.value)}
            placeholder={t("webview.urlPlaceholder")}
          />
        </label>
        <label className="dw-field">
          <span>{t("dashboard.urlWidgetReloadSeconds")}</span>
          <input
            min={0}
            max={3600}
            type="number"
            value={draft.reloadSeconds}
            onChange={(event) => updateDraft("reloadSeconds", Number(event.currentTarget.value))}
          />
        </label>
        <button className="dashboard-widget-icon-button" type="submit">
          <RefreshCw size={14} />
          {t("common.refresh")}
        </button>
        {config.url ? (
          <button
            className="dashboard-widget-icon-button compact"
            onClick={() => void openExternalUrl(config.url)}
            type="button"
          >
            <ExternalLink size={13} />
            {t("common.open")}
          </button>
        ) : null}
      </form>

      {tab ? (
        <div className="dashboard-url-webview-shell">
          <WebViewWorkspace isActive tab={tab} />
        </div>
      ) : (
        <div className="dashboard-widget-empty-state">
          <h4>{t("dashboard.urlWidgetEmptyTitle")}</h4>
          <p>{t("dashboard.urlWidgetEmptyHint")}</p>
        </div>
      )}
    </div>
  );
}

function formatUrlHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
