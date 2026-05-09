import {
  invokeCommand,
  isTauriRuntime,
  type CaptureScreenshotRequest,
  type ListScreenshotsResponse,
  type StoredScreenshot,
} from "../lib/tauri";

export type StoredScreenshotKind = StoredScreenshot["kind"];
export type { StoredScreenshot };

const SCREENSHOTS_CHANGED_EVENT = "admindeck:screenshots-changed";

type ScreenshotChangeListener = () => void;

export async function listStoredScreenshots(options: {
  offset: number;
  limit: number;
}): Promise<ListScreenshotsResponse> {
  if (!isTauriRuntime()) {
    return { screenshots: [], total: 0, hasMore: false };
  }
  return invokeCommand("list_screenshots", { request: options });
}

export async function addStoredScreenshot(
  kind: StoredScreenshotKind,
  request?: CaptureScreenshotRequest,
): Promise<StoredScreenshot> {
  let stored: StoredScreenshot;
  if (kind === "fullscreen") {
    stored = await invokeCommand("capture_fullscreen_screenshot_to_library", { kind });
  } else if (kind === "window" && !request) {
    stored = await invokeCommand("capture_active_window_screenshot_to_library", { kind });
  } else {
    stored = await invokeCommand("capture_screenshot_to_library", {
      kind,
      request:
        request ?? {
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(window.innerWidth)),
          height: Math.max(1, Math.round(window.innerHeight)),
        },
    });
  }
  notifyScreenshotsChanged();
  return stored;
}

export async function deleteStoredScreenshot(id: string): Promise<void> {
  await invokeCommand("delete_screenshot", { id });
  notifyScreenshotsChanged();
}

export async function clearStoredScreenshots(): Promise<void> {
  await invokeCommand("clear_screenshots");
  notifyScreenshotsChanged();
}

export function subscribeToScreenshotChanges(listener: ScreenshotChangeListener) {
  window.addEventListener(SCREENSHOTS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SCREENSHOTS_CHANGED_EVENT, listener);
}

function notifyScreenshotsChanged() {
  window.dispatchEvent(new Event(SCREENSHOTS_CHANGED_EVENT));
}
