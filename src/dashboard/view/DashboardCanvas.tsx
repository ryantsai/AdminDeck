import GridLayout, { type Layout, WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useMemo } from "react";
import { useDashboardStore } from "../state/dashboardStore";
import type { DashboardView, DashboardWidgetInstance, GridDensity } from "../types";
import { WidgetFrame } from "./WidgetFrame";

const ResponsiveGrid = WidthProvider(GridLayout);

export const DENSITY_SETTINGS: Record<GridDensity, { rowHeight: number; margin: [number, number] }> = {
  compact:  { rowHeight: 52, margin: [6, 6]   },
  default:  { rowHeight: 68, margin: [16, 16] },
  roomy:    { rowHeight: 92, margin: [30, 30] },
};

export interface DashboardCanvasProps {
  view: DashboardView;
  instances: DashboardWidgetInstance[];
  onCustomize: (instance: DashboardWidgetInstance, anchor: HTMLElement) => void;
}

export function DashboardCanvas({ view, instances, onCustomize }: DashboardCanvasProps) {
  const editMode = useDashboardStore((s) => s.editMode);
  const applyLayout = useDashboardStore((s) => s.applyLayout);

  const settings = DENSITY_SETTINGS[view.gridDensity];
  const layout: Layout = useMemo(
    () => instances.map((i) => ({
      i: i.id, x: i.gridX, y: i.gridY, w: i.gridW, h: i.gridH, minW: 1, minH: 1,
    })),
    [instances],
  );

  function onLayoutChange(next: Layout) {
    if (!editMode) return;
    applyLayout(view.id, next.map((l) => ({ id: l.i, gridX: l.x, gridY: l.y, gridW: l.w, gridH: l.h })));
  }

  return (
    <ResponsiveGrid
      className="dw-canvas"
      cols={12}
      rowHeight={settings.rowHeight}
      margin={settings.margin}
      layout={layout}
      isDraggable={editMode}
      isResizable={editMode}
      compactType="vertical"
      preventCollision={false}
      draggableHandle=".drag-handle"
      draggableCancel=".dw-controls, .dw-ctrl, button, input, textarea, select, a, [role='button']"
      resizeHandles={editMode ? ["n", "e", "s", "w"] : []}
      onLayoutChange={onLayoutChange}
    >
      {instances.map((i) => (
        <div key={i.id}>
          <WidgetFrame instance={i} onCustomize={onCustomize} />
        </div>
      ))}
    </ResponsiveGrid>
  );
}
