import { scrollAssistantChatToBottom } from "./assistantScroll.ts";

const chatLog = {
  scrollTop: 37,
  scrollHeight: 840,
};

if (!scrollAssistantChatToBottom(chatLog)) {
  throw new Error("Assistant chat scroll should report success when a log is present.");
}

if (chatLog.scrollTop !== chatLog.scrollHeight) {
  throw new Error("Assistant chat scroll should move the log to the bottom.");
}

if (scrollAssistantChatToBottom(null)) {
  throw new Error("Assistant chat scroll should report no-op when no log is present.");
}
