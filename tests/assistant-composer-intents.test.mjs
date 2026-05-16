import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Assistant composer exposes Create Widget and Watchdog intent chips", async () => {
  const assistantSource = await readFile(
    new URL("../src/ai/AssistantPanel.tsx", import.meta.url),
    "utf8",
  );
  const locale = JSON.parse(
    await readFile(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"),
  );

  assert.match(
    assistantSource,
    /type AssistantPromptIntent = "chat" \| "extensionCreation" \| "createWidget" \| "watchdog"/,
    "AssistantPromptIntent should include the selectable composer intents.",
  );
  assert.match(
    assistantSource,
    /assistant-intent-chip/,
    "AssistantPanel should render a visible intent chip in the composer.",
  );
  assert.match(
    assistantSource,
    /assistant-intent-examples/,
    "AssistantPanel should render example bubbles when an intent is selected.",
  );
  assert.equal(locale.ai.createWidget, "Create Widget");
  assert.equal(locale.ai.watchdog, "Watchdog");
  assert.deepEqual(locale.ai.createWidgetExamples, [
    "a round clock widget",
    "a CPU and RAM mini monitor",
    "a quick SSH jump list",
  ]);
  assert.deepEqual(locale.ai.watchdogExamples, [
    "monitor every 5 minutes and E-Mail me if the process has stopped",
    "watch this SSH service and report failures",
    "check disk space every hour",
  ]);
});
