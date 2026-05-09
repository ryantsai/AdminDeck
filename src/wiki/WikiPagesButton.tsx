import { BookOpen } from "lucide-react";
import type { AriaRole } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { menuButtonAria } from "../lib/aria";
import type { WikiPageReference } from "../types";
import { listWikiPagesForConnection } from "./wikiCommands";

const OPEN_WIKI_EVENT = "kkterm:open-wiki";

export function dispatchOpenWiki(pageId: string) {
  window.dispatchEvent(
    new CustomEvent<{ pageId: string }>(OPEN_WIKI_EVENT, {
      detail: { pageId },
    }),
  );
}

export function useOpenWikiListener(handler: (pageId: string) => void) {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId: string }>).detail;
      if (detail?.pageId) {
        handler(detail.pageId);
      }
    };
    window.addEventListener(OPEN_WIKI_EVENT, listener as EventListener);
    return () => window.removeEventListener(OPEN_WIKI_EVENT, listener as EventListener);
  }, [handler]);
}

interface WikiPagesButtonProps {
  buttonClassName?: string;
  buttonRole?: AriaRole;
  connectionId: string;
  iconSize?: number;
  onPageOpen?: () => void;
  showLabel?: boolean;
}

export function WikiPagesButton({
  buttonClassName = "connection-wiki-button rail-button-style inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/10",
  buttonRole,
  connectionId,
  iconSize = 14,
  onPageOpen,
  showLabel = false,
}: WikiPagesButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<WikiPageReference[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listWikiPagesForConnection(connectionId);
      setPages(next);
    } catch {
      setPages([]);
    }
  }, [connectionId]);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const node = containerRef.current;
      if (node && !node.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="connection-wiki-anchor relative" ref={containerRef} role={buttonRole ? "none" : undefined}>
      <button
        type="button"
        className={buttonClassName}
        role={buttonRole}
        {...menuButtonAria(open)}
        aria-label={t("wiki.wikiPagesForConnection")}
        title={t("wiki.wikiPagesForConnection")}
        onClick={() => setOpen((current) => !current)}
      >
        <BookOpen size={iconSize} />
        {showLabel ? <span>{t("wiki.wikiPagesForConnection")}</span> : null}
      </button>
      {open ? (
        <div className="connection-wiki-popover" role="menu">
          <div className="connection-wiki-popover-title">
            {t("wiki.wikiPagesForConnection")}
          </div>
          {pages.length === 0 ? (
            <div className="connection-wiki-popover-empty">
              {t("wiki.noPagesForConnection")}
            </div>
          ) : (
            <ul className="connection-wiki-popover-list">
              {pages.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    className="connection-wiki-popover-item"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      dispatchOpenWiki(page.id);
                      onPageOpen?.();
                    }}
                  >
                    {page.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
