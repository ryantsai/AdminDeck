import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type {
  ContentBody, ContentChart, ContentLeafBody, ContentLive, ContentTable,
} from "../types";
import {
  parseJsonObject, resolveLivePath, validateContentWidgetBody,
} from "../schema";
import { invokeCommand } from "../../lib/tauri";
import type { DashboardWidgetInstance } from "../types";

export function ContentWidgetRenderer({
  bodyJson,
  instance,
}: {
  bodyJson: string;
  instance: DashboardWidgetInstance;
}) {
  const { t } = useTranslation();
  const parsed = useMemo<ContentBody | null>(() => {
    const json = parseJsonObject(bodyJson);
    if (!json.ok) return null;
    const body = validateContentWidgetBody(json.value);
    return body.ok ? body.value : null;
  }, [bodyJson]);

  if (!parsed) return <div className="dw-content-error">{t("dashboard.invalidContentWidgetBody")}</div>;

  if (parsed.shape === "live") {
    return <LiveContent data={parsed.data} instance={instance} />;
  }
  if (parsed.shape === "layout") {
    return (
      <div className={`dw-layout dw-layout-${parsed.data.direction}`}>
        {parsed.data.children.map((child, i) => (
          <div key={i} className="dw-layout-cell">
            <LeafRenderer leaf={child} />
          </div>
        ))}
      </div>
    );
  }
  return <LeafRenderer leaf={parsed} />;
}

type LiveState =
  | { kind: "loading" }
  | { kind: "ready"; data: unknown; fetchedAt: number }
  | { kind: "error"; message: string };

function LiveContent({ data, instance }: { data: ContentLive; instance: DashboardWidgetInstance }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LiveState>({ kind: "loading" });
  // Keep latest fetch state in a ref so the interval body always sees fresh
  // params after rerenders without re-arming the interval.
  const liveRef = useRef(data);
  liveRef.current = data;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const result = await invokeCommand("dashboard_widget_fetch", {
          instanceId: instance.id,
          url: liveRef.current.fetch.url,
        });
        if (cancelled) return;
        setState({ kind: "ready", data: result.body, fetchedAt: Date.now() });
      } catch (error) {
        if (cancelled) return;
        const message =
          typeof error === "object" && error !== null && "detail" in error && typeof (error as { detail?: unknown }).detail === "string"
            ? `${(error as { reason?: string }).reason ?? "fetchFailed"}: ${(error as { detail: string }).detail}`
            : error instanceof Error
              ? error.message
              : String(error);
        setState({ kind: "error", message });
      }
    };
    void run();
    const refreshSec = data.fetch.refreshSec;
    if (!refreshSec) return () => { cancelled = true; };
    const interval = window.setInterval(() => { void run(); }, refreshSec * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [instance.id, data.fetch.url, data.fetch.refreshSec]);

  if (state.kind === "loading") {
    return <div className="dw-live-loading">{t("common.loading")}</div>;
  }
  if (state.kind === "error") {
    return <div className="dw-live-error" title={state.message}>{state.message}</div>;
  }
  // Apply bindings to produce the final render body, then dispatch to the
  // leaf renderer. Invalid binding paths produce `undefined`; we fall back
  // to whatever literal value was in the render's data (the AI may have
  // supplied a placeholder).
  const boundData: Record<string, unknown> = { ...data.render.data };
  for (const binding of data.bindings) {
    const resolved = resolveLivePath(state.data, binding.source);
    if (resolved !== undefined) {
      boundData[binding.target] = resolved;
    }
  }
  const bound = { shape: data.render.shape, data: boundData };
  const validated = validateContentWidgetBody(bound);
  if (!validated.ok) {
    return (
      <div className="dw-live-error">
        {t("dashboard.invalidContentWidgetBody")}
      </div>
    );
  }
  // The validated shape must be a leaf (we restricted live render shapes
  // to the leaf set at the schema layer).
  if (validated.value.shape === "layout" || validated.value.shape === "live") {
    return <div className="dw-live-error">{t("dashboard.invalidContentWidgetBody")}</div>;
  }
  return <LeafRenderer leaf={validated.value} />;
}

function LeafRenderer({ leaf }: { leaf: ContentLeafBody }) {
  switch (leaf.shape) {
    case "markdown":
      return <RichContent source={leaf.data.source} mode={leaf.data.mode ?? "markdown"} />;
    case "kvList":
      return (
        <div className="dw-kv">
          {leaf.data.rows.map((r, i) => (
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
          {leaf.data.items.map((item, i) => (
            <li key={i} className={item.done ? "dw-done" : ""}>{item.label}</li>
          ))}
        </ul>
      );
    case "stat":
      return (
        <div className="dw-stat">
          <span className="dw-stat-value">{leaf.data.value}</span>
          {leaf.data.unit && <span className="dw-stat-unit">{leaf.data.unit}</span>}
          {leaf.data.delta && <span className="dw-stat-delta">{leaf.data.delta}</span>}
          {leaf.data.caption && <span className="dw-stat-caption">{leaf.data.caption}</span>}
        </div>
      );
    case "table":
      return <TableContent data={leaf.data} />;
    case "chart":
      return <ChartContent data={leaf.data} />;
  }
}

function TableContent({ data }: { data: ContentTable }) {
  return (
    <div className="dw-table-wrap">
      <table className="dw-table">
        <thead>
          <tr>
            {data.columns.map((col) => (
              <th key={col.key} style={col.align ? { textAlign: alignToCss(col.align) } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              {data.columns.map((col) => (
                <td key={col.key} style={col.align ? { textAlign: alignToCss(col.align) } : undefined}>
                  {row[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignToCss(align: "start" | "center" | "end"): "left" | "center" | "right" {
  return align === "start" ? "left" : align === "end" ? "right" : "center";
}

function ChartContent({ data }: { data: ContentChart }) {
  // KKTerm-owned SVG primitives. Charts use the host accent variable
  // (`--w-accent`) so the visual stays tied to the per-instance palette
  // rather than baking in a fixed color. Width/height are auto via the
  // viewBox + CSS `width: 100%`.
  if (data.kind === "sparkline") {
    return (
      <div className="dw-chart">
        <Sparkline points={data.points} />
        {data.caption && <span className="dw-chart-caption">{data.caption}</span>}
      </div>
    );
  }
  if (data.kind === "bar") {
    return (
      <div className="dw-chart">
        <BarChart series={data.series} />
        {data.caption && <span className="dw-chart-caption">{data.caption}</span>}
      </div>
    );
  }
  return (
    <div className="dw-chart">
      <Donut series={data.series} />
      {data.caption && <span className="dw-chart-caption">{data.caption}</span>}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const VIEW_W = 100;
  const VIEW_H = 32;
  // Pad min==max so a flat series renders as a horizontal line in the middle
  // rather than a degenerate vertical line at y=0.
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? VIEW_W / (points.length - 1) : 0;
  const d = points
    .map((p, i) => {
      const x = i * stepX;
      const y = VIEW_H - ((p - min) / span) * VIEW_H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="dw-sparkline">
      <path d={d} fill="none" stroke="var(--w-accent, currentColor)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BarChart({ series }: { series: { label: string; value: number }[] }) {
  // Allow negative bars: bars grow from a zero baseline either up or down,
  // scaled so the largest magnitude fills the full half-height.
  const max = Math.max(...series.map((s) => Math.abs(s.value)), 1);
  return (
    <ul className="dw-bar-chart">
      {series.map((s, i) => {
        const pct = (Math.abs(s.value) / max) * 100;
        return (
          <li key={i} className="dw-bar-row">
            <span className="dw-bar-label">{s.label}</span>
            <span className="dw-bar-track">
              <span
                className={`dw-bar-fill ${s.value < 0 ? "dw-bar-neg" : ""}`}
                style={{ width: `${pct.toFixed(1)}%` }}
              />
            </span>
            <span className="dw-bar-value">{formatBarValue(s.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function formatBarValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(Math.abs(value) >= 100 ? 0 : 2);
}

function Donut({ series }: { series: { label: string; value: number }[] }) {
  // SVG donut. We render a single ring of arcs, each colored by mixing the
  // host accent at varying alpha so the chart inherits the instance palette.
  const VIEW = 48;
  const CX = VIEW / 2;
  const CY = VIEW / 2;
  const R_OUTER = 22;
  const R_INNER = 14;
  const total = series.reduce((acc, s) => acc + s.value, 0);
  // Guard against a fully-zero donut: render an empty ring so the widget is
  // still readable rather than a NaN-laden invisible shape.
  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="dw-donut">
        <circle cx={CX} cy={CY} r={(R_OUTER + R_INNER) / 2} fill="none" stroke="var(--w-accent-soft, rgba(0,0,0,0.08))" strokeWidth={R_OUTER - R_INNER} />
      </svg>
    );
  }
  let start = -Math.PI / 2;
  const slices = series.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const end = start + sweep;
    const path = donutArcPath(CX, CY, R_OUTER, R_INNER, start, end);
    // Step alpha across the palette so adjacent slices read as distinct
    // without needing per-slice color picks from the AI.
    const alpha = 0.35 + (0.55 * (i / Math.max(1, series.length - 1)));
    start = end;
    return { path, alpha, label: s.label, value: s.value };
  });
  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="dw-donut">
      {slices.map((slice, i) => (
        <path
          key={i}
          d={slice.path}
          fill="var(--w-accent, currentColor)"
          fillOpacity={slice.alpha}
        >
          <title>{`${slice.label}: ${slice.value}`}</title>
        </path>
      ))}
    </svg>
  );
}

function donutArcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  // A single slice of 100% would produce zero-width arc endpoints (start ==
  // end after wrap). Clamp at slightly less than a full revolution and
  // close manually so the donut still renders.
  const safeEnd = Math.abs(sweep - Math.PI * 2) < 1e-3 ? start + Math.PI * 2 - 1e-3 : end;
  const x1 = cx + rOuter * Math.cos(start);
  const y1 = cy + rOuter * Math.sin(start);
  const x2 = cx + rOuter * Math.cos(safeEnd);
  const y2 = cy + rOuter * Math.sin(safeEnd);
  const x3 = cx + rInner * Math.cos(safeEnd);
  const y3 = cy + rInner * Math.sin(safeEnd);
  const x4 = cx + rInner * Math.cos(start);
  const y4 = cy + rInner * Math.sin(start);
  const largeArc = safeEnd - start > Math.PI ? 1 : 0;
  return [
    `M${x1.toFixed(2)},${y1.toFixed(2)}`,
    `A${rOuter},${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
    `L${x3.toFixed(2)},${y3.toFixed(2)}`,
    `A${rInner},${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)},${y4.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function RichContent({ source, mode }: { source: string; mode: "markdown" | "html" }) {
  const html = useMemo(() => {
    const rawHtml =
      mode === "html"
        ? source
        : (marked.parse(source, { async: false }) as string);
    return DOMPurify.sanitize(rawHtml);
  }, [mode, source]);

  return (
    <div
      className="dw-content-md dw-content-rich"
      data-mode={mode}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
