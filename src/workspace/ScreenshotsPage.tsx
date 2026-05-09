import { Camera, Copy, Grid2X2, List, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store";
import {
  addStoredScreenshot,
  clearStoredScreenshots,
  deleteStoredScreenshot,
  listStoredScreenshots,
  subscribeToScreenshotChanges,
  type StoredScreenshot,
} from "./screenshotLibrary";

type ScreenshotViewMode = "grid" | "list";
const SCREENSHOT_PAGE_SIZE = 60;

export function ScreenshotsPage() {
  const { t } = useTranslation();
  const showWorkspaceStatus = useWorkspaceStore((state) => state.showWorkspaceStatus);
  const [screenshots, setScreenshots] = useState<StoredScreenshot[]>([]);
  const [hasMoreScreenshots, setHasMoreScreenshots] = useState(false);
  const [loadingScreenshots, setLoadingScreenshots] = useState(false);
  const [viewMode, setViewMode] = useState<ScreenshotViewMode>("grid");
  const loadMoreRef = useRef<HTMLButtonElement | null>(null);
  const loadingScreenshotsRef = useRef(false);
  const screenshotCountRef = useRef(0);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  useEffect(() => {
    screenshotCountRef.current = screenshots.length;
  }, [screenshots.length]);

  const loadScreenshots = useCallback(
    async (mode: "reset" | "append") => {
      if (loadingScreenshotsRef.current) {
        return;
      }
      loadingScreenshotsRef.current = true;
      setLoadingScreenshots(true);
      try {
        const offset = mode === "append" ? screenshotCountRef.current : 0;
        const response = await listStoredScreenshots({
          offset,
          limit: SCREENSHOT_PAGE_SIZE,
        });
        setHasMoreScreenshots(response.hasMore);
        setScreenshots((current) =>
          mode === "append" ? [...current, ...response.screenshots] : response.screenshots,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showWorkspaceStatus(t("screenshots.loadError", { message }), { tone: "error" });
      } finally {
        loadingScreenshotsRef.current = false;
        setLoadingScreenshots(false);
      }
    },
    [showWorkspaceStatus, t],
  );

  useEffect(() => {
    void loadScreenshots("reset");
    const unsubscribe = subscribeToScreenshotChanges(() => void loadScreenshots("reset"));
    return unsubscribe;
  }, [loadScreenshots]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreScreenshots) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadScreenshots("append");
        }
      },
      { root: null, rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreScreenshots, loadScreenshots]);

  async function copyScreenshot(screenshot: StoredScreenshot) {
    try {
      const response = await fetch(screenshot.dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/jpeg"]: blob }),
      ]);
      showWorkspaceStatus(t("screenshots.copySuccess"), { tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showWorkspaceStatus(t("screenshots.copyError", { message }), { tone: "error" });
    }
  }

  async function deleteScreenshot(id: string) {
    try {
      await deleteStoredScreenshot(id);
      showWorkspaceStatus(t("screenshots.deleteSuccess"), { tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showWorkspaceStatus(t("screenshots.deleteError", { message }), { tone: "error" });
    }
  }

  async function clearScreenshots() {
    try {
      await clearStoredScreenshots();
      showWorkspaceStatus(t("screenshots.clearSuccess"), { tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showWorkspaceStatus(t("screenshots.deleteError", { message }), { tone: "error" });
    }
  }

  async function takeScreenshot() {
    try {
      await addStoredScreenshot("fullscreen");
      showWorkspaceStatus(t("screenshots.captureSuccess"), { tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showWorkspaceStatus(t("screenshots.captureError", { message }), { tone: "error" });
    }
  }

  function screenshotLabel(screenshot: StoredScreenshot) {
    switch (screenshot.kind) {
      case "region":
        return t("screenshots.regionCapture");
      case "fullscreen":
        return t("screenshots.fullscreenCapture");
      case "window":
        return t("screenshots.windowCapture");
      default:
        return screenshot.fileName;
    }
  }

  return (
    <main className="screenshots-page" role="region" aria-label={t("screenshots.title")}>
      <header className="screenshots-header">
        <div>
          <h1>{t("screenshots.title")}</h1>
          <p>{t("screenshots.subtitle")}</p>
        </div>
        <div className="screenshots-actions" role="toolbar" aria-label={t("screenshots.viewOptions")}>
          <button
            className="secondary-button"
            onClick={() => void takeScreenshot()}
            type="button"
          >
            <Camera size={15} />
            {t("screenshots.takeScreenshot")}
          </button>
          <button
            aria-label={t("screenshots.gridView")}
            aria-pressed={viewMode === "grid"}
            className="icon-button"
            onClick={() => setViewMode("grid")}
            type="button"
          >
            <Grid2X2 size={16} />
          </button>
          <button
            aria-label={t("screenshots.listView")}
            aria-pressed={viewMode === "list"}
            className="icon-button"
            onClick={() => setViewMode("list")}
            type="button"
          >
            <List size={16} />
          </button>
          <button
            className="secondary-button"
            disabled={screenshots.length === 0}
            onClick={() => void clearScreenshots()}
            type="button"
          >
            {t("screenshots.clearAll")}
          </button>
        </div>
      </header>
      {screenshots.length === 0 ? (
        <section className="screenshots-empty" aria-label={t("screenshots.emptyTitle")}>
          <h2>{t("screenshots.emptyTitle")}</h2>
          <p>{t("screenshots.emptyHint")}</p>
        </section>
      ) : (
        <section
          className={`screenshots-collection screenshots-${viewMode}`}
          aria-label={t("screenshots.collection")}
        >
          {screenshots.map((screenshot) => (
            <article className="screenshot-card" key={screenshot.id}>
              <div className="screenshot-preview">
                <img alt={screenshotLabel(screenshot)} loading="lazy" src={screenshot.dataUrl} />
              </div>
              <div className="screenshot-details">
                <strong>{screenshotLabel(screenshot)}</strong>
                <span>
                  {t("screenshots.metadata", {
                    dimensions: `${screenshot.width} x ${screenshot.height}`,
                    capturedAt: dateFormatter.format(new Date(screenshot.capturedAt)),
                  })}
                </span>
              </div>
              <div className="screenshot-card-actions">
                <button
                  aria-label={t("screenshots.copyScreenshot")}
                  className="icon-button"
                  onClick={() => void copyScreenshot(screenshot)}
                  type="button"
                >
                  <Copy size={15} />
                </button>
                <button
                  aria-label={t("screenshots.deleteScreenshot")}
                  className="icon-button danger"
                  onClick={() => void deleteScreenshot(screenshot.id)}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
          {hasMoreScreenshots ? (
            <button
              className="secondary-button screenshots-load-more"
              disabled={loadingScreenshots}
              onClick={() => void loadScreenshots("append")}
              ref={loadMoreRef}
              type="button"
            >
              {loadingScreenshots ? t("screenshots.loading") : t("screenshots.loadMore")}
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}
