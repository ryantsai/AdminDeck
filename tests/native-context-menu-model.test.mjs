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

test("native context menu normalization removes unsafe separator edges", async () => {
  const { normalizeNativeContextMenuItems } = await importTypeScriptModule(
    new URL("../src/lib/nativeContextMenuModel.ts", import.meta.url),
  );

  const normalized = normalizeNativeContextMenuItems([
    { kind: "separator" },
    { kind: "item", label: "Open", action: () => undefined },
    { kind: "separator" },
    { kind: "separator" },
    { kind: "item", label: "Delete", action: () => undefined },
    { kind: "separator" },
  ]);

  assert.deepEqual(
    normalized.map((item) => item.kind === "item" ? item.label : item.kind),
    ["Open", "separator", "Delete"],
  );
});

test("native context menu normalization removes empty submenus recursively", async () => {
  const { normalizeNativeContextMenuItems } = await importTypeScriptModule(
    new URL("../src/lib/nativeContextMenuModel.ts", import.meta.url),
  );

  const normalized = normalizeNativeContextMenuItems([
    {
      kind: "submenu",
      label: "Empty",
      items: [{ kind: "separator" }],
    },
    {
      kind: "submenu",
      label: "Split",
      items: [
        { kind: "separator" },
        { kind: "item", label: "Left", action: () => undefined },
        { kind: "separator" },
      ],
    },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "submenu");
  assert.equal(normalized[0].label, "Split");
  assert.deepEqual(
    normalized[0].items.map((item) => item.kind === "item" ? item.label : item.kind),
    ["Left"],
  );
});
