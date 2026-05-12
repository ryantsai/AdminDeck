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

test("assistant stream events preserve tool status and final content synchronously", async () => {
  const { applyAssistantStreamEventToMessage } = await importTypeScriptModule(
    new URL("../src/ai/streamMessage.ts", import.meta.url),
  );
  const times = [
    "2026-05-12T15:00:00.000Z",
    "2026-05-12T15:00:01.000Z",
    "2026-05-12T15:00:02.000Z",
    "2026-05-12T15:00:03.000Z",
  ];
  const nextTime = () => times.shift() ?? "2026-05-12T15:00:03.000Z";
  const options = {
    errorPrefix: "Error",
    now: nextTime,
    workStartedAt: "2026-05-12T14:59:59.000Z",
  };
  let message = { content: "", isStreaming: true, workStartedAt: options.workStartedAt };

  message = applyAssistantStreamEventToMessage(
    message,
    { type: "toolCallStart", toolId: "call_1", toolName: "current_time" },
    options,
  );
  message = applyAssistantStreamEventToMessage(
    message,
    { type: "toolCallEnd", toolId: "call_1", toolName: "current_time" },
    options,
  );
  message = applyAssistantStreamEventToMessage(
    message,
    { type: "contentDelta", delta: "It is 11:00 PM." },
    options,
  );
  message = applyAssistantStreamEventToMessage(
    message,
    { type: "done", model: "deepseek-chat", providerKind: "deepseek" },
    options,
  );

  assert.equal(message.content, "It is 11:00 PM.");
  assert.equal(message.isStreaming, false);
  assert.equal(message.workCompletedAt, "2026-05-12T15:00:02.000Z");
  assert.deepEqual(message.toolCalls, [
    {
      toolId: "call_1",
      toolName: "current_time",
      status: "completed",
      startedAt: "2026-05-12T15:00:00.000Z",
      endedAt: "2026-05-12T15:00:01.000Z",
    },
  ]);
});
