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
  const {
    applyAssistantStreamEventToMessage,
    completeAssistantStreamMessageFromResponse,
  } = await importTypeScriptModule(
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

  const recovered = completeAssistantStreamMessageFromResponse(
    {
      content: "",
      reasoningContent: message.reasoningContent,
      toolCalls: message.toolCalls,
      isStreaming: false,
    },
    {
      providerKind: "deepseek",
      model: "deepseek-v4-flash",
      content: "It is 11:00 PM.",
      reasoningContent: "I checked the time.",
    },
  );

  assert.equal(recovered.content, "It is 11:00 PM.");
  assert.equal(recovered.reasoningContent, "I checked the time.");
});

test("assistant stream events accept legacy snake_case tool fields", async () => {
  const {
    applyAssistantStreamEventToMessage,
    latestRunningAssistantToolCall,
  } = await importTypeScriptModule(
    new URL("../src/ai/streamMessage.ts", import.meta.url),
  );
  const times = [
    "2026-05-12T15:00:00.000Z",
    "2026-05-12T15:00:01.000Z",
  ];
  const options = {
    errorPrefix: "Error",
    now: () => times.shift() ?? "2026-05-12T15:00:01.000Z",
    workStartedAt: "2026-05-12T14:59:59.000Z",
  };
  let message = { content: "", isStreaming: true, workStartedAt: options.workStartedAt };

  message = applyAssistantStreamEventToMessage(
    message,
    { type: "toolCallStart", tool_id: "call_legacy", tool_name: "dashboard_create_widget" },
    options,
  );

  assert.equal(latestRunningAssistantToolCall(message).toolName, "dashboard_create_widget");

  message = applyAssistantStreamEventToMessage(
    message,
    { type: "toolCallEnd", tool_id: "call_legacy", tool_name: "dashboard_create_widget" },
    options,
  );

  assert.deepEqual(message.toolCalls, [
    {
      toolId: "call_legacy",
      toolName: "dashboard_create_widget",
      status: "completed",
      startedAt: "2026-05-12T15:00:00.000Z",
      endedAt: "2026-05-12T15:00:01.000Z",
    },
  ]);
});

test("assistant stream ignores malformed tool events instead of recording undefined names", async () => {
  const {
    applyAssistantStreamEventToMessage,
    latestRunningAssistantToolCall,
  } = await importTypeScriptModule(
    new URL("../src/ai/streamMessage.ts", import.meta.url),
  );
  const options = {
    errorPrefix: "Error",
    now: () => "2026-05-12T15:00:00.000Z",
    workStartedAt: "2026-05-12T14:59:59.000Z",
  };

  const message = applyAssistantStreamEventToMessage(
    { content: "", isStreaming: true },
    { type: "toolCallStart", toolId: "call_bad" },
    options,
  );

  assert.equal(message.workStartedAt, options.workStartedAt);
  assert.equal(message.toolCalls, undefined);
  assert.equal(latestRunningAssistantToolCall(message), undefined);
});
