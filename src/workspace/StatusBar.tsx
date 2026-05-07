import { Cpu, MemoryStick, Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store";

const NOTIFICATION_FADE_MS = 220;

export function StatusBar() {
  const { t } = useTranslation();
  const hostUsage = useWorkspaceStore((state) => state.performanceMetrics.hostUsage);
  const notification = useWorkspaceStore((state) => state.workspaceStatusNotification);
  const clearWorkspaceStatus = useWorkspaceStore((state) => state.clearWorkspaceStatus);
  const [renderedNotification, setRenderedNotification] = useState(notification);
  const [isNotificationExiting, setIsNotificationExiting] = useState(false);

  useEffect(() => {
    if (!notification) {
      return;
    }
    setRenderedNotification(notification);
    setIsNotificationExiting(false);
    const remainingMs = Math.max(0, notification.expiresAt - Date.now());
    const fadeDelayMs = Math.max(0, remainingMs - NOTIFICATION_FADE_MS);
    const fadeTimeout = window.setTimeout(() => setIsNotificationExiting(true), fadeDelayMs);
    const clearTimeout = window.setTimeout(() => clearWorkspaceStatus(notification.id), remainingMs);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [clearWorkspaceStatus, notification]);

  useEffect(() => {
    if (notification) {
      return;
    }
    if (!isNotificationExiting) {
      setRenderedNotification(undefined);
      return;
    }
    const timeout = window.setTimeout(() => {
      setRenderedNotification(undefined);
      setIsNotificationExiting(false);
    }, NOTIFICATION_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [isNotificationExiting, notification]);

  return (
    <footer className="status-bar">
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
        <Metric
          icon={<Network size={13} />}
          label={t("workspace.network")}
          metric="network"
          title={t("workspace.networkUsage")}
          value={formatNetwork(hostUsage?.networkBytesPerSecond)}
        />
      </div>
      {renderedNotification ? (
        <span
          className={`status-notification ${renderedNotification.tone} ${
            isNotificationExiting ? "is-exiting" : "is-entering"
          }`}
          role="status"
        >
          {renderedNotification.message}
        </span>
      ) : null}
    </footer>
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
