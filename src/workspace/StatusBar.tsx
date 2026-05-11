import { ArrowDownToLine, ArrowUpFromLine, BedSingle, Coffee, Cpu, MemoryStick } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ActivePage } from "../app/ActivityRail";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";

const NOTIFICATION_FADE_MS = 220;

export function StatusBar({ activePage }: { activePage: ActivePage }) {
  const { t } = useTranslation();
  const notice = useWorkspaceStore((state) => state.statusBarNotice);
  const clearStatusBarNotice = useWorkspaceStore((state) => state.clearStatusBarNotice);
  const [renderedNotice, setRenderedNotice] = useState(notice);
  const [isNoticeExiting, setIsNoticeExiting] = useState(false);

  useEffect(() => {
    if (!notice) {
      return;
    }
    setRenderedNotice(notice);
    setIsNoticeExiting(false);
    const remainingMs = Math.max(0, notice.expiresAt - Date.now());
    const fadeDelayMs = Math.max(0, remainingMs - NOTIFICATION_FADE_MS);
    const fadeTimeout = window.setTimeout(() => setIsNoticeExiting(true), fadeDelayMs);
    const clearTimeout = window.setTimeout(() => clearStatusBarNotice(notice.id), remainingMs);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [clearStatusBarNotice, notice]);

  useEffect(() => {
    if (notice) {
      return;
    }
    if (!isNoticeExiting) {
      setRenderedNotice(undefined);
      return;
    }
    const timeout = window.setTimeout(() => {
      setRenderedNotice(undefined);
      setIsNoticeExiting(false);
    }, NOTIFICATION_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [isNoticeExiting, notice]);

  return (
    <footer className="status-bar">
      <div className="status-bar-module">{renderModuleStatus(activePage, t)}</div>
      <div className="status-bar-notice-area">
        {renderedNotice ? (
          <span
            className={`status-notification ${renderedNotice.tone} ${
              isNoticeExiting ? "is-exiting" : "is-entering"
            }`}
            role="status"
          >
            {renderedNotice.message}
          </span>
        ) : null}
      </div>
      <div className="status-bar-actions">
        <DontSleepStatusButton />
      </div>
    </footer>
  );
}

function DontSleepStatusButton() {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [enabled, setEnabled] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    void invokeCommand("get_dont_sleep_enabled")
      .then((nextEnabled) => {
        if (!disposed) {
          setEnabled(nextEnabled);
        }
      })
      .catch(() => {
        // The status bar should still render if the desktop-only helper is unavailable.
      });

    return () => {
      disposed = true;
    };
  }, []);

  async function handleClick() {
    if (updating) {
      return;
    }

    const nextEnabled = !enabled;
    setUpdating(true);

    try {
      const savedEnabled = isTauriRuntime()
        ? await invokeCommand("set_dont_sleep_enabled", { enabled: nextEnabled })
        : nextEnabled;
      setEnabled(savedEnabled);
      showStatusBarNotice(
        savedEnabled ? t("app.dontSleepEnabled") : t("app.dontSleepDisabled"),
        { tone: savedEnabled ? "success" : "info" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showStatusBarNotice(t("app.dontSleepError", { message }), { tone: "error" });
    } finally {
      setUpdating(false);
    }
  }

  const label = enabled ? t("app.dontSleepDisable") : t("app.dontSleepEnable");
  const Icon = enabled ? Coffee : BedSingle;

  return (
    <button
      className={`status-bar-action status-bar-dont-sleep ${enabled ? "active" : ""}`}
      aria-label={label}
      aria-pressed={enabled}
      disabled={updating}
      onClick={() => void handleClick()}
      type="button"
    >
      <Icon size={14} />
    </button>
  );
}

function renderModuleStatus(activePage: ActivePage, t: (key: string) => string) {
  switch (activePage) {
    case "workspace":
      return <WorkspaceHostMetrics t={t} />;
    case "dashboard":
      return <span className="status-bar-module-text">{t("dashboard.statusReady")}</span>;
    case "settings":
      return null;
  }
}

function WorkspaceHostMetrics({ t }: { t: (key: string) => string }) {
  const hostUsage = useWorkspaceStore((state) => state.performanceMetrics.hostUsage);

  return (
    <div className="host-metrics" aria-label={t("workspace.hostUsage")}>
      <Metric
        icon={<Cpu size={13} />}
        label={t("workspace.cpu")}
        metric="percent"
        title={t("workspace.cpuUsage")}
        value={formatPercent(hostUsage?.cpuPercent)}
      />
      <Metric
        icon={<MemoryStick size={13} />}
        label={t("workspace.ram")}
        metric="percent"
        title={t("workspace.ramUsage")}
        value={formatPercent(hostUsage?.ramPercent)}
      />
      <NetworkMetric
        downstreamLabel={t("workspace.networkDownstream")}
        downstreamTitle={t("workspace.networkDownstreamUsage")}
        downstreamValue={formatNetwork(hostUsage?.networkDownstreamBytesPerSecond)}
        title={t("workspace.networkUsage")}
        upstreamLabel={t("workspace.networkUpstream")}
        upstreamTitle={t("workspace.networkUpstreamUsage")}
        upstreamValue={formatNetwork(hostUsage?.networkUpstreamBytesPerSecond)}
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  metric,
  title,
  value,
}: {
  icon: ReactNode;
  label: string;
  metric: "network" | "percent";
  title: string;
  value: string;
}) {
  return (
    <span className={`host-metric host-metric-${metric}`} aria-label={`${label} ${value}`} title={title}>
      {icon}
      <strong className="host-metric-value">{value}</strong>
    </span>
  );
}

function NetworkMetric({
  downstreamLabel,
  downstreamTitle,
  downstreamValue,
  title,
  upstreamLabel,
  upstreamTitle,
  upstreamValue,
}: {
  downstreamLabel: string;
  downstreamTitle: string;
  downstreamValue: string;
  title: string;
  upstreamLabel: string;
  upstreamTitle: string;
  upstreamValue: string;
}) {
  return (
    <span
      className="host-metric host-metric-network"
      aria-label={`${downstreamLabel} ${downstreamValue}, ${upstreamLabel} ${upstreamValue}`}
      title={title}
    >
      <span className="host-metric-transfer" title={downstreamTitle}>
        <ArrowDownToLine size={13} />
        <strong className="host-metric-value">{downstreamValue}</strong>
      </span>
      <span className="host-metric-transfer" title={upstreamTitle}>
        <ArrowUpFromLine size={13} />
        <strong className="host-metric-value">{upstreamValue}</strong>
      </span>
    </span>
  );
}

function formatPercent(value: number | undefined) {
  if (value === undefined) {
    return "--%";
  }
  return `${Math.round(value)}%`;
}

function formatNetwork(bytesPerSecond: number | undefined) {
  if (bytesPerSecond === undefined) {
    return "-- MB/s";
  }
  const mb = bytesPerSecond / 1_000_000;
  if (mb < 10) {
    return `${mb.toFixed(1)} MB/s`;
  }
  if (mb < 100) {
    return `${Math.round(mb)} MB/s`;
  }
  return `${Math.min(9999, Math.round(mb))} MB/s`;
}
