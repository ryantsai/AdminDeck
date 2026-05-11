import { ConnectionIcon } from "../connections/ConnectionIcon";
import { workspaceKindLabel } from "../connections/utils";
import { inspectActiveSshSystemContext } from "../terminal/TerminalWorkspace";
import { writeToClipboard } from "../lib/clipboard";
import {
  Bot,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  FileImage,
  LoaderCircle,
  PanelRight,
  Plus,
  RefreshCw,
  ScrollText,
  SendHorizontal,
  Settings,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { dialogButtonAria, menuButtonAria } from "../lib/aria";
import { invokeCommand, isTauriRuntime, openExternalUrl } from "../lib/tauri";
import type { AiStreamEvent, CaptureScreenshotRequest } from "../lib/tauri";
import {
  getAiProviderDefinition,
  modelSupportsImageInput,
  normalizeAiProviderDraft,
  validateAiProviderForChat,
} from "./providers";
import { useWorkspaceStore } from "../store";
import { getPaneRenderer, sendTextToRdpPane, writeInputToPane } from "../workspace/paneRegistry";
import i18next from "../i18n/config";
import { prepareAssistantTerminalInput } from "./terminalCommandSend";
import { marked, type Tokens } from "marked";
import { Channel } from "@tauri-apps/api/core";

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
  reasoningContent?: string;
  textAttachments?: AssistantTextAttachment[];
  imageAttachments?: AssistantImageAttachment[];
  fileAttachments?: AssistantFileAttachment[];
  intent?: AssistantPromptIntent;
  createdAt: string;
  toolCalls?: AssistantToolCallStatus[];
  workStartedAt?: string;
  workCompletedAt?: string;
  isStreaming?: boolean;
};

type AssistantToolCallStatus = {
  toolId: string;
  toolName: string;
  status: "running" | "completed";
  startedAt: string;
  endedAt?: string;
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

type AssistantTextAttachment = {
  id: string;
  sourceLabel: string;
  text: string;
  capturedAt: string;
};

type AssistantImageAttachment = {
  id: string;
  sourceLabel: string;
  imageDataUrl: string;
  width: number;
  height: number;
};

type AssistantFileAttachment = {
  id: string;
  sourceLabel: string;
  dataUrl: string;
  mimeType: string;
  size: number;
};

type ScreenshotRegionState = {
  bounds: DOMRect;
  pointerId?: number;
  start?: { x: number; y: number };
  current?: { x: number; y: number };
};

export interface AssistantPageContext {
  contextLabel: string;
  connectionLabel: string;
  sourceLabel: string;
  text: string;
}

const ASSISTANT_IMAGE_MAX_EDGE = 1280;
const ASSISTANT_IMAGE_JPEG_QUALITY = 0.72;
const ASSISTANT_FILE_MAX_BYTES = 10 * 1024 * 1024;

function randomAssistantWaitingPhrase() {
  const phrases = i18next.t("ai.waitingPhrases", { returnObjects: true }) as readonly string[];
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return i18next.t("ai.chargingBeacon");
  }
  return phrases[Math.floor(Math.random() * phrases.length)] ?? i18next.t("ai.chargingBeacon");
}

function createAssistantChatMessage(
  role: AssistantChatMessage["role"],
  content: string,
  intent?: AssistantPromptIntent,
  textAttachments?: AssistantTextAttachment[],
  imageAttachments?: AssistantImageAttachment[],
  fileAttachments?: AssistantFileAttachment[],
  reasoningContent?: string,
): AssistantChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    reasoningContent,
    textAttachments,
    imageAttachments,
    fileAttachments,
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
  const period = hours >= 12 ? i18next.t("common.pm") : i18next.t("common.am");
  return `${hour12}:${minutes} ${period}`;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return readFileAsDataUrl(file);
}

function readFileAsDataUrl(file: File): Promise<string> {
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

function normalizeFileAttachments(value: unknown): AssistantFileAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AssistantFileAttachment>;
    if (
      typeof candidate.sourceLabel !== "string" ||
      !candidate.sourceLabel.trim() ||
      typeof candidate.dataUrl !== "string" ||
      !candidate.dataUrl.startsWith("data:")
    ) {
      return [];
    }
    return [
      {
        id:
          typeof candidate.id === "string" && candidate.id
            ? candidate.id
            : `assistant-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceLabel: candidate.sourceLabel.trim(),
        dataUrl: candidate.dataUrl,
        mimeType:
          typeof candidate.mimeType === "string" && candidate.mimeType.trim()
            ? candidate.mimeType.trim()
            : "application/octet-stream",
        size: typeof candidate.size === "number" ? candidate.size : 0,
      },
    ];
  });
}

function normalizeTextAttachments(value: unknown): AssistantTextAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AssistantTextAttachment>;
    if (
      typeof candidate.sourceLabel !== "string" ||
      !candidate.sourceLabel.trim() ||
      typeof candidate.text !== "string" ||
      !candidate.text.trim()
    ) {
      return [];
    }
    return [
      {
        id:
          typeof candidate.id === "string" && candidate.id
            ? candidate.id
            : `assistant-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceLabel: candidate.sourceLabel.trim(),
        text: candidate.text,
        capturedAt: normalizeDateString(candidate.capturedAt) ?? new Date().toISOString(),
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
      reasoningContent: typeof candidate.reasoningContent === "string" && candidate.reasoningContent ? candidate.reasoningContent : undefined,
      textAttachments: normalizeTextAttachments(candidate.textAttachments),
      imageAttachments: normalizeImageAttachments(candidate.imageAttachments),
      fileAttachments: normalizeFileAttachments(candidate.fileAttachments),
      intent:
        candidate.intent === "chat" || candidate.intent === "extensionCreation"
          ? candidate.intent
          : undefined,
      createdAt: normalizeDateString(candidate.createdAt) ?? new Date().toISOString(),
      toolCalls: normalizeAssistantToolCalls(candidate.toolCalls),
      workStartedAt: normalizeDateString(candidate.workStartedAt),
      workCompletedAt: normalizeDateString(candidate.workCompletedAt),
    },
  ];
}

function normalizeAssistantToolCalls(value: unknown): AssistantToolCallStatus[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const calls: AssistantToolCallStatus[] = value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AssistantToolCallStatus>;
    if (
      typeof candidate.toolId !== "string" ||
      !candidate.toolId ||
      typeof candidate.toolName !== "string" ||
      !candidate.toolName
    ) {
      return [];
    }
    return [
      {
        toolId: candidate.toolId,
        toolName: candidate.toolName,
        status: candidate.status === "running" ? "running" : "completed",
        startedAt: normalizeDateString(candidate.startedAt) ?? new Date().toISOString(),
        endedAt: normalizeDateString(candidate.endedAt),
      },
    ];
  });
  return calls.length > 0 ? calls : undefined;
}

function normalizeDateString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const ASSISTANT_CHAT_HISTORY_KEY = "kkterm.aiAssistant.chatHistory.v1";

export function AssistantPanel({
  collapsed,
  onOpenSettings,
  onToggleCollapsed,
  pageContext,
}: {
  collapsed: boolean;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
  pageContext?: AssistantPageContext;
}) {
  const { t } = useTranslation();
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const requestRdpPreCapture = useWorkspaceStore((state) => state.requestRdpPreCapture);
  const assistantContextSnippet = useWorkspaceStore((state) => state.assistantContextSnippet);
  const setAssistantContextSnippet = useWorkspaceStore(
    (state) => state.setAssistantContextSnippet,
  );
  const clearAssistantContextSnippet = useWorkspaceStore(
    (state) => state.clearAssistantContextSnippet,
  );
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
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
  const [addContextMenuOpen, setAddContextMenuOpen] = useState(false);
  const [pastedImageContexts, setPastedImageContexts] = useState<AssistantImageAttachment[]>([]);
  const [fileContexts, setFileContexts] = useState<AssistantFileAttachment[]>([]);
  const [imagePasteRejected, setImagePasteRejected] = useState(false);
  const [screenshotRegionState, setScreenshotRegionState] =
    useState<ScreenshotRegionState | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addContextMenuRef = useRef<HTMLDivElement | null>(null);
  const regionTargetRef = useRef<HTMLDivElement | null>(null);
  const regionSelectionRef = useRef<HTMLDivElement | null>(null);
  const activeAssistantRequestIdRef = useRef(0);
  const wasCollapsedRef = useRef(collapsed);
  const workspaceContextLabel = activeTab
    ? `${activeTab.title} - ${workspaceKindLabel(activeTab)}`
    : t("ai.noActiveSession");
  const workspaceConnectionLabel = activeTab?.connection
    ? `${activeTab.connection.user}@${activeTab.connection.host}`
    : t("ai.workspace");
  const contextLabel = pageContext?.contextLabel ?? workspaceContextLabel;
  const connectionLabel = pageContext?.connectionLabel ?? workspaceConnectionLabel;
  const pageContextPayload =
    pageContext && pageContext.text.trim()
      ? {
          sourceLabel: pageContext.sourceLabel,
          text: pageContext.text,
        }
      : undefined;
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
    !pageContext && activeTab?.kind === "terminal"
      ? activeTab.focusedPaneId ?? activeTab.panes[0]?.id
      : undefined;
  const activeFocusedPane =
    activeTab?.kind === "terminal"
      ? activeTab.panes.find((pane) => pane.id === activeTerminalPaneId) ?? activeTab.panes[0]
      : undefined;
  const activeFocusedTerminalPane =
    activeFocusedPane?.kind === undefined || activeFocusedPane?.kind === "terminal"
      ? activeFocusedPane
      : undefined;
  const canAttachTerminalBuffer =
    Boolean(activeFocusedTerminalPane) &&
    (!activeFocusedTerminalPane?.connection ||
      activeFocusedTerminalPane.connection.type === "local" ||
      activeFocusedTerminalPane.connection.type === "ssh");
  const activeRdpPaneId =
    !pageContext && activeTab?.kind === "remoteDesktop" && activeTab.connection?.type === "rdp"
      ? activeTab.focusedPaneId ?? activeTab.panes[0]?.id
      : undefined;
  const sortedChatHistory = useMemo(() => sortedAssistantThreads(chatHistory), [chatHistory]);
  const recentChatHistory = sortedChatHistory.slice(0, 5);
  const shouldShowChatHistory = messages.length === 0 && !prompt.trim() && !isSendingPrompt;

  useEffect(() => {
    writeAssistantChatHistory(chatHistory);
  }, [chatHistory]);

  useEffect(() => {
    const wasCollapsed = wasCollapsedRef.current;
    wasCollapsedRef.current = collapsed;
    if (!wasCollapsed || collapsed || isSendingPrompt) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [collapsed, isSendingPrompt]);

  useEffect(() => {
    if (currentModelSupportsImageInput) {
      setImagePasteRejected(false);
    }
  }, [currentModelSupportsImageInput]);

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
    if (activeTerminalPaneId) {
      const data = prepareAssistantTerminalInput(code);
      writeInputToPane(activeTerminalPaneId, data);
      return;
    }

    if (activeRdpPaneId) {
      const trimmed = code.replace(/\r?\n$/, "");
      const send = sendTextToRdpPane(activeRdpPaneId, trimmed, true);
      if (send) {
        send.catch((error) => {
          setChatError(error instanceof Error ? error.message : String(error));
        });
      }
    }
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
    setPastedImageContexts([]);
    setFileContexts([]);
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
    setPastedImageContexts([]);
    setFileContexts([]);
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
      setPastedImageContexts([]);
      setFileContexts([]);
      setImagePasteRejected(false);
      setAssistantIntent("chat");
    }
  }

  async function handleCopyMessage(message: AssistantChatMessage) {
    const attachmentText =
      message.textAttachments
        ?.map((attachment) => `${attachment.sourceLabel}\n\n${attachment.text}`)
        .join("\n\n") ?? "";
    await writeToClipboard(
      attachmentText ? `${message.content}\n\n${attachmentText}` : message.content,
    );
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

  function handleAddFiles() {
    setAddContextMenuOpen(false);
    fileInputRef.current?.click();
  }

  async function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    try {
      const imageAttachments: AssistantImageAttachment[] = [];
      const fileAttachments: AssistantFileAttachment[] = [];
      for (const file of files) {
        if (file.size > ASSISTANT_FILE_MAX_BYTES) {
          showStatusBarNotice(t("ai.fileTooLarge", { name: file.name }), { tone: "warning" });
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        if (file.type.startsWith("image/")) {
          imageAttachments.push(await createImageAttachment(file.name, dataUrl));
          continue;
        }
        fileAttachments.push({
          id: `assistant-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sourceLabel: file.name,
          dataUrl,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      if (imageAttachments.length > 0) {
        setPastedImageContexts((current) => [...current, ...imageAttachments]);
      }
      if (fileAttachments.length > 0) {
        setFileContexts((current) => [...current, ...fileAttachments]);
      }
      setImagePasteRejected(false);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
    } finally {
      composerTextareaRef.current?.focus();
    }
  }

  function handleOpenAssistantLink(url: string) {
    openExternalUrl(url).catch((error) => {
      setChatError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleAddScreenshot() {
    setAddContextMenuOpen(false);
    if (activeTab?.kind === "remoteDesktop" && activeTab.connection?.type === "rdp") {
      requestRdpPreCapture();
    }
    setScreenshotRegionState({ bounds: appViewportBounds() });
  }

  async function handleAddTerminalBuffer() {
    setAddContextMenuOpen(false);
    const pane = activeFocusedTerminalPane;
    if (!pane) {
      return;
    }

    let text = "";
    if (pane.connection?.type === "ssh" && pane.tmuxSessionId) {
      try {
        text = await invokeCommand("capture_tmux_pane", {
          request: {
            host: pane.connection.host,
            user: pane.connection.user,
            port: pane.connection.port,
            keyPath: pane.connection.keyPath,
            proxyJump: pane.connection.proxyJump,
            authMethod: pane.connection.authMethod,
            secretOwnerId: pane.connection.id,
            tmuxSessionId: pane.tmuxSessionId,
            bufferLines: useWorkspaceStore.getState().sshSettings.bufferLines,
          },
        });
      } catch {
        text = getPaneRenderer(pane.id)?.getBufferText() ?? "";
      }
    } else {
      text = getPaneRenderer(pane.id)?.getBufferText() ?? "";
    }

    const trimmed = text.trim();
    if (!trimmed) {
      composerTextareaRef.current?.focus();
      return;
    }
    const sourceLabel = pane.connection
      ? `${pane.connection.name} ${t("terminal.terminalBuffer")}`
      : `${pane.title} ${t("terminal.terminalBuffer")}`;
    setAssistantContextSnippet({
      id: `terminal-buffer-${Date.now()}`,
      kind: "text",
      sourceLabel,
      text: trimmed,
      capturedAt: new Date().toISOString(),
    });
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
        pageContext: pageContextPayload,
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
    const textAttachments: AssistantTextAttachment[] =
      assistantContextSnippet?.kind === "text"
        ? [
            {
              id: assistantContextSnippet.id,
              sourceLabel: assistantContextSnippet.sourceLabel,
              text: assistantContextSnippet.text,
              capturedAt: assistantContextSnippet.capturedAt,
            },
          ]
        : [];
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
      textAttachments.length > 0 ? textAttachments : undefined,
      imageAttachments.length > 0 ? imageAttachments : undefined,
      fileContexts.length > 0 ? fileContexts : undefined,
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
      setFileContexts([]);
      setImagePasteRejected(false);
      if (assistantContextSnippet) {
        clearAssistantContextSnippet();
      }
      setChatError("");
      return;
    }

    const history = previousMessages.map((message) => ({
      role: message.role,
      content: message.content,
      reasoningContent: message.reasoningContent,
    }));
    setMessages(nextMessages);
    setCurrentThreadTitle(fallbackTitle);
    saveChatMessages(nextMessages, fallbackTitle);
    setPrompt("");
    setPastedImageContexts([]);
    setFileContexts([]);
    setImagePasteRejected(false);
    if (assistantContextSnippet) {
      clearAssistantContextSnippet();
    }
    setChatError("");
    setIsSendingPrompt(true);
    const requestId = activeAssistantRequestIdRef.current + 1;
    activeAssistantRequestIdRef.current = requestId;
    const workStartedAt = new Date().toISOString();
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

      const streamingMessage = createAssistantChatMessage(
        "assistant",
        "",
        requestIntent,
      );
      streamingMessage.isStreaming = true;
      streamingMessage.workStartedAt = workStartedAt;
      let streamingMessageSnapshot = streamingMessage;
      const messagesWithStreaming = [...nextMessages, streamingMessage];
      setMessages(messagesWithStreaming);

      const channel = new Channel<AiStreamEvent>();
      channel.onmessage = (event: AiStreamEvent) => {
        if (activeAssistantRequestIdRef.current !== requestId) {
          return;
        }
        setMessages((current) => {
          const lastIndex = current.length - 1;
          if (lastIndex < 0 || current[lastIndex].id !== streamingMessage.id) {
            return current;
          }
          const updated = [...current];
          const msg = { ...updated[lastIndex] };
          switch (event.type) {
            case "reasoningDelta":
              msg.reasoningContent = (msg.reasoningContent ?? "") + event.delta;
              break;
            case "contentDelta":
              msg.content += event.delta;
              break;
            case "toolCallStart":
              msg.workStartedAt = msg.workStartedAt ?? workStartedAt;
              msg.toolCalls = [
                ...(msg.toolCalls ?? []).filter((tc) => tc.toolId !== event.toolId),
                {
                  toolId: event.toolId,
                  toolName: event.toolName,
                  status: "running",
                  startedAt: new Date().toISOString(),
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
                      endedAt: new Date().toISOString(),
                    }
                  : tc,
              );
              break;
            case "done":
              msg.isStreaming = false;
              msg.workCompletedAt = new Date().toISOString();
              msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
                tc.status === "running"
                  ? { ...tc, status: "completed", endedAt: new Date().toISOString() }
                  : tc,
              );
              break;
            case "error":
              msg.isStreaming = false;
              msg.workCompletedAt = new Date().toISOString();
              if (!msg.content) {
                msg.content = `${t("ai.errorPrefix")}: ${event.message}`;
              }
              break;
          }
          updated[lastIndex] = msg;
          streamingMessageSnapshot = msg;
          return updated;
        });
      };

      await invokeCommand("run_ai_agent_streaming", {
        channel,
        request: {
          prompt: normalizedPrompt,
          contextLabel,
          intent: requestIntent,
          selectedOutput: textAttachments[0]?.text,
          pageContext: pageContextPayload,
          screenshots: imageAttachments.map((attachment) => ({
            sourceLabel: attachment.sourceLabel,
            dataUrl: attachment.imageDataUrl,
          })),
          files: fileContexts.map((attachment) => ({
            sourceLabel: attachment.sourceLabel,
            dataUrl: attachment.dataUrl,
            mimeType: attachment.mimeType,
          })),
          systemContext,
          messages: history,
          outputLanguage: resolveAssistantOutputLanguage(aiProviderSettings.outputLanguage),
        },
      });

      if (activeAssistantRequestIdRef.current !== requestId) {
        return;
      }

      const completedAt = new Date().toISOString();
      streamingMessageSnapshot = {
        ...streamingMessageSnapshot,
        isStreaming: false,
        workCompletedAt: completedAt,
        toolCalls: (streamingMessageSnapshot.toolCalls ?? []).map((tc) =>
          tc.status === "running" ? { ...tc, status: "completed", endedAt: completedAt } : tc,
        ),
      };
      setMessages((current) =>
        current.map((message) =>
          message.id === streamingMessage.id ? streamingMessageSnapshot : message,
        ),
      );
      saveChatMessages([...nextMessages, streamingMessageSnapshot], threadTitle);
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

  async function captureAssistantScreenshot(rect: CaptureScreenshotRequest) {
    if (!isTauriRuntime()) {
      showStatusBarNotice(t("workspace.screenshotsRequireRuntime"), { tone: "warning" });
      return;
    }

    try {
      await waitForScreenshotSurface();
      const screenshot = await invokeCommand("capture_screenshot_for_assistant", {
        request: rect,
      });
      setAssistantContextSnippet({
        id: `assistant-screenshot-${Date.now()}`,
        kind: "screenshot",
        sourceLabel: t("workspace.screenshot"),
        imageDataUrl: screenshot.dataUrl,
        width: screenshot.width,
        height: screenshot.height,
        capturedAt: new Date().toISOString(),
      });
      showStatusBarNotice(t("workspace.sentToAi"), { tone: "success" });
    } catch (error) {
      showStatusBarNotice(
        t("workspace.screenshotCaptureError", {
          message: error instanceof Error ? error.message : String(error),
        }),
        { tone: "error" },
      );
    } finally {
      composerTextareaRef.current?.focus();
    }
  }

  function handleScreenshotRegionPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !screenshotRegionState ||
      !pointInBounds(event.clientX, event.clientY, screenshotRegionState.bounds)
    ) {
      return;
    }
    const point = clampPointToBounds(
      event.clientX,
      event.clientY,
      screenshotRegionState.bounds,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setScreenshotRegionState({
      ...screenshotRegionState,
      pointerId: event.pointerId,
      start: point,
      current: point,
    });
  }

  function handleScreenshotRegionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !screenshotRegionState?.start ||
      screenshotRegionState.pointerId !== event.pointerId
    ) {
      return;
    }
    setScreenshotRegionState({
      ...screenshotRegionState,
      current: clampPointToBounds(
        event.clientX,
        event.clientY,
        screenshotRegionState.bounds,
      ),
    });
  }

  function handleScreenshotRegionPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !screenshotRegionState?.start ||
      screenshotRegionState.pointerId !== event.pointerId
    ) {
      return;
    }
    const current = clampPointToBounds(
      event.clientX,
      event.clientY,
      screenshotRegionState.bounds,
    );
    const rect = rectFromPoints(screenshotRegionState.start, current);
    setScreenshotRegionState(null);
    if (rect.width < 4 || rect.height < 4) {
      return;
    }
    void captureAssistantScreenshot(rect);
  }

  function handleScreenshotRegionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setScreenshotRegionState(null);
      composerTextareaRef.current?.focus();
    }
  }

  const screenshotSelectionRect =
    screenshotRegionState?.start && screenshotRegionState.current
      ? rectFromPoints(screenshotRegionState.start, screenshotRegionState.current)
      : null;

  useLayoutEffect(() => {
    const node = regionTargetRef.current;
    if (!node || !screenshotRegionState) {
      return;
    }

    node.style.height = `${screenshotRegionState.bounds.height}px`;
    node.style.left = `${screenshotRegionState.bounds.left}px`;
    node.style.top = `${screenshotRegionState.bounds.top}px`;
    node.style.width = `${screenshotRegionState.bounds.width}px`;
  }, [
    screenshotRegionState?.bounds.height,
    screenshotRegionState?.bounds.left,
    screenshotRegionState?.bounds.top,
    screenshotRegionState?.bounds.width,
  ]);

  useLayoutEffect(() => {
    const node = regionSelectionRef.current;
    if (!node || !screenshotSelectionRect) {
      return;
    }

    node.style.height = `${screenshotSelectionRect.height}px`;
    node.style.left = `${screenshotSelectionRect.x}px`;
    node.style.top = `${screenshotSelectionRect.y}px`;
    node.style.width = `${screenshotSelectionRect.width}px`;
  }, [
    screenshotSelectionRect?.height,
    screenshotSelectionRect?.width,
    screenshotSelectionRect?.x,
    screenshotSelectionRect?.y,
  ]);

  useEffect(() => {
    if (!screenshotRegionState) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      regionTargetRef.current?.parentElement?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screenshotRegionState]);

  const shouldShowPreStreamWaiting =
    isSendingPrompt && !messages.some((message) => message.role === "assistant" && message.isStreaming);

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
        {!pageContext && activeTab?.connection ? (
          <ConnectionIcon
            localShell={activeTab.connection.localShell}
            size={32}
            type={activeTab.connection.type}
          />
        ) : (
          <Bot size={16} />
        )}
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
            onOpenLink={handleOpenAssistantLink}
            onSendCode={handleSendCodeToTerminal}
          />
        ))}
        {shouldShowPreStreamWaiting ? (
          <article className="assistant-message assistant-waiting" aria-live="polite">
            <span className="assistant-spinner" aria-hidden="true" />
            <span>{t("ai.preparingResponse")}</span>
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
        {fileContexts.length > 0 ? (
          <section className="assistant-selection-context">
            <header>
              <span>{t("ai.attachedFiles", { count: fileContexts.length })}</span>
              <button
                className="row-action"
                aria-label={t("ai.clearContext")}
                onClick={() => setFileContexts([])}
                title={t("ai.clearContext")}
                type="button"
              >
                <X size={13} />
              </button>
            </header>
            <div className="assistant-file-attachment-list">
              {fileContexts.map((file) => (
                <div className="assistant-file-attachment" key={file.id}>
                  <FileImage size={14} />
                  <span>{file.sourceLabel}</span>
                  <small>{formatBytes(file.size)}</small>
                  <button
                    aria-label={t("ai.removeFileAttachment", { label: file.sourceLabel })}
                    className="assistant-attachment-remove"
                    onClick={() =>
                      setFileContexts((current) =>
                        current.filter((attachment) => attachment.id !== file.id),
                      )
                    }
                    title={t("ai.removeFileAttachment", { label: file.sourceLabel })}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
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
            <input
              ref={fileInputRef}
              accept="image/*,.pdf,.txt,.log,.md,.json,.jsonl,.csv,.tsv,.yaml,.yml,.xml,.toml,.ini,.conf"
              className="sr-only"
              multiple
              onChange={(event) => void handleFileInputChange(event)}
              tabIndex={-1}
              type="file"
            />
            <button
              {...menuButtonAria(addContextMenuOpen)}
              className="assistant-plus-button"
              disabled={isSendingPrompt}
              onClick={() => setAddContextMenuOpen((open) => !open)}
              onMouseEnter={() => {
                if (
                  activeTab?.kind === "remoteDesktop" &&
                  activeTab.connection?.type === "rdp"
                ) {
                  requestRdpPreCapture();
                }
              }}
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
                  onClick={handleAddFiles}
                  role="menuitem"
                  type="button"
                >
                  <FileImage size={15} />
                  {t("ai.addFiles")}
                </button>
                <button
                  className="assistant-add-menu-item"
                  onClick={handleAddScreenshot}
                  role="menuitem"
                  type="button"
                >
                  <Camera size={15} />
                  {t("ai.addScreenshot")}
                </button>
                {canAttachTerminalBuffer ? (
                  <button
                    className="assistant-add-menu-item"
                    onClick={() => void handleAddTerminalBuffer()}
                    role="menuitem"
                    type="button"
                  >
                    <ScrollText size={15} />
                    {t("ai.addTerminalBuffer")}
                  </button>
                ) : null}
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
      {screenshotRegionState ? (
        <div
          aria-label={t("workspace.selectRegion")}
          className="screenshot-region-overlay"
          onKeyDown={handleScreenshotRegionKeyDown}
          onPointerDown={handleScreenshotRegionPointerDown}
          onPointerMove={handleScreenshotRegionPointerMove}
          onPointerUp={handleScreenshotRegionPointerUp}
          role="application"
          tabIndex={-1}
        >
          <div className="screenshot-region-target" ref={regionTargetRef} />
          {screenshotSelectionRect ? (
            <div className="screenshot-region-selection" ref={regionSelectionRef} />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function AssistantMessageView({
  message,
  onCopyCode,
  onCopyMessage,
  onOpenLink,
  onSendCode,
}: {
  message: AssistantChatMessage;
  onCopyCode: (code: string) => void;
  onCopyMessage: (message: AssistantChatMessage) => void;
  onOpenLink: (url: string) => void;
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
          {message.textAttachments?.length ? (
            <div className="assistant-message-text-attachments">
              {message.textAttachments.map((attachment) => (
                <figure className="assistant-message-text-attachment" key={attachment.id}>
                  <figcaption>{attachment.sourceLabel}</figcaption>
                  <pre>
                    <code>{attachment.text}</code>
                  </pre>
                </figure>
              ))}
            </div>
          ) : null}
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
          {message.fileAttachments?.length ? (
            <div className="assistant-message-file-attachments">
              {message.fileAttachments.map((file) => (
                <div className="assistant-message-file-attachment" key={file.id}>
                  <FileImage size={13} />
                  <span>{file.sourceLabel}</span>
                  <small>{formatBytes(file.size)}</small>
                </div>
              ))}
            </div>
          ) : null}
          {message.role === "assistant" ? <AssistantWorkPanel message={message} /> : null}
          <MarkdownContent
            canSendCode={canSendCode}
            content={message.content}
            onCopyCode={onCopyCode}
            onOpenLink={onOpenLink}
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function appViewportBounds() {
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function rectFromPoints(
  start: { x: number; y: number },
  current: { x: number; y: number },
): CaptureScreenshotRequest {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(Math.abs(current.x - start.x))),
    height: Math.max(1, Math.round(Math.abs(current.y - start.y))),
  };
}

function pointInBounds(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function clampPointToBounds(x: number, y: number, bounds: DOMRect) {
  return {
    x: Math.min(Math.max(x, bounds.left), bounds.right),
    y: Math.min(Math.max(y, bounds.top), bounds.bottom),
  };
}

async function waitForScreenshotSurface() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 90));
}

function toolCallLabel(
  toolName: string,
  status: AssistantToolCallStatus["status"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const runningLabels: Record<string, string> = {
    web_search: t("ai.toolWebSearch"),
    web_fetch: t("ai.toolWebFetch"),
    shell_command: t("ai.toolShellCommand"),
    app_data_file_search: t("ai.toolFileSearch"),
    app_data_file_read: t("ai.toolFileRead"),
    current_time: t("ai.toolCurrentTime"),
  };
  const completedLabels: Record<string, string> = {
    web_search: t("ai.toolWebSearchDone"),
    web_fetch: t("ai.toolWebFetchDone"),
    shell_command: t("ai.toolShellCommandDone"),
    app_data_file_search: t("ai.toolFileSearchDone"),
    app_data_file_read: t("ai.toolFileReadDone"),
    current_time: t("ai.toolCurrentTimeDone"),
  };
  const labels = status === "running" ? runningLabels : completedLabels;
  return labels[toolName] ?? toolName;
}

function AssistantWorkPanel({ message }: { message: AssistantChatMessage }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [waitingPhrase, setWaitingPhrase] = useState(randomAssistantWaitingPhrase);
  const [waitingDots, setWaitingDots] = useState(0);
  const wasStreamingRef = useRef(Boolean(message.isStreaming));
  const reasoningContent = message.reasoningContent?.trim() ?? "";
  const toolCalls = message.toolCalls ?? [];
  const hasWork = Boolean(reasoningContent) || toolCalls.length > 0 || Boolean(message.isStreaming);

  useEffect(() => {
    setExpanded(false);
    wasStreamingRef.current = Boolean(message.isStreaming);
  }, [message.id]);

  useEffect(() => {
    if (wasStreamingRef.current && !message.isStreaming) {
      setExpanded(false);
    }
    wasStreamingRef.current = Boolean(message.isStreaming);
  }, [message.isStreaming]);

  useEffect(() => {
    if (!message.isStreaming) {
      setWaitingDots(0);
      return;
    }

    const interval = window.setInterval(() => {
      setWaitingDots((current) => (current + 1) % 4);
    }, 300);

    return () => {
      window.clearInterval(interval);
    };
  }, [message.isStreaming]);

  useEffect(() => {
    if (!message.isStreaming) {
      return;
    }

    setWaitingPhrase(randomAssistantWaitingPhrase());
    const interval = window.setInterval(() => {
      setWaitingPhrase(randomAssistantWaitingPhrase());
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [message.isStreaming]);

  if (!hasWork) {
    return null;
  }

  const duration =
    message.workStartedAt && message.workCompletedAt
      ? formatAssistantWorkDuration(message.workStartedAt, message.workCompletedAt, t)
      : "";
  const label = message.isStreaming
    ? waitingPhrase || t("ai.chargingBeacon")
    : t("ai.workedFor", { duration: duration || t("ai.workDurationUnderSecond") });
  const thinkingStatus = message.isStreaming ? "running" : "completed";

  return (
    <section className="assistant-work-panel">
      <button
        aria-expanded={expanded}
        className="assistant-work-toggle"
        onClick={() => setExpanded((e) => !e)}
        type="button"
      >
        <span>
          {label}
          {message.isStreaming ? (
            <span className="assistant-waiting-dots" aria-hidden="true">
              {".".repeat(waitingDots)}
            </span>
          ) : null}
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expanded ? (
        <div className="assistant-work-timeline">
          {reasoningContent || message.isStreaming ? (
            <div className="assistant-work-step" data-state={thinkingStatus}>
              <span className="assistant-work-step-icon" aria-hidden="true">
                {message.isStreaming ? <LoaderCircle size={13} /> : null}
              </span>
              <div>
                <strong>{t("ai.thinkingStep")}</strong>
                {reasoningContent ? (
                  <p className="assistant-work-reasoning">{reasoningContent}</p>
                ) : null}
              </div>
            </div>
          ) : null}
          {toolCalls.map((toolCall) => (
            <div className="assistant-work-step" data-state={toolCall.status} key={toolCall.toolId}>
              <span className="assistant-work-step-icon" aria-hidden="true">
                {toolCall.status === "running" ? <LoaderCircle size={13} /> : null}
              </span>
              <div>
                <strong>{toolCallLabel(toolCall.toolName, toolCall.status, t)}</strong>
                <small>
                  {toolCall.status === "running" ? t("ai.toolCallRunning") : t("ai.toolCallComplete")}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatAssistantWorkDuration(
  startedAt: string,
  completedAt: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const started = new Date(startedAt).getTime();
  const completed = new Date(completedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(completed) || completed <= started) {
    return t("ai.workDurationUnderSecond");
  }
  const totalSeconds = Math.max(1, Math.round((completed - started) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return t("ai.workDurationSeconds", { count: seconds });
  }
  return t("ai.workDurationMinutesSeconds", { minutes, seconds });
}

function externalAssistantLinkUrl(href: string | null) {
  if (!href) {
    return undefined;
  }
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function MarkdownContent({
  canSendCode,
  content,
  onCopyCode,
  onOpenLink,
  onSendCode,
}: {
  canSendCode: boolean;
  content: string;
  onCopyCode: (code: string) => void;
  onOpenLink: (url: string) => void;
  onSendCode: (code: string) => void;
}) {
  const { t } = useTranslation();
  const tokens = useMemo(() => {
    const lexed = marked.lexer(content);
    return lexed.filter((tok) => tok.type !== "space");
  }, [content]);

  function handleMarkdownClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as Element | null)?.closest("a");
    if (!link) {
      return;
    }
    const href = link.getAttribute("href");
    const externalUrl = externalAssistantLinkUrl(href);
    event.preventDefault();
    event.stopPropagation();
    if (externalUrl) {
      onOpenLink(externalUrl);
    }
  }

  return (
    <div className="markdown-content" onClick={handleMarkdownClick}>
      {tokens.map((token, index) => {
        if (token.type === "code") {
          const codeToken = token as Tokens.Code;
          const lang = codeToken.lang || "";
          const code = codeToken.text;
          return (
            <div className="markdown-code-block" key={`code-${index}`}>
              <div className="markdown-code-toolbar">
                <span>{lang || t("ai.code")}</span>
                <div className="markdown-code-actions">
                  <button
                    className="assistant-code-send"
                    onClick={() => onCopyCode(code)}
                    type="button"
                  >
                    <Copy size={13} />
                    {t("ai.copy")}
                  </button>
                  <button
                    className="assistant-code-send"
                    disabled={!canSendCode}
                    onClick={() => onSendCode(code)}
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
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        const html = marked.parse(token.raw, { async: false }) as string;
        return (
          <div
            key={`md-${index}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}
