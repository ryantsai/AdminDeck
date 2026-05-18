import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function importTypeScriptModule(path) {
  const source = await readFile(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: true,
    },
  });
  const encoded = encodeURIComponent(transpiled.outputText);
  return import(`data:text/javascript;charset=utf-8,${encoded}`);
}

test("script widget source is encoded as data before iframe execution", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const source = "document.body.innerHTML = `<div><script>alert(1)</script></div>`;";
  const srcdoc = buildSrcdoc({
    source,
    permissions: { network: false },
  });

  assert.match(srcdoc, /script-src 'unsafe-inline' blob:/);
  assert.match(srcdoc, /return injectScript\(/);
  assert.match(srcdoc, /padding:\s*4px;/);
  assert.doesNotMatch(srcdoc, /<script>alert\(1\)<\/script><\/div>`;/);
  assert.match(srcdoc, /\\u003cscript>alert\(1\)\\u003c\/script>\\u003c\/div>`;/);
});

test("script widget CSP allows remote images only with network permission", async () => {
  const { buildCsp } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );

  assert.match(buildCsp({ network: true }), /img-src http: https: data: blob:/);
  assert.match(buildCsp({ network: true }), /connect-src \*/);
  assert.match(buildCsp({ network: true }), /script-src 'unsafe-inline' blob:/);
  assert.doesNotMatch(buildCsp({ network: true }), /script-src[^;]*https:/);
  assert.match(buildCsp({ network: false }), /img-src data: blob:/);
  assert.match(buildCsp({ network: false }), /connect-src 'none'/);
  assert.match(buildCsp({ network: false }), /script-src 'unsafe-inline' blob:/);
  assert.doesNotMatch(buildCsp({ network: false }), /script-src[^;]*https:/);
});

test("script widget host intercepts external links for parent opener bridge", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "document.getElementById('root').innerHTML = '<a href=\"https://example.com\">Example</a>';",
    permissions: { network: false },
  });

  assert.match(srcdoc, /openExternal: function \(url\)/);
  assert.match(srcdoc, /closest\('a\[href\]'\)/);
  assert.match(srcdoc, /type: 'openExternalUrl'/);
  assert.match(srcdoc, /url\.protocol === 'http:'/);
  assert.match(srcdoc, /url\.protocol === 'https:'/);
});

test("script widget host exposes keyed secret bridge", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "KK.getSecret('apiKey');",
    permissions: { network: false },
  });

  assert.match(srcdoc, /getSecret: function \(key\)/);
  assert.match(srcdoc, /type: 'getSecret'/);
  assert.match(srcdoc, /type !== 'secretValue'/);
  assert.doesNotMatch(srcdoc, /widget-api-key/);
});

test("script widget host exposes measured viewport bridge", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "const viewport = KK.getViewport(); KK.onViewportResize(() => {});",
    permissions: { network: false },
  });

  assert.match(srcdoc, /function readViewport\(\)/);
  assert.match(srcdoc, /getViewport: readViewport/);
  assert.match(srcdoc, /onViewportResize: function \(callback\)/);
  assert.match(srcdoc, /new ResizeObserver\(notify\)/);
});

test("script widget host caps animation and tight timer loops", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "requestAnimationFrame(() => {}); setInterval(() => {}, 0);",
    permissions: { network: false },
  });

  assert.match(srcdoc, /KK_RAF_MIN_INTERVAL_MS = 33/);
  assert.match(srcdoc, /window\.requestAnimationFrame = function \(callback\)/);
  assert.match(srcdoc, /window\.setInterval = function \(handler, timeout\)/);
  assert.match(srcdoc, /KK_SET_INTERVAL_MIN_MS = 100/);
  assert.match(srcdoc, /if \(!_kkVisible\) return;/);
});

test("script widget parent bridge rate-limits expensive messages", async () => {
  const hostSource = await readFile(
    new URL("../src/dashboard/script/ScriptWidgetHost.tsx", import.meta.url),
    "utf8",
  );

  assert.match(hostSource, /BRIDGE_RATE_LIMITS_MS/);
  assert.match(hostSource, /getPerformanceCounters:\s*1000/);
  assert.match(hostSource, /setSettings:\s*500/);
  assert.match(hostSource, /allowBridgeMessage\("getPerformanceCounters"\)/);
  assert.match(hostSource, /allowBridgeMessage\("setSettings"\)/);
});

test("script widget host exposes app-owned UI primitives", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "document.getElementById('root').className = 'kk-shell';",
    permissions: { network: false },
  });

  for (const className of [
    "kk-shell",
    "kk-toolbar",
    "kk-panel",
    "kk-stat-value",
    "kk-stage",
    "kk-fill",
  ]) {
    assert.match(srcdoc, new RegExp(`\\.${className}`));
  }
});

test("script widget host exposes file and folder drop-zone helper", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "KK.onFileDrop(document.getElementById('root'), () => {});",
    permissions: { network: false },
  });

  assert.match(srcdoc, /onFileDrop: function \(target, callback, options\)/);
  assert.match(srcdoc, /dragover/);
  assert.match(srcdoc, /webkitGetAsEntry/);
  assert.match(srcdoc, /readDirectoryEntries/);
  assert.match(srcdoc, /readAsArrayBuffer/);
});

test("script widget wraps user source in IIFE so top-level return is legal", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  // A realistic AI-generated body with effect-style cleanup return.
  const source = "let t = setInterval(() => {}, 100);\nreturn () => clearInterval(t);";
  const srcdoc = buildSrcdoc({ source, permissions: { network: false } });

  // The wrapper must appear in the injected call, with the source flanked by
  // the IIFE prefix and suffix.
  assert.match(
    srcdoc,
    /injectScript\('\(function\(\){' \+ "let t = setInterval[^\n]*?clearInterval\(t\);" \+ '\\n}\)\(\);'/,
  );

  // The wrapped script that would actually execute in the iframe must parse
  // as a top-level Program without "Illegal return statement".
  const wrapped = `(function(){${source}\n})();`;
  assert.doesNotThrow(() => new vm.Script(wrapped));
  // And the unwrapped form must still be illegal — proving the wrapper is
  // doing the work, not some lucky parser leniency.
  assert.throws(() => new vm.Script(source), /Illegal return/);
});

test("script widget signals smoke-test ready and bubbles runtime errors to parent", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "document.getElementById('root').textContent = 'ok';",
    permissions: { network: false },
  });

  // After the user source loads, the host posts a kk.ready signal so
  // ScriptWidgetHost can clear its 2s smoke-test watchdog. Without this
  // signal, every widget would appear unhealthy on first mount.
  assert.match(
    srcdoc,
    /window\.parent\.postMessage\(\{\s*kk:\s*true,\s*type:\s*'ready'\s*\},\s*'\*'\)/,
  );

  // The iframe's showError handler posts kk.runtimeError to the parent so
  // a thrown widget surfaces in the dashboard health state and the
  // assistant context payload, not only in an in-iframe <pre>.
  assert.match(
    srcdoc,
    /window\.parent\.postMessage\(\{\s*kk:\s*true,\s*type:\s*'runtimeError',\s*error:\s*serialized\s*\},\s*'\*'\)/,
  );
});

test("live widget path expression resolves dotted, indexed, and fan-out paths", async () => {
  const { resolveLivePath, isValidLivePathExpression } = await importTypeScriptModule(
    new URL("../src/dashboard/schema.ts", import.meta.url),
  );

  const data = {
    quote: { price: 42.5, ts: 1700000000 },
    quotes: [
      { close: 100, vol: 1000 },
      { close: 102, vol: 900 },
      { close: 99,  vol: 1100 },
    ],
    nested: { a: { b: [{ c: "deep" }] } },
  };

  // Syntactic validator must accept the canonical forms.
  for (const p of ["quote.price", "quotes[0].close", "quotes[*].close", "nested.a.b[0].c"]) {
    assert.equal(isValidLivePathExpression(p), true, p);
  }

  // Resolver behavior — primitive at the end.
  assert.equal(resolveLivePath(data, "quote.price"), 42.5);
  assert.equal(resolveLivePath(data, "quotes[1].close"), 102);
  assert.equal(resolveLivePath(data, "nested.a.b[0].c"), "deep");

  // Resolver behavior — array fan-out.
  assert.deepEqual(resolveLivePath(data, "quotes[*].close"), [100, 102, 99]);
  assert.deepEqual(resolveLivePath(data, "quotes[*].vol"), [1000, 900, 1100]);

  // Missing path → undefined, not throw.
  assert.equal(resolveLivePath(data, "quote.missing"), undefined);
  assert.equal(resolveLivePath(data, "missing[0]"), undefined);
  // Index past end → undefined.
  assert.equal(resolveLivePath(data, "quotes[99]"), undefined);

  // Malformed paths must be rejected at validation time so the renderer
  // never asks the resolver to walk garbage.
  for (const bad of ["", ".key", "key.", "key[", "key[]", "key.123", "key/value"]) {
    assert.equal(isValidLivePathExpression(bad), false, `${bad} should be invalid`);
  }
});

test("script widget rAF wrapper emits throttled motionTick heartbeat for stall watchdog", async () => {
  const { buildSrcdoc } = await importTypeScriptModule(
    new URL("../src/dashboard/script/permissions.ts", import.meta.url),
  );
  const srcdoc = buildSrcdoc({
    source: "function frame(){ requestAnimationFrame(frame); } requestAnimationFrame(frame);",
    permissions: { network: false },
  });

  // The wrapper centralises rAF dispatch in runKkRafPump; the heartbeat
  // post must live inside that function so every iframe gets a stall
  // signal whether or not the user source calls rAF.
  assert.match(srcdoc, /KK_MOTION_TICK_MIN_MS\s*=\s*500/);
  assert.match(
    srcdoc,
    /window\.parent\.postMessage\(\{\s*kk:\s*true,\s*type:\s*'motionTick',\s*ticks:\s*_kkMotionTickCounter\s*\},\s*'\*'\)/,
  );
  // Throttle gate: the post must be guarded by a timestamp comparison so
  // a 60 fps widget produces ~2 messages/s, not 60.
  assert.match(srcdoc, /if\s*\(\s*timestamp\s*-\s*_kkLastMotionTickPostAt\s*>=\s*KK_MOTION_TICK_MIN_MS\s*\)/);
});

test("script widget infers common local libraries from legacy generated source", async () => {
  const { resolveWidgetLibraryKeys } = await importTypeScriptModule(
    new URL("../src/dashboard/script/widgetLibraries.ts", import.meta.url),
  );

  assert.deepEqual(
    resolveWidgetLibraryKeys(undefined, "mermaid.initialize({ startOnLoad: false }); anime.timeline();"),
    ["mermaid", "animejs"],
  );
});

test("script widget resolver accepts every advertised local library", async () => {
  const { WIDGET_LIBRARIES, resolveWidgetLibraryKeys } = await importTypeScriptModule(
    new URL("../src/dashboard/script/widgetLibraries.ts", import.meta.url),
  );

  const keys = Object.keys(WIDGET_LIBRARIES);
  assert.ok(keys.length > 20);
  assert.deepEqual(resolveWidgetLibraryKeys(keys, ""), keys);
});

test("script widget library catalog documents qrcode canvas target contract", async () => {
  const { libraryCatalogForAi } = await importTypeScriptModule(
    new URL("../src/dashboard/script/widgetLibraries.ts", import.meta.url),
  );

  const catalog = libraryCatalogForAi();
  assert.match(catalog, /qrcode \(global: QRCode\)/);
  assert.match(catalog, /QRCode\.toCanvas, pass a real <canvas> element, not a wrapper div/);
});

test("script widget library catalog documents Matter.js physics contract", async () => {
  const { libraryCatalogForAi } = await importTypeScriptModule(
    new URL("../src/dashboard/script/widgetLibraries.ts", import.meta.url),
  );

  const catalog = libraryCatalogForAi();
  assert.match(catalog, /matter \(global: Matter\)/);
  assert.match(catalog, /2D physics engine/);
  assert.match(catalog, /explicit wall\/floor bodies sized from KK\.getViewport\(\)/);
});
