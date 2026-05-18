import type { AiStreamEvent } from "../lib/tauri";
import type { AgentRunResponse } from "../lib/tauri";

export type AssistantToolCallStatus = {
  toolId: string;
  toolName: string;
  status: "running" | "completed";
  error?: string;
  startedAt: string;
  endedAt?: string;
};

export type AssistantStreamMessage = {
  content: string;
  reasoningContent?: string;
  toolCalls?: AssistantToolCallStatus[];
  workStartedAt?: string;
  workCompletedAt?: string;
  isStreaming?: boolean;
};

export function applyAssistantStreamEventToMessage(
  message: AssistantStreamMessage,
  event: AiStreamEvent,
  options: {
    errorPrefix: string;
    now: () => string;
    workStartedAt: string;
  },
): AssistantStreamMessage {
  const msg: AssistantStreamMessage = { ...message };
  switch (event.type) {
    case "reasoningDelta":
      msg.reasoningContent = (msg.reasoningContent ?? "") + event.delta;
      break;
    case "contentDelta":
      msg.content += event.delta;
      break;
    case "toolCallStart":
      const startedToolId = streamEventString(event, "toolId", "tool_id");
      const startedToolName = streamEventString(event, "toolName", "tool_name");
      msg.workStartedAt = msg.workStartedAt ?? options.workStartedAt;
      if (!startedToolId || !startedToolName) {
        break;
      }
      msg.toolCalls = [
        ...(msg.toolCalls ?? []).filter((tc) => tc.toolId !== startedToolId),
        {
          toolId: startedToolId,
          toolName: startedToolName,
          status: "running",
          startedAt: options.now(),
        },
      ];
      break;
    case "toolCallEnd":
      const endedToolId = streamEventString(event, "toolId", "tool_id");
      const endedToolName = streamEventString(event, "toolName", "tool_name");
      if (!endedToolId) {
        break;
      }
      msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
        tc.toolId === endedToolId
          ? {
              ...tc,
              toolName: endedToolName ?? tc.toolName,
              status: "completed",
              ...(event.error ? { error: event.error } : {}),
              endedAt: options.now(),
            }
          : tc,
      );
      break;
    case "done":
      msg.isStreaming = false;
      msg.workCompletedAt = options.now();
      msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
        tc.status === "running"
          ? { ...tc, status: "completed", endedAt: options.now() }
          : tc,
      );
      break;
    case "error":
      msg.isStreaming = false;
      msg.workCompletedAt = options.now();
      if (!msg.content) {
        msg.content = `${options.errorPrefix}: ${event.message}`;
      }
      break;
  }
  return msg;
}

export function completeAssistantStreamMessageFromResponse<T extends AssistantStreamMessage>(
  message: T,
  response: AgentRunResponse,
): T {
  return {
    ...message,
    content: preserveSecretRequestDirectives(message.content, response.content),
    reasoningContent: message.reasoningContent?.trim()
      ? message.reasoningContent
      : response.reasoningContent,
  };
}

export function latestRunningAssistantToolCall(message: AssistantStreamMessage) {
  const toolCalls = message.toolCalls ?? [];
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (
      toolCall.status === "running" &&
      typeof toolCall.toolName === "string" &&
      toolCall.toolName.trim()
    ) {
      return toolCall;
    }
  }
  return undefined;
}

export function assistantWorkPanelShouldShowThinkingStep(message: AssistantStreamMessage) {
  return Boolean(message.reasoningContent?.trim());
}

const SECRET_REQUEST_FENCE = /```kkterm-secret-request\s*\n[\s\S]*?```/g;

function preserveSecretRequestDirectives(streamedContent: string, finalContent: string) {
  const directives = streamedContent.match(SECRET_REQUEST_FENCE) ?? [];
  const missingDirectives = directives.filter((directive) => !finalContent.includes(directive));
  if (missingDirectives.length === 0) {
    return finalContent;
  }
  return [finalContent.trimEnd(), ...missingDirectives].filter(Boolean).join("\n\n");
}

function streamEventString(event: AiStreamEvent, camelKey: string, snakeKey: string) {
  const record = event as unknown as Record<string, unknown>;
  const value = record[camelKey] ?? record[snakeKey];
  return typeof value === "string" && value.trim() ? value : undefined;
}
