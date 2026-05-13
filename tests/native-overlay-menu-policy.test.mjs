import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ordinary workspace command menus are not RDP-blocking DOM overlays", async () => {
  const source = await readFile(
    new URL("../src/workspace/nativeOverlay.ts", import.meta.url),
    "utf8",
  );

  for (const selector of [
    ".quick-connect-menu",
    ".add-connection-menu",
    ".tree-context-menu",
    ".rail-context-menu",
    ".screenshot-menu",
  ]) {
    assert.equal(
      source.includes(selector),
      false,
      `${selector} should use native menus instead of RDP DOM overlay parking`,
    );
  }
});
