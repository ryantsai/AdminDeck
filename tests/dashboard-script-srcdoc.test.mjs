import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
  assert.match(buildCsp({ network: true }), /script-src 'unsafe-inline' blob: http: https:/);
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
