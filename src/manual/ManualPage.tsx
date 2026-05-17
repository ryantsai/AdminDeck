import { ArrowLeft } from "lucide-react";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime, type ManualChapter } from "../lib/tauri";

const INDEX_FILENAME = "INDEX.md";

export function ManualPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [chapters, setChapters] = useState<ManualChapter[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string>(INDEX_FILENAME);
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = isTauriRuntime();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let disposed = false;
    invokeCommand("list_manual_chapters")
      .then((list) => {
        if (disposed) return;
        const sorted = [...list].sort((a, b) => a.order - b.order);
        setChapters(sorted);
      })
      .catch((err) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
    };
  }, [tauri]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let disposed = false;
    setLoading(true);
    setError(null);
    invokeCommand("read_manual_chapter", { filename: selectedFilename })
      .then((source) => {
        if (disposed) return;
        setMarkdown(source);
      })
      .catch((err) => {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setMarkdown("");
        setError(message);
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [selectedFilename, tauri]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [selectedFilename]);

  const renderedHtml = useMemo(() => {
    if (!markdown) return "";
    try {
      return marked.parse(markdown, { async: false }) as string;
    } catch {
      return "";
    }
  }, [markdown]);

  if (!tauri) {
    return (
      <section className="manual-page" aria-label={t("manual.title")}>
        <header className="manual-page-header">
          <button
            type="button"
            className="manual-back-button"
            onClick={onBack}
            aria-label={t("manual.back")}
          >
            <ArrowLeft size={16} />
            {t("manual.back")}
          </button>
          <div>
            <h1>{t("manual.title")}</h1>
            <p className="manual-subtitle">{t("manual.subtitle")}</p>
          </div>
        </header>
        <p className="manual-runtime-warning">{t("manual.tauriRequired")}</p>
      </section>
    );
  }

  return (
    <section className="manual-page" aria-label={t("manual.title")}>
      <header className="manual-page-header">
        <button
          type="button"
          className="manual-back-button"
          onClick={onBack}
          aria-label={t("manual.back")}
        >
          <ArrowLeft size={16} />
          {t("manual.back")}
        </button>
        <div>
          <h1>{t("manual.title")}</h1>
          <p className="manual-subtitle">{t("manual.subtitle")}</p>
        </div>
      </header>
      <div className="manual-layout">
        <nav className="manual-nav" aria-label={t("manual.chaptersLabel")}>
          <div className="manual-nav-label">{t("manual.chaptersLabel")}</div>
          <ul>
            {chapters.map((chapter) => (
              <li key={chapter.slug}>
                <button
                  type="button"
                  className={`manual-nav-item ${
                    chapter.filename === selectedFilename ? "active" : ""
                  }`}
                  onClick={() => setSelectedFilename(chapter.filename)}
                >
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <article
          ref={contentRef}
          className="manual-content"
          aria-busy={loading ? true : undefined}
        >
          {error ? (
            <p className="manual-error">
              {t("manual.loadError", { message: error })}
            </p>
          ) : null}
          {loading && !error ? (
            <p className="manual-loading">{t("manual.loading")}</p>
          ) : null}
          {!loading && !error ? (
            <div
              className="manual-markdown"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : null}
        </article>
      </div>
    </section>
  );
}
