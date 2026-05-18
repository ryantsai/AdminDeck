import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("status bar exposes a clickable AI working indicator", async () => {
  const statusBarSource = await readFile(
    new URL("../src/workspace/StatusBar.tsx", import.meta.url),
    "utf8",
  );
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const assistantSource = await readFile(
    new URL("../src/ai/AssistantPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    statusBarSource,
    /function\s+AssistantWorkingStatusButton/,
    "StatusBar should render a dedicated AI working indicator.",
  );
  assert.match(
    statusBarSource,
    /assistantWorking/,
    "StatusBar should read the shared assistant working state.",
  );
  assert.match(
    statusBarSource,
    /onOpenAssistant/,
    "Clicking the status indicator should ask App to open the Assistant panel.",
  );
  assert.match(
    appSource,
    /function\s+openAssistantPanel/,
    "App should own the actual Assistant panel opening behavior.",
  );
  assert.match(
    assistantSource,
    /setAssistantWorking\(isSendingPrompt\)/,
    "AssistantPanel should publish in-flight work to shared state.",
  );
});

test("assistant renders in-chat tool approval controls", async () => {
  const assistantSource = await readFile(
    new URL("../src/ai/AssistantPanel.tsx", import.meta.url),
    "utf8",
  );
  const tauriSource = await readFile(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");

  assert.match(
    assistantSource,
    /assistant-tool-approval-request/,
    "AssistantPanel should listen for backend tool approval requests.",
  );
  assert.match(
    assistantSource,
    /complete_assistant_tool_approval_request/,
    "AssistantPanel should complete the approval request instead of changing global settings.",
  );
  assert.match(
    assistantSource,
    /assistant-tool-approval-card/,
    "AssistantPanel should render an in-chat approval card.",
  );
  assert.match(
    assistantSource,
    /toolApprovalCancelled/,
    "AssistantPanel should show a cancelled state when the user bails out.",
  );
  assert.match(
    assistantSource,
    /completeAssistantToolApproval\(request\.requestId,\s*false,\s*\{\s*cancelPrompt:\s*true\s*\}/,
    "AssistantPanel should let Cancel reject the pending approval and stop the active response.",
  );
  assert.match(
    tauriSource,
    /complete_assistant_tool_approval_request/,
    "typed Tauri wrappers should include the approval completion command.",
  );
});
