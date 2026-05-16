export type AssistantScrollableLog = {
  scrollTop: number;
  scrollHeight: number;
};

export function scrollAssistantChatToBottom(log: AssistantScrollableLog | null) {
  if (!log) {
    return false;
  }

  log.scrollTop = log.scrollHeight;
  return true;
}
