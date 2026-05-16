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
