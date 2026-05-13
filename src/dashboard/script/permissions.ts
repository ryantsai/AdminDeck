import type { ScriptBody } from "../types";

export function buildCsp(perm: ScriptBody["permissions"]): string {
  const connect = perm.network ? "*" : "'none'";
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline' blob:",
    `connect-src ${connect}`,
    "img-src data: blob:",
    "font-src data:",
  ].join("; ");
}

function scriptStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildSrcdoc(body: ScriptBody): string {
  const csp = buildCsp(body.permissions);
  const shim = body.htmlShim?.trim().length ? body.htmlShim : '<div id="root"></div>';
  const source = scriptStringLiteral(body.source);
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, "&quot;")}" />
  <style>
    :root {
      color-scheme: light;
      --kk-text: #111827;
      --kk-muted: #64748b;
      --kk-border: #d8dee8;
      --kk-surface: #ffffff;
      --kk-surface-muted: #f6f8fb;
      --kk-accent: #2563eb;
      --kk-accent-soft: rgba(37, 99, 235, 0.12);
    }
    html, body {
      margin: 0;
      padding: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--kk-text);
      font-size: 13px;
      line-height: 1.4;
    }
    body { background: transparent; }
    *, *::before, *::after { box-sizing: border-box; }
    h1, h2, h3, p { margin: 0; }
    h1, h2, h3 { font-size: 13px; font-weight: 700; letter-spacing: 0; }
    p, small { color: var(--kk-muted); }
    label { display: grid; gap: 4px; color: var(--kk-muted); font-size: 12px; }
    input, select, textarea {
      width: 100%;
      min-height: 30px;
      border: 1px solid var(--kk-border);
      border-radius: 6px;
      background: var(--kk-surface);
      color: var(--kk-text);
      padding: 5px 8px;
      font: inherit;
    }
    button {
      min-height: 30px;
      border: 1px solid rgba(37, 99, 235, 0.28);
      border-radius: 6px;
      background: var(--kk-accent);
      color: #ffffff;
      padding: 5px 10px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    button.secondary {
      background: var(--kk-surface-muted);
      color: var(--kk-text);
      border-color: var(--kk-border);
    }
    .kk-row { display: flex; align-items: center; gap: 8px; }
    .kk-stack { display: grid; gap: 8px; }
    .kk-result {
      border: 1px solid var(--kk-border);
      border-radius: 6px;
      background: var(--kk-surface-muted);
      padding: 8px;
      font-weight: 700;
    }
    .kk-widget-error { color: #b00; white-space: pre-wrap; font: 12px/1.4 ui-monospace, monospace; }
  </style>
</head><body>
  ${shim}
  <script>
    (function () {
      const KK = {
        postMessage: function (payload) { window.parent.postMessage({ kk: true, payload }, "*"); },
        requestPermission: function () { return Promise.resolve(false); },
      };
      window.KK = KK;
      function showError(err) {
        const pre = document.createElement('pre');
        pre.className = 'kk-widget-error';
        pre.textContent = String(err && (err.stack || err.message) || err);
        document.body.replaceChildren(pre);
      }
      window.addEventListener('error', function (event) {
        showError(event.error || event.message);
      });
      window.addEventListener('unhandledrejection', function (event) {
        showError(event.reason);
      });
      try {
        const source = ${source};
        const blob = new Blob([source + '\\n//# sourceURL=kkterm-dashboard-widget.js'], { type: 'text/javascript' });
        const script = document.createElement('script');
        script.src = URL.createObjectURL(blob);
        script.onload = function () { URL.revokeObjectURL(script.src); };
        script.onerror = function () { showError(new Error('Widget script failed to load.')); };
        document.head.appendChild(script);
      } catch (err) {
        showError(err);
      }
    })();
  </script>
</body></html>`;
}
