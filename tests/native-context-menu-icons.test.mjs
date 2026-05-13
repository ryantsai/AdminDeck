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

test("native menu icon SVGs are small lucide-style SVG assets", async () => {
  const { nativeMenuIcons } = await importTypeScriptModule(
    new URL("../src/lib/nativeMenuIcons.ts", import.meta.url),
  );

  assert.match(nativeMenuIcons.pin, /^<svg /);
  assert.match(nativeMenuIcons.pin, /viewBox="0 0 24 24"/);
  assert.match(nativeMenuIcons.pin, /stroke="currentColor"/);
  assert.match(nativeMenuIcons.pin, /<path /);
});
