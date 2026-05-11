import type { ScriptBody } from "../types";

export function buildCsp(perm: ScriptBody["permissions"]): string {
  const connect = perm.network ? "*" : "'none'";
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    `connect-src ${connect}`,
    "img-src data: blob:",
    "font-src data:",
  ].join("; ");
}

export function buildSrcdoc(body: ScriptBody): string {
  const csp = buildCsp(body.permissions);
  const shim = body.htmlShim?.trim().length ? body.htmlShim : '<div id="root"></div>';
  const safeSource = body.source;
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, "&quot;")}" />
  <style>
    html, body { margin: 0; padding: 8px; font-family: ui-sans-serif, system-ui, sans-serif; color: #222; font-size: 13px; }
    body { background: transparent; }
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
      try {
        ${safeSource}
      } catch (err) {
        document.body.innerHTML = '<pre style="color:#b00;font:12px/1.4 ui-monospace,monospace">'
          + String(err && err.stack || err) + '</pre>';
      }
    })();
  </script>
</body></html>`;
}
