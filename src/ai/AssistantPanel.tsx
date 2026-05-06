import { workspaceKindLabel } from "../connections/utils";
import { inspectActiveSshSystemContext } from "../terminal/TerminalWorkspace";
import { writeToClipboard } from "../lib/clipboard";
import {
  Bot,
  Camera,
  ChevronRight,
  Copy,
  FileImage,
  PanelRight,
  Plus,
  Puzzle,
  RefreshCw,
  ScrollText,
  SendHorizontal,
  Settings,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { dialogButtonAria, menuButtonAria } from "../lib/aria";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import {
  getAiProviderDefinition,
  modelSupportsImageInput,
  normalizeAiProviderDraft,
  validateAiProviderForChat,
} from "./providers";
import { useWorkspaceStore } from "../store";
import { writeInputToPane } from "../workspace/paneRegistry";
import i18next from "../i18n/config";

function resolveAssistantOutputLanguage(outputLanguage: string): string | undefined {
  if (!outputLanguage) {
    const uiCode = i18next.language || "en";
    const name = i18next.t(`languages.${uiCode}`);
    return name && name !== `languages.${uiCode}` ? name : undefined;
  }
  return outputLanguage;
}

type AssistantChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  imageAttachments?: AssistantImageAttachment[];
  intent?: AssistantPromptIntent;
  createdAt: string;
};

type AssistantChatThread = {
  id: string;
  title: string;
  contextLabel: string;
  messages: AssistantChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type AssistantPromptIntent = "chat" | "extensionCreation";

type AssistantImageAttachment = {
  id: string;
  sourceLabel: string;
  imageDataUrl: string;
  width: number;
  height: number;
};

const EXTENSION_DRAFT_PROMPT = "Create an AdminDeck extension draft for: ";
const ASSISTANT_IMAGE_MAX_EDGE = 1280;
const ASSISTANT_IMAGE_JPEG_QUALITY = 0.72;

function randomAssistantWaitingPhrase() {
  const phrases = i18next.t("ai.waitingPhrases", { returnObjects: true }) as readonly string[];
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return "Charging the answer beacon";
  }
  return phrases[Math.floor(Math.random() * phrases.length)] ?? "Charging the answer beacon";
}

function createAssistantChatMessage(
  role: AssistantChatMessage["role"],
  content: string,
  intent?: AssistantPromptIntent,
  imageAttachments?: AssistantImageAttachment[],
): AssistantChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    imageAttachments,
    intent,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantChatThreadId() {
  return `assistant-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function assistantThreadTitle(messages: AssistantChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || i18next.t("ai.newChat");
  return title.length > 56 ? `${title.slice(0, 53)}...` : title;
}

function assistantThreadPreview(thread: AssistantChatThread) {
  const lastMessage = thread.messages[thread.messages.length - 1];
  const preview = lastMessage?.content.trim().replace(/\s+/g, " ") || i18next.t("ai.noMessages");
  return preview.length > 64 ? `${preview.slice(0, 61)}...` : preview;
}

function sanitizeAssistantThreadTitle(value: string) {
  const title = value
    .trim()
    .split(/\r?\n/)[0]
    ?.replace(/^title:\s*/i, "")
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!title) {
    return "";
  }
  return title.length > 56 ? `${title.slice(0, 53)}...` : title;
}

function formatAssistantMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  return `${hour12}:${minutes}${period}`;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("image paste did not produce a data URL"));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("failed to read pasted image"));
    });
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("failed to load image")));
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { dataUrl, width: 0, height: 0 };
  }

  const scale = Math.min(1, ASSISTANT_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return { dataUrl, width: sourceWidth, height: sourceHeight };
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", ASSISTANT_IMAGE_JPEG_QUALITY),
    width,
    height,
  };
}

async function createImageAttachment(
  sourceLabel: string,
  dataUrl: string,
): Promise<AssistantImageAttachment> {
  const compressed = await compressImageDataUrl(dataUrl);
  return {
    id: `assistant-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceLabel,
    imageDataUrl: compressed.dataUrl,
    width: compressed.width,
    height: compressed.height,
  };
}

function normalizeImageAttachments(value: unknown): AssistantImageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AssistantImageAttachment>;
    if (
      typeof candidate.sourceLabel !== "string" ||
      !candidate.sourceLabel.trim() ||
      typeof candidate.imageDataUrl !== "string" ||
      !candidate.imageDataUrl.startsWith("data:image/")
    ) {
      return [];
    }
    return [
      {
        id:
          typeof candidate.id === "string" && candidate.id
            ? candidate.id
            : `assistant-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceLabel: candidate.sourceLabel.trim(),
        imageDataUrl: candidate.imageDataUrl,
        width: typeof candidate.width === "number" ? candidate.width : 0,
        height: typeof candidate.height === "number" ? candidate.height : 0,
      },
    ];
  });
}

function sortedAssistantThreads(threads: AssistantChatThread[]) {
  return [...threads].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function upsertAssistantChatThread(
  threads: AssistantChatThread[],
  thread: AssistantChatThread,
) {
  const withoutThread = threads.filter((item) => item.id !== thread.id);
  return sortedAssistantThreads([thread, ...withoutThread]);
}

function assistantIntentForPrompt(
  activeIntent: AssistantPromptIntent,
  prompt: string,
): AssistantPromptIntent {
  if (activeIntent === "extensionCreation") {
    return activeIntent;
  }

  const normalized = prompt.toLowerCase();
  const asksForExtension =
    /\b(extension|plugin|addon|add-on)\b/.test(normalized) &&
    /\b(create|build|generate|write|draft|scaffold|make)\b/.test(normalized);
  return asksForExtension ? "extensionCreation" : "chat";
}

function readAssistantChatHistory(): AssistantChatThread[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const rawHistory = window.localStorage.getItem(ASSISTANT_CHAT_HISTORY_KEY);
    if (!rawHistory) {
      return [];
    }
    const parsed = JSON.parse(rawHistory);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap(normalizeAssistantChatThread);
  } catch {
    return [];
  }
}

function writeAssistantChatHistory(threads: AssistantChatThread[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ASSISTANT_CHAT_HISTORY_KEY, JSON.stringify(threads));
}

function normalizeAssistantChatThread(value: unknown): AssistantChatThread[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const candidate = value as Partial<AssistantChatThread>;
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.flatMap(normalizeAssistantChatMessage)
    : [];
  if (messages.length === 0) {
    return [];
  }
  const createdAt = normalizeDateString(candidate.createdAt) ?? messages[0].createdAt;
  const updatedAt =
    normalizeDateString(candidate.updatedAt) ?? messages[messages.length - 1].createdAt;
  return [
    {
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : createAssistantChatThreadId(),
      title:
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim()
          : assistantThreadTitle(messages),
      contextLabel:
        typeof candidate.contextLabel === "string" && candidate.contextLabel.trim()
          ? candidate.contextLabel.trim()
          : i18next.t("ai.workspace"),
      messages,
      createdAt,
      updatedAt,
    },
  ];
}

function normalizeAssistantChatMessage(value: unknown): AssistantChatMessage[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const candidate = value as Partial<AssistantChatMessage>;
  if (candidate.role !== "assistant" && candidate.role !== "user") {
    return [];
  }
  if (typeof candidate.content !== "string" || !candidate.content.trim()) {
    return [];
  }
  return [
    {
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `${candidate.role}-${Date.now()}`,
      role: candidate.role,
      content: candidate.content,
      imageAttachments: normalizeImageAttachments(candidate.imageAttachments),
      intent:
        candidate.intent === "chat" || candidate.intent === "extensionCreation"
          ? candidate.intent
          : undefined,
      createdAt: normalizeDateString(candidate.createdAt) ?? new Date().toISOString(),
    },
  ];
}

function normalizeDateString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const ASSISTANT_CHAT_HISTORY_KEY = "admindeck.aiAssistant.chatHistory.v1";

export function AssistantPanel({
  onOpenSettings,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const assistantContextSnippet = useWorkspaceStore((state) => state.assistantContextSnippet);
  const clearAssistantContextSnippet = useWorkspaceStore(
    (state) => state.clearAssistantContextSnippet,
  );
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const aiProviderHasApiKey = useWorkspaceStore((state) => state.aiProviderHasApiKey);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState(createAssistantChatThreadId);
  const [currentThreadTitle, setCurrentThreadTitle] = useState<string | undefined>();
  const [chatHistory, setChatHistory] = useState<AssistantChatThread[]>(readAssistantChatHistory);
  const [showAllChats, setShowAllChats] = useState(false);
  const [chatError, setChatError] = useState("");
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [assistantIntent, setAssistantIntent] = useState<AssistantPromptIntent>("chat");
  const [waitingPhrase, setWaitingPhrase] = useState("");
  const [waitingDots, setWaitingDots] = useState(0);
  const [addContextMenuOpen, setAddContextMenuOpen] = useState(false);
  const [pastedImageContexts, setPastedImageContexts] = useState<AssistantImageAttachment[]>([]);
  const [imagePasteRejected, setImagePasteRejected] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const addContextMenuRef = useRef<HTMLDivElement | null>(null);
  const activeAssistantRequestIdRef = useRef(0);
  const contextLabel = activeTab
    ? `${activeTab.title} - ${workspaceKindLabel(activeTab)}`
    : t("ai.noActiveSession");
  const connectionLabel = activeTab?.connection
    ? `${activeTab.connection.user}@${activeTab.connection.host}`
    : t("ai.workspace");
  const providerDefinition = getAiProviderDefinition(aiProviderSettings.providerKind);
  const currentModel = aiProviderSettings.model || providerDefinition.defaultModel;
  const modelOptionIds = useMemo(
    () => new Set(providerDefinition.modelOptions.map((model) => model.id)),
    [providerDefinition],
  );
  const hasCustomModel = currentModel.trim().length > 0 && !modelOptionIds.has(currentModel);
  const currentModelSupportsImageInput = modelSupportsImageInput(
    providerDefinition,
    currentModel,
  );
  const assistantScreenshotContext =
    assistantContextSnippet?.kind === "screenshot"
      ? {
          sourceLabel: assistantContextSnippet.sourceLabel,
          dataUrl: assistantContextSnippet.imageDataUrl,
        }
      : undefined;
  const hasPendingImageContext = pastedImageContexts.length > 0 || Boolean(assistantScreenshotContext);
  const showImageNotSupportedNotice =
    !currentModelSupportsImageInput && (hasPendingImageContext || imagePasteRejected);
  const activeTerminalPaneId =
    activeTab?.kind === "terminal" ? activeTab.focusedPaneId ?? activeTab.panes[0]?.id : undefined;
  const sortedChatHistory = useMemo(() => sortedAssistantThreads(chatHistory), [chatHistory]);
  const recentChatHistory = sortedChatHistory.slice(0, 5);
  const shouldShowChatHistory = messages.length === 0 && !prompt.trim() && !isSendingPrompt;

  useEffect(() => {
    writeAssistantChatHistory(chatHistory);
  }, [chatHistory]);

  useEffect(() => {
    if (currentModelSupportsImageInput) {
      setImagePasteRejected(false);
    }
  }, [currentModelSupportsImageInput]);

  useEffect(() => {
    if (!isSendingPrompt) {
      setWaitingDots(0);
      return;
    }

    const interval = window.setInterval(() => {
      setWaitingDots((current) => (current + 1) % 4);
    }, 300);

    return () => {
      window.clearInterval(interval);
    };
  }, [isSendingPrompt]);

  useEffect(() => {
    if (!isSendingPrompt) {
      return;
    }

    const interval = window.setInterval(() => {
      setWaitingPhrase(randomAssistantWaitingPhrase());
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isSendingPrompt]);

  useEffect(() => {
    if (!addContextMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const node = addContextMenuRef.current;
      if (node && !node.contains(event.target as Node)) {
        setAddContextMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddContextMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addContextMenuOpen]);

  function handleSendCodeToTerminal(code: string) {
    if (!activeTerminalPaneId) {
      return;
    }

    const data = code.endsWith("\n") ? code : `${code}\n`;
    writeInputToPane(activeTerminalPaneId, data);
  }

  function handleChatSubmit(event: FormEvent) {
    event.preventDefault();
    void submitAssistantPrompt();
  }

  function handleStopAssistantPrompt() {
    if (!isSendingPrompt) {
      return;
    }

    activeAssistantRequestIdRef.current += 1;
    setIsSendingPrompt(false);
    setWaitingPhrase("");
    setWaitingDots(0);
    setChatError("");
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  }

  function handleNewChat() {
    if (isSendingPrompt) {
      return;
    }
    saveCurrentChat();
    setMessages([]);
    setCurrentThreadId(createAssistantChatThreadId());
    setCurrentThreadTitle(undefined);
    setPrompt("");
    setChatError("");
    setWaitingPhrase("");
    setPastedImageContexts([]);
    setImagePasteRejected(false);
    setAssistantIntent("chat");
    setShowAllChats(false);
  }

  function saveCurrentChat() {
    if (messages.length === 0) {
      return;
    }
    saveChatMessages(messages, currentThreadTitle ?? assistantThreadTitle(messages));
  }

  function saveChatMessages(nextMessages: AssistantChatMessage[], title: string) {
    if (nextMessages.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    const thread: AssistantChatThread = {
      id: currentThreadId,
      title,
      contextLabel,
      messages: nextMessages,
      createdAt: nextMessages[0]?.createdAt ?? now,
      updatedAt: nextMessages[nextMessages.length - 1]?.createdAt ?? now,
    };
    setChatHistory((current) => upsertAssistantChatThread(current, thread));
  }

  function resumeChat(thread: AssistantChatThread) {
    if (isSendingPrompt) {
      return;
    }
    saveCurrentChat();
    setCurrentThreadId(thread.id);
    setCurrentThreadTitle(thread.title);
    setMessages(thread.messages);
    setPrompt("");
    setChatError("");
    setWaitingPhrase("");
    setPastedImageContexts([]);
    setImagePasteRejected(false);
    setAssistantIntent("chat");
    setShowAllChats(false);
  }

  function deleteChat(threadId: string) {
    setChatHistory((current) => current.filter((thread) => thread.id !== threadId));
    if (threadId === currentThreadId) {
      setMessages([]);
      setCurrentThreadId(createAssistantChatThreadId());
      setCurrentThreadTitle(undefined);
      setPrompt("");
      setChatError("");
      setWaitingPhrase("");
      setPastedImageContexts([]);
      setImagePasteRejected(false);
      setAssistantIntent("chat");
    }
  }

  async function handleCopyMessage(message: AssistantChatMessage) {
    await writeToClipboard(message.content);
  }

  async function handleCopyCode(code: string) {
    await writeToClipboard(code);
  }

  async function handleModelChange(model: string) {
    const previousSettings = aiProviderSettings;
    const nextSettings = normalizeAiProviderDraft({
      ...previousSettings,
      model,
    });
    setAiProviderSettings(nextSettings);
    setChatError("");

    if (!isTauriRuntime()) {
      return;
    }

    try {
      const saved = await invokeCommand("update_ai_provider_settings", {
        request: nextSettings,
      });
      setAiProviderSettings(saved);
    } catch (error) {
      setAiProviderSettings(previousSettings);
      setChatError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleStartExtensionDraft() {
    if (isSendingPrompt) {
      return;
    }

    setAddContextMenuOpen(false);
    setAssistantIntent("extensionCreation");
    if (!prompt.trim()) {
      setPrompt(EXTENSION_DRAFT_PROMPT);
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
        composerTextareaRef.current?.setSelectionRange(
          EXTENSION_DRAFT_PROMPT.length,
          EXTENSION_DRAFT_PROMPT.length,
        );
      });
    } else {
      composerTextareaRef.current?.focus();
    }
  }

  function handleStubContextOption(label: string) {
    setAddContextMenuOpen(false);
    void label;
    composerTextareaRef.current?.focus();
  }

  async function generateThreadTitleFromProvider(
    userPrompt: string,
    requestIntent: AssistantPromptIntent,
  ) {
    const response = await invokeCommand("run_ai_agent", {
      request: {
        prompt:
          "Create a concise chat title for this user request. Return only the title, no quotes, no markdown, maximum 8 words.\n\nUser request:\n" +
          userPrompt,
        contextLabel,
        intent: requestIntent,
        messages: [],
        outputLanguage: resolveAssistantOutputLanguage(aiProviderSettings.outputLanguage),
      },
    });
    return sanitizeAssistantThreadTitle(response.content);
  }

  async function submitAssistantPrompt() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || isSendingPrompt) {
      return;
    }
    const requestIntent = assistantIntentForPrompt(assistantIntent, normalizedPrompt);
    setAssistantIntent(requestIntent);
    let imageAttachments: AssistantImageAttachment[] = [];
    if (currentModelSupportsImageInput) {
      imageAttachments = [...pastedImageContexts];
      if (assistantScreenshotContext) {
        try {
          imageAttachments = [
            ...imageAttachments,
            await createImageAttachment(
              assistantScreenshotContext.sourceLabel,
              assistantScreenshotContext.dataUrl,
            ),
          ];
        } catch (error) {
          setChatError(error instanceof Error ? error.message : String(error));
          return;
        }
      }
    }
    const userMessage = createAssistantChatMessage(
      "user",
      normalizedPrompt,
      requestIntent,
      imageAttachments.length > 0 ? imageAttachments : undefined,
    );
    const previousMessages = messages;
    const nextMessages = [...previousMessages, userMessage];
    const isFirstThreadMessage = previousMessages.length === 0;
    const fallbackTitle = currentThreadTitle ?? assistantThreadTitle(nextMessages);
    try {
      validateAiProviderForChat(aiProviderSettings, aiProviderHasApiKey);
    } catch (error) {
      const assistantMessage = createAssistantChatMessage(
        "assistant",
        `${t("ai.providerError")}: ${error instanceof Error ? error.message : String(error)}`,
        requestIntent,
      );
      const failedMessages = [...nextMessages, assistantMessage];
      setMessages(failedMessages);
      setCurrentThreadTitle(fallbackTitle);
      saveChatMessages(failedMessages, fallbackTitle);
      setPrompt("");
      setPastedImageContexts([]);
      setImagePasteRejected(false);
      if (assistantContextSnippet?.kind === "screenshot") {
        clearAssistantContextSnippet();
      }
      setChatError("");
      return;
    }

    const history = previousMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    setMessages(nextMessages);
    setCurrentThreadTitle(fallbackTitle);
    saveChatMessages(nextMessages, fallbackTitle);
    setPrompt("");
    setPastedImageContexts([]);
    setImagePasteRejected(false);
    if (assistantContextSnippet?.kind === "screenshot") {
      clearAssistantContextSnippet();
    }
    setChatError("");
    setWaitingPhrase(randomAssistantWaitingPhrase());
    setIsSendingPrompt(true);
    const requestId = activeAssistantRequestIdRef.current + 1;
    activeAssistantRequestIdRef.current = requestId;
    let threadTitle = fallbackTitle;
    try {
      if (isFirstThreadMessage) {
        const generatedTitle = await generateThreadTitleFromProvider(normalizedPrompt, requestIntent);
        if (activeAssistantRequestIdRef.current !== requestId) {
          return;
        }
        if (generatedTitle) {
          threadTitle = generatedTitle;
          setCurrentThreadTitle(generatedTitle);
          saveChatMessages(nextMessages, generatedTitle);
        }
      }

      const systemContext = await inspectActiveSshSystemContext(activeTab);
      if (activeAssistantRequestIdRef.current !== requestId) {
        return;
      }

      const response = await invokeCommand("run_ai_agent", {
        request: {
          prompt: normalizedPrompt,
          contextLabel,
          intent: requestIntent,
          selectedOutput:
            assistantContextSnippet?.kind === "text" ? assistantContextSnippet.text : undefined,
          screenshots: imageAttachments.map((attachment) => ({
            sourceLabel: attachment.sourceLabel,
            dataUrl: attachment.imageDataUrl,
          })),
          systemContext,
          messages: history,
          outputLanguage: resolveAssistantOutputLanguage(aiProviderSettings.outputLanguage),
        },
      });
      if (activeAssistantRequestIdRef.current !== requestId) {
        return;
      }

      const assistantMessage = createAssistantChatMessage(
        "assistant",
        response.content,
        requestIntent,
      );
      const completedMessages = [...nextMessages, assistantMessage];
      setMessages(completedMessages);
      saveChatMessages(completedMessages, threadTitle);
    } catch (error) {
      if (activeAssistantRequestIdRef.current !== requestId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setChatError(message);
      const failedMessages = [
        ...nextMessages,
        createAssistantChatMessage("assistant", `${t("ai.errorPrefix")}: ${message}`, requestIntent),
      ];
      setMessages(failedMessages);
      saveChatMessages(failedMessages, threadTitle);
    } finally {
      if (activeAssistantRequestIdRef.current === requestId) {
        setIsSendingPrompt(false);
        setWaitingPhrase("");
      }
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") {
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const nextPrompt = `${prompt.slice(0, selectionStart)}\n${prompt.slice(selectionEnd)}`;
      const nextCaret = selectionStart + 1;
      setPrompt(nextPrompt);
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      });
      return;
    }

    if (event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    void submitAssistantPrompt();
  }

  async function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardFiles = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    const imageFiles =
      clipboardFiles.length > 0
        ? clipboardFiles
        : Array.from(event.clipboardData.items).flatMap((item) => {
            if (!item.type.startsWith("image/")) {
              return [];
            }
            const file = item.getAsFile();
            return file ? [file] : [];
          });
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    if (!currentModelSupportsImageInput) {
      setImagePasteRejected(true);
      return;
    }

    try {
      const attachments = await Promise.all(
        imageFiles.map(async (imageFile, index) => {
          const dataUrl = await readImageFileAsDataUrl(imageFile);
          const attachment = await createImageAttachment(t("ai.pastedImageSource"), dataUrl);
          return imageFiles.length === 1
            ? attachment
            : {
                ...attachment,
                sourceLabel: t("ai.pastedImageSourceWithNumber", { number: index + 1 }),
              };
        }),
      );
      setPastedImageContexts((current) => [...current, ...attachments]);
      setImagePasteRejected(false);
    } catch (error) {
      setImagePasteRejected(true);
      setChatError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-topbar">
        <h2>{t("ai.title")}</h2>
        <button
          aria-label={t("ai.refresh")}
          className="assistant-toolbar-button"
          title={t("ai.refresh")}
          type="button"
        >
          <RefreshCw size={16} />
        </button>
        <button
          aria-label={t("ai.settings")}
          className="assistant-toolbar-button"
          onClick={onOpenSettings}
          title={t("ai.settings")}
          type="button"
        >
          <Settings size={16} />
        </button>
        <button
          aria-label={t("ai.newAiChat")}
          className="assistant-toolbar-button"
          disabled={isSendingPrompt}
          onClick={handleNewChat}
          title={t("ai.newChat")}
          type="button"
        >
          <Plus size={16} />
        </button>
        <button
          aria-label={t("ai.collapsePanel")}
          className="assistant-toolbar-button"
          onClick={onToggleCollapsed}
          title={t("ai.collapsePanel")}
          type="button"
        >
          <PanelRight size={17} />
        </button>
      </div>

      <div className="assistant-context active-session-hint">
        <Bot size={16} />
        <span>
          <strong>{contextLabel}</strong>
          <small>{connectionLabel}</small>
        </span>
      </div>

      {assistantIntent === "extensionCreation" ? (
        <div className="assistant-context assistant-extension-context">
          <Plus size={16} />
          <span>
            <strong>{t("ai.extensionDraft")}</strong>
            <small>{t("ai.extensionReviewOnly")}</small>
          </span>
        </div>
      ) : null}

      {shouldShowChatHistory ? (
        <section className={`assistant-tasks${showAllChats ? " assistant-chat-history-panel" : ""}`}>
          <header>
            <span>{showAllChats ? t("ai.allChats") : t("ai.chats")}</span>
            {showAllChats ? (
              <button
                className="assistant-toolbar-button"
                onClick={() => setShowAllChats(false)}
                type="button"
                aria-label={t("ai.closeChatHistory")}
                title={t("ai.close")}
              >
                <X size={15} />
              </button>
            ) : (
              <button
                className="assistant-view-all-button"
                disabled={sortedChatHistory.length === 0}
                onClick={() => setShowAllChats(true)}
                type="button"
              >
                {t("ai.viewAll")}({sortedChatHistory.length})
              </button>
            )}
          </header>
          {showAllChats ? (
            <div className="assistant-chat-history-list">
              {sortedChatHistory.map((thread) => (
                <div className="assistant-chat-history-row-wrap" key={thread.id}>
                  <button
                    className="assistant-chat-history-row"
                    onClick={() => resumeChat(thread)}
                    type="button"
                  >
                    <strong>{thread.title}</strong>
                    <span>{assistantThreadPreview(thread)}</span>
                    <small>{formatAssistantMessageTime(thread.updatedAt)}</small>
                  </button>
                  <button
                    aria-label={t("ai.deleteChat", { title: thread.title })}
                    className="assistant-chat-history-delete"
                    onClick={() => deleteChat(thread.id)}
                    title={t("ai.deleteChat", { title: thread.title })}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : recentChatHistory.length > 0 ? (
            recentChatHistory.map((thread) => (
              <button
                className="assistant-task-row"
                key={thread.id}
                onClick={() => resumeChat(thread)}
                type="button"
              >
                <span>{thread.title}</span>
                <small>{formatAssistantMessageTime(thread.updatedAt)}</small>
              </button>
            ))
          ) : (
            <p>{t("ai.noChatsYet")}</p>
          )}
        </section>
      ) : null}

      <div className={`assistant-chat-log${showAllChats && shouldShowChatHistory ? " assistant-chat-log-condensed" : ""}`}>
        {messages.map((message) => (
          <AssistantMessageView
            key={message.id}
            message={message}
            onCopyCode={handleCopyCode}
            onCopyMessage={handleCopyMessage}
            onSendCode={handleSendCodeToTerminal}
          />
        ))}
        {isSendingPrompt ? (
          <article className="assistant-message assistant-waiting" aria-live="polite">
            <span className="assistant-spinner" aria-hidden="true" />
            <span>{waitingPhrase || t("ai.chargingBeacon")}<span className="assistant-waiting-dots" aria-hidden="true">{".".repeat(waitingDots)}</span></span>
          </article>
        ) : null}
      </div>

      {chatError ? <p className="form-error">{chatError}</p> : null}

      <form className="assistant-chat-composer" onSubmit={handleChatSubmit}>
        {assistantContextSnippet ? (
          <section className="assistant-selection-context">
            <header>
              <span>{assistantContextSnippet.sourceLabel}</span>
              <button
                className="row-action"
                aria-label={t("ai.clearContext")}
                onClick={clearAssistantContextSnippet}
                title={t("ai.clearContext")}
                type="button"
              >
                <X size={13} />
              </button>
            </header>
            {assistantContextSnippet.kind === "screenshot" ? (
              <div className="assistant-screenshot-context">
                <img alt={assistantContextSnippet.sourceLabel} src={assistantContextSnippet.imageDataUrl} />
                <small>
                  {assistantContextSnippet.width} x {assistantContextSnippet.height}
                </small>
              </div>
            ) : (
              <pre>
                <code>{assistantContextSnippet.text}</code>
              </pre>
            )}
          </section>
        ) : null}
        {pastedImageContexts.length > 0 ? (
          <section className="assistant-selection-context">
            <header>
              <span>{t("ai.pastedImages", { count: pastedImageContexts.length })}</span>
              <button
                className="row-action"
                aria-label={t("ai.clearContext")}
                onClick={() => {
                  setPastedImageContexts([]);
                  setImagePasteRejected(false);
                }}
                title={t("ai.clearContext")}
                type="button"
              >
                <X size={13} />
              </button>
            </header>
            <div className="assistant-attachment-preview-grid">
              {pastedImageContexts.map((image) => (
                <figure className="assistant-attachment-preview" key={image.id}>
                  <img alt={image.sourceLabel} src={image.imageDataUrl} />
                  <figcaption>
                    <span>{image.sourceLabel}</span>
                    <small>
                      {image.width} x {image.height}
                    </small>
                  </figcaption>
                  <button
                    aria-label={t("ai.removeImageAttachment", { label: image.sourceLabel })}
                    className="assistant-attachment-remove"
                    onClick={() =>
                      setPastedImageContexts((current) =>
                        current.filter((attachment) => attachment.id !== image.id),
                      )
                    }
                    title={t("ai.removeImageAttachment", { label: image.sourceLabel })}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
        {showImageNotSupportedNotice ? (
          <p className="assistant-image-support-notice" role="status">
            {t("ai.imageInputNotSupported")}
          </p>
        ) : null}
        <textarea
          ref={composerTextareaRef}
          onKeyDown={handleComposerKeyDown}
          onPaste={(event) => void handleComposerPaste(event)}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          disabled={isSendingPrompt}
          placeholder={t("ai.composerPlaceholder")}
          rows={3}
          value={prompt}
        />
        <div className="assistant-composer-footer">
          <div className="assistant-add-menu-wrapper" ref={addContextMenuRef}>
            <button
              {...menuButtonAria(addContextMenuOpen)}
              className="assistant-plus-button"
              disabled={isSendingPrompt}
              onClick={() => setAddContextMenuOpen((open) => !open)}
              type="button"
              aria-label={t("ai.addContext")}
              title={t("ai.addContext")}
            >
              <Plus size={18} />
            </button>
            {addContextMenuOpen ? (
              <div className="assistant-add-menu" role="menu" aria-label={t("ai.addContext")}>
                <button
                  className="assistant-add-menu-item"
                  onClick={() => handleStubContextOption(t("ai.addFiles"))}
                  role="menuitem"
                  type="button"
                >
                  <FileImage size={15} />
                  {t("ai.addFiles")}
                </button>
                <button
                  className="assistant-add-menu-item"
                  onClick={() => handleStubContextOption(t("ai.addScreenshot"))}
                  role="menuitem"
                  type="button"
                >
                  <Camera size={15} />
                  {t("ai.addScreenshot")}
                </button>
                <button
                  className="assistant-add-menu-item"
                  onClick={() => handleStubContextOption(t("ai.addTerminalBuffer"))}
                  role="menuitem"
                  type="button"
                >
                  <ScrollText size={15} />
                  {t("ai.addTerminalBuffer")}
                </button>
                <div className="assistant-add-menu-submenu">
                  <button
                    aria-haspopup="menu"
                    className="assistant-add-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <Puzzle size={15} />
                    {t("ai.extensions")}
                    <ChevronRight className="assistant-add-menu-chevron" size={13} />
                  </button>
                  <div className="assistant-add-menu assistant-add-menu-submenu-panel" role="menu">
                    <button
                      aria-checked={assistantIntent === "extensionCreation" ? "true" : "false"}
                      className="assistant-add-menu-item"
                      onClick={handleStartExtensionDraft}
                      role="menuitemcheckbox"
                      type="button"
                    >
                      <Plus size={14} />
                      {t("ai.draftExtension")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <select
            aria-label={t("settings.model")}
            className="assistant-model-select"
            disabled={isSendingPrompt}
            onChange={(event) => void handleModelChange(event.currentTarget.value)}
            title={t("settings.model")}
            value={currentModel}
          >
            {hasCustomModel ? <option value={currentModel}>{currentModel}</option> : null}
            {providerDefinition.modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <button
            aria-label={isSendingPrompt ? t("ai.stopMessage") : t("ai.sendMessage")}
            className="assistant-send-button"
            data-state={isSendingPrompt ? "stopping" : "sending"}
            disabled={!isSendingPrompt && !prompt.trim()}
            onClick={isSendingPrompt ? handleStopAssistantPrompt : undefined}
            title={isSendingPrompt ? t("ai.stopMessage") : t("ai.sendMessage")}
            type={isSendingPrompt ? "button" : "submit"}
          >
            {isSendingPrompt ? <Square fill="currentColor" size={13} /> : <SendHorizontal size={18} />}
          </button>
        </div>
      </form>
    </aside>
  );
}

function AssistantMessageView({
  message,
  onCopyCode,
  onCopyMessage,
  onSendCode,
}: {
  message: AssistantChatMessage;
  onCopyCode: (code: string) => void;
  onCopyMessage: (message: AssistantChatMessage) => void;
  onSendCode: (code: string) => void;
}) {
  const { t } = useTranslation();
  const userMessageLineCount = message.role === "user" ? message.content.split(/\r?\n/).length : 0;
  const shouldTruncateUserMessage = message.role === "user" && userMessageLineCount > 10;
  const canSendCode = message.intent !== "extensionCreation";
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);
  const [previewImage, setPreviewImage] = useState<AssistantImageAttachment | null>(null);

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    function handlePreviewKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    }

    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [previewImage]);

  return (
    <article className={`assistant-message ${message.role}`}>
      <div className="assistant-message-content">
        <div
          className={`assistant-message-bubble${shouldTruncateUserMessage && !isUserMessageExpanded ? " assistant-message-bubble-truncated" : ""}`}
        >
          {message.imageAttachments?.length ? (
            <div className="assistant-message-attachments">
              {message.imageAttachments.map((image) => (
                <figure className="assistant-message-attachment" key={image.id}>
                  <button
                    {...dialogButtonAria(previewImage?.id === image.id)}
                    aria-label={t("ai.openImagePreview", { label: image.sourceLabel })}
                    className="assistant-message-attachment-button"
                    onClick={() => setPreviewImage(image)}
                    title={t("ai.openImagePreview", { label: image.sourceLabel })}
                    type="button"
                  >
                    <img alt={image.sourceLabel} src={image.imageDataUrl} />
                  </button>
                  <figcaption>
                    {image.sourceLabel} · {image.width} x {image.height}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <MarkdownContent
            canSendCode={canSendCode}
            content={message.content}
            onCopyCode={onCopyCode}
            onSendCode={onSendCode}
          />
        </div>
        <div className="assistant-message-actions">
          <time dateTime={message.createdAt}>{formatAssistantMessageTime(message.createdAt)}</time>
          <button
            aria-label={t("ai.copyMessage")}
            onClick={() => onCopyMessage(message)}
            title={t("ai.copyMessage")}
            type="button"
          >
            <Copy size={10} />
          </button>
        </div>
      </div>
      {shouldTruncateUserMessage ? (
        <button
          className="assistant-message-expand"
          onClick={() => setIsUserMessageExpanded((expanded) => !expanded)}
          type="button"
        >
          {isUserMessageExpanded ? t("ai.showLess") : t("ai.more")}
        </button>
      ) : null}
      {previewImage ? (
        <div
          className="assistant-image-preview-backdrop"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            aria-label={t("ai.imagePreviewTitle", { label: previewImage.sourceLabel })}
            className="assistant-image-preview-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <strong>{previewImage.sourceLabel}</strong>
                <small>
                  {previewImage.width} x {previewImage.height}
                </small>
              </div>
              <button
                aria-label={t("ai.close")}
                className="assistant-toolbar-button"
                onClick={() => setPreviewImage(null)}
                title={t("ai.close")}
                type="button"
              >
                <X size={15} />
              </button>
            </header>
            <img alt={previewImage.sourceLabel} src={previewImage.imageDataUrl} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

type MarkdownBlock =
  | { kind: "code"; code: string; language: string }
  | { kind: "text"; text: string };

function MarkdownContent({
  canSendCode,
  content,
  onCopyCode,
  onSendCode,
}: {
  canSendCode: boolean;
  content: string;
  onCopyCode: (code: string) => void;
  onSendCode: (code: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="markdown-content">
      {parseMarkdownBlocks(content).map((block, index) =>
        block.kind === "code" ? (
          <div className="markdown-code-block" key={`code-${index}`}>
            <div className="markdown-code-toolbar">
              <span>{block.language || t("ai.code")}</span>
              <div className="markdown-code-actions">
                <button
                  className="assistant-code-send"
                  onClick={() => onCopyCode(block.code)}
                  type="button"
                >
                  <Copy size={13} />
                  {t("ai.copy")}
                </button>
                <button
                  className="assistant-code-send"
                  disabled={!canSendCode}
                  onClick={() => onSendCode(block.code)}
                  title={
                    canSendCode
                      ? t("ai.sendToTerminal")
                      : t("ai.extensionReviewTooltip")
                  }
                  type="button"
                >
                  <Terminal size={13} />
                  {t("ai.send")}
                </button>
              </div>
            </div>
            <pre>
              <code>{block.code}</code>
            </pre>
          </div>
        ) : (
          <MarkdownTextBlock block={block.text} key={`text-${index}`} />
        ),
      )}
    </div>
  );
}

function MarkdownTextBlock({ block }: { block: string }) {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  if (/^#{1,3}\s+/.test(trimmed)) {
    return <h3>{renderInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ""), "heading")}</h3>;
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return (
      <ul>
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>
            {renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ""), `li-${index}`)}
          </li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => /^>\s?/.test(line.trim()))) {
    return (
      <blockquote>
        {renderInlineMarkdown(
          lines.map((line) => line.trim().replace(/^>\s?/, "")).join(" "),
          "blockquote",
        )}
      </blockquote>
    );
  }

  return <p>{renderInlineMarkdown(trimmed.replace(/\n+/g, " "), "paragraph")}</p>;
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const textBuffer: string[] = [];
  const codeBuffer: string[] = [];
  let codeLanguage = "";
  let inCodeBlock = false;

  function flushText() {
    if (textBuffer.length === 0) {
      return;
    }
    blocks.push({ kind: "text", text: textBuffer.join("\n") });
    textBuffer.length = 0;
  }

  function flushCode() {
    blocks.push({ kind: "code", code: codeBuffer.join("\n"), language: codeLanguage });
    codeBuffer.length = 0;
    codeLanguage = "";
  }

  for (const line of content.split(/\r?\n/)) {
    const fence = line.match(/^```\s*([A-Za-z0-9_+.-]*)\s*$/);
    if (fence) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushText();
        codeLanguage = fence[1] ?? "";
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
    } else if (line.trim() === "") {
      flushText();
    } else {
      textBuffer.push(line);
    }
  }

  if (inCodeBlock) {
    flushCode();
  }
  flushText();
  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
