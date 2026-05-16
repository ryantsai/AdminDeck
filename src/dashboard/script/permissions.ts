import type { ScriptBody } from "../types";

export interface ResolvedWidgetLibrary {
  key: string;
  global: string;
  source: string;
}

export function buildCsp(perm: ScriptBody["permissions"]): string {
  const connect = perm.network ? "*" : "'none'";
  const images = perm.network ? "http: https: data: blob:" : "data: blob:";
  const scripts = "'unsafe-inline' blob:";
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src ${scripts}`,
    `connect-src ${connect}`,
    `img-src ${images}`,
    "font-src data:",
  ].join("; ");
}

function scriptStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildSrcdoc(
  body: ScriptBody,
  settingsValuesJson = "{}",
  libraries: ResolvedWidgetLibrary[] = [],
): string {
  const csp = buildCsp(body.permissions);
  const shim = body.htmlShim?.trim().length ? body.htmlShim : '<div id="root"></div>';
  const source = scriptStringLiteral(body.source);
  const settings = scriptStringLiteral(settingsValuesJson);
  const libraryEntries = libraries
    .map((lib) => `[${scriptStringLiteral(lib.key)},${scriptStringLiteral(lib.source)}]`)
    .join(",");
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
      padding: 4px;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--kk-text);
      font-size: 13px;
      line-height: 1.4;
    }
    body { background: transparent; }
    #root {
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      scrollbar-width: thin;
    }
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
    .kk-shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 10px;
      min-height: 100%;
    }
    .kk-toolbar,
    .kk-cluster {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .kk-title {
      color: var(--kk-text);
      font-size: 13px;
      font-weight: 750;
    }
    .kk-subtitle,
    .kk-muted {
      color: var(--kk-muted);
      font-size: 12px;
    }
    .kk-panel,
    .kk-card {
      min-width: 0;
      border: 1px solid var(--kk-border);
      border-radius: 8px;
      background: var(--kk-surface);
      box-shadow: 0 8px 22px -20px rgba(15, 23, 42, 0.45);
    }
    .kk-panel { padding: 10px; }
    .kk-card { padding: 9px; }
    .kk-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      gap: 8px;
    }
    .kk-stat {
      display: grid;
      gap: 2px;
      min-width: 0;
      padding: 8px;
      border: 1px solid var(--kk-border);
      border-radius: 7px;
      background: var(--kk-surface-muted);
    }
    .kk-stat-value {
      color: var(--kk-text);
      font-size: 18px;
      font-weight: 780;
      line-height: 1.1;
    }
    .kk-stat-label {
      color: var(--kk-muted);
      font-size: 11.5px;
    }
    .kk-pill,
    .kk-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 24px;
      padding: 3px 8px;
      border: 1px solid rgba(37, 99, 235, 0.24);
      border-radius: 999px;
      background: var(--kk-accent-soft);
      color: var(--kk-accent);
      font-size: 11.5px;
      font-weight: 650;
    }
    .kk-stage {
      position: relative;
      min-height: 0;
      overflow: hidden;
      border: 1px solid var(--kk-border);
      border-radius: 8px;
      background: #0f172a;
    }
    .kk-stage > canvas,
    canvas.kk-fill,
    svg.kk-fill,
    .kk-fill {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
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
      let settings = {};
      try {
        const parsedSettings = JSON.parse(${settings});
        if (parsedSettings && typeof parsedSettings === 'object' && !Array.isArray(parsedSettings)) {
          settings = parsedSettings;
        }
      } catch (_err) {}
      function readViewport() {
        var target = document.getElementById('root') || document.documentElement || document.body;
        var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        var width = Math.max(1, Math.floor((rect && rect.width) || (target && target.clientWidth) || window.innerWidth || 1));
        var height = Math.max(1, Math.floor((rect && rect.height) || (target && target.clientHeight) || window.innerHeight || 1));
        var dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        return { width: width, height: height, dpr: dpr };
      }
      const KK = {
        getSettings: function () { return JSON.parse(JSON.stringify(settings)); },
        getViewport: readViewport,
        onViewportResize: function (callback) {
          if (typeof callback !== 'function') return function () {};
          var target = document.getElementById('root') || document.documentElement || document.body;
          var disposed = false;
          var pending = false;
          function notify() {
            if (disposed || pending) return;
            pending = true;
            requestAnimationFrame(function () {
              pending = false;
              if (!disposed) callback(readViewport());
            });
          }
          var observer = null;
          if (typeof ResizeObserver !== 'undefined' && target) {
            observer = new ResizeObserver(notify);
            observer.observe(target);
          }
          window.addEventListener('resize', notify);
          setTimeout(notify, 0);
          return function () {
            disposed = true;
            if (observer) observer.disconnect();
            window.removeEventListener('resize', notify);
          };
        },
        getSecret: function (key) {
          return new Promise(function (resolve, reject) {
            if (typeof key !== 'string' || !key) {
              reject(new Error('Secret key is required.'));
              return;
            }
            const requestId = 'secret-' + Math.random().toString(36).slice(2);
            function onMessage(event) {
              const data = event.data;
              if (!data || data.kk !== true || data.type !== 'secretValue' || data.requestId !== requestId) return;
              window.removeEventListener('message', onMessage);
              if (data.ok) {
                resolve(data.value || null);
              } else {
                reject(new Error(data.error || 'Could not read widget secret.'));
              }
            }
            window.addEventListener('message', onMessage);
            window.parent.postMessage({ kk: true, type: 'getSecret', requestId: requestId, key: key }, "*");
          });
        },
        setSettings: function (nextSettings) {
          if (!nextSettings || typeof nextSettings !== 'object' || Array.isArray(nextSettings)) return;
          settings = JSON.parse(JSON.stringify(nextSettings));
          window.parent.postMessage({ kk: true, type: 'setSettings', settings: settings }, "*");
        },
        setSetting: function (key, value) {
          if (typeof key !== 'string' || !key) return;
          const nextSettings = Object.assign({}, settings);
          nextSettings[key] = value;
          KK.setSettings(nextSettings);
        },
        openExternal: function (url) { window.parent.postMessage({ kk: true, type: 'openExternalUrl', url }, "*"); },
        saveFile: function (filename, bytes, filters) {
          return new Promise(function (resolve, reject) {
            if (typeof filename !== 'string' || !filename) {
              reject(new Error('filename is required.'));
              return;
            }
            let buffer = null;
            if (bytes instanceof Uint8Array) {
              buffer = bytes;
            } else if (bytes instanceof ArrayBuffer) {
              buffer = new Uint8Array(bytes);
            } else if (bytes && bytes.buffer instanceof ArrayBuffer) {
              buffer = new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
            }
            if (!buffer) {
              reject(new Error('bytes must be a Uint8Array, ArrayBuffer, or typed array.'));
              return;
            }
            var requestId = 'file-save-' + Math.random().toString(36).slice(2);
            function onMessage(event) {
              var data = event.data;
              if (!data || data.kk !== true || data.type !== 'saveFileResult' || data.requestId !== requestId) return;
              window.removeEventListener('message', onMessage);
              if (data.ok) {
                resolve(data.path || null);
              } else {
                reject(new Error(data.error || 'File save failed.'));
              }
            }
            window.addEventListener('message', onMessage);
            window.parent.postMessage({
              kk: true,
              type: 'saveFile',
              requestId: requestId,
              filename: filename,
              bytes: buffer,
              filters: Array.isArray(filters) ? filters : undefined,
            }, "*");
          });
        },
        callMcpTool: function (serverIdOrName, toolName, args) {
          return new Promise(function (resolve, reject) {
            if (typeof serverIdOrName !== 'string' || !serverIdOrName) {
              reject(new Error('serverIdOrName is required.'));
              return;
            }
            if (typeof toolName !== 'string' || !toolName) {
              reject(new Error('toolName is required.'));
              return;
            }
            var requestId = 'mcp-' + Math.random().toString(36).slice(2);
            function onMessage(event) {
              var data = event.data;
              if (!data || data.kk !== true || data.type !== 'mcpToolResult' || data.requestId !== requestId) return;
              window.removeEventListener('message', onMessage);
              if (data.ok) {
                resolve(data.result);
              } else {
                reject(new Error(data.error || 'MCP tool call failed.'));
              }
            }
            window.addEventListener('message', onMessage);
            window.parent.postMessage({
              kk: true,
              type: 'callMcpTool',
              requestId: requestId,
              serverIdOrName: serverIdOrName,
              toolName: toolName,
              arguments: args == null ? {} : args,
            }, "*");
          });
        },
        readLocalFile: function (options) {
          return new Promise(function (resolve, reject) {
            var filters = options && Array.isArray(options.filters) ? options.filters : undefined;
            var requestId = 'file-read-' + Math.random().toString(36).slice(2);
            function onMessage(event) {
              var data = event.data;
              if (!data || data.kk !== true || data.type !== 'readLocalFileResult' || data.requestId !== requestId) return;
              window.removeEventListener('message', onMessage);
              if (data.ok) {
                resolve(data.file || null);
              } else {
                reject(new Error(data.error || 'File read failed.'));
              }
            }
            window.addEventListener('message', onMessage);
            window.parent.postMessage({
              kk: true,
              type: 'readLocalFile',
              requestId: requestId,
              filters: filters,
            }, "*");
          });
        },
        postMessage: function (payload) { window.parent.postMessage({ kk: true, payload }, "*"); },
        requestPermission: function () { return Promise.resolve(false); },
      };
      window.KK = KK;
      // Harden 2: visibility-aware throttling. When the host reports the widget
      // is off-screen or scrolled away, script authors can check KK.isVisible()
      // to pause expensive rAF/animation loops.
      var _kkVisible = true;
      KK.isVisible = function () { return _kkVisible; };
      window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || !data.kk || data.type !== 'setVisible') return;
        _kkVisible = data.visible === true;
      });

      document.addEventListener('click', function (event) {
        const target = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!target) return;
        const href = target.getAttribute('href') || '';
        try {
          const url = new URL(href);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            event.preventDefault();
            KK.openExternal(url.href);
          }
        } catch (_err) {
          // Relative and non-URL links stay inside the sandbox.
        }
      }, true);
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
      function injectScript(source, name) {
        return new Promise(function (resolve, reject) {
          var blob = new Blob([source + '\\n//# sourceURL=' + name], { type: 'text/javascript' });
          var script = document.createElement('script');
          script.src = URL.createObjectURL(blob);
          script.onload = function () { URL.revokeObjectURL(script.src); resolve(); };
          script.onerror = function () {
            URL.revokeObjectURL(script.src);
            reject(new Error('Failed to load ' + name));
          };
          document.head.appendChild(script);
        });
      }
      var libraries = [${libraryEntries}];
      var chain = Promise.resolve();
      libraries.forEach(function (entry) {
        chain = chain.then(function () {
          return injectScript(entry[1], 'kkterm-widget-lib-' + entry[0] + '.js');
        });
      });
      chain.then(function () {
        // Wrap user source in a sync IIFE so top-level \`return\` is legal
        // (matches the effect-style "return cleanup" idiom AI generators emit).
        // No leading newline: keeps user line N at blob line N for stack traces.
        return injectScript('(function(){' + ${source} + '\\n})();', 'kkterm-dashboard-widget.js');
      }).catch(showError);
    })();
  </script>
</body></html>`;
}
