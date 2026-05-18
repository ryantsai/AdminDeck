import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dashboard View deletion is edit-mode only and uses the shared delete confirmation dialog", async () => {
  const page = await readFile(new URL("../src/dashboard/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(page, /import \{ DeleteConfirmationDialog \} from "\.\.\/app\/DeleteConfirmationDialog";/);
  assert.match(page, /const \[deleteViewTarget, setDeleteViewTarget\]/);
  assert.match(page, /\{editMode && views\.length > 1 && \(/);
  assert.match(page, /setDeleteViewTarget\(v\)/);
  assert.doesNotMatch(page, /onClick=\{\(\) => void removeView\(v\.id\)\}/);
  assert.match(page, /<DeleteConfirmationDialog[\s\S]*message=\{t\("dashboard\.deleteViewBody"/);
  assert.match(page, /onConfirm=\{\(\) => \{[\s\S]*void removeView\(target\.id\);/);
});

test("Dashboard widget deletion uses the shared delete confirmation dialog", async () => {
  const frame = await readFile(new URL("../src/dashboard/view/WidgetFrame.tsx", import.meta.url), "utf8");

  assert.match(frame, /import \{ DeleteConfirmationDialog \} from "\.\.\/\.\.\/app\/DeleteConfirmationDialog";/);
  assert.match(frame, /const \[deleteConfirmOpen, setDeleteConfirmOpen\] = useState\(false\);/);
  assert.match(frame, /<DeleteConfirmationDialog[\s\S]*message=\{t\("dashboard\.deleteWidgetBody"/);
  assert.doesNotMatch(frame, /removeConfirmHint/);
  assert.doesNotMatch(frame, /confirmTimerRef/);
});

test("Dashboard widgets are isolated by an error boundary", async () => {
  const canvas = await readFile(new URL("../src/dashboard/view/DashboardCanvas.tsx", import.meta.url), "utf8");
  const boundary = await readFile(
    new URL("../src/dashboard/view/DashboardWidgetErrorBoundary.tsx", import.meta.url),
    "utf8",
  );

  assert.match(canvas, /import \{ DashboardWidgetErrorBoundary \} from "\.\/DashboardWidgetErrorBoundary";/);
  assert.match(canvas, /<DashboardWidgetErrorBoundary[\s\S]*<WidgetFrame instance=\{i\}/);
  assert.match(canvas, /fallback=\{<div className="dashboard-widget-error">\{t\("common\.error"\)\}<\/div>\}/);
  assert.match(boundary, /static getDerivedStateFromError/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /previousProps\.resetKey !== this\.props\.resetKey/);
});
