import { ScreenshotMenu } from "../workspace/ScreenshotMenu";
import { WikiPagesButton } from "../wiki/WikiPagesButton";
import { documentHasWebviewOverlay } from "../workspace/nativeOverlay";
import { ArrowLeft, ArrowRight, Globe2, KeyRound, RefreshCw, Save } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormEvent } from "react";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { WorkspaceTab } from "../types";

type WebviewNavigationEvent = {
  sessionId: string;
  url: string;
};

type WebviewPageLoadEvent = {
  sessionId: string;
  url: string;
  status: "started" | "finished" | "unknown";
};

type WebviewTitleChangedEvent = {
  sessionId: string;
  title: string;
};

type WebviewDownloadEvent = {
  sessionId: string;
  url: string;
  status: "requested" | "finished" | "unknown";
  path?: string;
  success?: boolean;
};

interface WebviewSessionLease {
  promise: Promise<void>;
  refCount: number;
  closeTimer: number | null;
  started: boolean;
  closed: boolean;
}

const webviewSessionLeases = new Map<string, WebviewSessionLease>();

function acquireWebviewSession(sessionId: string, start: () => Promise<unknown>) {
  const current = webviewSessionLeases.get(sessionId);
  if (current && !current.closed) {
    if (current.closeTimer !== null) {
      window.clearTimeout(current.closeTimer);
      current.closeTimer = null;
    }
    current.refCount += 1;
    return current;
  }

  let lease: WebviewSessionLease;
  const promise = Promise.resolve()
    .then(start)
    .then(() => {
      lease.started = true;
    });
  lease = {
    promise,
    refCount: 1,
    closeTimer: null,
    started: false,
    closed: false,
  };
  promise.catch(() => {
    if (webviewSessionLeases.get(sessionId) === lease) {
      webviewSessionLeases.delete(sessionId);
    }
  });
  webviewSessionLeases.set(sessionId, lease);
  return lease;
}

function releaseWebviewSession(sessionId: string) {
  const lease = webviewSessionLeases.get(sessionId);
  if (!lease) {
    return;
  }
  lease.refCount = Math.max(0, lease.refCount - 1);
  if (lease.refCount > 0) {
    return;
  }
  if (lease.closeTimer !== null) {
    window.clearTimeout(lease.closeTimer);
  }
  lease.closeTimer = window.setTimeout(() => {
    if (lease.refCount > 0 || webviewSessionLeases.get(sessionId) !== lease) {
      return;
    }
    lease.closed = true;
    void lease.promise
      .then(
        () =>
          invokeCommand("close_webview_session", {
            request: { sessionId },
          }).catch(() => undefined),
        () => undefined,
      )
      .finally(() => {
        if (webviewSessionLeases.get(sessionId) === lease) {
          webviewSessionLeases.delete(sessionId);
        }
      });
  }, 50);
}

type CapturedCredentialPayload = {
  ok: boolean;
  reason?: string;
  url?: string;
  username?: string;
  password?: string;
  usernameSelector?: string;
  passwordSelector?: string;
};

const CREDENTIAL_TITLE_PREFIX = "__ADMINDECK_URL_CREDENTIAL__";

export function WebViewWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const { t } = useTranslation();
  const updateWebviewTabMetadata = useWorkspaceStore((state) => state.updateWebviewTabMetadata);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const sessionStartedRef = useRef(false);
  const sessionStartingRef = useRef(false);
  const sessionIdRef = useRef<string>(`webview-${tab.id}`);
  const lastBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibilityRef = useRef({ isActive, webviewSuppressed: false });
  const [navError, setNavError] = useState("");
  const [fillStatus, setFillStatus] = useState("");
  const [webviewSuppressed, setWebviewSuppressed] = useState(false);
  const [addressInput, setAddressInput] = useState(tab.url ?? "");

  const initialUrl = tab.url ?? "";
  const [savedCredentialUsername, setSavedCredentialUsername] = useState(tab.connection?.urlCredentialUsername ?? "");
  const [hasSavedCredential, setHasSavedCredential] = useState(Boolean(tab.connection?.hasUrlCredential));
  const urlCredentialUsername = savedCredentialUsername || tab.connection?.urlCredentialUsername;
  const canFillCredential = Boolean(hasSavedCredential && urlCredentialUsername);

  const computeBounds = () => {
    const node = placeholderRef.current;
    if (!node) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  };

  const pushWebviewVisibility = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return;
    }
    const visible = visibilityRef.current.isActive && !visibilityRef.current.webviewSuppressed;
    void invokeCommand("set_webview_visibility", {
      request: { sessionId: sessionIdRef.current, visible, ...bounds },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
    if (visible) {
      lastBoundsRef.current = bounds;
    }
  };

  const scheduleBoundsPush = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const bounds = computeBounds();
      if (!bounds) {
        return;
      }
      if (!visibilityRef.current.isActive || visibilityRef.current.webviewSuppressed) {
        void invokeCommand("set_webview_visibility", {
          request: { sessionId: sessionIdRef.current, visible: false, ...bounds },
        }).catch((error) => {
          setNavError(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      const previous = lastBoundsRef.current;
      if (
        previous &&
        previous.x === bounds.x &&
        previous.y === bounds.y &&
        previous.width === bounds.width &&
        previous.height === bounds.height
      ) {
        return;
      }
      lastBoundsRef.current = bounds;
      void invokeCommand("update_webview_bounds", {
        request: { sessionId: sessionIdRef.current, ...bounds },
      }).catch((error) => {
        setNavError(error instanceof Error ? error.message : String(error));
      });
    });
  };

  useEffect(() => {
    if (!isTauriRuntime() || sessionStartedRef.current || sessionStartingRef.current || !initialUrl) {
      return;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return;
    }
    let disposed = false;
    const sessionId = sessionIdRef.current;
    sessionStartingRef.current = true;
    lastBoundsRef.current = bounds;
    const lease = acquireWebviewSession(sessionId, () =>
      invokeCommand("start_webview_session", {
        request: {
          sessionId,
          url: initialUrl,
          dataPartition: tab.dataPartition,
          ...bounds,
        },
      }),
    );
    lease.promise
      .then(() => {
        sessionStartingRef.current = false;
        if (disposed) {
          return;
        }
        sessionStartedRef.current = true;
        pushWebviewVisibility();
      })
      .catch((error) => {
        sessionStartingRef.current = false;
        sessionStartedRef.current = false;
        if (!disposed) {
          setNavError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ownsSession = sessionStartingRef.current || sessionStartedRef.current;
      sessionStartingRef.current = false;
      sessionStartedRef.current = false;
      if (ownsSession) {
        releaseWebviewSession(sessionId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    visibilityRef.current = { isActive, webviewSuppressed };
  }, [isActive, webviewSuppressed]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const node = placeholderRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => scheduleBoundsPush());
    observer.observe(node);
    window.addEventListener("resize", scheduleBoundsPush);
    window.addEventListener("scroll", scheduleBoundsPush, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBoundsPush);
      window.removeEventListener("scroll", scheduleBoundsPush, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const updateSuppression = () => {
      setWebviewSuppressed(documentHasWebviewOverlay());
    };
    updateSuppression();
    const observer = new MutationObserver(updateSuppression);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    pushWebviewVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, webviewSuppressed]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    const disposers: Array<() => void> = [];
    void Promise.all([
      listen<WebviewNavigationEvent>("webview-navigation", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        setAddressInput(event.payload.url);
        updateWebviewTabMetadata(tab.id, {
          subtitle: formatWebviewSubtitle(event.payload.url),
          url: event.payload.url,
        });
      }),
      listen<WebviewPageLoadEvent>("webview-page-load", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        setAddressInput(event.payload.url);
        if (event.payload.status === "finished") {
          setFillStatus("");
        }
      }),
      listen<WebviewTitleChangedEvent>("webview-title-changed", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        const title = event.payload.title.trim();
        if (title.startsWith(CREDENTIAL_TITLE_PREFIX)) {
          void handleCapturedCredential(title.slice(CREDENTIAL_TITLE_PREFIX.length));
          return;
        }
        if (title) {
          updateWebviewTabMetadata(tab.id, { title });
        }
      }),
      listen<WebviewDownloadEvent>("webview-download", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        if (event.payload.status === "requested") {
          setFillStatus(t("webview.downloadStarted"));
          return;
        }
        if (event.payload.status === "finished") {
          setFillStatus(event.payload.success ? t("webview.downloadComplete") : t("webview.downloadFailed"));
        }
      }),
    ]).then((unlistenFns) => {
      if (disposed) {
        unlistenFns.forEach((unlisten) => unlisten());
        return;
      }
      disposers.push(...unlistenFns);
    });

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, [tab.id, t, updateWebviewTabMetadata]);

  function handleNavigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    setNavError("");
    void invokeCommand("webview_navigate", {
      request: { sessionId: sessionIdRef.current, url: addressInput },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleSimple(name: "webview_reload" | "webview_go_back" | "webview_go_forward") {
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    void invokeCommand(name, {
      request: { sessionId: sessionIdRef.current },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleCapturedCredential(rawPayload: string) {
    if (!tab.connection) {
      return;
    }
    let payload: CapturedCredentialPayload;
    try {
      payload = JSON.parse(rawPayload) as CapturedCredentialPayload;
    } catch {
      setFillStatus("");
      setNavError(t("webview.savePasswordInvalidCapture"));
      return;
    }
    if (!payload.ok || !payload.username || !payload.password) {
      setFillStatus("");
      const reason = payload.reason === "no-password-field"
        ? t("webview.savePasswordNoPasswordField")
        : payload.reason === "empty-password"
          ? t("webview.savePasswordEmptyPassword")
          : payload.reason === "empty-username"
            ? t("webview.savePasswordEmptyUsername")
            : t("webview.savePasswordFailed");
      setNavError(reason);
      return;
    }
    setNavError("");
    setFillStatus(t("webview.savingPassword"));
    void invokeCommand("store_secret", {
      request: {
        kind: "urlPassword",
        ownerId: tab.connection.id,
        secret: payload.password,
      },
    })
      .then(() => invokeCommand("upsert_url_credential", {
        request: {
          connectionId: tab.connection!.id,
          username: payload.username!,
          pageUrl: payload.url,
          usernameSelector: payload.usernameSelector,
          passwordSelector: payload.passwordSelector,
        },
      }))
      .then(() => {
        setSavedCredentialUsername(payload.username ?? "");
        setHasSavedCredential(true);
        setFillStatus(t("webview.passwordSaved"));
        window.dispatchEvent(new CustomEvent("admindeck:connection-tree-invalidated"));
      })
      .catch((error) => {
        setFillStatus("");
        setNavError(error instanceof Error ? error.message : String(error));
      });
  }

  function handleSaveCredential() {
    if (!isTauriRuntime() || !sessionStartedRef.current || !tab.connection) {
      return;
    }
    setNavError("");
    setFillStatus(t("webview.capturingPassword"));
    void invokeCommand("capture_webview_credential", {
      request: { sessionId: sessionIdRef.current },
    }).catch((error) => {
      setFillStatus("");
      setNavError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleFillCredential() {
    if (!isTauriRuntime() || !sessionStartedRef.current || !tab.connection || !urlCredentialUsername) {
      return;
    }
    setNavError("");
    setFillStatus(t("webview.fillingCredential"));
    void invokeCommand("fill_webview_credential", {
      request: {
        sessionId: sessionIdRef.current,
        secretOwnerId: tab.connection.id,
        username: urlCredentialUsername,
      },
    })
      .then(() => setFillStatus(t("webview.credentialFilled")))
      .catch((error) => {
        setFillStatus("");
        setNavError(error instanceof Error ? error.message : String(error));
      });
  }

  return (
    <section
      className={isActive ? "terminal-workspace webview-workspace active" : "terminal-workspace webview-workspace"}
      ref={workspaceRef}
    >
      <article className="terminal-pane webview-pane">
        <header>
          <div className="webview-nav-group">
            <Globe2 className="webview-nav-globe" size={13} />
            <button
              className="terminal-pane-action"
              aria-label={t("webview.goBack")}
              onClick={() => handleSimple("webview_go_back")}
              title={t("webview.back")}
              type="button"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              className="terminal-pane-action"
              aria-label={t("webview.goForward")}
              onClick={() => handleSimple("webview_go_forward")}
              title={t("webview.forward")}
              type="button"
            >
              <ArrowRight size={13} />
            </button>
            <button
              className="terminal-pane-action"
              aria-label={t("webview.reload")}
              onClick={() => handleSimple("webview_reload")}
              title={t("webview.reload")}
              type="button"
            >
              <RefreshCw size={13} />
            </button>
            <form className="webview-toolbar-form" onSubmit={handleNavigate}>
              <input
                aria-label={t("webview.address")}
                className="webview-address-input"
                onChange={(event) => setAddressInput(event.currentTarget.value)}
                placeholder={t("webview.urlPlaceholder")}
                value={addressInput}
              />
            </form>
          </div>
          <span className="webview-title-center">
            {tab.title}
          </span>
          <div className="terminal-pane-actions">
            {fillStatus ? <span className="webview-toolbar-status">{fillStatus}</span> : null}
            <button
              className="terminal-pane-action"
              onClick={handleSaveCredential}
              title={t("webview.savePasswordTitle")}
              type="button"
            >
              <Save size={13} />
            </button>
            <button
              className="terminal-pane-action"
              disabled={!canFillCredential}
              onClick={handleFillCredential}
              title={canFillCredential ? t("webview.fillSavedCredential") : t("webview.noSavedCredential")}
              type="button"
            >
              <KeyRound size={13} />
            </button>
            <ScreenshotMenu
              buttonClassName="terminal-pane-action"
              targetLabel={t("webview.screenshotTarget", { title: tab.title })}
              targetRef={workspaceRef}
            />
            {tab.connection ? (
              <WikiPagesButton
                buttonClassName="terminal-pane-action"
                connectionId={tab.connection.id}
                iconSize={13}
              />
            ) : null}
          </div>
        </header>
        <div ref={placeholderRef} className="webview-placeholder">
          {!initialUrl ? (
            <p className="webview-placeholder-message">{t("webview.noUrlConfigured")}</p>
          ) : !isTauriRuntime() ? (
            <p className="webview-placeholder-message">
              {t("webview.desktopRuntimeOnly")} <code>{initialUrl}</code>
            </p>
          ) : null}
          {navError ? <p className="form-error webview-placeholder-error">{navError}</p> : null}
        </div>
      </article>
    </section>
  );
}

function formatWebviewSubtitle(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
