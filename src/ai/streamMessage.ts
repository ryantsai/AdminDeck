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
      msg.workStartedAt = msg.workStartedAt ?? options.workStartedAt;
      msg.toolCalls = [
        ...(msg.toolCalls ?? []).filter((tc) => tc.toolId !== event.toolId),
        {
          toolId: event.toolId,
          toolName: event.toolName,
          status: "running",
          startedAt: options.now(),
        },
      ];
      break;
    case "toolCallEnd":
      msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
        tc.toolId === event.toolId
          ? {
              ...tc,
              toolName: event.toolName,
              status: "completed",
              error: event.error,
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
    content: response.content,
    reasoningContent: message.reasoningContent?.trim()
      ? message.reasoningContent
      : response.reasoningContent,
  };
}
