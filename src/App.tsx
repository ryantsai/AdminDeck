import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Camera,
  Mouse,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardPaste,
  Columns2,
  Copy,
  Download,
  Folder,
  FolderPlus,
  Globe2,
  HardDrive,
  KeyRound,
  Languages,
  Laptop,
  LayoutDashboard,
  Menu,
  Monitor,
  PanelRight,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  Server,
  Settings,
  SplitSquareHorizontal,
  Terminal,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  AddComputer as IconParkAddComputer,
  CollapseTextInput as IconParkCollapseTextInput,
  DataScreen as IconParkDataScreen,
  Delete as IconParkDelete,
  Edit as IconParkEdit,
  ExpandTextInput as IconParkExpandTextInput,
  FolderPlus as IconParkFolderPlus,
  LaptopComputer as IconParkLaptopComputer,
  Server as IconParkServer,
  Setting as IconParkSetting,
  Terminal as IconParkTerminal,
} from "@icon-park/react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  ReactNode,
} from "react";
import "@icon-park/react/styles/index.css";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import audioIcon from "./assets/file-icons/audio.svg";
import cIcon from "./assets/file-icons/c.svg";
import certificateIcon from "./assets/file-icons/certificate.svg";
import consoleIcon from "./assets/file-icons/console.svg";
import cppIcon from "./assets/file-icons/cpp.svg";
import csharpIcon from "./assets/file-icons/csharp.svg";
import cssIcon from "./assets/file-icons/css.svg";
import databaseIcon from "./assets/file-icons/database.svg";
import dockerIcon from "./assets/file-icons/docker.svg";
import documentIcon from "./assets/file-icons/document.svg";
import exeIcon from "./assets/file-icons/exe.svg";
import fileIcon from "./assets/file-icons/file.svg";
import folderIcon from "./assets/file-icons/folder.svg";
import fontIcon from "./assets/file-icons/font.svg";
import gitIcon from "./assets/file-icons/git.svg";
import goIcon from "./assets/file-icons/go.svg";
import htmlIcon from "./assets/file-icons/html.svg";
import imageIcon from "./assets/file-icons/image.svg";
import javaIcon from "./assets/file-icons/java.svg";
import javascriptIcon from "./assets/file-icons/javascript.svg";
import jsonIcon from "./assets/file-icons/json.svg";
import keyIcon from "./assets/file-icons/key.svg";
import lockIcon from "./assets/file-icons/lock.svg";
import logIcon from "./assets/file-icons/log.svg";
import markdownIcon from "./assets/file-icons/markdown.svg";
import pdfIcon from "./assets/file-icons/pdf.svg";
import phpIcon from "./assets/file-icons/php.svg";
import powerpointIcon from "./assets/file-icons/powerpoint.svg";
import powershellIcon from "./assets/file-icons/powershell.svg";
import pythonIcon from "./assets/file-icons/python.svg";
import reactIcon from "./assets/file-icons/react.svg";
import rubyIcon from "./assets/file-icons/ruby.svg";
import rustIcon from "./assets/file-icons/rust.svg";
import settingsIcon from "./assets/file-icons/settings.svg";
import svgIcon from "./assets/file-icons/svg.svg";
import tableIcon from "./assets/file-icons/table.svg";
import tomlIcon from "./assets/file-icons/toml.svg";
import typescriptIcon from "./assets/file-icons/typescript.svg";
import videoIcon from "./assets/file-icons/video.svg";
import wordIcon from "./assets/file-icons/word.svg";
import xmlIcon from "./assets/file-icons/xml.svg";
import yamlIcon from "./assets/file-icons/yaml.svg";
import zipIcon from "./assets/file-icons/zip.svg";
import {
  invokeCommand,
  isTauriRuntime,
  saveTextFile,
  selectKeyFile,
  type CaptureScreenshotRequest,
  type LocalDirectoryEntry,
  type SftpDirectoryEntry,
  type SftpPathProperties,
  type SftpTransferProgress,
  type SftpTransferResult,
  type SshHostKeyPreview,
  type TerminalOutput,
  type TmuxSession,
} from "./lib/tauri";
import {
  AI_PROVIDER_DEFINITIONS,
  getAiProviderDefinition,
  normalizeAiProviderDraft,
  providerDefaultsFor,
  validateAiProviderForChat,
} from "./ai/providers";
import { connectionTree, defaultTerminalSettings } from "./sample-data";
import { useWorkspaceStore } from "./store";
import {
  createTerminalRenderer,
  type TerminalDimensions,
  type TerminalRenderer,
} from "./terminal/renderer";
import { ensureLayout } from "./workspace/layout";
import {
  getPaneRenderer,
  registerPaneInputWriter,
  registerPaneRenderer,
  unregisterPaneInputWriter,
  unregisterPaneRenderer,
  writeInputToPane,
} from "./workspace/paneRegistry";
import type {
  AiProviderKind,
  AiReasoningEffort,
  Connection,
  ConnectionFolder,
  ConnectionStatus,
  ConnectionTree,
  ConnectionType,
  CreateConnectionRequest,
  FileEntry,
  LayoutNode,
  SftpSettings,
  SplitDirection,
  SshSettings,
  TerminalCursorStyle,
  TerminalPane,
  TerminalSettings,
  UpdateConnectionRequest,
  WorkspaceTab,
} from "./types";

type DraggedTreeItem =
  | { kind: "folder"; folderId: string }
  | { kind: "connection"; connectionId: string };

type TreeDropTarget =
  | { kind: "root"; targetIndex: number }
  | { kind: "folder"; folderId: string; targetIndex: number }
  | {
      kind: "connection";
      folderId?: string;
      connectionId: string;
      targetIndex: number;
    };

type TreeDragPreview = {
  kind: "folder" | "connection";
  title: string;
  subtitle?: string;
  connectionType?: ConnectionType;
  connectionStatus?: ConnectionStatus;
  connectionCount?: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type PendingFolderDraft = {
  parentFolderId?: string;
};

type TreeContextMenuState =
  | {
      kind: "tree";
      x: number;
      y: number;
    }
  | {
      kind: "folder";
      folder: ConnectionFolder;
      x: number;
      y: number;
    }
  | {
      kind: "connection";
      connection: Connection;
      folderId?: string;
      x: number;
      y: number;
    };

type TerminalContextMenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
};

type EditConnectionState = {
  connection: Connection;
  folderId?: string;
};

type ConnectionDialogRequest = CreateConnectionRequest & {
  password?: string;
  urlCredentialUsername?: string;
  urlPassword?: string;
};

type ConnectionTileType = ConnectionType;

type WebviewNavigationEvent = {
  sessionId: string;
  url: string;
};

type WebviewPageLoadEvent = {
  sessionId: string;
  url: string;
  status: "started" | "finished" | "unknown";
};

type WebviewTitleChangedEvent = {
  sessionId: string;
  title: string;
};

type WebviewDownloadEvent = {
  sessionId: string;
  url: string;
  status: "requested" | "finished" | "unknown";
  path?: string;
  success?: boolean;
};

const AI_PROVIDER_SECRET_OWNER_ID = "openai-compatible-provider";
const ASSISTANT_CONTEXT_MAX_CHARS = 4000;
const RECENT_CONNECTION_STORAGE_KEY = "admin-deck.recentConnectionIds";
const RECENT_CONNECTION_LIMIT = 5;
const WINDOWS_LOCAL_SHELL_OPTIONS = [
  { label: "PowerShell", value: "powershell.exe" },
  { label: "Command Prompt", value: "cmd.exe" },
  { label: "WSL", value: "wsl.exe" },
];

type LocalShellOption = {
  canElevate?: boolean;
  label: string;
  value?: string;
};

type ScreenshotRect = CaptureScreenshotRequest;

type ScreenshotRegionState = {
  bounds: DOMRect;
  pointerId?: number;
  start?: { x: number; y: number };
  current?: { x: number; y: number };
};

function ScreenshotMenu({
  buttonClassName = "icon-button",
  targetRef,
}: {
  buttonClassName?: string;
  targetRef: RefObject<HTMLElement | null>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [regionState, setRegionState] = useState<ScreenshotRegionState | null>(null);
  const [copiedStatus, setCopiedStatus] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function captureRect(rect: ScreenshotRect) {
    if (!isTauriRuntime()) {
      window.alert("Screenshots require the Tauri desktop runtime.");
      return;
    }

    try {
      await waitForScreenshotSurface();
      await invokeCommand("capture_screenshot_to_clipboard", { request: rect });
      setCopiedStatus("Copied");
      window.setTimeout(() => setCopiedStatus(""), 1600);
    } catch (error) {
      window.alert(
        `Could not copy screenshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function targetBounds() {
    const target = targetRef.current;
    if (!target) {
      return null;
    }
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return bounds;
  }

  function handleEntirePanel() {
    setMenuOpen(false);
    const bounds = targetBounds();
    if (!bounds) {
      return;
    }
    void captureRect(rectFromBounds(bounds));
  }

  function handleRegion() {
    setMenuOpen(false);
    const bounds = targetBounds();
    if (!bounds) {
      return;
    }
    setRegionState({ bounds });
  }

  function handleRegionPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState || !pointInBounds(event.clientX, event.clientY, regionState.bounds)) {
      return;
    }
    const point = clampPointToBounds(event.clientX, event.clientY, regionState.bounds);
    event.currentTarget.setPointerCapture(event.pointerId);
    setRegionState({
      ...regionState,
      pointerId: event.pointerId,
      start: point,
      current: point,
    });
  }

  function handleRegionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState?.start || regionState.pointerId !== event.pointerId) {
      return;
    }
    setRegionState({
      ...regionState,
      current: clampPointToBounds(event.clientX, event.clientY, regionState.bounds),
    });
  }

  function handleRegionPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!regionState?.start || regionState.pointerId !== event.pointerId) {
      return;
    }
    const current = clampPointToBounds(event.clientX, event.clientY, regionState.bounds);
    const rect = rectFromPoints(regionState.start, current);
    setRegionState(null);

    if (rect.width < 4 || rect.height < 4) {
      return;
    }
    void captureRect(rect);
  }

  function handleRegionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setRegionState(null);
    }
  }

  const selectionRect =
    regionState?.start && regionState.current
      ? rectFromPoints(regionState.start, regionState.current)
      : null;

  return (
    <>
      <div className="terminal-menu-wrapper screenshot-menu-wrapper" ref={menuRef}>
        <button
          aria-label="Take screenshot"
          aria-haspopup="menu"
          aria-expanded={menuOpen ? "true" : "false"}
          className={buttonClassName}
          onClick={() => setMenuOpen((open) => !open)}
          title={copiedStatus || "Take screenshot"}
          type="button"
        >
          <Camera size={13} />
        </button>
        {menuOpen ? (
          <div className="terminal-menu screenshot-menu" role="menu">
            <button
              className="terminal-menu-item"
              onClick={handleRegion}
              role="menuitem"
              type="button"
            >
              Region
            </button>
            <button
              className="terminal-menu-item"
              onClick={handleEntirePanel}
              role="menuitem"
              type="button"
            >
              Entire Window/Panel
            </button>
          </div>
        ) : null}
      </div>
      {regionState ? (
        <div
          aria-label="Select screenshot region"
          className="screenshot-region-overlay"
          onKeyDown={handleRegionKeyDown}
          onPointerDown={handleRegionPointerDown}
          onPointerMove={handleRegionPointerMove}
          onPointerUp={handleRegionPointerUp}
          role="application"
          tabIndex={-1}
        >
          <div
            className="screenshot-region-target"
            style={{
              height: regionState.bounds.height,
              left: regionState.bounds.left,
              top: regionState.bounds.top,
              width: regionState.bounds.width,
            }}
          />
          {selectionRect ? (
            <div
              className="screenshot-region-selection"
              style={{
                height: selectionRect.height,
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function rectFromBounds(bounds: DOMRect): ScreenshotRect {
  return {
    x: Math.max(0, Math.round(bounds.left)),
    y: Math.max(0, Math.round(bounds.top)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function rectFromPoints(
  start: { x: number; y: number },
  current: { x: number; y: number },
): ScreenshotRect {
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

function isWindowsPlatform() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return /windows/i.test(`${navigator.userAgent} ${navigator.platform}`);
}

function localShellOptionsForPlatform(): LocalShellOption[] {
  if (!isWindowsPlatform()) {
    return [{ label: "Terminal" }];
  }

  return [
    { canElevate: true, label: "Command Prompt", value: "cmd.exe" },
    ...WINDOWS_LOCAL_SHELL_OPTIONS.filter((option) => option.value !== "cmd.exe").map((option) => ({
      ...option,
      canElevate: option.value === "powershell.exe",
    })),
  ];
}

function loadRecentConnectionIds() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const storedIds = JSON.parse(localStorage.getItem(RECENT_CONNECTION_STORAGE_KEY) ?? "[]");
    return Array.isArray(storedIds)
      ? storedIds.filter((connectionId): connectionId is string => typeof connectionId === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecentConnectionIds(connectionIds: string[]) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(
    RECENT_CONNECTION_STORAGE_KEY,
    JSON.stringify(connectionIds.slice(0, RECENT_CONNECTION_LIMIT)),
  );
}

function uniqueRuntimeId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

type TransferRecord = {
  id: string;
  direction: "upload" | "download";
  name: string;
  state: "queued" | "active" | "done" | "failed" | "canceled";
  progress: number;
  detail: string;
  overwriteBehavior: SftpSettings["overwriteBehavior"];
  localPath?: string;
  remoteDirectory?: string;
  remotePath?: string;
  localDirectory?: string;
};

const TRANSFER_HISTORY_STATES: TransferRecord["state"][] = ["canceled", "done", "failed"];

type TransferDirection = TransferRecord["direction"];

type TransferConflictDecision = "overwrite" | "overwriteAll" | "skip" | "cancel";

type TransferConflictState = {
  direction: TransferDirection;
  name: string;
  targetPath: string;
  isFolder: boolean;
  remainingConflicts: number;
};

type FileSortKey = "name" | "date";
type FilePaneSide = "local" | "remote";

type SftpContextMenuState = {
  side: FilePaneSide;
  x: number;
  y: number;
  names: string[];
};

type FilePropertiesState = {
  side: FilePaneSide;
  entry: FileEntry;
  path: string;
  remoteProperties?: SftpPathProperties;
};

type AssistantChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
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

const ASSISTANT_WAITING_PHRASES = [
  "Fixing phaser cannon",
  "Opening the hatch",
  "Charging the jump drive",
  "Aligning the star map",
  "Spinning up the ion fan",
  "Polishing the command deck",
  "Tuning the warp kettle",
  "Rebooting the moon router",
  "Counting spare photons",
  "Warming the flux capacitor",
  "Calibrating laser spoons",
  "Priming the nebula pump",
  "Negotiating with the airlock",
  "Filing asteroid paperwork",
  "Dusting the antimatter shelf",
  "Reticulating space splines",
  "Checking helmet vibes",
  "Defragging the cargo bay",
  "Unjamming the holo button",
  "Balancing the plasma tray",
  "Finding the left thruster",
  "Tickling the debug console",
  "Restarting orbital coffee",
  "Inflating backup gravity",
  "Rewiring the tiny reactor",
  "Tapping the starboard gauge",
  "Loading cosmic duct tape",
  "Convincing the nav computer",
  "Sequencing hatch confetti",
  "Indexing comet receipts",
  "Greasing the wormhole hinge",
  "Ping-testing Mars",
  "Sorting the photon drawer",
  "Cooling the laser noodles",
  "Tightening gravity bolts",
  "Priming the escape kazoo",
  "Painting racing stripes",
  "Untangling sensor cables",
  "Waking the sleep module",
  "Auditing stardust inventory",
  "Shaking the quantum snowglobe",
  "Finding north in space",
  "Folding the solar sail",
  "Loading backup starlight",
  "Rehearsing airlock manners",
  "Baking a moon packet",
  "Charging the sarcasm shield",
  "Buffing the docking clamp",
  "Sharpening the laser pointer",
  "Priming the thought engine",
  "Warming up the command chair",
  "Asking the dashboard nicely",
  "Cycling the photon valves",
  "Refreshing the orbit cache",
  "Rebalancing the holo grid",
  "Tuning the antenna eyebrows",
  "Opening a tiny wormhole",
  "Calming the fusion toaster",
  "Tapping the reactor glass",
  "Checking the space odometer",
  "Stirring the data soup",
  "Filling the oxygen spreadsheet",
  "Aligning satellite socks",
  "Charging the blaster dial",
  "Plotting a snack trajectory",
  "Washing the sensor array",
  "Summoning auxiliary pixels",
  "Scanning for loose commas",
  "Decrypting the captain's doodle",
  "Inventorying laser batteries",
  "Priming the turbo clipboard",
  "Tightening the console latch",
  "Reheating the star chart",
  "Cycling the space windshield",
  "Repacking the toolkit",
  "Testing zero-g cupholders",
  "Stabilizing the time drawer",
  "Loading orbital elevator music",
  "Finding the backup button",
  "Recharging the idea cannon",
  "Adjusting the moon mirror",
  "Flossing the fiber uplink",
  "Polishing the escape pod",
  "Resetting the drama dampener",
  "Opening channel banana",
  "Patching the astro modem",
  "Checking the warp warranty",
  "Sorting the asteroid queue",
  "Measuring the cosmic shrug",
  "Sealing the vacuum zipper",
  "Cycling the launch chime",
  "Rebooting the gravity fan",
  "Massaging the matrix",
  "Tuning the ion kazoo",
  "Refilling the star ink",
  "Aligning the blink lights",
  "Priming the orbit blender",
  "Counting laser freckles",
  "Unlocking the science drawer",
  "Greasing the docking rails",
  "Pinging the command moon",
  "Refactoring the hyperspace",
  "Starting the tiny supernova",
  "Scanning for friendly qubits",
  "Tapping the fusion meter",
  "Loading the patience module",
  "Dialing the photon desk",
  "Rotating the starboard waffle",
  "Checking the captain's checklist",
  "Balancing the antenna fork",
  "Rewinding the time cassette",
  "Powering the polite thruster",
  "Tuning the orbit guitar",
  "Loading the moon compiler",
  "Untying the data knot",
  "Calibrating the comet broom",
  "Charging the signal lantern",
  "Rebooting the hatch bell",
  "Flipping the plasma pancake",
  "Opening the auxiliary curtain",
  "Testing the vacuum whistle",
  "Priming the starboard toaster",
  "Buffing the quantum knob",
  "Refreshing the nebula cache",
  "Warming the rocket socks",
  "Assembling the space sandwich",
  "Aligning the laser stapler",
  "Checking the orbit invoice",
  "Tuning the warp harmonica",
  "Feeding the command queue",
  "Stacking spare timelines",
  "Cleaning the photon lens",
  "Patching the hatch firmware",
  "Loading the console confetti",
  "Rehearsing the docking wink",
  "Starting the plasma metronome",
  "Counting backup universes",
  "Tightening the starlight jar",
  "Polishing the telemetry spoon",
  "Resetting the orbital toaster",
  "Opening the moon drawer",
  "Charging the debug beacon",
  "Tuning the static hammock",
  "Repacking the nebula toolbox",
  "Scanning for lost semicolons",
  "Priming the turbo antenna",
  "Adjusting the time zipper",
  "Loading the starboard playlist",
  "Checking the gravity receipt",
  "Dusting the launch button",
  "Rebooting the comet scheduler",
  "Finding the cosmic clipboard",
  "Balancing the sensor teacup",
  "Tapping the hatch twice",
  "Folding the wormhole napkin",
  "Charging the orbital lantern",
  "Polishing the warp sprocket",
  "Refreshing the photon pantry",
  "Checking the space calendar",
  "Tuning the navigation kazoo",
  "Loading the answer thrusters",
  "Rewiring the stardust modem",
  "Opening the cargo fortune",
  "Measuring the launch grin",
  "Unclogging the plasma funnel",
  "Counting the quiet beeps",
  "Calibrating the quantum teapot",
  "Priming the orbit stapler",
  "Fixing the dashboard wobble",
  "Testing the starboard wink",
  "Recharging the thought lantern",
  "Sorting hyperspace coupons",
  "Polishing the signal mirror",
  "Loading the hatch password",
  "Cycling the antimatter fan",
  "Checking the moon gasket",
  "Tuning the sensor marimba",
  "Launching the tiny checklist",
  "Aligning the nebula ruler",
  "Rebooting the captain's chair",
  "Packing spare photons",
  "Opening the diagnostics pantry",
  "Priming the laser accordion",
  "Untangling the orbit spaghetti",
  "Charging the polite laser",
  "Checking the fusion cup",
  "Defrosting the comet tray",
  "Retuning the space banjo",
  "Loading the answer cartridge",
  "Patching the moon socket",
  "Counting celestial paperclips",
  "Stabilizing the blinkenlights",
  "Warming the response engine",
  "Rebalancing the starboard vibes",
  "Opening the tiny airlock",
  "Testing the hyperspace zipper",
  "Refreshing the command buffer",
  "Calibrating the orbit spoon",
  "Charging the answer beacon",
  "Checking the last hatch",
] as const;

function randomAssistantWaitingPhrase() {
  return ASSISTANT_WAITING_PHRASES[
    Math.floor(Math.random() * ASSISTANT_WAITING_PHRASES.length)
  ];
}

function createAssistantChatMessage(
  role: AssistantChatMessage["role"],
  content: string,
): AssistantChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantChatThreadId() {
  return `assistant-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function assistantThreadTitle(messages: AssistantChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "New chat";
  return title.length > 56 ? `${title.slice(0, 53)}...` : title;
}

function assistantThreadPreview(thread: AssistantChatThread) {
  const lastMessage = thread.messages[thread.messages.length - 1];
  const preview = lastMessage?.content.trim().replace(/\s+/g, " ") || "No messages";
  return preview.length > 64 ? `${preview.slice(0, 61)}...` : preview;
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
          : "Workspace",
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

type PanelLayoutState = {
  collapsed: boolean;
  width: number;
};

const CONNECTION_PANEL_DEFAULT_WIDTH = 292;
const CONNECTION_PANEL_MIN_WIDTH = 220;
const CONNECTION_PANEL_MAX_WIDTH = 520;
const AI_PANEL_DEFAULT_WIDTH = 334;
const AI_PANEL_MIN_WIDTH = 260;
const AI_PANEL_MAX_WIDTH = 620;
const CONNECTION_PANEL_LAYOUT_KEY = "admindeck.layout.connectionsPanel.v1";
const AI_PANEL_LAYOUT_PREFIX = "admindeck.layout.aiAssistPanel.v1.";
const ASSISTANT_CHAT_HISTORY_KEY = "admindeck.aiAssistant.chatHistory.v1";

const defaultConnectionPanelLayout: PanelLayoutState = {
  collapsed: false,
  width: CONNECTION_PANEL_DEFAULT_WIDTH,
};

const defaultAiPanelLayout: PanelLayoutState = {
  collapsed: false,
  width: AI_PANEL_DEFAULT_WIDTH,
};

async function writeToClipboard(text: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function readFromClipboard() {
  if (!navigator.clipboard?.readText) {
    return "";
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadPanelLayout(
  key: string,
  fallback: PanelLayoutState,
  minWidth: number,
  maxWidth: number,
): PanelLayoutState {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<PanelLayoutState> | null;
    if (!parsed) {
      return fallback;
    }
    return {
      collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : fallback.collapsed,
      width:
        typeof parsed.width === "number" && Number.isFinite(parsed.width)
          ? clamp(Math.round(parsed.width), minWidth, maxWidth)
          : fallback.width,
    };
  } catch {
    return fallback;
  }
}

function persistPanelLayout(key: string, layout: PanelLayoutState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function removeLayoutStorageKeys() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("admindeck.layout.")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function App() {
  const [activePage, setActivePage] = useState<"workspace" | "settings">("workspace");
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const setFrontendLaunchMs = useWorkspaceStore((state) => state.setFrontendLaunchMs);
  const setPerformanceSnapshot = useWorkspaceStore((state) => state.setPerformanceSnapshot);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  const [connectionPanelLayout, setConnectionPanelLayout] = useState(() =>
    loadPanelLayout(
      CONNECTION_PANEL_LAYOUT_KEY,
      defaultConnectionPanelLayout,
      CONNECTION_PANEL_MIN_WIDTH,
      CONNECTION_PANEL_MAX_WIDTH,
    ),
  );
  const aiLayoutConnectionId = activeTab?.connection?.id ?? "workspace";
  const [aiPanelLayout, setAiPanelLayout] = useState(() =>
    loadPanelLayout(
      `${AI_PANEL_LAYOUT_PREFIX}${aiLayoutConnectionId}`,
      defaultAiPanelLayout,
      AI_PANEL_MIN_WIDTH,
      AI_PANEL_MAX_WIDTH,
    ),
  );

  useEffect(() => {
    persistPanelLayout(CONNECTION_PANEL_LAYOUT_KEY, connectionPanelLayout);
  }, [connectionPanelLayout]);

  useEffect(() => {
    setAiPanelLayout(
      loadPanelLayout(
        `${AI_PANEL_LAYOUT_PREFIX}${aiLayoutConnectionId}`,
        defaultAiPanelLayout,
        AI_PANEL_MIN_WIDTH,
        AI_PANEL_MAX_WIDTH,
      ),
    );
  }, [aiLayoutConnectionId]);

  useEffect(() => {
    persistPanelLayout(`${AI_PANEL_LAYOUT_PREFIX}${aiLayoutConnectionId}`, aiPanelLayout);
  }, [aiLayoutConnectionId, aiPanelLayout]);

  function handleConnectionPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = connectionPanelLayout.collapsed
      ? 0
      : connectionPanelLayout.width;

    beginDragResize(event, (pointerEvent) => {
      const nextWidth = clamp(
        startWidth + pointerEvent.clientX - startX,
        CONNECTION_PANEL_MIN_WIDTH,
        CONNECTION_PANEL_MAX_WIDTH,
      );
      setConnectionPanelLayout({
        collapsed: false,
        width: nextWidth,
      });
    });
  }

  function handleAiPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = aiPanelLayout.collapsed ? 0 : aiPanelLayout.width;

    beginDragResize(event, (pointerEvent) => {
      const nextWidth = clamp(
        startWidth + startX - pointerEvent.clientX,
        AI_PANEL_MIN_WIDTH,
        AI_PANEL_MAX_WIDTH,
      );
      setAiPanelLayout({
        collapsed: false,
        width: nextWidth,
      });
    });
  }

  function handleResetLayout() {
    removeLayoutStorageKeys();
    resetAllLayouts();
    setConnectionPanelLayout(defaultConnectionPanelLayout);
    setAiPanelLayout(defaultAiPanelLayout);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFrontendLaunchMs(Math.round(performance.now()));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [setFrontendLaunchMs]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    async function refreshPerformanceSnapshot() {
      try {
        const snapshot = await invokeCommand("get_performance_snapshot");
        if (!disposed) {
          setPerformanceSnapshot(snapshot);
        }
      } catch {
        // Performance metrics are diagnostic only.
      }
    }

    void refreshPerformanceSnapshot();
    const interval = window.setInterval(() => void refreshPerformanceSnapshot(), 15_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [setPerformanceSnapshot]);

  useEffect(() => {
    invokeCommand("get_terminal_settings")
      .then(setTerminalSettings)
      .catch(() => undefined);
  }, [setTerminalSettings]);

  useEffect(() => {
    invokeCommand("get_ssh_settings")
      .then(setSshSettings)
      .catch(() => undefined);
  }, [setSshSettings]);

  useEffect(() => {
    invokeCommand("get_sftp_settings")
      .then(setSftpSettings)
      .catch(() => undefined);
  }, [setSftpSettings]);

  useEffect(() => {
    invokeCommand("get_ai_provider_settings")
      .then(setAiProviderSettings)
      .catch(() => undefined);
  }, [setAiProviderSettings]);

  useEffect(() => {
    invokeCommand("secret_exists", {
      request: {
        kind: "aiApiKey",
        ownerId: AI_PROVIDER_SECRET_OWNER_ID,
      },
    })
      .then((presence) => setAiProviderHasApiKey(presence.exists))
      .catch(() => undefined);
  }, [setAiProviderHasApiKey]);

  useEffect(() => {
    const preventDefaultContextMenu = (event: globalThis.MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", preventDefaultContextMenu, { capture: true });
    return () => {
      window.removeEventListener("contextmenu", preventDefaultContextMenu, { capture: true });
    };
  }, []);

  return (
    <div
      className={`app-shell ${activePage === "settings" ? "settings-mode" : ""} ${
        connectionPanelLayout.collapsed ? "connections-collapsed" : ""
      } ${aiPanelLayout.collapsed ? "ai-assist-collapsed" : ""}`}
      style={
        {
          "--connection-panel-width": connectionPanelLayout.collapsed
            ? "0px"
            : `${connectionPanelLayout.width}px`,
          "--connection-resize-width": "1px",
          "--ai-panel-width": aiPanelLayout.collapsed ? "0px" : `${aiPanelLayout.width}px`,
          "--ai-resize-width": aiPanelLayout.collapsed ? "34px" : "1px",
        } as CSSProperties
      }
    >
      <ActivityRail
        activePage={activePage}
        connectionsCollapsed={connectionPanelLayout.collapsed}
        onConnectionsRestore={() =>
          setConnectionPanelLayout((layout) => ({ ...layout, collapsed: false }))
        }
        onNavigate={setActivePage}
      />
      {activePage === "settings" ? (
        <SettingsPage onBack={() => setActivePage("workspace")} onResetLayout={handleResetLayout} />
      ) : (
        <>
          <ConnectionSidebar
            collapsed={connectionPanelLayout.collapsed}
            onToggleCollapsed={() =>
              setConnectionPanelLayout((layout) => ({
                ...layout,
                collapsed: !layout.collapsed,
              }))
            }
          />
          {connectionPanelLayout.collapsed ? (
            <div className="connection-collapsed-separator" aria-hidden="true" />
          ) : (
            <PanelResizeHandle
              ariaLabel="Resize Connections column"
              side="left"
              onPointerDown={handleConnectionPanelResize}
            />
          )}
          <main className="workspace">
            <TabStrip />
            <WorkspaceCanvas />
            <StatusBar />
          </main>
          <PanelResizeHandle
            ariaLabel="Resize AI Assistant panel"
            side="right"
            collapsed={aiPanelLayout.collapsed}
            collapsedLabel="AI Assistant"
            onClick={() =>
              aiPanelLayout.collapsed
                ? setAiPanelLayout((layout) => ({ ...layout, collapsed: false }))
                : undefined
            }
            onPointerDown={handleAiPanelResize}
          />
          <AssistantPanel
            collapsed={aiPanelLayout.collapsed}
            onOpenSettings={() => setActivePage("settings")}
            onToggleCollapsed={() =>
              setAiPanelLayout((layout) => ({
                ...layout,
                collapsed: !layout.collapsed,
              }))
            }
          />
        </>
      )}
    </div>
  );
}

function beginDragResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  onMove: (event: PointerEvent) => void,
) {
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  document.body.classList.add("is-resizing-layout");

  const stop = () => {
    document.body.classList.remove("is-resizing-layout");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

function PanelResizeHandle({
  ariaLabel,
  collapsed,
  collapsedLabel,
  onClick,
  side,
  onPointerDown,
}: {
  ariaLabel: string;
  collapsed?: boolean;
  collapsedLabel?: string;
  onClick?: () => void;
  side: "left" | "right";
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`panel-resize-handle panel-resize-handle-${side} ${
        collapsed ? "panel-resize-handle-collapsed" : ""
      }`}
      onClick={onClick}
      onPointerDown={collapsed ? undefined : onPointerDown}
      title={ariaLabel}
      type="button"
    >
      {collapsed ? (
        <span className="panel-collapsed-tab">
          <span>{collapsedLabel}</span>
          {side === "left" ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </span>
      ) : null}
    </button>
  );
}

function ActivityRail({
  activePage,
  connectionsCollapsed,
  onConnectionsRestore,
  onNavigate,
}: {
  activePage: "workspace" | "settings";
  connectionsCollapsed: boolean;
  onConnectionsRestore: () => void;
  onNavigate: (page: "workspace" | "settings") => void;
}) {
  function handleConnectionsClick() {
    onNavigate("workspace");
    if (connectionsCollapsed) {
      onConnectionsRestore();
    }
  }

  return (
    <nav className="activity-rail" aria-label="Primary">
      <button
        className={`rail-button ${activePage === "workspace" ? "active" : ""} ${
          connectionsCollapsed ? "connections-collapsed-indicator" : ""
        }`}
        aria-label="Connections"
        onClick={handleConnectionsClick}
      >
        <LayoutDashboard size={18} />
        <span className="rail-tooltip" role="tooltip">
          Connections
        </span>
      </button>
      <button
        className={`rail-button rail-button-settings ${activePage === "settings" ? "active" : ""}`}
        aria-label="Settings"
        onClick={() => onNavigate("settings")}
      >
        <Settings size={18} />
        <span className="rail-tooltip" role="tooltip">
          Settings
        </span>
      </button>
    </nav>
  );
}

function ConnectionSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const addConnectionToTerminalPane = useWorkspaceStore((state) => state.addConnectionToTerminalPane);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const [tree, setTree] = useState<ConnectionTree>(connectionTree);
  const [formMode, setFormMode] = useState<"save" | "quick" | null>(null);
  const [formError, setFormError] = useState("");
  const [treeError, setTreeError] = useState("");
  const [quickConnectMenuOpen, setQuickConnectMenuOpen] = useState(false);
  const [recentConnectionIds, setRecentConnectionIds] = useState(loadRecentConnectionIds);
  const [dropTarget, setDropTarget] = useState("");
  const [dragPreview, setDragPreview] = useState<TreeDragPreview | null>(null);
  const [draggedSourceId, setDraggedSourceId] = useState("");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [pendingFolderDraft, setPendingFolderDraft] = useState<PendingFolderDraft | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null);
  const [editConnection, setEditConnection] = useState<EditConnectionState | null>(null);
  const quickConnectRef = useRef<HTMLDivElement | null>(null);
  const draggedItemRef = useRef<DraggedTreeItem | null>(null);
  const pointerDragTargetRef = useRef<TreeDropTarget | null>(null);
  const pointerDragListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    stop: (event: PointerEvent) => void;
  } | null>(null);
  const suppressTreeClickRef = useRef(false);

  useEffect(() => {
    void reloadConnectionGroups();
  }, []);

  useEffect(() => {
    if (!quickConnectMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const node = quickConnectRef.current;
      if (node && !node.contains(event.target as Node)) {
        setQuickConnectMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickConnectMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickConnectMenuOpen]);

  useEffect(
    () => () => {
      removePointerDragListeners();
    },
    [],
  );

  async function reloadConnectionGroups() {
    try {
      setTree(await invokeCommand("list_connection_tree"));
    } catch {
      setTree(connectionTree);
    }
  }

  async function handleConnectionSaved(connection: Connection, folderId?: string) {
    if (folderId) {
      await reloadConnectionGroups();
    } else {
      setTree((currentTree) => upsertRootConnection(currentTree, connection));
    }
    setFormMode(null);
    setFormError("");
    setTreeError("");
  }

  function handleConnectionReady(connection: Connection) {
    setTree((currentTree) => upsertRootConnection(currentTree, connection));
    rememberConnection(connection);
    openConnection(connection);
    setFormMode(null);
    setFormError("");
    setTreeError("");
  }

  function rememberConnection(connection: Connection) {
    setRecentConnectionIds((currentIds) => {
      const nextIds = [
        connection.id,
        ...currentIds.filter((connectionId) => connectionId !== connection.id),
      ].slice(0, RECENT_CONNECTION_LIMIT);
      saveRecentConnectionIds(nextIds);
      return nextIds;
    });
  }

  function handleOpenConnection(connection: Connection) {
    rememberConnection(connection);
    openConnection(connection);
  }

  function handleAddConnectionToFocusedPane(connection: Connection, direction: SplitDirection) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab || activeTab.kind !== "terminal") {
      handleOpenConnection(connection);
      return;
    }
    rememberConnection(connection);
    addConnectionToTerminalPane(activeTab.id, connection, direction);
  }

  function handleQuickLocalShell(option: LocalShellOption) {
    setQuickConnectMenuOpen(false);
    const connection: Connection = {
      id: uniqueRuntimeId("quick"),
      name: option.label,
      host: "localhost",
      user: "local",
      type: "local",
      localShell: option.value,
      status: "idle",
    };
    openConnection(connection);
  }

  function handleQuickSsh(connection: Connection) {
    setQuickConnectMenuOpen(false);
    openConnection(connection);
  }

  async function handleQuickAdminShell(option: LocalShellOption) {
    if (!option.value) {
      return;
    }

    setTreeError("");
    setQuickConnectMenuOpen(false);
    try {
      await invokeCommand("launch_elevated_terminal", {
        request: {
          shell: option.value,
        },
      });
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function storeConnectionPassword(connectionId: string, password: string) {
    if (!isTauriRuntime()) {
      return;
    }

    await invokeCommand("store_secret", {
      request: {
        kind: "connectionPassword",
        ownerId: connectionId,
        secret: password,
      },
    });
  }

  async function storeUrlPassword(connectionId: string, password: string) {
    if (!isTauriRuntime()) {
      return;
    }

    await invokeCommand("store_secret", {
      request: {
        kind: "urlPassword",
        ownerId: connectionId,
        secret: password,
      },
    });
  }

  async function upsertUrlCredential(connectionId: string, username: string) {
    if (!isTauriRuntime()) {
      return;
    }

    await invokeCommand("upsert_url_credential", {
      request: {
        connectionId,
        username,
      },
    });
  }

  async function handleConnectionSubmit(request: ConnectionDialogRequest) {
    setFormError("");
    const { password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    if (formMode === "save") {
      try {
        const connection = await invokeCommand("create_connection", {
          request: connectionRequest,
        });
        if (password) {
          await storeConnectionPassword(connection.id, password);
        }
        if (connection.type === "url" && urlCredentialUsername && urlPassword) {
          await storeUrlPassword(connection.id, urlPassword);
          await upsertUrlCredential(connection.id, urlCredentialUsername);
        }
        await handleConnectionSaved(
          {
            ...connection,
            hasPassword: Boolean(password),
            urlCredentialUsername:
              connection.type === "url" && urlCredentialUsername ? urlCredentialUsername : undefined,
            hasUrlCredential: connection.type === "url" && Boolean(urlCredentialUsername && urlPassword),
          },
          connectionRequest.folderId,
        );
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const connection: Connection = {
      id: `quick-${Date.now()}`,
      name: connectionRequest.name || connectionRequest.host || connectionRequest.url || "Quick session",
      host: connectionRequest.host ?? "",
      user: connectionRequest.user ?? "",
      port: connectionRequest.port,
      keyPath: connectionRequest.keyPath,
      proxyJump: connectionRequest.proxyJump,
      authMethod: connectionRequest.authMethod,
      hasPassword: Boolean(password),
      type: connectionRequest.type,
      localShell: connectionRequest.localShell,
      url: connectionRequest.url,
      dataPartition: connectionRequest.dataPartition,
      useTmuxSessions: connectionRequest.useTmuxSessions,
      tmuxConnectionId:
        connectionRequest.type === "ssh" && connectionRequest.useTmuxSessions !== false
          ? uniqueRuntimeId("admindeck")
          : undefined,
      urlCredentialUsername:
        connectionRequest.type === "url" && urlCredentialUsername ? urlCredentialUsername : undefined,
      hasUrlCredential: connectionRequest.type === "url" && Boolean(urlCredentialUsername && urlPassword),
      status: "idle",
    };

    try {
      if (password) {
        await storeConnectionPassword(connection.id, password);
      }
      if (connection.type === "url" && urlCredentialUsername && urlPassword) {
        await storeUrlPassword(connection.id, urlPassword);
      }
      handleConnectionReady(connection);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleConnectionUpdate(request: ConnectionDialogRequest) {
    if (!editConnection) {
      return;
    }

    setFormError("");
    const { password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    const updateRequest: UpdateConnectionRequest = {
      ...connectionRequest,
      id: editConnection.connection.id,
      type: editConnection.connection.type,
    };

    try {
      const connection = await invokeCommand("update_connection", {
        request: updateRequest,
      });
      if (password) {
        await storeConnectionPassword(connection.id, password);
      }
      if (connection.type === "url" && urlPassword) {
        await storeUrlPassword(connection.id, urlPassword);
      }
      if (connection.type === "url" && urlCredentialUsername) {
        await upsertUrlCredential(connection.id, urlCredentialUsername);
      }
      await reloadConnectionGroups();
      setEditConnection(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCreateFolder(parentFolderId?: string) {
    setTreeError("");
    if (parentFolderId) {
      setCollapsedFolderIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(parentFolderId);
        return nextIds;
      });
    }
    setPendingFolderDraft({ parentFolderId });
  }

  function handleCancelPendingFolder() {
    setPendingFolderDraft(null);
  }

  async function handleCommitPendingFolder(name: string, parentFolderId?: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      handleCancelPendingFolder();
      return;
    }

    setPendingFolderDraft(null);
    await createFolder(trimmedName, parentFolderId);
  }

  async function createFolder(name: string, parentFolderId?: string) {
    if (!name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("create_connection_folder", {
        request: { name, parentFolderId },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRenameFolder(folder: ConnectionFolder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection_folder", {
        request: { id: folder.id, name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteFolder(folder: ConnectionFolder) {
    if (!confirmDeleteFolder(folder)) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("delete_connection_folder", {
        folderId: folder.id,
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDeleteFolder(folder: ConnectionFolder) {
    const childFolderCount = countFolders(folder.folders);
    const connectionCount = countConnections(folder);
    const detail =
      connectionCount === 0 && childFolderCount === 0
        ? `Delete folder "${folder.name}"?`
        : `Delete folder "${folder.name}", ${connectionCount} connection${
            connectionCount === 1 ? "" : "s"
          }, and ${childFolderCount} subfolder${childFolderCount === 1 ? "" : "s"}?`;
    return window.confirm(`${detail}\n\nThis cannot be undone.`);
  }

  async function handleRenameConnection(connection: Connection) {
    const name = window.prompt("Rename connection", connection.name)?.trim();
    if (!name || name === connection.name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection", {
        request: { id: connection.id, name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveFolder(
    folderId: string,
    parentFolderId: string | undefined,
    targetIndex: number,
  ) {
    try {
      setTreeError("");
      setTree(
        await invokeCommand("move_connection_folder", {
          request: { id: folderId, parentFolderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveConnection(
    connectionId: string,
    folderId: string | undefined,
    targetIndex: number,
  ) {
    try {
      setTreeError("");
      setTree(
        await invokeCommand("move_connection", {
          request: { id: connectionId, folderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteConnection(connection: Connection) {
    if (!confirmDeleteConnection(connection)) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("delete_connection", {
        connectionId: connection.id,
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDeleteConnection(connection: Connection) {
    return window.confirm(`Delete connection "${connection.name}"?\n\nThis cannot be undone.`);
  }

  const treeWithLiveStatuses = useMemo(
    () => withLiveConnectionStatuses(tree, activeSessionCounts),
    [activeSessionCounts, tree],
  );

  const filteredTree = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return treeWithLiveStatuses;
    }

    return filterConnectionTree(treeWithLiveStatuses, normalizedQuery);
  }, [query, treeWithLiveStatuses]);
  const quickConnectShellOptions = useMemo(() => localShellOptionsForPlatform(), []);
  const recentConnections = useMemo(() => {
    const connectionsById = new Map(
      flattenConnections(treeWithLiveStatuses).map((connection) => [connection.id, connection]),
    );
    return recentConnectionIds
      .map((connectionId) => connectionsById.get(connectionId))
      .filter((connection): connection is Connection => Boolean(connection))
      .slice(0, RECENT_CONNECTION_LIMIT);
  }, [recentConnectionIds, treeWithLiveStatuses]);
  const isTreeFiltered = query.trim().length > 0;

  function handleDragEnd() {
    draggedItemRef.current = null;
    pointerDragTargetRef.current = null;
    setDragPreview(null);
    setDraggedSourceId("");
    setDropTarget("");
  }

  function handleTreeClickCapture(event: ReactMouseEvent) {
    if (!suppressTreeClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressTreeClickRef.current = false;
  }

  function handleTreeContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "tree",
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleConnectionContextMenu(
    connection: Connection,
    folderId: string | undefined,
    event: ReactMouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "connection",
      connection,
      folderId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleFolderContextMenu(folder: ConnectionFolder, event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "folder",
      folder,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleToggleFolder(folderId: string) {
    setCollapsedFolderIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(folderId)) {
        nextIds.delete(folderId);
      } else {
        nextIds.add(folderId);
      }
      return nextIds;
    });
  }

  function handleExpandAllFolders() {
    setCollapsedFolderIds(new Set());
    setTreeContextMenu(null);
  }

  function handleCollapseAllFolders() {
    setCollapsedFolderIds(new Set(collectConnectionFolderIds(treeWithLiveStatuses.folders)));
    setTreeContextMenu(null);
  }

  function completeTreeDrop(item: DraggedTreeItem, target: TreeDropTarget) {
    if (item.kind === "folder") {
      if (target.kind === "connection") {
        return;
      }

      if (target.kind === "folder" && item.folderId === target.folderId) {
        return;
      }

      void handleMoveFolder(
        item.folderId,
        target.kind === "folder" ? target.folderId : undefined,
        target.targetIndex,
      );
      return;
    }

    if (item.kind === "connection") {
      if (target.kind === "connection" && item.connectionId === target.connectionId) {
        return;
      }

      void handleMoveConnection(
        item.connectionId,
        target.kind === "root" ? undefined : target.folderId,
        target.targetIndex,
      );
    }
  }

  function removePointerDragListeners() {
    const listeners = pointerDragListenersRef.current;
    if (!listeners) {
      return;
    }

    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.stop);
    window.removeEventListener("pointercancel", listeners.stop);
    pointerDragListenersRef.current = null;
  }

  function treeDropTargetFromElement(element: Element | null, item: DraggedTreeItem) {
    const row = element?.closest<HTMLElement>("[data-tree-drop-kind]");
    if (!row) {
      return null;
    }

    if (row.dataset.treeDropKind === "root") {
      return {
        kind: "root",
        targetIndex:
          item.kind === "connection"
            ? Number(row.dataset.connectionCount ?? 0)
            : Number(row.dataset.folderCount ?? 0),
      } satisfies TreeDropTarget;
    }

    if (row.dataset.treeDropKind === "folder") {
      const folderId = row.dataset.folderId;
      if (!folderId) {
        return null;
      }

      const connectionCount = Number(row.dataset.connectionCount ?? 0);
      const folderCount = Number(row.dataset.folderCount ?? 0);
      return {
        kind: "folder",
        folderId,
        targetIndex: item.kind === "connection" ? connectionCount : folderCount,
      } satisfies TreeDropTarget;
    }

    const folderId = row.dataset.folderId;
    const connectionId = row.dataset.connectionId;
    if (!connectionId) {
      return null;
    }

    return {
      kind: "connection",
      folderId: folderId || undefined,
      connectionId,
      targetIndex: Number(row.dataset.connectionIndex ?? 0),
    } satisfies TreeDropTarget;
  }

  function treeDropTargetId(target: TreeDropTarget) {
    if (target.kind === "root") {
      return "root";
    }

    return target.kind === "folder" ? `folder-${target.folderId}` : `connection-${target.connectionId}`;
  }

  function treeItemId(item: DraggedTreeItem) {
    return item.kind === "folder" ? `folder-${item.folderId}` : `connection-${item.connectionId}`;
  }

  function handlePointerDragStart(
    event: ReactPointerEvent<HTMLElement>,
    item: DraggedTreeItem,
    preview: Omit<TreeDragPreview, "x" | "y" | "offsetX" | "offsetY" | "width">,
  ) {
    if (isTreeFiltered || event.button !== 0) {
      return;
    }

    removePointerDragListeners();
    const sourceBounds = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = startX - sourceBounds.left;
    const offsetY = startY - sourceBounds.top;
    const previewWidth = Math.min(sourceBounds.width, 320);
    const pointerId = event.pointerId;
    let dragStarted = false;
    pointerDragTargetRef.current = null;

    const updateDragPreview = (pointerEvent: PointerEvent) => {
      setDragPreview((currentPreview) =>
        currentPreview
          ? { ...currentPreview, x: pointerEvent.clientX, y: pointerEvent.clientY }
          : null,
      );
    };

    const startDrag = (pointerEvent: PointerEvent) => {
      if (dragStarted) {
        return;
      }

      dragStarted = true;
      draggedItemRef.current = item;
      suppressTreeClickRef.current = true;
      setDraggedSourceId(treeItemId(item));
      setDragPreview({
        ...preview,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        offsetX,
        offsetY,
        width: previewWidth,
      });
      setDropTarget("");
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) {
        return;
      }

      if (!dragStarted) {
        const xMovement = Math.abs(pointerEvent.clientX - startX);
        const yMovement = Math.abs(pointerEvent.clientY - startY);
        if (xMovement < 4 && yMovement < 4) {
          return;
        }

        startDrag(pointerEvent);
      }

      pointerEvent.preventDefault();
      updateDragPreview(pointerEvent);
      const target = treeDropTargetFromElement(
        document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY),
        item,
      );
      pointerDragTargetRef.current = target;
      setDropTarget(target ? treeDropTargetId(target) : "");
    };
    const stop = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) {
        return;
      }

      if (!dragStarted) {
        removePointerDragListeners();
        return;
      }

      pointerEvent.preventDefault();
      const target = pointerDragTargetRef.current;
      const dragged = draggedItemRef.current;
      removePointerDragListeners();
      handleDragEnd();
      if (target && dragged) {
        completeTreeDrop(dragged, target);
      }
      window.setTimeout(() => {
        suppressTreeClickRef.current = false;
      }, 0);
    };

    pointerDragListenersRef.current = { move, stop };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <aside className="connection-sidebar" aria-hidden={collapsed}>
      <div className="sidebar-header">
        <div>
          <h1>Connections</h1>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-button"
            aria-label="New folder"
            title="New folder"
            onClick={() => void handleCreateFolder()}
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Add connection"
            title="Add connection"
            onClick={() => setFormMode("save")}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Collapse Connections column"
            title="Collapse Connections column"
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelRight size={17} />
          </button>
        </div>
      </div>

      <label className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search hosts, folders"
        />
      </label>

      <div className="quick-connect-anchor" ref={quickConnectRef}>
        <button
          aria-expanded={quickConnectMenuOpen}
          aria-haspopup="menu"
          className="quick-connect"
          onClick={() => setQuickConnectMenuOpen((isOpen) => !isOpen)}
        >
          <Play size={15} />
          Quick connect
        </button>
        {quickConnectMenuOpen ? (
          <QuickConnectMenu
            recentConnections={recentConnections}
            shellOptions={quickConnectShellOptions}
            sshSettings={sshSettings}
            onOpenConnection={(connection) => {
              setQuickConnectMenuOpen(false);
              handleOpenConnection(connection);
            }}
            onOpenElevatedShell={(option) => void handleQuickAdminShell(option)}
            onOpenLocalShell={handleQuickLocalShell}
            onOpenSsh={handleQuickSsh}
          />
        ) : null}
      </div>
      {treeError ? <p className="form-error tree-error">{treeError}</p> : null}

      <div
        className={`tree-list ${dropTarget === "root" ? "drop-target" : ""}`}
        aria-label="Connection tree"
        data-connection-count={filteredTree.connections.length}
        data-folder-count={filteredTree.folders.length}
        data-tree-drop-kind="root"
        onContextMenu={handleTreeContextMenu}
      >
        {filteredTree.connections.map((connection, connectionIndex) => (
          <ConnectionRow
            connection={connection}
            key={connection.id}
            connectionIndex={connectionIndex}
            dragDisabled={isTreeFiltered}
            isDraggingSource={draggedSourceId === `connection-${connection.id}`}
            isDropTarget={dropTarget === `connection-${connection.id}`}
            onClickCapture={handleTreeClickCapture}
            onOpen={() => handleOpenConnection(connection)}
            onContextMenu={(event) => handleConnectionContextMenu(connection, undefined, event)}
            onPointerDragStart={(event) =>
              handlePointerDragStart(
                event,
                { kind: "connection", connectionId: connection.id },
                {
                  kind: "connection",
                  title: connection.name,
                  subtitle: connection.host,
                  connectionType: connection.type,
                  connectionStatus: connection.status,
                },
              )
            }
          />
        ))}
        {pendingFolderDraft && !pendingFolderDraft.parentFolderId ? (
          <NewFolderDraftRow
            level={0}
            onCancel={handleCancelPendingFolder}
            onCommit={(name) => void handleCommitPendingFolder(name)}
          />
        ) : null}
        {filteredTree.folders.map((folder) => (
          <ConnectionFolderNode
            dragDisabled={isTreeFiltered}
            draggedSourceId={draggedSourceId}
            dropTarget={dropTarget}
            folder={folder}
            collapsedFolderIds={collapsedFolderIds}
            key={folder.id}
            level={0}
            onClickCapture={handleTreeClickCapture}
            pendingFolderDraft={pendingFolderDraft}
            onCancelPendingFolder={handleCancelPendingFolder}
            onCommitPendingFolder={handleCommitPendingFolder}
            onContextMenu={handleFolderContextMenu}
            onConnectionContextMenu={handleConnectionContextMenu}
            onCreateFolder={handleCreateFolder}
            onOpenConnection={handleOpenConnection}
            onPointerDragStart={handlePointerDragStart}
            onToggleFolder={handleToggleFolder}
          />
        ))}
      </div>

      {treeContextMenu ? (
        <TreeContextMenu
          menu={treeContextMenu}
          canAddToPane={Boolean(tabs.find((tab) => tab.id === activeTabId && tab.kind === "terminal"))}
          onClose={() => setTreeContextMenu(null)}
          onCollapseAll={handleCollapseAllFolders}
          onCreateConnection={() => {
            setTreeContextMenu(null);
            setFormMode("save");
          }}
          onCreateFolder={() => {
            setTreeContextMenu(null);
            handleCreateFolder();
          }}
          onDelete={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              void handleDeleteConnection(menu.connection);
            } else if (menu.kind === "folder") {
              void handleDeleteFolder(menu.folder);
            }
          }}
          onExpandAll={handleExpandAllFolders}
          onProperties={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              setFormError("");
              setEditConnection({ connection: menu.connection, folderId: menu.folderId });
            }
          }}
          onRename={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              void handleRenameConnection(menu.connection);
            } else if (menu.kind === "folder") {
              void handleRenameFolder(menu.folder);
            }
          }}
          onAddToPane={(direction) => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              handleAddConnectionToFocusedPane(menu.connection, direction);
            }
          }}
        />
      ) : null}

      {dragPreview ? <TreeDragPreview preview={dragPreview} /> : null}

      {formMode ? (
        <ConnectionDialog
          error={formError}
          tree={tree}
          mode={formMode}
          sshSettings={sshSettings}
          onCancel={() => {
            setFormMode(null);
            setFormError("");
          }}
          onSubmit={handleConnectionSubmit}
        />
      ) : null}
      {editConnection ? (
        <ConnectionDialog
          error={formError}
          initialConnection={editConnection.connection}
          initialFolderId={editConnection.folderId}
          tree={tree}
          mode="edit"
          sshSettings={sshSettings}
          onCancel={() => {
            setEditConnection(null);
            setFormError("");
          }}
          onSubmit={handleConnectionUpdate}
        />
      ) : null}
    </aside>
  );
}

function ConnectionFolderNode({
  collapsedFolderIds,
  dragDisabled,
  draggedSourceId,
  dropTarget,
  folder,
  level,
  onClickCapture,
  onCreateFolder,
  onOpenConnection,
  onPointerDragStart,
  onToggleFolder,
  onCancelPendingFolder,
  onCommitPendingFolder,
  onConnectionContextMenu,
  onContextMenu,
  pendingFolderDraft,
}: {
  collapsedFolderIds: Set<string>;
  dragDisabled: boolean;
  draggedSourceId: string;
  dropTarget: string;
  folder: ConnectionFolder;
  level: number;
  onClickCapture: (event: ReactMouseEvent) => void;
  onCreateFolder: (parentFolderId?: string) => void | Promise<void>;
  onOpenConnection: (connection: Connection) => void;
  onPointerDragStart: (
    event: ReactPointerEvent<HTMLElement>,
    item: DraggedTreeItem,
    preview: Omit<TreeDragPreview, "x" | "y" | "offsetX" | "offsetY" | "width">,
  ) => void;
  onToggleFolder: (folderId: string) => void;
  onCancelPendingFolder: () => void;
  onCommitPendingFolder: (name: string, parentFolderId?: string) => void | Promise<void>;
  onConnectionContextMenu: (
    connection: Connection,
    folderId: string | undefined,
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
  onContextMenu: (folder: ConnectionFolder, event: ReactMouseEvent<HTMLElement>) => void;
  pendingFolderDraft: PendingFolderDraft | null;
}) {
  const connectionCount = countConnections(folder);
  const folderCount = countFolders(folder.folders);
  const isCollapsed = collapsedFolderIds.has(folder.id);

  return (
    <section className="tree-group" style={{ paddingLeft: level * 14 } as CSSProperties}>
      <div
        className={`tree-folder-row ${dragDisabled ? "" : "can-drag"} ${
          dropTarget === `folder-${folder.id}` ? "drop-target" : ""
        } ${draggedSourceId === `folder-${folder.id}` ? "dragging-source" : ""}`}
        data-connection-count={folder.connections.length}
        data-folder-count={folder.folders.length}
        data-folder-id={folder.id}
        data-tree-drop-kind="folder"
        onClickCapture={onClickCapture}
        onContextMenu={(event) => onContextMenu(folder, event)}
        onPointerDown={(event) =>
          onPointerDragStart(
            event,
            { kind: "folder", folderId: folder.id },
            {
              kind: "folder",
              title: folder.name,
              connectionCount,
            },
          )
        }
      >
        <div className="tree-folder">
          <button
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${folder.name}`}
            className="tree-disclosure"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFolder(folder.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title={isCollapsed ? "Expand folder" : "Collapse folder"}
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <Folder size={15} />
          <span>{folder.name}</span>
          <small>{connectionCount + folderCount}</small>
        </div>
        <span className="folder-actions">
          <button
            className="row-action"
            aria-label={`New subfolder in ${folder.name}`}
            onClick={() => void onCreateFolder(folder.id)}
          >
            <FolderPlus size={13} />
          </button>
        </span>
      </div>
      {!isCollapsed ? (
        <>
          {folder.connections.map((connection, connectionIndex) => (
            <ConnectionRow
              connection={connection}
              connectionIndex={connectionIndex}
              dragDisabled={dragDisabled}
              folderId={folder.id}
              isDraggingSource={draggedSourceId === `connection-${connection.id}`}
              isDropTarget={dropTarget === `connection-${connection.id}`}
              key={connection.id}
              onClickCapture={onClickCapture}
              onOpen={() => onOpenConnection(connection)}
              onContextMenu={(event) => onConnectionContextMenu(connection, folder.id, event)}
              onPointerDragStart={(event) =>
                onPointerDragStart(
                  event,
                  { kind: "connection", connectionId: connection.id },
                  {
                    kind: "connection",
                    title: connection.name,
                    subtitle: connection.host,
                    connectionType: connection.type,
                    connectionStatus: connection.status,
                  },
                )
              }
            />
          ))}
          {pendingFolderDraft?.parentFolderId === folder.id ? (
            <NewFolderDraftRow
              level={level + 1}
              onCancel={onCancelPendingFolder}
              onCommit={(name) => void onCommitPendingFolder(name, folder.id)}
            />
          ) : null}
          {folder.folders.map((childFolder) => (
            <ConnectionFolderNode
              collapsedFolderIds={collapsedFolderIds}
              dragDisabled={dragDisabled}
              draggedSourceId={draggedSourceId}
              dropTarget={dropTarget}
              folder={childFolder}
              key={childFolder.id}
              level={level + 1}
              onClickCapture={onClickCapture}
              pendingFolderDraft={pendingFolderDraft}
              onCancelPendingFolder={onCancelPendingFolder}
              onCommitPendingFolder={onCommitPendingFolder}
              onConnectionContextMenu={onConnectionContextMenu}
              onContextMenu={onContextMenu}
              onCreateFolder={onCreateFolder}
              onOpenConnection={onOpenConnection}
              onPointerDragStart={onPointerDragStart}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </>
      ) : null}
    </section>
  );
}

function NewFolderDraftRow({
  level,
  onCancel,
  onCommit,
}: {
  level: number;
  onCancel: () => void;
  onCommit: (name: string) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSettledRef = useRef(false);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const settle = (name: string) => {
    if (isSettledRef.current) {
      return;
    }

    isSettledRef.current = true;
    if (!name.trim()) {
      onCancel();
      return;
    }

    void onCommit(name);
  };

  return (
    <div className="tree-group pending-folder-group" style={{ paddingLeft: level * 14 } as CSSProperties}>
      <div className="tree-folder-row pending-folder-row">
        <div className="tree-folder pending-folder">
          <ChevronDown size={14} />
          <Folder size={15} />
          <input
            aria-label="New folder name"
            className="pending-folder-input"
            onBlur={(event) => settle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                settle(event.currentTarget.value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                isSettledRef.current = true;
                onCancel();
              }
            }}
            ref={inputRef}
          />
        </div>
      </div>
    </div>
  );
}

function TreeContextMenu({
  menu,
  canAddToPane,
  onClose,
  onCollapseAll,
  onCreateConnection,
  onCreateFolder,
  onDelete,
  onExpandAll,
  onProperties,
  onRename,
  onAddToPane,
}: {
  menu: TreeContextMenuState;
  canAddToPane: boolean;
  onClose: () => void;
  onCollapseAll: () => void;
  onCreateConnection: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
  onExpandAll: () => void;
  onProperties: () => void;
  onRename: () => void;
  onAddToPane: (direction: SplitDirection) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = () => onClose();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }

    const bounds = node.getBoundingClientRect();
    const left = Math.min(menu.x, window.innerWidth - bounds.width - 8);
    const top = Math.min(menu.y, window.innerHeight - bounds.height - 8);
    node.style.left = `${Math.max(8, left)}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }, [menu.x, menu.y]);

  return (
    <div
      className="tree-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
    >
      {menu.kind === "tree" ? (
        <>
          <button onClick={onCreateConnection} role="menuitem" type="button">
            <IconParkAddComputer className="menu-item-icon" size={15} />
            <span>New Connection</span>
          </button>
          <button onClick={onCreateFolder} role="menuitem" type="button">
            <IconParkFolderPlus className="menu-item-icon" size={15} />
            <span>New Folder</span>
          </button>
        </>
      ) : null}
      <button onClick={onExpandAll} role="menuitem" type="button">
        <IconParkExpandTextInput className="menu-item-icon" size={15} />
        <span>Expand All</span>
      </button>
      <button onClick={onCollapseAll} role="menuitem" type="button">
        <IconParkCollapseTextInput className="menu-item-icon" size={15} />
        <span>Collapse All</span>
      </button>
      {menu.kind !== "tree" ? (
        <>
          <button onClick={onRename} role="menuitem" type="button">
            <IconParkEdit className="menu-item-icon" size={15} />
            <span>Rename</span>
          </button>
          <button onClick={onDelete} role="menuitem" type="button">
            <IconParkDelete className="menu-item-icon" size={15} />
            <span>Delete</span>
          </button>
        </>
      ) : null}
      {menu.kind === "connection" ? (
        <>
          {canAddToPane ? (
            <>
              <button onClick={() => onAddToPane("right")} role="menuitem" type="button">
                <ArrowRight className="menu-item-icon" size={15} />
                <span>Add to Right Pane</span>
              </button>
              <button onClick={() => onAddToPane("left")} role="menuitem" type="button">
                <ArrowLeft className="menu-item-icon" size={15} />
                <span>Add to Left Pane</span>
              </button>
              <button onClick={() => onAddToPane("down")} role="menuitem" type="button">
                <ArrowDown className="menu-item-icon" size={15} />
                <span>Add to Lower Pane</span>
              </button>
              <button onClick={() => onAddToPane("up")} role="menuitem" type="button">
                <ArrowUp className="menu-item-icon" size={15} />
                <span>Add to Upper Pane</span>
              </button>
            </>
          ) : null}
          <button onClick={onProperties} role="menuitem" type="button">
            <IconParkSetting className="menu-item-icon" size={15} />
            <span>Properties</span>
          </button>
        </>
      ) : null}
    </div>
  );
}

function QuickConnectMenu({
  recentConnections,
  shellOptions,
  sshSettings,
  onOpenConnection,
  onOpenElevatedShell,
  onOpenLocalShell,
  onOpenSsh,
}: {
  recentConnections: Connection[];
  shellOptions: LocalShellOption[];
  sshSettings: SshSettings;
  onOpenConnection: (connection: Connection) => void;
  onOpenElevatedShell: (option: LocalShellOption) => void;
  onOpenLocalShell: (option: LocalShellOption) => void;
  onOpenSsh: (connection: Connection) => void;
}) {
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(String(sshSettings.defaultPort));
  const normalizedSshPort = Number(sshPort || sshSettings.defaultPort);
  const canSubmitSsh =
    Boolean(sshHost.trim()) &&
    Number.isInteger(normalizedSshPort) &&
    normalizedSshPort >= 1 &&
    normalizedSshPort <= 65535;

  function handleSshSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const host = sshHost.trim();
    if (!canSubmitSsh) {
      return;
    }

    onOpenSsh({
      id: uniqueRuntimeId("quick"),
      name: host,
      host,
      user: sshSettings.defaultUser,
      port: normalizedSshPort,
      authMethod: "agent",
      type: "ssh",
      useTmuxSessions: false,
      status: "idle",
    });
  }

  return (
    <div className="quick-connect-menu" role="menu" aria-label="Quick connect">
      {sshDialogOpen ? (
        <form className="quick-connect-mini-dialog" onSubmit={handleSshSubmit}>
          <label>
            <span>Hostname</span>
            <input
              autoFocus
              onChange={(event) => setSshHost(event.currentTarget.value)}
              placeholder="example.internal"
              required
              value={sshHost}
            />
          </label>
          <label>
            <span>Port</span>
            <input
              inputMode="numeric"
              max="65535"
              min="1"
              onChange={(event) => setSshPort(event.currentTarget.value)}
              placeholder={String(sshSettings.defaultPort)}
              type="number"
              value={sshPort}
            />
          </label>
          <div className="quick-connect-mini-actions">
            <button disabled={!canSubmitSsh} type="submit">
              Connect
            </button>
            <button onClick={() => setSshDialogOpen(false)} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setSshDialogOpen(true)} role="menuitem" type="button">
          <Server size={15} />
          <span>SSH</span>
        </button>
      )}
      {shellOptions.map((option) =>
        option.canElevate ? (
          <div className="quick-connect-submenu" key={option.value ?? option.label}>
            <button aria-haspopup="menu" role="menuitem" type="button">
              <Terminal size={15} />
              <span>{option.label}</span>
              <ChevronDown size={13} />
            </button>
            <div className="quick-connect-submenu-panel" role="menu">
              <button onClick={() => onOpenLocalShell(option)} role="menuitem" type="button">
                Normal
              </button>
              <button onClick={() => onOpenElevatedShell(option)} role="menuitem" type="button">
                Admin
              </button>
            </div>
          </div>
        ) : (
          <button
            key={option.value ?? option.label}
            onClick={() => onOpenLocalShell(option)}
            role="menuitem"
            type="button"
          >
            <Terminal size={15} />
            <span>{option.label}</span>
          </button>
        ),
      )}
      <div className="quick-connect-menu-separator" role="separator" />
      {recentConnections.length > 0 ? (
        recentConnections.map((connection) => (
          <button
            key={connection.id}
            onClick={() => onOpenConnection(connection)}
            role="menuitem"
            type="button"
          >
            <ConnectionGlyph size={15} type={connection.type} />
            <span className="connection-main">
              <strong>{connection.name}</strong>
              <small>{connectionSubtitle(connection)}</small>
            </span>
            <span className={`status-dot ${connection.status}`} />
          </button>
        ))
      ) : (
        <button disabled role="menuitem" type="button">
          <Server size={15} />
          <span>No recent connections</span>
        </button>
      )}
    </div>
  );
}

const CONNECTION_TYPE_TILES: Array<{
  type: ConnectionTileType;
  title: string;
  description: string;
  accent: string;
}> = [
  {
    type: "ssh",
    title: "SSH",
    description: "Secure shell",
    accent: "#374151",
  },
  {
    type: "local",
    title: "Terminal",
    description: "Local shell",
    accent: "#13a085",
  },
  {
    type: "url",
    title: "URL",
    description: "Embedded web app",
    accent: "#0ea5e9",
  },
  {
    type: "rdp",
    title: "Remote Desktop",
    description: "Windows RDP",
    accent: "#1d4ed8",
  },
  {
    type: "vnc",
    title: "VNC",
    description: "Screen control",
    accent: "#c026d3",
  },
];

const CONNECTION_ICON_FILLS: Record<Exclude<ConnectionTileType, "url">, string[]> = {
  ssh: ["#1f2937", "#f3f4f6", "#111827", "#6b7280"],
  local: ["#047857", "#d1fae5", "#065f46", "#34d399"],
  rdp: ["#1e3a8a", "#dbeafe", "#172554", "#60a5fa"],
  vnc: ["#a21caf", "#fae8ff", "#86198f", "#e879f9"],
};

function ConnectionTypeGlyph({
  className,
  size = 16,
  type,
}: {
  className?: string;
  size?: number;
  type: ConnectionTileType;
}) {
  if (type === "url") {
    return <Globe2 className={className} size={size} />;
  }

  const iconProps = {
    className,
    fill: CONNECTION_ICON_FILLS[type],
    size,
    strokeWidth: 3,
    theme: "multi-color" as const,
  };

  switch (type) {
    case "local":
      return <IconParkTerminal {...iconProps} />;
    case "rdp":
      return <IconParkDataScreen {...iconProps} />;
    case "vnc":
      return <IconParkLaptopComputer {...iconProps} />;
    case "ssh":
      return <IconParkServer {...iconProps} />;
  }
}

function ConnectionGlyph({
  className,
  size = 16,
  type,
}: {
  className?: string;
  size?: number;
  type: ConnectionType;
}) {
  if (type === "url") {
    return <Globe2 className={className} size={size} />;
  }
  return <ConnectionTypeGlyph className={className} size={size} type={type} />;
}

function ConnectionDialog({
  error,
  initialConnection,
  initialFolderId,
  tree,
  mode,
  sshSettings,
  onCancel,
  onSubmit,
}: {
  error: string;
  initialConnection?: Connection;
  initialFolderId?: string;
  tree: ConnectionTree;
  mode: "save" | "quick" | "edit";
  sshSettings: SshSettings;
  onCancel: () => void;
  onSubmit: (request: ConnectionDialogRequest) => void | Promise<void>;
}) {
  const [connectionType, setConnectionType] = useState<ConnectionType | "">(
    initialConnection?.type ?? "",
  );
  const [authMethod, setAuthMethod] = useState<"keyFile" | "password" | "agent">(
    initialConnection?.authMethod ?? "keyFile",
  );
  const [keyPath, setKeyPath] = useState(
    initialConnection?.keyPath ?? sshSettings.defaultKeyPath ?? "",
  );
  const usesSshDefaults = connectionType === "ssh";
  const usesRemoteDesktopFields = connectionType
    ? isRemoteDesktopConnectionType(connectionType)
    : false;
  const folderOptions = useMemo(() => flattenFolders(tree.folders), [tree.folders]);
  const localShellOptions = useMemo(() => localShellOptionsForPlatform(), []);
  const isEditMode = mode === "edit";
  const isUrlConnection = connectionType === "url";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionType) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const selectedLocalShell = String(
      form.get("localShell") ??
        initialConnection?.localShell ??
        localShellOptions[0]?.value ??
        "",
    );
    const selectedLocalShellLabel =
      localShellOptions.find((option) => (option.value ?? "") === selectedLocalShell)?.label ??
      "Local terminal";
    const rawUrl = String(form.get("url") ?? "").trim();
    const host =
      connectionType === "local"
        ? "localhost"
        : connectionType === "url"
          ? rawUrl
          : String(form.get("host") ?? "").trim();
    const requestedName = String(form.get("name") ?? "").trim();
    const name =
      connectionType === "local"
        ? requestedName || selectedLocalShellLabel
        : requestedName || host;
    const portValue = String(form.get("port") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const keyPath = String(form.get("keyPath") ?? "").trim();
    const proxyJump = String(form.get("proxyJump") ?? "").trim();
    const useTmuxSessions = form.get("useTmuxSessions") === "on";

    void onSubmit({
      name,
      host,
      user:
        connectionType === "local"
          ? "local"
          : connectionType === "url"
            ? initialConnection?.user ?? "web"
            : String(form.get("user") ?? "").trim(),
      type: connectionType,
      folderId: String(form.get("folderId") ?? "").trim() || undefined,
      port: portValue ? Number(portValue) : undefined,
      keyPath: usesSshDefaults && authMethod === "keyFile" ? keyPath || undefined : undefined,
      proxyJump: proxyJump || undefined,
      authMethod: usesSshDefaults ? authMethod : undefined,
      useTmuxSessions: usesSshDefaults ? useTmuxSessions : undefined,
      localShell: connectionType === "local" ? selectedLocalShell || undefined : undefined,
      url: connectionType === "url" ? rawUrl : undefined,
      dataPartition:
        connectionType === "url"
          ? String(form.get("dataPartition") ?? "").trim() || undefined
          : undefined,
      password:
        usesSshDefaults && authMethod === "password"
          ? password
          : usesRemoteDesktopFields
            ? password || undefined
            : undefined,
      urlCredentialUsername:
        connectionType === "url"
          ? String(form.get("urlCredentialUsername") ?? "").trim() || undefined
          : undefined,
      urlPassword: connectionType === "url" ? String(form.get("urlPassword") ?? "") || undefined : undefined,
    });
  }

  async function handleBrowseKeyFile() {
    const selectedPath = await selectKeyFile(keyPath || sshSettings.defaultKeyPath);
    if (selectedPath) {
      setKeyPath(selectedPath);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="connection-dialog" onSubmit={handleSubmit}>
        <header
          className={mode === "quick" ? "connection-dialog-header" : "connection-dialog-header compact"}
        >
          <div>
            <p className="panel-label">
              {mode === "edit" ? "Connection properties" : mode === "save" ? "New connection" : "Quick connect"}
            </p>
            {mode === "quick" ? <h2>Open one-off session</h2> : null}
          </div>
          {mode === "quick" ? (
            <button className="icon-button" type="button" aria-label="Close" onClick={onCancel}>
              <X size={15} />
            </button>
          ) : null}
        </header>

        {isEditMode && initialConnection ? (
          <div className="connection-type-summary">
            <ConnectionGlyph size={20} type={initialConnection.type} />
            <span>
              <strong>{connectionTypeLabel(initialConnection.type)}</strong>
              <small>{connectionSubtitle(initialConnection)}</small>
            </span>
          </div>
        ) : (
          <fieldset className="connection-type-picker">
            <legend>Type*</legend>
            <div className="connection-type-grid">
              {CONNECTION_TYPE_TILES.map((tile) => (
                <button
                  aria-pressed={connectionType === tile.type}
                  className={`connection-type-tile ${connectionType === tile.type ? "selected" : ""}`}
                  key={tile.type}
                  onClick={() => setConnectionType(tile.type)}
                  style={{ "--tile-accent": tile.accent } as CSSProperties}
                  type="button"
                >
                  <span className="connection-type-icon">
                    <ConnectionTypeGlyph type={tile.type} size={32} />
                  </span>
                  <span className="connection-type-copy">
                    <strong>{tile.title}</strong>
                    <small>{tile.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {connectionType ? (
          <div className="connection-dialog-fields">
            {mode === "save" || mode === "edit" ? (
              <label>
                <span>Folder</span>
                <select name="folderId" defaultValue={initialFolderId ?? ""}>
                  <option value="">Root</option>
                  {folderOptions.map((option) => (
                    <option value={option.folder.id} key={option.folder.id}>
                      {"  ".repeat(option.level)}
                      {option.folder.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {connectionType === "local" ? (
              <>
                <label>
                  <span>Name(Optional)</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder="Connection name" />
                </label>
                <label>
                  <span>Shell</span>
                  <select
                    name="localShell"
                    defaultValue={initialConnection?.localShell ?? localShellOptions[0]?.value ?? ""}
                  >
                    {localShellOptions.map((option) => (
                      <option value={option.value ?? ""} key={option.value ?? option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : isUrlConnection ? (
              <>
                <label>
                  <span>Name(Optional)</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder="Connection name" />
                </label>
                <label>
                  <span>URL*</span>
                  <input name="url" defaultValue={initialConnection?.url ?? ""} placeholder="https://example.com" required />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Data partition</span>
                    <input
                      name="dataPartition"
                      defaultValue={initialConnection?.dataPartition ?? ""}
                      placeholder="Default"
                    />
                  </label>
                  <label>
                    <span>Credential user</span>
                    <input
                      name="urlCredentialUsername"
                      defaultValue={initialConnection?.urlCredentialUsername ?? ""}
                      placeholder="Optional username"
                    />
                  </label>
                </div>
                <label>
                  <span>Password</span>
                  <input
                    autoComplete="current-password"
                    name="urlPassword"
                    placeholder={isEditMode ? "Leave blank to keep stored password" : "Stored in OS keychain"}
                    type="password"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>Name(Optional)</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder="Connection name" />
                </label>

                <label>
                  <span>Host*</span>
                  <input
                    name="host"
                    defaultValue={initialConnection?.host ?? ""}
                    placeholder="example.internal"
                    required
                  />
                </label>

                <div className="form-grid">
                  <label>
                    <span>{connectionType === "vnc" ? "User" : "User*"}</span>
                    <input
                      key={`user-${connectionType}`}
                      name="user"
                      defaultValue={
                        initialConnection?.user ??
                        (connectionType === "ssh" ? sshSettings.defaultUser : "")
                      }
                      placeholder={
                        connectionType === "rdp"
                          ? "DOMAIN\\admin"
                          : connectionType === "vnc"
                            ? "Optional username"
                            : "admin"
                      }
                      required={connectionType !== "vnc"}
                    />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      key={`port-${connectionType}`}
                      name="port"
                      defaultValue={
                        initialConnection?.port ?? defaultPortForConnectionType(connectionType, sshSettings)
                      }
                      inputMode="numeric"
                      min="1"
                      max="65535"
                      type="number"
                      placeholder={String(defaultPortForConnectionType(connectionType, sshSettings))}
                    />
                  </label>
                </div>
              </>
            )}

            {usesRemoteDesktopFields ? (
              <label>
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder={isEditMode ? "Leave blank to keep stored password" : "Stored in OS keychain"}
                  type="password"
                />
              </label>
            ) : null}

            {usesSshDefaults ? (
              <>
                <div className="form-grid">
                  <label>
                    <span>Auth*</span>
                    <select
                      name="authMethod"
                      value={authMethod}
                      required
                      onChange={(event) =>
                        setAuthMethod(event.currentTarget.value as "keyFile" | "password" | "agent")
                      }
                    >
                      <option value="keyFile">Key file</option>
                      <option value="password">Password</option>
                      <option value="agent">SSH agent</option>
                    </select>
                  </label>
                  <label>
                    <span>Proxy jump</span>
                    <input
                      name="proxyJump"
                      defaultValue={initialConnection?.proxyJump ?? sshSettings.defaultProxyJump ?? ""}
                      placeholder="jump.internal"
                    />
                  </label>
                </div>

                {authMethod === "password" ? (
                  <label>
                    <span>Password*</span>
                    <input
                      name="password"
                      placeholder={isEditMode ? "Leave blank to keep stored password" : "Stored in OS keychain"}
                      required={!isEditMode}
                      type="password"
                    />
                  </label>
                ) : authMethod === "keyFile" ? (
                  <label>
                    <span>Key path</span>
                    <div className="input-with-button">
                      <input
                        name="keyPath"
                        onChange={(event) => setKeyPath(event.currentTarget.value)}
                        placeholder="C:\\Users\\ryan\\.ssh\\id_ed25519"
                        value={keyPath}
                      />
                      <button className="toolbar-button" onClick={handleBrowseKeyFile} type="button">
                        Browse
                      </button>
                    </div>
                  </label>
                ) : null}
                <label className="checkbox-row">
                  <input
                    name="useTmuxSessions"
                    type="checkbox"
                    defaultChecked={initialConnection?.useTmuxSessions ?? true}
                  />
                  <span>Use tmux sessions</span>
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="dialog-actions">
          <button className="approve-button" disabled={!connectionType} type="submit">
            {mode === "quick" ? <Play size={15} /> : <Save size={15} />}
            {mode === "quick" ? "Connect" : "Save"}
          </button>
          <button className="toolbar-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function TreeDragPreview({ preview }: { preview: TreeDragPreview }) {
  const previewRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = previewRef.current;
    if (!node) {
      return;
    }

    node.style.left = `${preview.x - preview.offsetX}px`;
    node.style.top = `${preview.y - preview.offsetY}px`;
    node.style.width = `${preview.width}px`;
  }, [preview.offsetX, preview.offsetY, preview.width, preview.x, preview.y]);

  return (
    <div className={`tree-drag-preview ${preview.kind}`} ref={previewRef}>
      {preview.kind === "folder" ? (
        <Folder size={15} />
      ) : (
        <ConnectionGlyph size={15} type={preview.connectionType ?? "ssh"} />
      )}
      <span className="connection-main">
        <strong>{preview.title}</strong>
        {preview.subtitle ? <small>{preview.subtitle}</small> : null}
      </span>
      {preview.kind === "folder" ? (
        <small className="tree-drag-count">{preview.connectionCount ?? 0}</small>
      ) : preview.connectionStatus ? (
        <span className={`status-dot ${preview.connectionStatus}`} />
      ) : null}
    </div>
  );
}

function ConnectionRow({
  connection,
  connectionIndex,
  dragDisabled,
  folderId,
  isDraggingSource,
  isDropTarget,
  onClickCapture,
  onContextMenu,
  onOpen,
  onPointerDragStart,
}: {
  connection: Connection;
  connectionIndex: number;
  dragDisabled: boolean;
  folderId?: string;
  isDraggingSource: boolean;
  isDropTarget: boolean;
  onClickCapture: (event: ReactMouseEvent) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpen: () => void;
  onPointerDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={`connection-row ${dragDisabled ? "" : "can-drag"} ${
        isDropTarget ? "drop-target" : ""
      } ${isDraggingSource ? "dragging-source" : ""
      }`}
      data-connection-id={connection.id}
      data-connection-index={connectionIndex}
      data-folder-id={folderId ?? ""}
      data-tree-drop-kind="connection"
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDragStart}
    >
      <button className="connection-open" onClick={onOpen}>
        <ConnectionGlyph size={16} type={connection.type} />
        <span className="connection-main">
          <strong>{connection.name}</strong>
          <small>{connectionSubtitle(connection)}</small>
        </span>
      </button>
      <span className={`status-dot ${connection.status}`} />
    </div>
  );
}

function upsertRootConnection(tree: ConnectionTree, connection: Connection): ConnectionTree {
  const withoutConnection = removeConnectionFromTree(tree, connection.id);
  return {
    ...withoutConnection,
    connections: [connection, ...withoutConnection.connections],
  };
}

function withLiveConnectionStatuses(
  tree: ConnectionTree,
  activeSessionCounts: Record<string, number>,
): ConnectionTree {
  return {
    connections: tree.connections.map((connection) => ({
      ...connection,
      status: liveConnectionStatus(connection.id, activeSessionCounts),
    })),
    folders: tree.folders.map((folder) => withLiveFolderStatuses(folder, activeSessionCounts)),
  };
}

function withLiveFolderStatuses(
  folder: ConnectionFolder,
  activeSessionCounts: Record<string, number>,
): ConnectionFolder {
  return {
    ...folder,
    connections: folder.connections.map((connection) => ({
      ...connection,
      status: liveConnectionStatus(connection.id, activeSessionCounts),
    })),
    folders: folder.folders.map((childFolder) =>
      withLiveFolderStatuses(childFolder, activeSessionCounts),
    ),
  };
}

function removeConnectionFromTree(tree: ConnectionTree, connectionId: string): ConnectionTree {
  return {
    connections: tree.connections.filter((connection) => connection.id !== connectionId),
    folders: tree.folders.map((folder) => removeConnectionFromFolder(folder, connectionId)),
  };
}

function removeConnectionFromFolder(
  folder: ConnectionFolder,
  connectionId: string,
): ConnectionFolder {
  return {
    ...folder,
    connections: folder.connections.filter((connection) => connection.id !== connectionId),
    folders: folder.folders.map((childFolder) =>
      removeConnectionFromFolder(childFolder, connectionId),
    ),
  };
}

function filterConnectionTree(tree: ConnectionTree, normalizedQuery: string): ConnectionTree {
  return {
    connections: tree.connections.filter((connection) =>
      connectionMatchesQuery(connection, normalizedQuery),
    ),
    folders: tree.folders
      .map((folder) => filterConnectionFolder(folder, normalizedQuery))
      .filter((folder): folder is ConnectionFolder => Boolean(folder)),
  };
}

function filterConnectionFolder(
  folder: ConnectionFolder,
  normalizedQuery: string,
): ConnectionFolder | null {
  const folderMatches = folder.name.toLowerCase().includes(normalizedQuery);
  const connections = folderMatches
    ? folder.connections
    : folder.connections.filter((connection) => connectionMatchesQuery(connection, normalizedQuery));
  const folders = folder.folders
    .map((childFolder) => filterConnectionFolder(childFolder, normalizedQuery))
    .filter((childFolder): childFolder is ConnectionFolder => Boolean(childFolder));

  if (!folderMatches && connections.length === 0 && folders.length === 0) {
    return null;
  }

  return {
    ...folder,
    connections,
    folders: folderMatches ? folder.folders : folders,
  };
}

function connectionMatchesQuery(connection: Connection, normalizedQuery: string) {
  return [connection.name, connection.host, connection.user, connection.type]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function flattenConnections(tree: ConnectionTree): Connection[] {
  return [
    ...tree.connections,
    ...tree.folders.flatMap((folder) => flattenFolderConnections(folder)),
  ];
}

function flattenFolderConnections(folder: ConnectionFolder): Connection[] {
  return [
    ...folder.connections,
    ...folder.folders.flatMap((childFolder) => flattenFolderConnections(childFolder)),
  ];
}

function flattenFolders(
  folders: ConnectionFolder[],
  level = 0,
): Array<{ folder: ConnectionFolder; level: number }> {
  return folders.flatMap((folder) => [
    { folder, level },
    ...flattenFolders(folder.folders, level + 1),
  ]);
}

function collectConnectionFolderIds(folders: ConnectionFolder[]): string[] {
  return folders.flatMap((folder) => [folder.id, ...collectConnectionFolderIds(folder.folders)]);
}

function countConnections(folder: ConnectionFolder): number {
  return (
    folder.connections.length +
    folder.folders.reduce((total, childFolder) => total + countConnections(childFolder), 0)
  );
}

function countFolders(folders: ConnectionFolder[]): number {
  return folders.reduce(
    (total, folder) => total + 1 + countFolders(folder.folders),
    0,
  );
}

function liveConnectionStatus(
  connectionId: string,
  activeSessionCounts: Record<string, number>,
): ConnectionStatus {
  return activeSessionCounts[connectionId] ? "connected" : "idle";
}

function isRemoteDesktopConnectionType(type: ConnectionType) {
  return type === "rdp" || type === "vnc";
}

function defaultPortForConnectionType(type: ConnectionType, sshSettings: SshSettings) {
  if (type === "rdp") {
    return 3389;
  }
  if (type === "vnc") {
    return 5900;
  }
  return sshSettings.defaultPort;
}

function connectionTypeLabel(type: ConnectionType) {
  switch (type) {
    case "local":
      return "Local terminal";
    case "ssh":
      return "SSH terminal";
    case "url":
      return "URL";
    case "rdp":
      return "RDP";
    case "vnc":
      return "VNC";
  }
}

function connectionSubtitle(connection: Connection) {
  if (connection.type === "local") {
    return connection.host;
  }
  if (connection.type === "url") {
    return connection.url ?? connection.host;
  }
  const address = connection.port ? `${connection.host}:${connection.port}` : connection.host;
  if (connection.user) {
    return `${connection.user}@${address}`;
  }
  return address;
}

function connectionIconForType(type: ConnectionType) {
  switch (type) {
    case "local":
      return Laptop;
    case "url":
      return Globe2;
    case "rdp":
      return Monitor;
    case "vnc":
      return Mouse;
    case "ssh":
      return Server;
  }
}

function tabIconFor(tab: WorkspaceTab) {
  if (tab.kind === "sftp") {
    return Columns2;
  }
  if (tab.kind === "webview") {
    return Globe2;
  }
  if (tab.kind === "remoteDesktop") {
    return connectionIconForType(tab.connection?.type ?? "rdp");
  }
  return Terminal;
}

function workspaceKindLabel(tab: WorkspaceTab) {
  switch (tab.kind) {
    case "sftp":
      return "SFTP browser";
    case "webview":
      return "Webview";
    case "remoteDesktop":
      return `${connectionTypeLabel(tab.connection?.type ?? "rdp")} connection`;
    case "terminal":
      return "Terminal";
  }
}

function TabStrip() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const [quickConnectMenuOpen, setQuickConnectMenuOpen] = useState(false);
  const quickConnectRef = useRef<HTMLDivElement | null>(null);
  const shellOptions = useMemo(() => localShellOptionsForPlatform(), []);

  useEffect(() => {
    if (!quickConnectMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const node = quickConnectRef.current;
      if (node && !node.contains(event.target as Node)) {
        setQuickConnectMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickConnectMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickConnectMenuOpen]);

  function handleQuickLocalShell(option: LocalShellOption) {
    setQuickConnectMenuOpen(false);
    openConnection({
      id: uniqueRuntimeId("quick"),
      name: option.label,
      host: "localhost",
      user: "local",
      type: "local",
      localShell: option.value,
      status: "idle",
    });
  }

  async function handleQuickAdminShell(option: LocalShellOption) {
    if (!option.value) {
      return;
    }

    setQuickConnectMenuOpen(false);
    try {
      await invokeCommand("launch_elevated_terminal", {
        request: {
          shell: option.value,
        },
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function handleQuickSsh(connection: Connection) {
    setQuickConnectMenuOpen(false);
    openConnection(connection);
  }

  return (
    <div className="tab-strip" aria-label="Workspace tabs">
      {tabs.map((tab) => (
        <div className={tab.id === activeTabId ? "tab active" : "tab"} key={tab.id}>
          <button className="tab-button" onClick={() => activateTab(tab.id)} type="button">
            {(() => {
              const Icon = tabIconFor(tab);
              return <Icon size={14} />;
            })()}
            <span>{tab.title}</span>
          </button>
          <button
            aria-label={`Close ${tab.title}`}
            className="tab-close-button"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
            title={`Close ${tab.title}`}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="quick-connect-anchor tab-quick-connect-anchor" ref={quickConnectRef}>
        <button
          aria-expanded={quickConnectMenuOpen}
          aria-haspopup="menu"
          className="new-tab"
          aria-label="New tab"
          onClick={() => setQuickConnectMenuOpen((isOpen) => !isOpen)}
          title="New tab"
          type="button"
        >
          <Plus size={15} />
        </button>
        {quickConnectMenuOpen ? (
          <QuickConnectMenu
            recentConnections={[]}
            shellOptions={shellOptions}
            sshSettings={sshSettings}
            onOpenConnection={(connection) => {
              setQuickConnectMenuOpen(false);
              openConnection(connection);
            }}
            onOpenElevatedShell={(option) => void handleQuickAdminShell(option)}
            onOpenLocalShell={handleQuickLocalShell}
            onOpenSsh={handleQuickSsh}
          />
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceCanvas() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);

  if (tabs.length === 0) {
    return (
      <div className="workspace-canvas">
        <section className="empty-workspace">
          <Terminal size={28} />
          <h2>No active session</h2>
          <p>Open a Connection from the tree.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-canvas">
      {tabs.map((tab) => {
        if (tab.kind === "sftp") {
          return <SftpWorkspace isActive={tab.id === activeTabId} key={tab.id} tab={tab} />;
        }
        if (tab.kind === "webview") {
          return <WebViewWorkspace isActive={tab.id === activeTabId} key={tab.id} tab={tab} />;
        }
        if (tab.kind === "remoteDesktop") {
          return (
            <RemoteDesktopWorkspace isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
          );
        }
        return <TerminalWorkspace isActive={tab.id === activeTabId} key={tab.id} tab={tab} />;
      })}
    </div>
  );
}

interface WebviewSessionLease {
  promise: Promise<void>;
  refCount: number;
  closeTimer: number | null;
  started: boolean;
  closed: boolean;
}

const webviewSessionLeases = new Map<string, WebviewSessionLease>();

function acquireWebviewSession(sessionId: string, start: () => Promise<unknown>) {
  const current = webviewSessionLeases.get(sessionId);
  if (current && !current.closed) {
    if (current.closeTimer !== null) {
      window.clearTimeout(current.closeTimer);
      current.closeTimer = null;
    }
    current.refCount += 1;
    return current;
  }

  let lease: WebviewSessionLease;
  const promise = Promise.resolve()
    .then(start)
    .then(() => {
      lease.started = true;
    });
  lease = {
    promise,
    refCount: 1,
    closeTimer: null,
    started: false,
    closed: false,
  };
  promise.catch(() => {
    if (webviewSessionLeases.get(sessionId) === lease) {
      webviewSessionLeases.delete(sessionId);
    }
  });
  webviewSessionLeases.set(sessionId, lease);
  return lease;
}

function releaseWebviewSession(sessionId: string) {
  const lease = webviewSessionLeases.get(sessionId);
  if (!lease) {
    return;
  }
  lease.refCount = Math.max(0, lease.refCount - 1);
  if (lease.refCount > 0) {
    return;
  }
  if (lease.closeTimer !== null) {
    window.clearTimeout(lease.closeTimer);
  }
  lease.closeTimer = window.setTimeout(() => {
    if (lease.refCount > 0 || webviewSessionLeases.get(sessionId) !== lease) {
      return;
    }
    lease.closed = true;
    void lease.promise
      .then(
        () =>
          invokeCommand("close_webview_session", {
            request: { sessionId },
          }).catch(() => undefined),
        () => undefined,
      )
      .finally(() => {
        if (webviewSessionLeases.get(sessionId) === lease) {
          webviewSessionLeases.delete(sessionId);
        }
      });
  }, 50);
}

function WebViewWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const updateWebviewTabMetadata = useWorkspaceStore((state) => state.updateWebviewTabMetadata);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const sessionStartedRef = useRef(false);
  const sessionStartingRef = useRef(false);
  const sessionIdRef = useRef<string>(`webview-${tab.id}`);
  const lastBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibilityRef = useRef({ isActive, webviewSuppressed: false });
  const [navError, setNavError] = useState("");
  const [fillStatus, setFillStatus] = useState("");
  const [webviewSuppressed, setWebviewSuppressed] = useState(false);
  const [addressInput, setAddressInput] = useState(tab.url ?? "");

  const initialUrl = tab.url ?? "";
  const urlCredentialUsername = tab.connection?.urlCredentialUsername;
  const canFillCredential = Boolean(tab.connection?.hasUrlCredential && urlCredentialUsername);

  const computeBounds = () => {
    const node = placeholderRef.current;
    if (!node) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  };

  const pushWebviewVisibility = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return;
    }
    const visible = visibilityRef.current.isActive && !visibilityRef.current.webviewSuppressed;
    void invokeCommand("set_webview_visibility", {
      request: { sessionId: sessionIdRef.current, visible, ...bounds },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
    if (visible) {
      lastBoundsRef.current = bounds;
    }
  };

  const scheduleBoundsPush = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const bounds = computeBounds();
      if (!bounds) {
        return;
      }
      if (!visibilityRef.current.isActive || visibilityRef.current.webviewSuppressed) {
        void invokeCommand("set_webview_visibility", {
          request: { sessionId: sessionIdRef.current, visible: false, ...bounds },
        }).catch((error) => {
          setNavError(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      const previous = lastBoundsRef.current;
      if (
        previous &&
        previous.x === bounds.x &&
        previous.y === bounds.y &&
        previous.width === bounds.width &&
        previous.height === bounds.height
      ) {
        return;
      }
      lastBoundsRef.current = bounds;
      void invokeCommand("update_webview_bounds", {
        request: { sessionId: sessionIdRef.current, ...bounds },
      }).catch((error) => {
        setNavError(error instanceof Error ? error.message : String(error));
      });
    });
  };

  useEffect(() => {
    if (!isTauriRuntime() || sessionStartedRef.current || sessionStartingRef.current || !initialUrl) {
      return;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return;
    }
    let disposed = false;
    const sessionId = sessionIdRef.current;
    sessionStartingRef.current = true;
    lastBoundsRef.current = bounds;
    const lease = acquireWebviewSession(sessionId, () =>
      invokeCommand("start_webview_session", {
        request: {
          sessionId,
          url: initialUrl,
          dataPartition: tab.dataPartition,
          ...bounds,
        },
      }),
    );
    lease.promise
      .then(() => {
        sessionStartingRef.current = false;
        if (disposed) {
          return;
        }
        sessionStartedRef.current = true;
        pushWebviewVisibility();
      })
      .catch((error) => {
        sessionStartingRef.current = false;
        sessionStartedRef.current = false;
        if (!disposed) {
          setNavError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ownsSession = sessionStartingRef.current || sessionStartedRef.current;
      sessionStartingRef.current = false;
      sessionStartedRef.current = false;
      if (ownsSession) {
        releaseWebviewSession(sessionId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    visibilityRef.current = { isActive, webviewSuppressed };
  }, [isActive, webviewSuppressed]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const node = placeholderRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => scheduleBoundsPush());
    observer.observe(node);
    window.addEventListener("resize", scheduleBoundsPush);
    window.addEventListener("scroll", scheduleBoundsPush, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBoundsPush);
      window.removeEventListener("scroll", scheduleBoundsPush, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const updateSuppression = () => {
      setWebviewSuppressed(documentHasWebviewOverlay());
    };
    updateSuppression();
    const observer = new MutationObserver(updateSuppression);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    pushWebviewVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, webviewSuppressed]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    const disposers: Array<() => void> = [];
    void Promise.all([
      listen<WebviewNavigationEvent>("webview-navigation", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        setAddressInput(event.payload.url);
        updateWebviewTabMetadata(tab.id, {
          subtitle: formatWebviewSubtitle(event.payload.url),
          url: event.payload.url,
        });
      }),
      listen<WebviewPageLoadEvent>("webview-page-load", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        setAddressInput(event.payload.url);
        if (event.payload.status === "finished") {
          setFillStatus("");
        }
      }),
      listen<WebviewTitleChangedEvent>("webview-title-changed", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        const title = event.payload.title.trim();
        if (title) {
          updateWebviewTabMetadata(tab.id, { title });
        }
      }),
      listen<WebviewDownloadEvent>("webview-download", (event) => {
        if (event.payload.sessionId !== sessionIdRef.current) {
          return;
        }
        if (event.payload.status === "requested") {
          setFillStatus("Download started");
          return;
        }
        if (event.payload.status === "finished") {
          setFillStatus(event.payload.success ? "Download complete" : "Download failed");
        }
      }),
    ]).then((unlistenFns) => {
      if (disposed) {
        unlistenFns.forEach((unlisten) => unlisten());
        return;
      }
      disposers.push(...unlistenFns);
    });

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, [tab.id, updateWebviewTabMetadata]);

  function handleNavigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    setNavError("");
    void invokeCommand("webview_navigate", {
      request: { sessionId: sessionIdRef.current, url: addressInput },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleSimple(name: "webview_reload" | "webview_go_back" | "webview_go_forward") {
    if (!isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    void invokeCommand(name, {
      request: { sessionId: sessionIdRef.current },
    }).catch((error) => {
      setNavError(error instanceof Error ? error.message : String(error));
    });
  }

  function handleFillCredential() {
    if (!isTauriRuntime() || !sessionStartedRef.current || !tab.connection || !urlCredentialUsername) {
      return;
    }
    setNavError("");
    setFillStatus("Filling credential");
    void invokeCommand("fill_webview_credential", {
      request: {
        sessionId: sessionIdRef.current,
        secretOwnerId: tab.connection.id,
        username: urlCredentialUsername,
      },
    })
      .then(() => setFillStatus("Credential filled"))
      .catch((error) => {
        setFillStatus("");
        setNavError(error instanceof Error ? error.message : String(error));
      });
  }

  return (
    <section
      className={isActive ? "terminal-workspace active" : "terminal-workspace"}
      ref={workspaceRef}
    >
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="icon-button"
            aria-label="Go back"
            onClick={() => handleSimple("webview_go_back")}
            title="Back"
            type="button"
          >
            <ArrowDown className="webview-nav-icon-back" size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Go forward"
            onClick={() => handleSimple("webview_go_forward")}
            title="Forward"
            type="button"
          >
            <ArrowDown className="webview-nav-icon-forward" size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Reload"
            onClick={() => handleSimple("webview_reload")}
            title="Reload"
            type="button"
          >
            <RefreshCw size={15} />
          </button>
          <form className="webview-toolbar-form" onSubmit={handleNavigate}>
            <input
              aria-label="Address"
              className="webview-address-input"
              onChange={(event) => setAddressInput(event.currentTarget.value)}
              placeholder="https://example.com"
              value={addressInput}
            />
          </form>
          <button
            className="toolbar-button"
            disabled={!canFillCredential}
            onClick={handleFillCredential}
            title={canFillCredential ? "Fill saved credential" : "No saved URL credential"}
            type="button"
          >
            <KeyRound size={15} />
            Fill
          </button>
          <ScreenshotMenu targetRef={workspaceRef} />
          {fillStatus ? <span className="webview-toolbar-status">{fillStatus}</span> : null}
        </div>
      </div>

      <div ref={placeholderRef} className="webview-placeholder">
        {!initialUrl ? (
          <p className="webview-placeholder-message">This URL connection has no URL configured.</p>
        ) : !isTauriRuntime() ? (
          <p className="webview-placeholder-message">
            Embedded browser only available in the desktop runtime. Open <code>{initialUrl}</code> externally.
          </p>
        ) : null}
        {navError ? <p className="form-error webview-placeholder-error">{navError}</p> : null}
      </div>
    </section>
  );
}

function documentHasWebviewOverlay() {
  return Boolean(
    document.querySelector(
      ".dialog-backdrop, .quick-connect-menu, .sftp-context-menu, .sftp-properties-popover, .screenshot-menu, .screenshot-region-overlay",
    ),
  );
}

function formatWebviewSubtitle(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function RemoteDesktopWorkspace({
  isActive,
  tab,
}: {
  isActive: boolean;
  tab: WorkspaceTab;
}) {
  const connection = tab.connection;
  const typeLabel = connection ? connectionTypeLabel(connection.type) : "Remote desktop";
  const Icon = connection ? connectionIconForType(connection.type) : Monitor;
  const workspaceRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionStartedRef = useRef(false);
  const sessionStartingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const lastBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibilityRef = useRef({ isActive, suppressed: false });
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore((state) => state.markConnectionSessionEnded);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const [suppressed, setSuppressed] = useState(false);
  const [rdpError, setRdpError] = useState("");
  const [rdpStatus, setRdpStatus] = useState("");
  const canStartRdp = connection?.type === "rdp";
  const closingAfterDisconnectRef = useRef(false);

  const computeBounds = () => {
    const node = hostRef.current;
    if (!node) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  };

  const pushRdpVisibility = () => {
    const sessionId = sessionIdRef.current;
    if (!sessionStartedRef.current || !sessionId) {
      return;
    }
    const visible = visibilityRef.current.isActive && !visibilityRef.current.suppressed;
    const bounds = visible ? computeBounds() : lastBoundsRef.current ?? computeBounds();
    if (!bounds) {
      return;
    }
    void invokeCommand("set_rdp_visibility", {
      request: { sessionId, visible, ...bounds },
    }).catch((error) => {
      setRdpError(error instanceof Error ? error.message : String(error));
    });
    if (!visible) {
      return;
    }
    const previous = lastBoundsRef.current;
    const boundsChanged =
      !previous ||
      previous.x !== bounds.x ||
      previous.y !== bounds.y ||
      previous.width !== bounds.width ||
      previous.height !== bounds.height;
    if (boundsChanged) {
      lastBoundsRef.current = bounds;
      void invokeCommand("update_rdp_bounds", {
        request: { sessionId, ...bounds },
      }).catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
    }
  };

  const scheduleBoundsPush = () => {
    if (!sessionStartedRef.current) {
      return;
    }
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      if (!visibilityRef.current.isActive || visibilityRef.current.suppressed) {
        const bounds = lastBoundsRef.current ?? computeBounds();
        if (!bounds) {
          return;
        }
        void invokeCommand("set_rdp_visibility", {
          request: { sessionId, visible: false, ...bounds },
        }).catch((error) => {
          setRdpError(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      const bounds = computeBounds();
      if (!bounds) {
        return;
      }
      const previous = lastBoundsRef.current;
      if (
        previous &&
        previous.x === bounds.x &&
        previous.y === bounds.y &&
        previous.width === bounds.width &&
        previous.height === bounds.height
      ) {
        return;
      }
      lastBoundsRef.current = bounds;
      void invokeCommand("update_rdp_bounds", {
        request: { sessionId, ...bounds },
      }).catch((error) => {
        setRdpError(error instanceof Error ? error.message : String(error));
      });
    });
  };

  useEffect(() => {
    if (!canStartRdp || !connection || !isTauriRuntime() || sessionStartedRef.current || sessionStartingRef.current) {
      return;
    }
    const bounds = computeBounds();
    if (!bounds) {
      return;
    }
    let disposed = false;
    const sessionId = `rdp-${tab.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionIdRef.current = sessionId;
    sessionStartingRef.current = true;
    lastBoundsRef.current = bounds;
    setRdpStatus("Connecting");
    void invokeCommand("start_rdp_session", {
      request: {
        sessionId,
        host: connection.host,
        user: connection.user,
        port: connection.port,
        secretOwnerId: connection.id,
        ...bounds,
      },
    })
      .then((started) => {
        sessionStartingRef.current = false;
        if (disposed) {
          void invokeCommand("close_rdp_session", { request: { sessionId: started.sessionId } });
          return;
        }
        sessionStartedRef.current = true;
        setRdpStatus(`Connected with ${started.control}`);
        markConnectionSessionStarted(connection.id);
        pushRdpVisibility();
      })
      .catch((error) => {
        sessionStartingRef.current = false;
        sessionStartedRef.current = false;
        if (!disposed) {
          setRdpStatus("");
          setRdpError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ownsSession = sessionStartingRef.current || sessionStartedRef.current;
      sessionStartingRef.current = false;
      const started = sessionStartedRef.current;
      sessionStartedRef.current = false;
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = null;
      }
      if (ownsSession) {
        void invokeCommand("close_rdp_session", { request: { sessionId } });
      }
      if (started) {
        markConnectionSessionEnded(connection.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    visibilityRef.current = { isActive, suppressed };
  }, [isActive, suppressed]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }
    const node = hostRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => scheduleBoundsPush());
    observer.observe(node);
    window.addEventListener("resize", scheduleBoundsPush);
    window.addEventListener("scroll", scheduleBoundsPush, true);
    const repushOnNativeMove = () => {
      lastBoundsRef.current = null;
      scheduleBoundsPush();
    };
    const moveUnlisten = listen("tauri://move", repushOnNativeMove).catch(() => null);
    const resizeUnlisten = listen("tauri://resize", repushOnNativeMove).catch(() => null);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBoundsPush);
      window.removeEventListener("scroll", scheduleBoundsPush, true);
      void moveUnlisten.then((dispose) => dispose?.());
      void resizeUnlisten.then((dispose) => dispose?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }
    const updateSuppression = () => {
      setSuppressed(documentHasWebviewOverlay());
    };
    updateSuppression();
    const observer = new MutationObserver(updateSuppression);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, [canStartRdp]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime() || !sessionStartedRef.current) {
      return;
    }
    pushRdpVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartRdp, isActive, suppressed]);

  useEffect(() => {
    if (!canStartRdp || !isTauriRuntime()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (!sessionStartedRef.current || !sessionId || closingAfterDisconnectRef.current) {
        return;
      }

      void invokeCommand("get_rdp_session_status", {
        request: { sessionId },
      })
        .then((status) => {
          if (!status.connected && sessionIdRef.current === status.sessionId) {
            closingAfterDisconnectRef.current = true;
            closeTab(tab.id);
          }
        })
        .catch((error) => {
          setRdpError(error instanceof Error ? error.message : String(error));
        });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canStartRdp, closeTab, tab.id]);

  return (
    <section
      className={isActive ? "terminal-workspace active" : "terminal-workspace"}
      ref={workspaceRef}
    >
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          {rdpStatus ? <span className="webview-toolbar-status">{rdpStatus}</span> : null}
          <ScreenshotMenu targetRef={workspaceRef} />
        </div>
      </div>
      <div className="remote-desktop-workspace" ref={hostRef}>
        <div className="remote-desktop-placeholder">
          <Icon size={34} />
          <h2>{connection?.name ?? typeLabel}</h2>
          <p>{connection ? `${typeLabel} ${connectionSubtitle(connection)}` : typeLabel}</p>
          {connection?.type === "rdp" ? (
            !isTauriRuntime() ? (
              <small>RDP uses the Windows desktop runtime.</small>
            ) : rdpError ? (
              <small className="form-error">{rdpError}</small>
            ) : (
              <small>Microsoft RDP ActiveX host is running in this workspace.</small>
            )
          ) : (
            <small>VNC transport implementation pending for v0.2.</small>
          )}
        </div>
      </div>
    </section>
  );
}

function normalizeFilenamePart(value: string) {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "terminal";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatBufferLogFilename(panelTitle: string, date = new Date()) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${normalizeFilenamePart(panelTitle)}_${year}${month}${day}_${hour}${minute}${second}.log`;
}

function TerminalWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const splitTerminalPaneDirected = useWorkspaceStore(
    (state) => state.splitTerminalPaneDirected,
  );
  const openSftpBrowser = useWorkspaceStore((state) => state.openSftpBrowser);
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const saveTabLayout = useWorkspaceStore((state) => state.saveTabLayout);
  const resetTabLayout = useWorkspaceStore((state) => state.resetTabLayout);
  const defaultFontSize = defaultTerminalSettings.fontSize;
  const canSplit = tab.panes.some((pane) => pane.connection);
  const sshConnection = tab.connection?.type === "ssh" ? tab.connection : undefined;
  const focusedPaneId = tab.focusedPaneId ?? tab.panes[0]?.id;
  const layout = useMemo(() => ensureLayout(tab.layout, tab.panes), [tab.layout, tab.panes]);

  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement | null>(null);
  const hamburgerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!splitMenuOpen && !hamburgerOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (splitMenuRef.current && target && !splitMenuRef.current.contains(target)) {
        setSplitMenuOpen(false);
      }
      if (hamburgerMenuRef.current && target && !hamburgerMenuRef.current.contains(target)) {
        setHamburgerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [splitMenuOpen, hamburgerOpen]);

  function handleSplit(direction: "right" | "left" | "down" | "up") {
    setSplitMenuOpen(false);
    splitTerminalPaneDirected(tab.id, direction);
  }

  async function handleSaveBuffer() {
    setHamburgerOpen(false);
    const targetPaneId = focusedPaneId;
    if (!targetPaneId) {
      return;
    }
    const targetPane = tab.panes.find((pane) => pane.id === targetPaneId);
    const renderer = getPaneRenderer(targetPaneId);
    if (!renderer) {
      return;
    }
    const defaultFilename = formatBufferLogFilename(targetPane?.title ?? tab.title);

    try {
      const text =
        targetPane?.connection?.type === "ssh" && targetPane.tmuxSessionId
          ? await invokeCommand("capture_tmux_pane", {
              request: {
                ...tmuxConnectionRequest(targetPane.connection),
                tmuxSessionId: targetPane.tmuxSessionId,
              },
            })
          : renderer.getBufferText();
      await saveTextFile(defaultFilename, text);
    } catch (error) {
      window.alert(
        `Could not save terminal buffer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function applyFontSizeToPanes(size: number) {
    for (const pane of tab.panes) {
      const renderer = getPaneRenderer(pane.id);
      renderer?.setFontSize(size);
    }
  }

  function currentFontSize() {
    const focusRenderer = focusedPaneId ? getPaneRenderer(focusedPaneId) : undefined;
    if (focusRenderer) {
      return focusRenderer.getFontSize();
    }
    for (const pane of tab.panes) {
      const renderer = getPaneRenderer(pane.id);
      if (renderer) {
        return renderer.getFontSize();
      }
    }
    return defaultFontSize;
  }

  function handleFontChange(delta: number | "reset") {
    const next = delta === "reset" ? defaultFontSize : currentFontSize() + delta;
    const clamped = Math.min(Math.max(Math.round(next), 6), 64);
    applyFontSizeToPanes(clamped);
  }

  function handleSaveView() {
    setHamburgerOpen(false);
    saveTabLayout(tab.id);
  }

  function handleResetView() {
    setHamburgerOpen(false);
    resetTabLayout(tab.id);
  }

  return (
    <section
      className={isActive ? "terminal-workspace active" : "terminal-workspace"}
    >
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="toolbar-button"
            aria-label="Open SFTP browser"
            disabled={!sshConnection}
            onClick={() => sshConnection && openSftpBrowser(sshConnection)}
            title="Open SFTP browser"
            type="button"
          >
            <Columns2 size={15} />
            SFTP
          </button>
          <div className="terminal-menu-wrapper" ref={splitMenuRef}>
            <button
              className="icon-button"
              aria-label="Split layout"
              aria-haspopup="menu"
              aria-expanded={splitMenuOpen ? "true" : "false"}
              disabled={!canSplit}
              onClick={() => setSplitMenuOpen((open) => !open)}
              title="Split layout"
              type="button"
            >
              <SplitSquareHorizontal size={15} />
            </button>
            {splitMenuOpen ? (
              <div className="terminal-menu" role="menu">
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("right")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowRight size={13} />
                  Split Right
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("left")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowLeft size={13} />
                  Split Left
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("down")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowDown size={13} />
                  Split Down
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("up")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowUp size={13} />
                  Split Up
                </button>
              </div>
            ) : null}
          </div>
          <div className="terminal-menu-wrapper" ref={hamburgerMenuRef}>
            <button
              className="icon-button"
              aria-label="Terminal actions"
              aria-haspopup="menu"
              aria-expanded={hamburgerOpen ? "true" : "false"}
              onClick={() => setHamburgerOpen((open) => !open)}
              title="Terminal actions"
              type="button"
            >
              <Menu size={15} />
            </button>
            {hamburgerOpen ? (
              <div className="terminal-menu" role="menu">
                <button
                  className="terminal-menu-item"
                  onClick={() => void handleSaveBuffer()}
                  role="menuitem"
                  type="button"
                >
                  <Save size={13} />
                  Save Buffer
                </button>
                <div className="terminal-menu-submenu">
                  <button
                    className="terminal-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <Type size={13} />
                    Font
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(1)}
                      role="menuitem"
                      type="button"
                    >
                      Increase size
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(-1)}
                      role="menuitem"
                      type="button"
                    >
                      Decrease size
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange("reset")}
                      role="menuitem"
                      type="button"
                    >
                      Reset size
                    </button>
                  </div>
                </div>
                <div className="terminal-menu-submenu">
                  <button
                    className="terminal-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <LayoutDashboard size={13} />
                    View
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={handleSaveView}
                      role="menuitem"
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={handleResetView}
                      role="menuitem"
                      type="button"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="terminal-grid">
        {layout ? (
          <TerminalLayoutView
            isActive={isActive}
            tabId={tab.id}
            layout={layout}
            panes={tab.panes}
            focusedPaneId={focusedPaneId}
            onFocusPane={(paneId) => setFocusedPane(tab.id, paneId)}
          />
        ) : null}
      </div>
    </section>
  );
}

function TerminalLayoutView({
  isActive,
  tabId,
  layout,
  panes,
  focusedPaneId,
  onFocusPane,
}: {
  isActive: boolean;
  tabId: string;
  layout: LayoutNode;
  panes: TerminalPane[];
  focusedPaneId: string | undefined;
  onFocusPane: (paneId: string) => void;
}) {
  if (layout.type === "leaf") {
    const pane = panes.find((entry) => entry.id === layout.paneId);
    if (!pane) {
      return null;
    }
    return (
      <div className="terminal-layout-leaf">
        <TerminalPaneView
          isActive={isActive}
          tabId={tabId}
          pane={pane}
          isFocused={pane.id === focusedPaneId}
          onFocus={() => onFocusPane(pane.id)}
        />
      </div>
    );
  }

  const className =
    layout.orientation === "horizontal"
      ? "terminal-layout-split terminal-layout-split-horizontal"
      : "terminal-layout-split terminal-layout-split-vertical";

  return (
    <div className={className}>
      {layout.children.map((child, index) => (
        <TerminalLayoutView
          key={child.type === "leaf" ? child.paneId : `split-${index}`}
          isActive={isActive}
          tabId={tabId}
          layout={child}
          panes={panes}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
        />
      ))}
    </div>
  );
}

function TmuxSessionTag({
  connection,
  sessionId,
  tabId,
}: {
  connection: Connection;
  sessionId?: string;
  tabId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [error, setError] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [mouseEnabledIds, setMouseEnabledIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const openTmuxSessionInPane = useWorkspaceStore((state) => state.openTmuxSessionInPane);

  const enabled = connection.type === "ssh" && connection.useTmuxSessions !== false && sessionId;

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function findSessionPane(tmuxSessionId: string): { tabId: string; paneId: string } | null {
    for (const tab of tabs) {
      if (tab.kind !== "terminal") continue;
      for (const pane of tab.panes) {
        if (pane.tmuxSessionId === tmuxSessionId) {
          return { tabId: tab.id, paneId: pane.id };
        }
      }
    }
    return null;
  }

  async function loadSessions() {
    if (!enabled || !isTauriRuntime()) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await invokeCommand("list_tmux_sessions", {
        request: tmuxConnectionRequest(connection),
      });
      setSessions(result);
    } catch (loadError) {
      setSessions([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    setExpandedSessionId(null);
    if (nextOpen) {
      await loadSessions();
    }
  }

  async function handleCloseSession(targetSessionId: string) {
    setLoading(true);
    setError("");
    try {
      await invokeCommand("close_tmux_session", {
        request: {
          ...tmuxConnectionRequest(connection),
          tmuxSessionId: targetSessionId,
        },
      });
      setMouseEnabledIds((prev) => {
        const next = new Set(prev);
        next.delete(targetSessionId);
        return next;
      });
      await loadSessions();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : String(closeError));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleMouse(targetSessionId: string) {
    const nextEnabled = !mouseEnabledIds.has(targetSessionId);
    try {
      await invokeCommand("set_tmux_mouse", {
        request: {
          ...tmuxConnectionRequest(connection),
          tmuxSessionId: targetSessionId,
          enabled: nextEnabled,
        },
      });
      setMouseEnabledIds((prev) => {
        const next = new Set(prev);
        if (nextEnabled) {
          next.add(targetSessionId);
        } else {
          next.delete(targetSessionId);
        }
        return next;
      });
    } catch (mouseError) {
      setError(mouseError instanceof Error ? mouseError.message : String(mouseError));
    }
  }

  function handleSessionRowClick(session: TmuxSession) {
    const location = findSessionPane(session.id);
    if (location) {
      activateTab(location.tabId);
      setFocusedPane(location.tabId, location.paneId);
      setOpen(false);
    } else {
      setExpandedSessionId((current) => (current === session.id ? null : session.id));
    }
  }

  function handleOpenInDirection(session: TmuxSession, direction: SplitDirection) {
    openTmuxSessionInPane(tabId, connection, session.id, direction);
    setOpen(false);
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className="tmux-session-wrapper" ref={menuRef}>
      <button
        className="tmux-session-tag"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => void handleToggle()}
        title="Show tmux sessions"
        type="button"
      >
        tmux {sessionId}
      </button>
      {open ? (
        <div className="tmux-session-menu" role="dialog" aria-label="tmux sessions">
          <header>
            <strong>tmux sessions</strong>
            <button
              className="terminal-pane-action"
              aria-label="Refresh tmux sessions"
              onClick={() => void loadSessions()}
              title="Refresh tmux sessions"
              type="button"
            >
              <RefreshCw size={13} />
            </button>
          </header>
          {loading ? <p>Loading...</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !error && sessions.length === 0 ? <p>No tmux sessions.</p> : null}
          <div className="tmux-session-list">
            {sessions.map((session) => {
              const location = findSessionPane(session.id);
              const isInApp = location !== null;
              const isExpanded = expandedSessionId === session.id;
              const mouseOn = mouseEnabledIds.has(session.id);

              return (
                <div className="tmux-session-row" key={session.id}>
                  <div className="tmux-session-row-main">
                    <button
                      className={`tmux-session-row-info${isInApp ? " in-app" : ""}`}
                      onClick={() => handleSessionRowClick(session)}
                      title={isInApp ? "Focus pane" : "Open in pane"}
                      type="button"
                    >
                      <strong>{session.id}</strong>
                      <small>
                        {isInApp ? "open" : session.attached ? "attached" : "detached"}
                        {" · "}
                        {session.windows}w
                      </small>
                    </button>
                    <button
                      className={`tmux-mouse-toggle${mouseOn ? " active" : ""}`}
                      aria-label={`${mouseOn ? "Disable" : "Enable"} mouse for ${session.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleToggleMouse(session.id)}
                      title={`Mouse: ${mouseOn ? "on" : "off"}`}
                      type="button"
                    >
                      <Mouse size={11} />
                    </button>
                    <button
                      className="terminal-pane-action"
                      aria-label={`Close tmux session ${session.id}`}
                      onClick={() => void handleCloseSession(session.id)}
                      title="Close tmux session"
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {!isInApp && isExpanded ? (
                    <div className="tmux-session-directions">
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "left")}
                        title="Open left"
                        type="button"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "up")}
                        title="Open above"
                        type="button"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "down")}
                        title="Open below"
                        type="button"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "right")}
                        title="Open right"
                        type="button"
                      >
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tmuxConnectionRequest(connection: Connection) {
  return {
    host: connection.host,
    user: connection.user,
    port: connection.port,
    keyPath: connection.keyPath,
    proxyJump: connection.proxyJump,
    authMethod: connection.authMethod,
    secretOwnerId: connection.id,
  };
}

async function inspectActiveSshSystemContext(tab: WorkspaceTab | undefined) {
  const connection =
    tab?.connection?.type === "ssh"
      ? tab.connection
      : tab?.panes.find((pane) => pane.connection?.type === "ssh")?.connection;
  if (!connection) {
    return undefined;
  }
  try {
    const context = await invokeCommand("inspect_ssh_system_context", {
      request: tmuxConnectionRequest(connection),
    });
    return [
      `Connection: ${connection.name}`,
      `Target: ${connection.user}@${connection.host}${connection.port ? `:${connection.port}` : ""}`,
      context.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    return `Connection: ${connection.name}\nTarget: ${connection.user}@${connection.host}${
      connection.port ? `:${connection.port}` : ""
    }\nSSH system context unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function TerminalPaneView({
  isActive,
  tabId,
  pane,
  isFocused,
  onFocus,
}: {
  isActive: boolean;
  tabId: string;
  pane: TerminalPane;
  isFocused: boolean;
  onFocus: () => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRendererRef = useRef<TerminalRenderer | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastResizeDimensionsRef = useRef<TerminalDimensions | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const onFocusRef = useRef(onFocus);
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<{
    resultIndex: number;
    resultCount: number;
    found: boolean;
  }>({ resultIndex: -1, resultCount: 0, found: true });
  const [selectedTerminalText, setSelectedTerminalText] = useState("");
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState | null>(null);
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const setAssistantContextSnippet = useWorkspaceStore(
    (state) => state.setAssistantContextSnippet,
  );
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore(
    (state) => state.markConnectionSessionEnded,
  );
  const recordTerminalStartMetric = useWorkspaceStore(
    (state) => state.recordTerminalStartMetric,
  );
  const clearTerminalStartMetric = useWorkspaceStore(
    (state) => state.clearTerminalStartMetric,
  );
  const closePane = useWorkspaceStore((state) => state.closePane);

  useEffect(() => {
    const element = terminalElementRef.current;
    const connection = pane.connection;
    if (!element || !connection || startedRef.current) {
      return;
    }

    startedRef.current = true;
    const terminal = createTerminalRenderer(terminalSettings);
    terminalRendererRef.current = terminal;
    terminal.open(element);
    terminal.fit();
    terminal.focus();
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey) {
        return true;
      }

      const key = event.key.toLowerCase();
      if (key === "c" && event.shiftKey) {
        const selection = terminal.getSelection();
        if (selection) {
          void writeToClipboard(selection);
          setSelectedTerminalText(selection);
          setContextMenu(null);
          return false;
        }
        return true;
      }

      if (key === "v") {
        void handlePasteIntoTerminal();
        return false;
      }

      return true;
    });
    registerPaneRenderer(pane.id, terminal);
    const focusDisposable = terminal.onFocus(() => {
      onFocusRef.current();
    });
    const terminalSessionType = connection.type === "local" ? "local" : "ssh";
    terminal.writeln(`Starting ${terminalSessionType} session for ${connection.name}...`);

    if (!isTauriRuntime()) {
      terminal.writeln("Terminal sessions require the Tauri desktop runtime.");
      return () => {
        terminal.dispose();
      };
    }

    const requestedSessionId = uniqueRuntimeId(`${connection.id}-terminal`);
    sessionIdRef.current = requestedSessionId;

    let disposed = false;
    let sessionStarted = false;
    let removeOutputListener: (() => void) | undefined;
    const writeInputToSession = (data: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data },
      });
      terminal.focus();
    };
    registerPaneInputWriter(pane.id, writeInputToSession);
    const dataDisposable = terminal.onData((data) => {
      if (terminalSettings.confirmMultilinePaste && isMultilinePaste(data)) {
        const shouldPaste = window.confirm("Paste multiple lines into this terminal?");
        if (!shouldPaste) {
          return;
        }
      }

      writeInputToSession(data);
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      setSelectedTerminalText(selection);
      if (selection && terminalSettings.copyOnSelect) {
        void navigator.clipboard?.writeText(selection);
      }
    });
    const searchResultsDisposable = terminal.onSearchResultsChange((result) => {
      setSearchResult({
        resultIndex: result.resultIndex,
        resultCount: result.resultCount,
        found: result.resultCount > 0,
      });
    });

    function fitAndResizeTerminal() {
      const dimensions = terminal.fit();
      const lastDimensions = lastResizeDimensionsRef.current;
      if (lastDimensions && terminalDimensionsEqual(lastDimensions, dimensions)) {
        return;
      }

      lastResizeDimensionsRef.current = dimensions;
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("resize_terminal", {
          request: {
            sessionId,
            cols: dimensions.cols,
            pixelHeight: dimensions.pixelHeight,
            pixelWidth: dimensions.pixelWidth,
            rows: dimensions.rows,
          },
        });
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fitAndResizeTerminal();
      });
    });
    resizeObserver.observe(element);

    void (async () => {
      const unlisten = await listen<TerminalOutput>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionIdRef.current) {
          terminal.write(event.payload.data);
        }
      });
      if (disposed) {
        unlisten();
        return;
      }
      removeOutputListener = unlisten;

      try {
        if (usesNativeSshHostKeyVerification(connection)) {
          terminal.writeln("Verifying SSH host key...");
          const preview = await invokeCommand("inspect_ssh_host_key", {
            request: {
              host: connection.host,
              port: connection.port,
            },
          });
          await confirmTrustedSshHostKey(preview);
        }

        const terminalStartAt = performance.now();
        const terminalDimensions = terminal.dimensions;
        const result = await invokeCommand("start_terminal_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            type: connection.type === "local" ? "local" : "ssh",
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            proxyJump: connection.proxyJump,
            authMethod: connection.authMethod,
            secretOwnerId: connection.id,
            shell:
              connection.type === "local"
                ? connection.localShell ?? terminalSettings.defaultShell
                : undefined,
            initialDirectory: connection.type === "local" ? undefined : pane.cwd.trim() || undefined,
            cols: terminalDimensions.cols,
            pixelHeight: terminalDimensions.pixelHeight,
            pixelWidth: terminalDimensions.pixelWidth,
            rows: terminalDimensions.rows,
            useTmux: connection.type === "ssh" && connection.useTmuxSessions !== false,
            tmuxSessionId: pane.tmuxSessionId,
          },
        });
        if (disposed) {
          void invokeCommand("close_terminal_session", { sessionId: result.sessionId });
          return;
        }
        const frontendDurationMs = Math.round(performance.now() - terminalStartAt);
        if (terminalSessionType === "ssh" && result.terminalReadyMs === undefined) {
          clearTerminalStartMetric("ssh");
        } else {
          recordTerminalStartMetric({
            kind: terminalSessionType,
            title: connection.name,
            durationMs:
              terminalSessionType === "ssh"
                ? result.terminalReadyMs ?? frontendDurationMs
                : frontendDurationMs,
            recordedAt: new Date().toISOString(),
          });
        }
        sessionIdRef.current = result.sessionId;
        sessionStarted = true;
        markConnectionSessionStarted(connection.id);
      } catch (error) {
        terminal.writeln("");
        terminal.writeln(`[failed to start session: ${String(error)}]`);
      }
    })();

    return () => {
      disposed = true;
      startedRef.current = false;
      dataDisposable.dispose();
      selectionDisposable.dispose();
      searchResultsDisposable.dispose();
      focusDisposable.dispose();
      unregisterPaneInputWriter(pane.id, writeInputToSession);
      unregisterPaneRenderer(pane.id, terminal);
      resizeObserver.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      removeOutputListener?.();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("close_terminal_session", { sessionId });
      }
      if (sessionStarted) {
        markConnectionSessionEnded(connection.id);
      }
      sessionIdRef.current = null;
      lastResizeDimensionsRef.current = null;
      terminalRendererRef.current = null;
      setSelectedTerminalText("");
      setContextMenu(null);
      setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
      terminal.dispose();
    };
  }, [
    clearTerminalStartMetric,
    markConnectionSessionEnded,
    markConnectionSessionStarted,
    pane.connection,
    pane.tmuxSessionId,
    recordTerminalStartMetric,
    terminalSettings,
  ]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const renderer = terminalRendererRef.current;
      if (!renderer) {
        return;
      }

      renderer.fit();
      renderer.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);


  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchOpen]);

  useEffect(() => {
    const renderer = terminalRendererRef.current;
    if (!renderer) {
      return;
    }

    if (!searchOpen || !searchTerm.trim()) {
      renderer.clearSearch();
      setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
      return;
    }

    const found = renderer.findNext(searchTerm);
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }, [searchOpen, searchTerm]);

  function handleCopyTerminalSelection() {
    const text = terminalRendererRef.current?.getSelection() || selectedTerminalText;
    if (text) {
      void writeToClipboard(text);
    }
    setContextMenu(null);
    terminalRendererRef.current?.focus();
  }

  async function handlePasteIntoTerminal() {
    const text = await readFromClipboard();
    if (!text) {
      setContextMenu(null);
      terminalRendererRef.current?.focus();
      return;
    }

    if (terminalSettings.confirmMultilinePaste && isMultilinePaste(text)) {
      const shouldPaste = window.confirm("Paste multiple lines into this terminal?");
      if (!shouldPaste) {
        setContextMenu(null);
        terminalRendererRef.current?.focus();
        return;
      }
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data: text },
      });
    }
    setContextMenu(null);
    terminalRendererRef.current?.focus();
  }

  function handleTerminalContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onFocus();

    const selection = terminalRendererRef.current?.getSelection() ?? "";
    setSelectedTerminalText(selection);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      hasSelection: Boolean(selection),
    });
  }

  function handleSendSelectionToAssistant() {
    const text = normalizeAssistantContextText(selectedTerminalText);
    if (!text) {
      return;
    }

    const sourceLabel = pane.connection
      ? `${pane.connection.name} terminal selection`
      : `${pane.title} terminal selection`;
    setAssistantContextSnippet({
      id: `terminal-selection-${Date.now()}`,
      sourceLabel,
      text,
      capturedAt: new Date().toISOString(),
    });
  }

  function handleSearchNext() {
    const found = terminalRendererRef.current?.findNext(searchTerm) ?? false;
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }

  function handleSearchPrevious() {
    const found = terminalRendererRef.current?.findPrevious(searchTerm) ?? false;
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }

  function handleCloseSearch() {
    terminalRendererRef.current?.clearSearch();
    setSearchOpen(false);
    setSearchTerm("");
    setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
    terminalRendererRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        handleSearchPrevious();
      } else {
        handleSearchNext();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseSearch();
    }
  }

  const searchStatusLabel = searchTerm.trim()
    ? searchResult.resultCount > 0 && searchResult.resultIndex >= 0
      ? `${searchResult.resultIndex + 1}/${searchResult.resultCount}`
      : searchResult.found
        ? "..."
        : "No results"
    : "";

  return (
    <article
      className={[
        "terminal-pane",
        searchOpen ? "terminal-pane-search-open" : "",
        isFocused ? "terminal-pane-focused" : "terminal-pane-inactive",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={() => onFocus()}
      ref={paneRef}
    >
      <header>
        <span>
          <Circle size={9} fill="currentColor" />
          {pane.title}
        </span>
        <div className="terminal-pane-actions">
          {pane.connection ? (
            <TmuxSessionTag connection={pane.connection} sessionId={pane.tmuxSessionId} tabId={tabId} />
          ) : null}
          <small>{pane.cwd}</small>
          <button
            className="terminal-pane-action"
            aria-label="Find in terminal scrollback"
            onClick={() => setSearchOpen((open) => !open)}
            title="Find in terminal scrollback"
            type="button"
          >
            <Search size={13} />
          </button>
          <button
            className="terminal-pane-action"
            aria-label="Copy terminal selection"
            disabled={!selectedTerminalText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopyTerminalSelection}
            title="Copy terminal selection (Ctrl+Shift+C)"
            type="button"
          >
            <Copy size={13} />
          </button>
          <ScreenshotMenu buttonClassName="terminal-pane-action" targetRef={paneRef} />
          <button
            className="terminal-pane-action"
            aria-label="Send selection to AI Assistant"
            disabled={!selectedTerminalText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSendSelectionToAssistant}
            title="Send selection to AI Assistant"
            type="button"
          >
            <Bot size={13} />
          </button>
          <button
            className="terminal-pane-action terminal-pane-close"
            aria-label={pane.tmuxSessionId ? "Detach tmux session" : "Close pane"}
            onClick={() => closePane(tabId, pane.id)}
            title={pane.tmuxSessionId ? "Detach tmux session" : "Close pane"}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      </header>
      {searchOpen ? (
        <div className="terminal-search-bar">
          <Search size={13} />
          <input
            aria-label="Find in terminal scrollback"
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find"
            ref={searchInputRef}
            value={searchTerm}
          />
          <span className={searchResult.found ? "terminal-search-count" : "terminal-search-count empty"}>
            {searchStatusLabel}
          </span>
          <button
            aria-label="Previous search result"
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchPrevious}
            title="Previous search result"
            type="button"
          >
            <ArrowUp size={13} />
          </button>
          <button
            aria-label="Next search result"
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchNext}
            title="Next search result"
            type="button"
          >
            <ArrowDown size={13} />
          </button>
          <button
            aria-label="Close terminal search"
            className="terminal-pane-action"
            onClick={handleCloseSearch}
            title="Close terminal search"
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}
      {pane.connection ? (
        <div className="xterm-host" onContextMenu={handleTerminalContextMenu} ref={terminalElementRef} />
      ) : (
        <pre>
          <code>{pane.buffer}</code>
        </pre>
      )}
      {contextMenu ? (
        <TerminalContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopyTerminalSelection}
          onPaste={() => void handlePasteIntoTerminal()}
        />
      ) : null}
    </article>
  );
}

function TerminalContextMenu({
  menu,
  onClose,
  onCopy,
  onPaste,
}: {
  menu: TerminalContextMenuState;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }

    const bounds = node.getBoundingClientRect();
    const left = Math.min(menu.x, window.innerWidth - bounds.width - 8);
    const top = Math.min(menu.y, window.innerHeight - bounds.height - 8);
    node.style.left = `${Math.max(8, left)}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }, [menu.x, menu.y]);

  return (
    <div
      className="terminal-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
    >
      {menu.hasSelection ? (
        <button
          onClick={() => {
            onCopy();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <Copy size={14} />
          <span>Copy</span>
        </button>
      ) : (
        <button
          onClick={() => {
            onPaste();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <ClipboardPaste size={14} />
          <span>Paste</span>
        </button>
      )}
    </div>
  );
}

function isMultilinePaste(data: string) {
  return data.split(/\r\n|\r|\n/).filter((line) => line.length > 0).length > 1;
}

function terminalDimensionsEqual(left: TerminalDimensions, right: TerminalDimensions) {
  return (
    left.cols === right.cols &&
    left.pixelHeight === right.pixelHeight &&
    left.pixelWidth === right.pixelWidth &&
    left.rows === right.rows
  );
}

function normalizeAssistantContextText(text: string) {
  const normalized = text.trim();
  if (normalized.length <= ASSISTANT_CONTEXT_MAX_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, ASSISTANT_CONTEXT_MAX_CHARS)}\n[Selection truncated before adding to AI Assistant context.]`;
}

function usesNativeSshHostKeyVerification(connection: Connection) {
  return (
    connection.type === "ssh" &&
    (Boolean(connection.keyPath?.trim()) ||
      Boolean(connection.hasPassword) ||
      connection.authMethod === "password" ||
      connection.authMethod === "agent") &&
    !connection.proxyJump?.trim()
  );
}

async function confirmTrustedSshHostKey(preview: SshHostKeyPreview) {
  if (preview.status === "trusted") {
    return;
  }

  if (preview.status === "changed") {
    throw new Error(
      `SSH host key for ${preview.host}:${preview.port} changed. Presented ${preview.algorithm} ${preview.fingerprint}.`,
    );
  }

  const shouldTrust = window.confirm(
    [
      `Trust SSH host key for ${preview.host}:${preview.port}?`,
      "",
      `${preview.algorithm} ${preview.fingerprint}`,
    ].join("\n"),
  );
  if (!shouldTrust) {
    throw new Error("SSH host key was not trusted");
  }

  await invokeCommand("trust_ssh_host_key", {
    request: {
      host: preview.host,
      port: preview.port,
      publicKey: preview.publicKey,
    },
  });
}

function SftpWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const openTerminalHere = useWorkspaceStore((state) => state.openTerminalHere);
  const connection = tab.connection;
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [localFiles, setLocalFiles] = useState<FileEntry[]>([]);
  const [remotePath, setRemotePath] = useState(".");
  const [remoteFiles, setRemoteFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [localStatus, setLocalStatus] = useState("");
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [selectedLocalNames, setSelectedLocalNames] = useState<string[]>([]);
  const [selectedRemoteNames, setSelectedRemoteNames] = useState<string[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [contextMenu, setContextMenu] = useState<SftpContextMenuState | null>(null);
  const [propertiesState, setPropertiesState] = useState<FilePropertiesState | null>(null);
  const [transferConflict, setTransferConflict] = useState<TransferConflictState | null>(null);
  const [renameRequest, setRenameRequest] = useState<{
    side: FilePaneSide;
    name: string;
    requestId: number;
  } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeTransferIdRef = useRef<string | null>(null);
  const transferConflictResolverRef = useRef<
    ((decision: TransferConflictDecision) => void) | null
  >(null);
  const overwriteAllConflictsRef = useRef<Record<TransferDirection, boolean>>({
    upload: false,
    download: false,
  });
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore(
    (state) => state.markConnectionSessionEnded,
  );

  useEffect(() => {
    void loadLocalDirectory();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let dispose: (() => void) | undefined;
    let disposed = false;
    void listen<SftpTransferProgress>("sftp-transfer-progress", (event) => {
      const progress = event.payload;
      setTransfers((current) =>
        current.map((transfer) =>
          transfer.id === progress.transferId
            ? {
                ...transfer,
                progress: progress.progress,
                detail:
                  progress.totalBytes > 0
                    ? `${formatFileSize(progress.transferredBytes)} / ${formatFileSize(
                        progress.totalBytes,
                      )}`
                    : `${formatFileSize(progress.transferredBytes)} transferred`,
              }
            : transfer,
        ),
      );
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      dispose = unlisten;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  const loadLocalDirectory = async (path?: string) => {
    if (!isTauriRuntime()) {
      setLocalStatus("Tauri runtime unavailable");
      setLocalFiles([]);
      return;
    }

    setIsLocalLoading(true);
    setLocalStatus(path ? "Opening folder" : "Loading local files");
    try {
      const result = await invokeCommand("list_local_directory", {
        request: { path },
      });
      setLocalPath(result.path);
      setLocalFiles(result.entries.map(localEntryToFileEntry));
      setSelectedLocalNames([]);
      setLocalStatus("");
    } catch (error) {
      setLocalStatus(String(error));
      setLocalFiles([]);
    } finally {
      setIsLocalLoading(false);
    }
  };

  useEffect(() => {
    if (!connection) {
      setStatus("No SSH connection selected");
      return;
    }

    if (!isTauriRuntime()) {
      setStatus("Tauri runtime unavailable");
      return;
    }

    let disposed = false;
    let sessionStarted = false;
    const requestedSessionId = uniqueRuntimeId(`${connection.id}-sftp`);
    sessionIdRef.current = requestedSessionId;
    setIsRemoteLoading(true);
    setStatus("Verifying host");

    (async () => {
      try {
        if (usesNativeSshHostKeyVerification(connection)) {
          const preview = await invokeCommand("inspect_ssh_host_key", {
            request: {
              host: connection.host,
              port: connection.port,
            },
          });
          await confirmTrustedSshHostKey(preview);
        }

        setStatus("Opening SFTP");
        const result = await invokeCommand("start_sftp_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            proxyJump: connection.proxyJump,
            authMethod: connection.authMethod,
            secretOwnerId: connection.id,
            path: ".",
          },
        });

        if (disposed) {
          void invokeCommand("close_sftp_session", { sessionId: result.sessionId });
          return;
        }

        sessionIdRef.current = result.sessionId;
        sessionStarted = true;
        markConnectionSessionStarted(connection.id);
        setRemotePath(result.path);
        setRemoteFiles(result.entries.map(remoteEntryToFileEntry));
        setSelectedRemoteNames([]);
        setStatus("Connected");
      } catch (error) {
        if (!disposed) {
          setStatus(String(error));
          setRemoteFiles([]);
        }
      } finally {
        if (!disposed) {
          setIsRemoteLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      const sessionId =
        sessionIdRef.current === requestedSessionId ? sessionIdRef.current : requestedSessionId;
      if (sessionId) {
        void invokeCommand("close_sftp_session", { sessionId });
      }
      if (sessionStarted) {
        markConnectionSessionEnded(connection.id);
      }
      if (sessionIdRef.current === requestedSessionId) {
        sessionIdRef.current = null;
      }
    };
  }, [connection, markConnectionSessionEnded, markConnectionSessionStarted]);

  const refreshRemoteDirectory = async () => {
    await loadRemoteDirectory(remotePath, "Refreshing");
  };

  const loadRemoteDirectory = async (path: string, loadingStatus = "Opening folder") => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus(loadingStatus);
    try {
      const result = await invokeCommand("list_sftp_directory", {
        request: { sessionId, path },
      });
      setRemotePath(result.path);
      setRemoteFiles(result.entries.map(remoteEntryToFileEntry));
      setSelectedRemoteNames([]);
      setStatus("Connected");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const openRemoteFolder = async (folderName: string) => {
    await loadRemoteDirectory(joinRemotePath(remotePath, folderName));
  };

  const openRemoteParent = async () => {
    await loadRemoteDirectory(joinRemotePath(remotePath, ".."));
  };

  const refreshLocalDirectory = async () => {
    await loadLocalDirectory(localPath || undefined);
  };

  const openLocalFolder = async (folderName: string) => {
    await loadLocalDirectory(joinLocalPath(localPath, folderName));
  };

  const openLocalParent = async () => {
    await loadLocalDirectory(joinLocalPath(localPath, ".."));
  };

  const setTransferState = (id: string, patch: Partial<TransferRecord>) => {
    setTransfers((current) =>
      current.map((transfer) => (transfer.id === id ? { ...transfer, ...patch } : transfer)),
    );
  };

  const resolveTransferConflict = (decision: TransferConflictDecision) => {
    transferConflictResolverRef.current?.(decision);
    transferConflictResolverRef.current = null;
    setTransferConflict(null);
  };

  const promptTransferConflict = (conflict: TransferConflictState) =>
    new Promise<TransferConflictDecision>((resolve) => {
      transferConflictResolverRef.current = resolve;
      setTransferConflict(conflict);
    });

  const conflictTargetPath = (direction: TransferDirection, fileName: string) =>
    direction === "upload" ? joinRemotePath(remotePath, fileName) : joinLocalPath(localPath, fileName);

  const destinationHasVisibleConflict = (direction: TransferDirection, fileName: string) => {
    const targetFiles = direction === "upload" ? remoteFiles : localFiles;
    return targetFiles.some((file) =>
      direction === "download"
        ? file.name.localeCompare(fileName, undefined, { sensitivity: "accent" }) === 0
        : file.name === fileName,
    );
  };

  const isExistingDestinationError = (message: string) =>
    /already exists/i.test(message) || /destination .*exists/i.test(message);

  const conflictPathFromError = (message: string, fallbackPath: string) => {
    const match = message.match(/already exists:\s*(.+)$/i);
    return match?.[1]?.trim() || fallbackPath;
  };

  const runQueuedTransfer = async (transfer: TransferRecord) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      setTransferState(transfer.id, {
        state: "failed",
        progress: 100,
        detail: "SFTP session unavailable",
      });
      activeTransferIdRef.current = null;
      return;
    }

    setTransferState(transfer.id, {
      state: "active",
      detail: "Preparing",
    });

    try {
      const result =
        transfer.direction === "upload"
          ? await invokeCommand("upload_sftp_path", {
              request: {
                sessionId,
                transferId: transfer.id,
                localPath: transfer.localPath ?? "",
                remoteDirectory: transfer.remoteDirectory ?? remotePath,
                overwriteBehavior: transfer.overwriteBehavior,
              },
            })
          : await invokeCommand("download_sftp_path", {
              request: {
                sessionId,
                transferId: transfer.id,
                remotePath: transfer.remotePath ?? "",
                localDirectory: transfer.localDirectory ?? localPath,
                overwriteBehavior: transfer.overwriteBehavior,
              },
            });

      setTransferState(transfer.id, {
        state: "done",
        progress: 100,
        detail: formatTransferResult(result),
      });

      if (transfer.direction === "upload") {
        await refreshRemoteDirectory();
      } else {
        await refreshLocalDirectory();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        transfer.overwriteBehavior !== "overwrite" &&
        isExistingDestinationError(message) &&
        overwriteAllConflictsRef.current[transfer.direction]
      ) {
        setTransferState(transfer.id, {
          state: "queued",
          progress: 0,
          detail: "Waiting to overwrite",
          overwriteBehavior: "overwrite",
        });
        return;
      }

      if (
        transfer.overwriteBehavior !== "overwrite" &&
        isExistingDestinationError(message) &&
        !overwriteAllConflictsRef.current[transfer.direction]
      ) {
        const decision = await promptTransferConflict({
          direction: transfer.direction,
          name: transfer.name,
          targetPath: conflictPathFromError(
            message,
            transfer.direction === "upload"
              ? joinRemotePath(transfer.remoteDirectory ?? remotePath, transfer.name)
              : joinLocalPath(transfer.localDirectory ?? localPath, transfer.name),
          ),
          isFolder: false,
          remainingConflicts: transfers.filter(
            (queuedTransfer) =>
              queuedTransfer.direction === transfer.direction && queuedTransfer.state === "queued",
          ).length,
        });

        if (decision === "overwrite" || decision === "overwriteAll") {
          if (decision === "overwriteAll") {
            overwriteAllConflictsRef.current[transfer.direction] = true;
            setTransfers((current) =>
              current.map((queuedTransfer) =>
                queuedTransfer.direction === transfer.direction && queuedTransfer.state === "queued"
                  ? { ...queuedTransfer, overwriteBehavior: "overwrite" }
                  : queuedTransfer,
              ),
            );
          }
          setTransferState(transfer.id, {
            state: "queued",
            progress: 0,
            detail: "Waiting to overwrite",
            overwriteBehavior: "overwrite",
          });
          return;
        }

        setTransferState(transfer.id, {
          state: decision === "skip" ? "canceled" : "failed",
          progress: 100,
          detail: decision === "skip" ? "Skipped existing target" : "Transfer canceled",
        });
        return;
      }

      setTransferState(transfer.id, {
        state: message.includes("transfer canceled") ? "canceled" : "failed",
        progress: 100,
        detail: message.includes("transfer canceled") ? "Canceled" : message,
      });
    } finally {
      activeTransferIdRef.current = null;
      setTransfers((current) => [...current]);
    }
  };

  useEffect(() => {
    if (activeTransferIdRef.current) {
      return;
    }

    const nextTransfer = transfers.find((transfer) => transfer.state === "queued");
    if (!nextTransfer) {
      return;
    }

    activeTransferIdRef.current = nextTransfer.id;
    void runQueuedTransfer(nextTransfer);
  }, [transfers]);

  useEffect(() => {
    if (transfers.some((transfer) => transfer.state === "queued" || transfer.state === "active")) {
      return;
    }

    overwriteAllConflictsRef.current = {
      upload: false,
      download: false,
    };
  }, [transfers]);

  const enqueueTransfers = async (direction: TransferDirection, names: string[]) => {
    const sessionId = sessionIdRef.current;
    const selected =
      direction === "upload"
        ? localFiles.filter((file) => names.includes(file.name))
        : remoteFiles.filter((file) => names.includes(file.name));
    if (!sessionId || selected.length === 0 || !localPath || !isTauriRuntime()) {
      return;
    }

    const visibleConflictCount = selected.filter((file) =>
      destinationHasVisibleConflict(direction, file.name),
    ).length;
    let batchOverwriteAll = overwriteAllConflictsRef.current[direction];
    let promptedConflictCount = 0;
    const nextTransfers: TransferRecord[] = [];

    for (const file of selected) {
      let overwriteBehavior: SftpSettings["overwriteBehavior"] = sftpSettings.overwriteBehavior;
      if (destinationHasVisibleConflict(direction, file.name)) {
        if (!batchOverwriteAll) {
          const decision = await promptTransferConflict({
            direction,
            name: file.name,
            targetPath: conflictTargetPath(direction, file.name),
            isFolder: file.kind === "folder",
            remainingConflicts: Math.max(visibleConflictCount - promptedConflictCount - 1, 0),
          });
          promptedConflictCount += 1;

          if (decision === "cancel") {
            break;
          }
          if (decision === "skip") {
            continue;
          }
          if (decision === "overwriteAll") {
            batchOverwriteAll = true;
            overwriteAllConflictsRef.current[direction] = true;
          }
        }

        overwriteBehavior = "overwrite";
      }

      nextTransfers.push({
        id: uniqueRuntimeId(direction),
        direction,
        name: file.name,
        state: "queued",
        progress: 0,
        detail: "Waiting",
        overwriteBehavior,
        localPath: direction === "upload" ? joinLocalPath(localPath, file.name) : undefined,
        remoteDirectory: direction === "upload" ? remotePath : undefined,
        remotePath: direction === "download" ? joinRemotePath(remotePath, file.name) : undefined,
        localDirectory: direction === "download" ? localPath : undefined,
      });
    }

    if (nextTransfers.length > 0) {
      setTransfers((current) => [...current, ...nextTransfers]);
    }
  };

  const handleUpload = (names = selectedLocalNames) => {
    void enqueueTransfers("upload", names);
  };

  const handleDownload = (names = selectedRemoteNames) => {
    void enqueueTransfers("download", names);
  };

  const handleCancelTransfer = async (transfer: TransferRecord) => {
    if (transfer.state === "queued") {
      setTransferState(transfer.id, {
        state: "canceled",
        progress: 100,
        detail: "Canceled before start",
      });
      return;
    }

    if (transfer.state !== "active") {
      return;
    }

    setTransferState(transfer.id, { detail: "Canceling" });
    try {
      await invokeCommand("cancel_sftp_transfer", {
        request: { transferId: transfer.id },
      });
    } catch (error) {
      setTransferState(transfer.id, {
        state: "failed",
        progress: 100,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCreateRemoteFolder = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      return;
    }

    const name = window.prompt("New remote folder name");
    if (name === null) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus("Remote folder name cannot be blank");
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Creating folder");
    try {
      await invokeCommand("create_sftp_folder", {
        request: {
          sessionId,
          parentPath: remotePath,
          name: trimmedName,
        },
      });
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleRenameRemotePath = async (currentName: string, newName: string) => {
    const sessionId = sessionIdRef.current;
    const selected = remoteFiles.find((file) => file.name === currentName);
    if (!sessionId || !selected || !isTauriRuntime()) {
      return;
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setStatus("Remote name cannot be blank");
      return;
    }
    if (trimmedName === selected.name) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Renaming");
    try {
      await invokeCommand("rename_sftp_path", {
        request: {
          sessionId,
          path: joinRemotePath(remotePath, selected.name),
          newName: trimmedName,
        },
      });
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleDeleteRemotePath = async (names = selectedRemoteNames) => {
    const sessionId = sessionIdRef.current;
    const selected = remoteFiles.filter((file) => names.includes(file.name));
    if (!sessionId || selected.length === 0 || !isTauriRuntime()) {
      return;
    }

    const shouldDelete = window.confirm(
      selected.length === 1
        ? `Delete remote ${selected[0].kind} "${selected[0].name}"?`
        : `Delete ${selected.length} remote items?`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Deleting");
    try {
      for (const item of selected) {
        await invokeCommand("delete_sftp_path", {
          request: {
            sessionId,
            path: joinRemotePath(remotePath, item.name),
          },
        });
      }
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleOpenTerminalHere = () => {
    if (!connection || !isConnected) {
      return;
    }

    openTerminalHere(connection, remotePath);
  };

  const selectedLocalFiles = localFiles.filter((file) => selectedLocalNames.includes(file.name));
  const selectedRemoteFiles = remoteFiles.filter((file) => selectedRemoteNames.includes(file.name));

  const handleDropTransfer = (targetSide: FilePaneSide, names: string[]) => {
    if (targetSide === "remote") {
      handleUpload(names);
      return;
    }

    handleDownload(names);
  };

  const handleOpenContextMenu = (
    side: FilePaneSide,
    names: string[],
    event: ReactMouseEvent,
  ) => {
    event.preventDefault();
    const fallbackNames = side === "local" ? selectedLocalNames : selectedRemoteNames;
    const nextNames = names.length > 0 ? names : fallbackNames;
    if (nextNames.length === 0) {
      setContextMenu(null);
      return;
    }

    if (side === "local") {
      setSelectedLocalNames(nextNames);
    } else {
      setSelectedRemoteNames(nextNames);
    }

    setContextMenu({
      side,
      names: nextNames,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleContextTransfer = (menu: SftpContextMenuState) => {
    if (menu.side === "local") {
      handleUpload(menu.names);
    } else {
      handleDownload(menu.names);
    }
    setContextMenu(null);
  };

  const handleContextRename = (menu: SftpContextMenuState) => {
    if (menu.side === "remote" && menu.names.length === 1) {
      setSelectedRemoteNames(menu.names);
      setRenameRequest({
        side: "remote",
        name: menu.names[0],
        requestId: Date.now(),
      });
    }
    setContextMenu(null);
  };

  const handleContextDelete = (menu: SftpContextMenuState) => {
    if (menu.side === "remote") {
      void handleDeleteRemotePath(menu.names);
    }
    setContextMenu(null);
  };

  const handleOpenProperties = async (side: FilePaneSide, names: string[]) => {
    const name = names[0];
    const entry =
      side === "local"
        ? localFiles.find((file) => file.name === name)
        : remoteFiles.find((file) => file.name === name);
    if (!entry) {
      return;
    }

    const path =
      side === "local" ? joinLocalPath(localPath, entry.name) : joinRemotePath(remotePath, entry.name);
    let remoteProperties: SftpPathProperties | undefined;
    if (side === "remote") {
      const sessionId = sessionIdRef.current;
      if (!sessionId || !isTauriRuntime()) {
        setStatus("SFTP session unavailable");
        return;
      }

      try {
        remoteProperties = await invokeCommand("sftp_path_properties", {
          request: { sessionId, path },
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    setPropertiesState({ side, entry, path, remoteProperties });
  };

  const handleContextProperties = (menu: SftpContextMenuState) => {
    void handleOpenProperties(menu.side, menu.names);
    setContextMenu(null);
  };

  const handleUpdateRemoteProperties = async (request: {
    permissions?: string;
    uid?: number;
    gid?: number;
  }) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !propertiesState || propertiesState.side !== "remote" || !isTauriRuntime()) {
      return;
    }

    try {
      const remoteProperties = await invokeCommand("update_sftp_path_properties", {
        request: {
          sessionId,
          path: propertiesState.path,
          ...request,
        },
      });
      setPropertiesState((current) =>
        current ? { ...current, remoteProperties } : current,
      );
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const isConnected = status === "Connected" && Boolean(sessionIdRef.current);
  const isTransferring = transfers.some((transfer) => transfer.state === "active");
  const activeTransferCount = transfers.filter((transfer) => transfer.state === "active").length;
  const clearableTransferCount = transfers.filter((transfer) =>
    TRANSFER_HISTORY_STATES.includes(transfer.state),
  ).length;

  return (
    <section
      className={isActive ? "sftp-workspace active" : "sftp-workspace"}
      ref={workspaceRef}
    >
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{status === "Connected" ? tab.subtitle : status}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="toolbar-button"
            disabled={!isConnected || selectedLocalFiles.length === 0}
            onClick={() => handleUpload()}
            type="button"
          >
            <Upload size={15} />
            Upload
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected || selectedRemoteFiles.length === 0 || !localPath}
            onClick={() => handleDownload()}
            type="button"
          >
            <Download size={15} />
            Download
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected}
            onClick={handleOpenTerminalHere}
            type="button"
          >
            <Terminal size={15} />
            Terminal
          </button>
          <ScreenshotMenu targetRef={workspaceRef} />
        </div>
      </div>

      <div className="file-manager">
        <FilePane
          side="local"
          title="Local"
          path={localPath || localStatus || "Local files"}
          files={localFiles}
          isLoading={isLocalLoading}
          status={localStatus}
          selectedNames={selectedLocalNames}
          onRefresh={refreshLocalDirectory}
          onGoUp={openLocalParent}
          onOpenFolder={openLocalFolder}
          onSelectionChange={setSelectedLocalNames}
          onContextMenuRequest={handleOpenContextMenu}
          onDropTransfer={isConnected && !isTransferring ? handleDropTransfer : undefined}
        />
        <FilePane
          side="remote"
          title="Remote"
          path={remotePath}
          files={remoteFiles}
          isLoading={isRemoteLoading}
          status={status === "Connected" ? "" : status}
          selectedNames={selectedRemoteNames}
          onRefresh={refreshRemoteDirectory}
          onGoUp={openRemoteParent}
          onCreateFolder={isConnected && !isTransferring ? handleCreateRemoteFolder : undefined}
          onRenameSelected={isConnected && !isTransferring ? handleRenameRemotePath : undefined}
          onDeleteSelected={isConnected && !isTransferring ? handleDeleteRemotePath : undefined}
          onOpenFolder={openRemoteFolder}
          onSelectionChange={setSelectedRemoteNames}
          onContextMenuRequest={handleOpenContextMenu}
          onDropTransfer={isConnected && !isTransferring ? handleDropTransfer : undefined}
          renameRequest={renameRequest?.side === "remote" ? renameRequest : undefined}
        />
      </div>

      <div className="transfer-queue">
        <header>
          <strong>Transfer activity</strong>
          <div className="transfer-queue-actions">
            <span>{activeTransferCount} active</span>
            <button
              className="toolbar-button transfer-clear-button"
              disabled={clearableTransferCount === 0}
              onClick={() =>
                setTransfers((current) =>
                  current.filter((transfer) => !TRANSFER_HISTORY_STATES.includes(transfer.state)),
                )
              }
              type="button"
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </header>
        {transfers.length === 0 ? (
          <div className="transfer-row transfer-row-muted">No transfers yet</div>
        ) : null}
        {transfers.map((transfer) => (
          <div className="transfer-row" key={transfer.id}>
            <span>
              {transfer.direction === "upload" ? "Upload" : "Download"} {transfer.name}
            </span>
            <progress value={transfer.progress} max="100" />
            <small className={`transfer-state transfer-state-${transfer.state}`}>
              {transfer.state}
            </small>
            <small>{transfer.detail}</small>
            <button
              className="row-action"
              aria-label={`Cancel ${transfer.name}`}
              disabled={!["active", "queued"].includes(transfer.state)}
              onClick={() => void handleCancelTransfer(transfer)}
              title={`Cancel ${transfer.name}`}
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {contextMenu ? (
        <SftpContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleContextDelete}
          onProperties={handleContextProperties}
          onRename={handleContextRename}
          onTransfer={handleContextTransfer}
        />
      ) : null}
      {propertiesState ? (
        <SftpPropertiesPopup
          properties={propertiesState}
          onClose={() => setPropertiesState(null)}
          onSave={(request) => void handleUpdateRemoteProperties(request)}
        />
      ) : null}
      {transferConflict ? (
        <TransferConflictDialog
          conflict={transferConflict}
          onDecision={resolveTransferConflict}
        />
      ) : null}
    </section>
  );
}

function localEntryToFileEntry(entry: LocalDirectoryEntry): FileEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    size: entry.kind === "folder" ? "-" : formatFileSize(entry.size),
    sizeBytes: entry.size,
    modified: formatRemoteTime(entry.modified),
    modifiedTimestamp: entry.modified,
  };
}

function remoteEntryToFileEntry(entry: SftpDirectoryEntry): FileEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    size: entry.kind === "folder" ? "-" : formatFileSize(entry.size),
    sizeBytes: entry.size,
    modified: formatRemoteTime(entry.modified),
    modifiedTimestamp: entry.modified,
    accessedTimestamp: entry.accessed,
    permissions: entry.permissions,
    mode: entry.permissions === undefined ? undefined : formatMode(entry.permissions),
    uid: entry.uid,
    user: entry.user,
    gid: entry.gid,
    group: entry.group,
  };
}

function formatTransferResult(result: SftpTransferResult) {
  const parts = [`${result.files} files`];
  if (result.folders > 0) {
    parts.push(`${result.folders} folders`);
  }
  parts.push(formatFileSize(result.bytes));
  return parts.join(" | ");
}

function joinRemotePath(basePath: string, childName: string) {
  if (!basePath || basePath === ".") {
    return childName;
  }
  if (basePath.endsWith("/")) {
    return `${basePath}${childName}`;
  }
  return `${basePath}/${childName}`;
}

function joinLocalPath(basePath: string, childName: string) {
  if (!basePath) {
    return childName;
  }
  if (basePath.endsWith("\\") || basePath.endsWith("/")) {
    return `${basePath}${childName}`;
  }
  return `${basePath}\\${childName}`;
}

function formatFileSize(size?: number) {
  if (size === undefined) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatRemoteTime(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatMode(mode?: number) {
  if (mode === undefined) {
    return "";
  }

  return (mode & 0o7777).toString(8).padStart(3, "0");
}

function sortFileEntries(files: FileEntry[], sortKey: FileSortKey) {
  return [...files].sort((left, right) => {
    if (left.kind === "folder" && right.kind !== "folder") {
      return -1;
    }
    if (left.kind !== "folder" && right.kind === "folder") {
      return 1;
    }

    if (sortKey === "date") {
      const leftTime = left.modifiedTimestamp ?? 0;
      const rightTime = right.modifiedTimestamp ?? 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function fileSortLabel(sortKey: FileSortKey) {
  return sortKey === "name" ? "Name" : "Date";
}

const FILE_ICON_BY_NAME: Record<string, string> = {
  ".dockerignore": dockerIcon,
  ".env": settingsIcon,
  ".gitattributes": gitIcon,
  ".gitignore": gitIcon,
  ".npmrc": settingsIcon,
  ".prettierrc": settingsIcon,
  ".yarnrc": settingsIcon,
  "cargo.lock": lockIcon,
  "docker-compose.yml": dockerIcon,
  "docker-compose.yaml": dockerIcon,
  "dockerfile": dockerIcon,
  "go.mod": goIcon,
  "go.sum": goIcon,
  "makefile": consoleIcon,
  "package-lock.json": lockIcon,
  "package.json": jsonIcon,
  "pnpm-lock.yaml": lockIcon,
  "readme": markdownIcon,
  "tsconfig.json": typescriptIcon,
  "vite.config.js": javascriptIcon,
  "vite.config.mjs": javascriptIcon,
  "vite.config.ts": typescriptIcon,
  "yarn.lock": lockIcon,
};

const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  "7z": zipIcon,
  aac: audioIcon,
  avi: videoIcon,
  bmp: imageIcon,
  c: cIcon,
  cer: certificateIcon,
  cert: certificateIcon,
  conf: settingsIcon,
  cpp: cppIcon,
  crt: certificateIcon,
  cs: csharpIcon,
  css: cssIcon,
  csv: tableIcon,
  db: databaseIcon,
  doc: wordIcon,
  docx: wordIcon,
  env: settingsIcon,
  exe: exeIcon,
  gif: imageIcon,
  go: goIcon,
  gz: zipIcon,
  h: cIcon,
  hpp: cppIcon,
  htm: htmlIcon,
  html: htmlIcon,
  ico: imageIcon,
  jar: javaIcon,
  java: javaIcon,
  jpeg: imageIcon,
  jpg: imageIcon,
  js: javascriptIcon,
  json: jsonIcon,
  jsx: reactIcon,
  key: keyIcon,
  lock: lockIcon,
  log: logIcon,
  m4a: audioIcon,
  md: markdownIcon,
  mkv: videoIcon,
  mov: videoIcon,
  mp3: audioIcon,
  mp4: videoIcon,
  mpeg: videoIcon,
  mpg: videoIcon,
  pem: keyIcon,
  pdf: pdfIcon,
  php: phpIcon,
  png: imageIcon,
  potx: powerpointIcon,
  ppsx: powerpointIcon,
  ppt: powerpointIcon,
  pptx: powerpointIcon,
  ps1: powershellIcon,
  py: pythonIcon,
  rar: zipIcon,
  rb: rubyIcon,
  rs: rustIcon,
  scss: cssIcon,
  sh: consoleIcon,
  sqlite: databaseIcon,
  sqlite3: databaseIcon,
  svg: svgIcon,
  tar: zipIcon,
  toml: tomlIcon,
  ts: typescriptIcon,
  tsx: reactIcon,
  txt: documentIcon,
  wav: audioIcon,
  webm: videoIcon,
  webp: imageIcon,
  woff: fontIcon,
  woff2: fontIcon,
  xls: tableIcon,
  xlsx: tableIcon,
  xml: xmlIcon,
  yaml: yamlIcon,
  yml: yamlIcon,
  zip: zipIcon,
};

function fileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return "";
  }
  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

function fileIconFor(file: FileEntry) {
  if (file.kind === "folder") {
    return folderIcon;
  }

  const normalizedName = file.name.toLowerCase();
  return (
    FILE_ICON_BY_NAME[normalizedName] ??
    FILE_ICON_BY_EXTENSION[fileExtension(normalizedName)] ??
    (file.kind === "other" ? documentIcon : fileIcon)
  );
}

function fileIconLabel(file: FileEntry) {
  if (file.kind === "folder") {
    return "Folder";
  }
  if (file.kind === "symlink") {
    return "Symbolic link";
  }
  const extension = fileExtension(file.name);
  return extension ? `${extension.toUpperCase()} file` : "File";
}

function FileTypeIcon({ file }: { file: FileEntry }) {
  return (
    <span
      aria-label={fileIconLabel(file)}
      className={`file-type-icon file-type-icon-${file.kind}`}
      role="img"
    >
      <img alt="" draggable={false} src={fileIconFor(file)} />
    </span>
  );
}

function FilePane({
  side,
  title,
  path,
  files,
  isLoading = false,
  status = "",
  selectedNames,
  onRefresh,
  onGoUp,
  onCreateFolder,
  onRenameSelected,
  onDeleteSelected,
  onOpenFolder,
  onSelectionChange,
  onContextMenuRequest,
  onDropTransfer,
  renameRequest,
}: {
  side: FilePaneSide;
  title: string;
  path: string;
  files: FileEntry[];
  isLoading?: boolean;
  status?: string;
  selectedNames: string[];
  onRefresh?: () => void;
  onGoUp?: () => void;
  onCreateFolder?: () => void;
  onRenameSelected?: (currentName: string, newName: string) => void | Promise<void>;
  onDeleteSelected?: () => void;
  onOpenFolder?: (folderName: string) => void;
  onSelectionChange?: (fileNames: string[]) => void;
  onContextMenuRequest?: (
    side: FilePaneSide,
    fileNames: string[],
    event: ReactMouseEvent,
  ) => void;
  onDropTransfer?: (targetSide: FilePaneSide, fileNames: string[]) => void;
  renameRequest?: { side: FilePaneSide; name: string; requestId: number };
}) {
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCanceledRef = useRef(false);
  const lastSelectedNameRef = useRef<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sortKey, setSortKey] = useState<FileSortKey>("name");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const hasMutationActions = Boolean(onCreateFolder || onRenameSelected || onDeleteSelected);
  const selectedFile = files.find((file) => file.name === selectedNames[0]);
  const canRenameSelected = Boolean(
    onRenameSelected && selectedFile && selectedNames.length === 1 && !isLoading,
  );
  const sortedFiles = useMemo(() => sortFileEntries(files, sortKey), [files, sortKey]);
  const nextSortKey: FileSortKey = sortKey === "name" ? "date" : "name";

  useEffect(() => {
    if (!editingName) {
      return;
    }

    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [editingName]);

  useEffect(() => {
    if (editingName && !files.some((file) => file.name === editingName)) {
      setEditingName(null);
      setRenameDraft("");
    }
  }, [editingName, files]);

  useEffect(() => {
    if (!renameRequest || renameRequest.side !== side || isLoading) {
      return;
    }

    const requestedFile = files.find((file) => file.name === renameRequest.name);
    if (!requestedFile || !onRenameSelected) {
      return;
    }

    onSelectionChange?.([requestedFile.name]);
    renameCanceledRef.current = false;
    setEditingName(requestedFile.name);
    setRenameDraft(requestedFile.name);
  }, [files, isLoading, onRenameSelected, onSelectionChange, renameRequest, side]);

  function beginRename(targetName = selectedFile?.name) {
    if (!targetName) {
      return;
    }

    renameCanceledRef.current = false;
    setEditingName(targetName);
    setRenameDraft(targetName);
  }

  function selectFile(fileName: string, event?: ReactMouseEvent | KeyboardEvent<HTMLDivElement>) {
    if (isLoading) {
      return;
    }

    if (event?.shiftKey && lastSelectedNameRef.current) {
      const currentIndex = sortedFiles.findIndex((file) => file.name === fileName);
      const lastIndex = sortedFiles.findIndex((file) => file.name === lastSelectedNameRef.current);
      if (currentIndex >= 0 && lastIndex >= 0) {
        const [start, end] =
          currentIndex < lastIndex ? [currentIndex, lastIndex] : [lastIndex, currentIndex];
        onSelectionChange?.(sortedFiles.slice(start, end + 1).map((file) => file.name));
        return;
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      const nextNames = selectedNames.includes(fileName)
        ? selectedNames.filter((name) => name !== fileName)
        : [...selectedNames, fileName];
      lastSelectedNameRef.current = fileName;
      onSelectionChange?.(nextNames);
      return;
    }

    lastSelectedNameRef.current = fileName;
    onSelectionChange?.([fileName]);
  }

  async function commitRename() {
    if (!editingName) {
      return;
    }

    if (renameCanceledRef.current) {
      renameCanceledRef.current = false;
      return;
    }

    const nextName = renameDraft.trim();
    const currentName = editingName;
    if (!nextName || nextName === currentName) {
      setEditingName(null);
      setRenameDraft("");
      return;
    }

    await onRenameSelected?.(currentName, nextName);
    setEditingName(null);
    setRenameDraft("");
  }

  function cancelRename() {
    renameCanceledRef.current = true;
    setEditingName(null);
    setRenameDraft("");
  }

  function dragPayloadFor(fileName: string) {
    return selectedNames.includes(fileName) ? selectedNames : [fileName];
  }

  function handleDragStart(fileName: string, event: ReactDragEvent<HTMLDivElement>) {
    if (isLoading || editingName === fileName) {
      event.preventDefault();
      return;
    }

    const names = dragPayloadFor(fileName);
    onSelectionChange?.(names);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "application/x-admindeck-sftp-items",
      JSON.stringify({ side, names }),
    );
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("application/x-admindeck-sftp-items")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDropTarget(true);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropTarget(false);

    try {
      const payload = JSON.parse(
        event.dataTransfer.getData("application/x-admindeck-sftp-items"),
      ) as { side?: FilePaneSide; names?: string[] };
      if (payload.side && payload.side !== side && payload.names?.length) {
        onDropTransfer?.(side, payload.names);
      }
    } catch {
      return;
    }
  }

  return (
    <article className="file-pane">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{path}</span>
        </div>
        <div className="file-pane-actions">
          <button
            className="icon-button"
            aria-label={`Open parent ${title.toLowerCase()} folder`}
            disabled={!onGoUp || isLoading}
            onClick={onGoUp}
            title={`Open parent ${title.toLowerCase()} folder`}
            type="button"
          >
            <ChevronDown className="up-icon" size={15} />
          </button>
          {hasMutationActions && (
            <>
              <button
                className="icon-button"
                aria-label={`Create ${title.toLowerCase()} folder`}
                disabled={!onCreateFolder || isLoading}
                onClick={onCreateFolder}
                title={`Create ${title.toLowerCase()} folder`}
                type="button"
              >
                <FolderPlus size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Rename selected ${title.toLowerCase()} item`}
                disabled={!canRenameSelected}
                onClick={() => beginRename()}
                title={`Rename selected ${title.toLowerCase()} item`}
                type="button"
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete selected ${title.toLowerCase()} item`}
                disabled={!onDeleteSelected || selectedNames.length === 0 || isLoading}
                onClick={onDeleteSelected}
                title={`Delete selected ${title.toLowerCase()} item`}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button
            className="icon-button file-sort-button"
            aria-label={`Sort ${title.toLowerCase()} files by ${nextSortKey}`}
            onClick={() => setSortKey(nextSortKey)}
            title={`Sort by ${nextSortKey}`}
            type="button"
          >
            <ArrowDown size={15} />
            <span>{fileSortLabel(sortKey)}</span>
          </button>
          <button
            className="icon-button"
            aria-label={`Refresh ${title.toLowerCase()} files`}
            disabled={!onRefresh || isLoading}
            onClick={onRefresh}
            title={`Refresh ${title.toLowerCase()} files`}
            type="button"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      <div
        className={`file-table${isDropTarget ? " drop-target" : ""}`}
        onContextMenu={(event) => onContextMenuRequest?.(side, selectedNames, event)}
        onDragLeave={() => setIsDropTarget(false)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isLoading && <div className="file-row file-row-muted">Loading...</div>}
        {!isLoading && status && <div className="file-row file-row-muted">{status}</div>}
        {!isLoading && !status && sortedFiles.length === 0 && (
          <div className="file-row file-row-muted">No files</div>
        )}
        {sortedFiles.map((file) => {
          const isEditing = editingName === file.name;
          const isSelected = selectedNames.includes(file.name);
          const fileTitle = file.kind === "folder" ? `Double-click to open ${file.name}` : file.name;
          const fileContents = (
            <>
              <FileTypeIcon file={file} />
              {isEditing ? (
                <input
                  aria-label={`Rename ${file.name}`}
                  className="file-rename-input"
                  onBlur={() => void commitRename()}
                  onChange={(event) => setRenameDraft(event.currentTarget.value)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  ref={renameInputRef}
                  value={renameDraft}
                />
              ) : (
                <span>{file.name}</span>
              )}
              <small>{file.size}</small>
              <small>{file.modified}</small>
            </>
          );

          if (isEditing) {
            return (
              <div
                className={`file-row file-row-interactive${isSelected ? " selected" : ""}`}
                draggable={false}
                key={file.name}
                title={fileTitle}
              >
                {fileContents}
              </div>
            );
          }

          return (
            <div
              className={`file-row file-row-interactive${isSelected ? " selected" : ""}`}
              draggable={!isLoading}
              key={file.name}
              onClick={(event) => {
                if (!isLoading) {
                  selectFile(file.name, event);
                }
              }}
              onDoubleClick={() => {
                if (!isLoading && file.kind === "folder") {
                  onOpenFolder?.(file.name);
                }
              }}
              onContextMenu={(event) => {
                if (isLoading) {
                  return;
                }

                event.stopPropagation();
                const names = isSelected ? selectedNames : [file.name];
                onContextMenuRequest?.(side, names, event);
              }}
              onDragStart={(event) => handleDragStart(file.name, event)}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !isLoading) {
                  event.preventDefault();
                  selectFile(file.name, event);
                  if (event.key === "Enter" && file.kind === "folder") {
                    onOpenFolder?.(file.name);
                  }
                }
              }}
              role="button"
              tabIndex={isLoading ? -1 : 0}
              title={fileTitle}
            >
              {fileContents}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function TransferConflictDialog({
  conflict,
  onDecision,
}: {
  conflict: TransferConflictState;
  onDecision: (decision: TransferConflictDecision) => void;
}) {
  const actionLabel = conflict.direction === "upload" ? "Upload" : "Download";
  const itemLabel = conflict.isFolder ? "folder" : "file";

  return (
    <div className="dialog-backdrop transfer-conflict-backdrop" role="presentation">
      <div className="transfer-conflict-dialog" role="dialog" aria-label="Transfer conflict">
        <header>
          <div>
            <strong>{itemLabel === "folder" ? "Folder exists" : "File exists"}</strong>
            <span>{actionLabel} conflict</span>
          </div>
          <button
            className="icon-button"
            aria-label="Cancel transfer conflict"
            onClick={() => onDecision("cancel")}
            type="button"
          >
            <X size={15} />
          </button>
        </header>
        <p>
          The target {itemLabel} already exists. Choose whether to overwrite{" "}
          <strong>{conflict.name}</strong>.
        </p>
        <code>{conflict.targetPath}</code>
        {conflict.remainingConflicts > 0 ? (
          <small>
            {conflict.remainingConflicts} more selected{" "}
            {conflict.remainingConflicts === 1 ? "conflict" : "conflicts"} may follow.
          </small>
        ) : null}
        <div className="transfer-conflict-actions">
          <button className="secondary-button" onClick={() => onDecision("skip")} type="button">
            Skip
          </button>
          <button className="secondary-button" onClick={() => onDecision("cancel")} type="button">
            Cancel
          </button>
          <button className="primary-button" onClick={() => onDecision("overwrite")} type="button">
            Overwrite
          </button>
          <button
            className="primary-button"
            onClick={() => onDecision("overwriteAll")}
            type="button"
          >
            Overwrite All
          </button>
        </div>
      </div>
    </div>
  );
}

function SftpContextMenu({
  menu,
  onTransfer,
  onRename,
  onDelete,
  onProperties,
  onClose,
}: {
  menu: SftpContextMenuState;
  onTransfer: (menu: SftpContextMenuState) => void;
  onRename: (menu: SftpContextMenuState) => void;
  onDelete: (menu: SftpContextMenuState) => void;
  onProperties: (menu: SftpContextMenuState) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = () => onClose();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }

    node.style.left = `${menu.x}px`;
    node.style.top = `${menu.y}px`;
  }, [menu.x, menu.y]);

  const transferLabel = menu.side === "local" ? "Transfer upload" : "Transfer download";
  const canRename = menu.side === "remote" && menu.names.length === 1;
  const canDelete = menu.side === "remote" && menu.names.length > 0;

  return (
    <div
      className="sftp-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
    >
      <button onClick={() => onTransfer(menu)} role="menuitem" type="button">
        Transfer
        <small>{transferLabel}</small>
      </button>
      <button disabled={!canRename} onClick={() => onRename(menu)} role="menuitem" type="button">
        Rename
      </button>
      <button disabled={!canDelete} onClick={() => onDelete(menu)} role="menuitem" type="button">
        Delete
      </button>
      <button onClick={() => onProperties(menu)} role="menuitem" type="button">
        Properties
      </button>
    </div>
  );
}

function SftpPropertiesPopup({
  properties,
  onClose,
  onSave,
}: {
  properties: FilePropertiesState;
  onClose: () => void;
  onSave: (request: { permissions?: string; uid?: number; gid?: number }) => void | Promise<void>;
}) {
  const remoteProperties = properties.remoteProperties;
  const isRemote = properties.side === "remote";
  const modeValue = remoteProperties?.mode ?? properties.entry.mode ?? "";
  const uidValue = remoteProperties?.uid ?? properties.entry.uid;
  const gidValue = remoteProperties?.gid ?? properties.entry.gid;
  const [mode, setMode] = useState(modeValue);
  const [uid, setUid] = useState(uidValue === undefined ? "" : String(uidValue));
  const [gid, setGid] = useState(gidValue === undefined ? "" : String(gidValue));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMode(modeValue);
    setUid(uidValue === undefined ? "" : String(uidValue));
    setGid(gidValue === undefined ? "" : String(gidValue));
    setError("");
  }, [gidValue, modeValue, uidValue]);

  const size = remoteProperties?.size ?? properties.entry.sizeBytes;
  const modified = remoteProperties?.modified ?? properties.entry.modifiedTimestamp;
  const accessed = remoteProperties?.accessed ?? properties.entry.accessedTimestamp;
  const owner =
    remoteProperties?.user ??
    properties.entry.user ??
    (uidValue === undefined ? "-" : String(uidValue));
  const group =
    remoteProperties?.group ??
    properties.entry.group ??
    (gidValue === undefined ? "-" : String(gidValue));

  function parseOptionalOwner(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${label} must be a non-negative number`);
    }
    return parsed;
  }

  async function handleSave() {
    setError("");

    if (mode.trim() && !/^[0-7]{3,4}$/.test(mode.trim())) {
      setError("Mode must be octal, for example 755 or 0644");
      return;
    }

    try {
      const request = {
        permissions: mode.trim() || undefined,
        uid: parseOptionalOwner(uid, "Owner"),
        gid: parseOptionalOwner(gid, "Group"),
      };
      setIsSaving(true);
      await onSave(request);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="sftp-properties-popover" role="dialog" aria-label="SFTP properties">
      <header>
        <div>
          <strong>{properties.entry.name}</strong>
          <span>{properties.path}</span>
        </div>
        <button className="icon-button" aria-label="Close properties" onClick={onClose} type="button">
          <X size={15} />
        </button>
      </header>
      <div className="properties-grid">
        <span>Type</span>
        <strong>{remoteProperties?.kind ?? properties.entry.kind}</strong>
        <span>Size</span>
        <strong>{formatFileSize(size)}</strong>
        <span>Modified</span>
        <strong>{formatRemoteTime(modified)}</strong>
        <span>Accessed</span>
        <strong>{formatRemoteTime(accessed)}</strong>
        <span>Owner</span>
        <strong>{owner}</strong>
        <span>Group</span>
        <strong>{group}</strong>
        <span>Mode</span>
        <strong>{modeValue || "-"}</strong>
      </div>
      {isRemote ? (
        <div className="properties-edit-grid">
          <label>
            <span>chmod</span>
            <input
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setMode(event.currentTarget.value)}
              value={mode}
            />
          </label>
          <label>
            <span>chown uid</span>
            <input
              inputMode="numeric"
              onChange={(event) => setUid(event.currentTarget.value)}
              value={uid}
            />
          </label>
          <label>
            <span>chown gid</span>
            <input
              inputMode="numeric"
              onChange={(event) => setGid(event.currentTarget.value)}
              value={gid}
            />
          </label>
        </div>
      ) : null}
      {error ? <p className="properties-error">{error}</p> : null}
      <div className="properties-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Close
        </button>
        {isRemote ? (
          <button className="primary-button" disabled={isSaving} onClick={() => void handleSave()} type="button">
            Save
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SettingsPage({
  onBack,
  onResetLayout,
}: {
  onBack: () => void;
  onResetLayout: () => void;
}) {
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const aiProviderHasApiKey = useWorkspaceStore((state) => state.aiProviderHasApiKey);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const setAiProviderSettings = useWorkspaceStore((state) => state.setAiProviderSettings);
  const setAiProviderHasApiKey = useWorkspaceStore((state) => state.setAiProviderHasApiKey);
  const [terminalDraft, setTerminalDraft] = useState(terminalSettings);
  const [aiDraft, setAiDraft] = useState(aiProviderSettings);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiError, setAiError] = useState("");
  const hasTerminalChanges = JSON.stringify(terminalDraft) !== JSON.stringify(terminalSettings);
  const hasAiChanges =
    JSON.stringify(aiDraft) !== JSON.stringify(aiProviderSettings) || apiKeyDraft.trim().length > 0;
  const aiProviderDefinition = getAiProviderDefinition(aiDraft.providerKind);

  useEffect(() => {
    setTerminalDraft(terminalSettings);
  }, [terminalSettings]);

  useEffect(() => {
    setAiDraft(aiProviderSettings);
  }, [aiProviderSettings]);

  async function handleSaveTerminalSettings() {
    try {
      setError("");
      setStatus("");
      const nextSettings = normalizeTerminalSettingsDraft(terminalDraft);
      const saved = isTauriRuntime()
        ? await invokeCommand("update_terminal_settings", { request: nextSettings })
        : nextSettings;
      setTerminalSettings(saved);
      setTerminalDraft(saved);
      setStatus("Terminal settings saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSaveAiProviderSettings() {
    try {
      setAiError("");
      setAiStatus("");
      const nextSettings = normalizeAiProviderDraft(aiDraft);

      if (apiKeyDraft.trim()) {
        if (isTauriRuntime()) {
          await invokeCommand("store_secret", {
            request: {
              kind: "aiApiKey",
              ownerId: AI_PROVIDER_SECRET_OWNER_ID,
              secret: apiKeyDraft.trim(),
            },
          });
        }
        setAiProviderHasApiKey(true);
        setApiKeyDraft("");
      }

      const saved = isTauriRuntime()
        ? await invokeCommand("update_ai_provider_settings", { request: nextSettings })
        : nextSettings;
      setAiProviderSettings(saved);
      setAiDraft(saved);
      setAiStatus("AI provider saved.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleClearAiProviderSettings() {
    const shouldClear = window.confirm(
      "Clear all AI provider settings and remove the saved AI API key?",
    );
    if (!shouldClear) {
      return;
    }

    try {
      setAiError("");
      setAiStatus("");
      const defaults = providerDefaultsFor("openai");
      if (isTauriRuntime()) {
        await invokeCommand("delete_secret", {
          request: {
            kind: "aiApiKey",
            ownerId: AI_PROVIDER_SECRET_OWNER_ID,
          },
        });
      }
      const saved = isTauriRuntime()
        ? await invokeCommand("update_ai_provider_settings", { request: defaults })
        : defaults;
      setAiProviderSettings(saved);
      setAiDraft(saved);
      setApiKeyDraft("");
      setAiProviderHasApiKey(false);
      setAiStatus("AI provider settings cleared.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleAiProviderKindChange(providerKind: AiProviderKind) {
    const defaults = providerDefaultsFor(providerKind);
    setAiDraft((settings) => ({
      ...settings,
      providerKind,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      reasoningEffort: defaults.reasoningEffort,
    }));
    setApiKeyDraft("");
    setAiStatus("");
    setAiError("");
  }

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="panel-label">AdminDeck</p>
          <h1>Settings</h1>
        </div>
        <button className="toolbar-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          Workspace
        </button>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          <a href="#terminal-settings" className="settings-nav-item active">
            <Terminal size={16} />
            <span>Terminal</span>
          </a>
          <a href="#ssh-settings" className="settings-nav-item">
            <Server size={16} />
            <span>SSH</span>
          </a>
          <a href="#sftp-settings" className="settings-nav-item">
            <Download size={16} />
            <span>SFTP</span>
          </a>
          <a href="#assistant-settings" className="settings-nav-item">
            <Bot size={16} />
            <span>AI Assistant</span>
          </a>
          <a href="#appearance-settings" className="settings-nav-item">
            <Palette size={16} />
            <span>Appearance</span>
          </a>
        </aside>

        <section className="settings-content" aria-label="Settings">
          <section className="settings-card settings-section" id="terminal-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">Terminal</p>
                <h2>Terminal behavior</h2>
              </div>
              <button
                className="toolbar-button"
                disabled={!hasTerminalChanges}
                onClick={() => void handleSaveTerminalSettings()}
                type="button"
              >
                <Save size={15} />
                Save
              </button>
            </div>

            <div className="form-grid three-columns">
              <label>
                <span>Font family</span>
                <input
                  onChange={(event) => {
                    const fontFamily = event.currentTarget.value;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      fontFamily,
                    }));
                  }}
                  value={terminalDraft.fontFamily}
                />
              </label>
              <label>
                <span>Font size</span>
                <input
                  inputMode="numeric"
                  max={32}
                  min={8}
                  onChange={(event) => {
                    const fontSize = Number(event.currentTarget.value);
                    setTerminalDraft((settings) => ({
                      ...settings,
                      fontSize,
                    }));
                  }}
                  type="number"
                  value={terminalDraft.fontSize}
                />
              </label>
              <label>
                <span>Line height</span>
                <input
                  max={2}
                  min={1}
                  onChange={(event) => {
                    const lineHeight = Number(event.currentTarget.value);
                    setTerminalDraft((settings) => ({
                      ...settings,
                      lineHeight,
                    }));
                  }}
                  step={0.05}
                  type="number"
                  value={terminalDraft.lineHeight}
                />
              </label>
            </div>

            <div className="form-grid three-columns">
              <label>
                <span>Scrollback lines</span>
                <input
                  inputMode="numeric"
                  max={100000}
                  min={100}
                  onChange={(event) => {
                    const scrollbackLines = Number(event.currentTarget.value);
                    setTerminalDraft((settings) => ({
                      ...settings,
                      scrollbackLines,
                    }));
                  }}
                  step={100}
                  type="number"
                  value={terminalDraft.scrollbackLines}
                />
                <small className="field-hint">Default is 10,000. Valid range is 100 to 100,000.</small>
              </label>
              <label>
                <span>Cursor style</span>
                <select
                  onChange={(event) => {
                    const cursorStyle = event.currentTarget.value as TerminalCursorStyle;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      cursorStyle,
                    }));
                  }}
                  value={terminalDraft.cursorStyle}
                >
                  <option value="block">Block</option>
                  <option value="bar">Bar</option>
                  <option value="underline">Underline</option>
                </select>
              </label>
              <label>
                <span>Default shell</span>
                <select
                  onChange={(event) => {
                    const defaultShell = event.currentTarget.value;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      defaultShell,
                    }));
                  }}
                  value={terminalDraft.defaultShell}
                >
                  <option value="powershell.exe">PowerShell</option>
                  <option value="cmd.exe">Command Prompt</option>
                  <option value="wsl.exe">WSL</option>
                </select>
              </label>
            </div>

            <div className="settings-toggles">
              <label>
                <input
                  checked={terminalDraft.copyOnSelect}
                  onChange={(event) => {
                    const copyOnSelect = event.currentTarget.checked;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      copyOnSelect,
                    }));
                  }}
                  type="checkbox"
                />
                Copy selected terminal text automatically
              </label>
              <label>
                <input
                  checked={terminalDraft.confirmMultilinePaste}
                  onChange={(event) => {
                    const confirmMultilinePaste = event.currentTarget.checked;
                    setTerminalDraft((settings) => ({
                      ...settings,
                      confirmMultilinePaste,
                    }));
                  }}
                  type="checkbox"
                />
                Confirm multiline paste
              </label>
            </div>

            {status ? <p className="settings-status success">{status}</p> : null}
            {error ? <p className="settings-status error">{error}</p> : null}
          </section>

          <section className="settings-card settings-section" id="ssh-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">SSH</p>
                <h2>SSH defaults</h2>
              </div>
            </div>
            <div className="settings-summary-grid">
              <SettingsSummary label="Default user" value={sshSettings.defaultUser} />
              <SettingsSummary label="Default port" value={String(sshSettings.defaultPort)} />
              <SettingsSummary label="Default key" value={sshSettings.defaultKeyPath || "Not set"} />
              <SettingsSummary label="ProxyJump" value={sshSettings.defaultProxyJump || "Not set"} />
            </div>
          </section>

          <section className="settings-card settings-section" id="sftp-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">SFTP</p>
                <h2>Transfer defaults</h2>
              </div>
            </div>
            <div className="settings-summary-grid compact">
              <SettingsSummary
                label="Overwrite behavior"
                value={sftpSettings.overwriteBehavior === "overwrite" ? "Overwrite" : "Fail"}
              />
            </div>
          </section>

          <section className="settings-card settings-section" id="assistant-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">AI Assistant</p>
                <h2>AI provider</h2>
              </div>
              <div className="settings-header-actions">
                <button
                  className="toolbar-button"
                  disabled={!hasAiChanges}
                  onClick={() => void handleSaveAiProviderSettings()}
                  type="button"
                >
                  <Save size={15} />
                  Save
                </button>
                <button
                  className="toolbar-button"
                  onClick={() => void handleClearAiProviderSettings()}
                  type="button"
                >
                  <Trash2 size={15} />
                  Clear All Settings
                </button>
              </div>
            </div>

            <div className="ai-provider-picker" role="group" aria-label="AI providers">
              {AI_PROVIDER_DEFINITIONS.map((definition) => (
                <button
                  className={
                    definition.kind === aiDraft.providerKind
                      ? "ai-provider-option selected"
                      : "ai-provider-option"
                  }
                  key={definition.kind}
                  onClick={() => handleAiProviderKindChange(definition.kind)}
                  type="button"
                >
                  <strong>{definition.label}</strong>
                  <span>{definition.defaultModel}</span>
                </button>
              ))}
            </div>

            <div className="form-grid three-columns">
              <label>
                <span>Provider</span>
                <select
                  onChange={(event) =>
                    handleAiProviderKindChange(event.currentTarget.value as AiProviderKind)
                  }
                  value={aiDraft.providerKind}
                >
                  {AI_PROVIDER_DEFINITIONS.map((definition) => (
                    <option key={definition.kind} value={definition.kind}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <input
                  list="ai-provider-model-options"
                  onChange={(event) => {
                    const model = event.currentTarget.value;
                    setAiDraft((settings) => ({
                      ...settings,
                      model,
                    }));
                  }}
                  value={aiDraft.model}
                />
                <datalist id="ai-provider-model-options">
                  {aiProviderDefinition.modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                <span>Reasoning effort</span>
                <select
                  onChange={(event) => {
                    const reasoningEffort = event.currentTarget.value as AiReasoningEffort;
                    setAiDraft((settings) => ({
                      ...settings,
                      reasoningEffort,
                    }));
                  }}
                  value={aiDraft.reasoningEffort}
                >
                  {aiProviderDefinition.reasoningEfforts.map((effort) => (
                    <option key={effort} value={effort}>
                      {formatReasoningEffort(effort)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid ai-provider-secret-grid">
              <label>
                <span>Endpoint</span>
                <input
                  onChange={(event) => {
                    const baseUrl = event.currentTarget.value;
                    setAiDraft((settings) => ({
                      ...settings,
                      baseUrl,
                    }));
                  }}
                  readOnly={!aiProviderDefinition.allowsCustomBaseUrl}
                  value={aiDraft.baseUrl}
                />
              </label>
              <label>
                <span>{aiProviderDefinition.requiresApiKey ? "API key" : "API key"}</span>
                <input
                  autoComplete="off"
                  disabled={!aiProviderDefinition.requiresApiKey}
                  onChange={(event) => setApiKeyDraft(event.currentTarget.value)}
                  placeholder={
                    aiProviderDefinition.requiresApiKey
                      ? aiProviderHasApiKey
                        ? "Saved"
                        : aiProviderDefinition.apiKeyLabel
                      : "Not required"
                  }
                  type="password"
                  value={apiKeyDraft}
                />
              </label>
            </div>

            <div className="settings-summary-grid compact">
              <SettingsSummary label="Active endpoint" value={formatProviderHost(aiDraft.baseUrl)} />
              <SettingsSummary
                label="Capabilities"
                value={aiProviderDefinition.capabilities
                  .map(formatAiProviderCapability)
                  .join(", ")}
              />
              <SettingsSummary
                label="Reasoning"
                value={formatReasoningEffort(aiDraft.reasoningEffort)}
              />
            </div>
            {aiStatus ? <p className="settings-status success">{aiStatus}</p> : null}
            {aiError ? <p className="settings-status error">{aiError}</p> : null}
          </section>

          <section className="settings-card settings-section" id="appearance-settings">
            <div className="settings-section-header">
              <div>
                <p className="panel-label">Appearance</p>
                <h2>Interface</h2>
              </div>
            </div>
            <div className="settings-reset-layout">
              <div>
                <strong>Layout</strong>
                <span>Reset panel widths, collapsed panels, and saved terminal pane layouts.</span>
              </div>
              <button className="toolbar-button" onClick={onResetLayout} type="button">
                <RotateCcw size={15} />
                Reset Layout
              </button>
            </div>
            <div className="settings-placeholder-list">
              <button className="settings-placeholder-item" type="button">
                <Languages size={17} />
                <span>Language (i18n)</span>
                <strong>To be implemented</strong>
              </button>
              <button className="settings-placeholder-item" type="button">
                <Palette size={17} />
                <span>Color Scheme</span>
                <strong>To be implemented</strong>
              </button>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function SettingsSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatAiProviderCapability(capability: string) {
  switch (capability) {
    case "toolCalling":
      return "tools";
    case "mcpReady":
      return "MCP ready";
    case "localRuntime":
      return "local";
    case "openAiCompatible":
      return "OpenAI compatible";
    default:
      return capability;
  }
}

function formatReasoningEffort(effort: AiReasoningEffort) {
  switch (effort) {
    case "default":
      return "Provider default";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "max":
      return "Max";
    default:
      return effort;
  }
}

function normalizeTerminalSettingsDraft(settings: TerminalSettings): TerminalSettings {
  if (!settings.fontFamily.trim()) {
    throw new Error("Font family is required.");
  }
  if (!settings.defaultShell.trim()) {
    throw new Error("Default shell is required.");
  }
  if (!Number.isFinite(settings.fontSize) || settings.fontSize < 8 || settings.fontSize > 32) {
    throw new Error("Terminal font size must be between 8 and 32.");
  }
  if (!Number.isFinite(settings.lineHeight) || settings.lineHeight < 1 || settings.lineHeight > 2) {
    throw new Error("Terminal line height must be between 1.0 and 2.0.");
  }
  if (
    !Number.isFinite(settings.scrollbackLines) ||
    settings.scrollbackLines < 100 ||
    settings.scrollbackLines > 100_000
  ) {
    throw new Error("Terminal scrollback must be between 100 and 100000 lines.");
  }

  return {
    ...settings,
    fontFamily: settings.fontFamily.trim(),
    fontSize: Math.round(settings.fontSize),
    lineHeight: Number(settings.lineHeight.toFixed(2)),
    scrollbackLines: Math.round(settings.scrollbackLines),
    defaultShell: settings.defaultShell.trim(),
  };
}

function AssistantPanel({
  collapsed,
  onOpenSettings,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
}) {
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const assistantContextSnippet = useWorkspaceStore((state) => state.assistantContextSnippet);
  const clearAssistantContextSnippet = useWorkspaceStore(
    (state) => state.clearAssistantContextSnippet,
  );
  const aiProviderSettings = useWorkspaceStore((state) => state.aiProviderSettings);
  const aiProviderHasApiKey = useWorkspaceStore((state) => state.aiProviderHasApiKey);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState(createAssistantChatThreadId);
  const [chatHistory, setChatHistory] = useState<AssistantChatThread[]>(readAssistantChatHistory);
  const [showAllChats, setShowAllChats] = useState(false);
  const [chatError, setChatError] = useState("");
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [waitingPhrase, setWaitingPhrase] = useState("");
  const [waitingDots, setWaitingDots] = useState(0);
  const [messageCopyStatus, setMessageCopyStatus] = useState("");
  const [terminalSendStatus, setTerminalSendStatus] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextLabel = activeTab
    ? `${activeTab.title} - ${workspaceKindLabel(activeTab)}`
    : "No active session";
  const connectionLabel = activeTab?.connection
    ? `${activeTab.connection.user}@${activeTab.connection.host}`
    : "Workspace";
  const providerDefinition = getAiProviderDefinition(aiProviderSettings.providerKind);
  const activeTerminalPaneId =
    activeTab?.kind === "terminal" ? activeTab.focusedPaneId ?? activeTab.panes[0]?.id : undefined;
  const sortedChatHistory = useMemo(() => sortedAssistantThreads(chatHistory), [chatHistory]);
  const recentChatHistory = sortedChatHistory.slice(0, 5);

  useEffect(() => {
    writeAssistantChatHistory(chatHistory);
  }, [chatHistory]);

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

  function handleSendCodeToTerminal(code: string) {
    if (!activeTerminalPaneId) {
      setTerminalSendStatus("Open and focus a terminal first.");
      return;
    }

    const data = code.endsWith("\n") ? code : `${code}\n`;
    if (writeInputToPane(activeTerminalPaneId, data)) {
      setTerminalSendStatus("Sent to focused terminal.");
      return;
    }

    setTerminalSendStatus("Focused terminal is still starting.");
  }

  function handleChatSubmit(event: FormEvent) {
    event.preventDefault();
    void submitAssistantPrompt();
  }

  function handleNewChat() {
    if (isSendingPrompt) {
      return;
    }
    saveCurrentChat();
    setMessages([]);
    setCurrentThreadId(createAssistantChatThreadId());
    setPrompt("");
    setChatError("");
    setTerminalSendStatus("");
    setMessageCopyStatus("");
    setWaitingPhrase("");
    setShowAllChats(false);
  }

  function saveCurrentChat() {
    if (messages.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    const thread: AssistantChatThread = {
      id: currentThreadId,
      title: assistantThreadTitle(messages),
      contextLabel,
      messages,
      createdAt: messages[0]?.createdAt ?? now,
      updatedAt: messages[messages.length - 1]?.createdAt ?? now,
    };
    setChatHistory((current) => upsertAssistantChatThread(current, thread));
  }

  function resumeChat(thread: AssistantChatThread) {
    if (isSendingPrompt) {
      return;
    }
    saveCurrentChat();
    setCurrentThreadId(thread.id);
    setMessages(thread.messages);
    setPrompt("");
    setChatError("");
    setTerminalSendStatus("");
    setMessageCopyStatus("");
    setWaitingPhrase("");
    setShowAllChats(false);
  }

  async function handleCopyMessage(message: AssistantChatMessage) {
    await writeToClipboard(message.content);
    setMessageCopyStatus(`${message.role === "user" ? "Your" : "Assistant"} message copied.`);
  }

  async function handleCopyCode(code: string) {
    await writeToClipboard(code);
    setMessageCopyStatus("Code copied.");
  }

  async function submitAssistantPrompt() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || isSendingPrompt) {
      return;
    }
    const userMessage = createAssistantChatMessage("user", normalizedPrompt);
    try {
      validateAiProviderForChat(aiProviderSettings, aiProviderHasApiKey);
    } catch (error) {
      const assistantMessage = createAssistantChatMessage(
        "assistant",
        `AI provider settings error: ${error instanceof Error ? error.message : String(error)}`,
      );
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setPrompt("");
      setChatError("");
      return;
    }

    const history = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setChatError("");
    setWaitingPhrase(randomAssistantWaitingPhrase());
    setIsSendingPrompt(true);
    try {
      const systemContext = await inspectActiveSshSystemContext(activeTab);
      const response = await invokeCommand("run_ai_agent", {
        request: {
          prompt: normalizedPrompt,
          contextLabel,
          selectedOutput: assistantContextSnippet?.text,
          systemContext,
          messages: history,
        },
      });
      const assistantMessage = createAssistantChatMessage("assistant", response.content);
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChatError(message);
      setMessages((current) => [
        ...current,
        createAssistantChatMessage("assistant", `AI Assistant error: ${message}`),
      ]);
    } finally {
      setIsSendingPrompt(false);
      setWaitingPhrase("");
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

  return (
    <aside className="assistant-panel" aria-hidden={collapsed}>
      <div className="assistant-topbar">
        <h2>AI Assistant</h2>
        <button
          aria-label="Refresh AI Assistant"
          className="assistant-toolbar-button"
          title="Refresh AI Assistant"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
        <button
          aria-label="AI Assistant settings"
          className="assistant-toolbar-button"
          onClick={onOpenSettings}
          title="AI Assistant settings"
          type="button"
        >
          <Settings size={16} />
        </button>
        <button
          aria-label="New AI Assistant chat"
          className="assistant-toolbar-button"
          disabled={isSendingPrompt}
          onClick={handleNewChat}
          title="New chat"
          type="button"
        >
          <Plus size={16} />
        </button>
        <button
          aria-label="Collapse AI Assistant panel"
          className="assistant-toolbar-button"
          onClick={onToggleCollapsed}
          title="Collapse AI Assistant panel"
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

      <section className="assistant-tasks">
        <header>
          <span>Chats</span>
          <button
            className="assistant-view-all-button"
            disabled={sortedChatHistory.length === 0}
            onClick={() => setShowAllChats(true)}
            type="button"
          >
            View All({sortedChatHistory.length})
          </button>
        </header>
        {recentChatHistory.length > 0 ? (
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
          <p>No chats yet.</p>
        )}
      </section>

      {showAllChats ? (
        <div className="assistant-chat-history-backdrop" role="presentation">
          <section className="assistant-chat-history-dialog" role="dialog" aria-label="All chats">
            <header>
              <div>
                <span>Chats</span>
                <small>{sortedChatHistory.length} saved</small>
              </div>
              <button
                className="assistant-toolbar-button"
                onClick={() => setShowAllChats(false)}
                type="button"
                aria-label="Close chat history"
                title="Close"
              >
                <X size={15} />
              </button>
            </header>
            <div className="assistant-chat-history-list">
              {sortedChatHistory.map((thread) => (
                <button
                  className="assistant-chat-history-row"
                  key={thread.id}
                  onClick={() => resumeChat(thread)}
                  type="button"
                >
                  <strong>{thread.title}</strong>
                  <span>{assistantThreadPreview(thread)}</span>
                  <small>{formatAssistantMessageTime(thread.updatedAt)}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {assistantContextSnippet ? (
        <section className="assistant-selection-context">
          <header>
            <span>{assistantContextSnippet.sourceLabel}</span>
            <button
              className="row-action"
              aria-label="Clear selected output context"
              onClick={clearAssistantContextSnippet}
              title="Clear selected output context"
              type="button"
            >
              <X size={13} />
            </button>
          </header>
          <pre>
            <code>{assistantContextSnippet.text}</code>
          </pre>
        </section>
      ) : null}

      <div className="assistant-chat-log">
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
            <span>{waitingPhrase || "Charging the answer beacon"}<span className="assistant-waiting-dots" aria-hidden="true">{".".repeat(waitingDots)}</span></span>
          </article>
        ) : null}
      </div>

      {terminalSendStatus ? <p className="assistant-send-status">{terminalSendStatus}</p> : null}
      {messageCopyStatus ? <p className="assistant-send-status">{messageCopyStatus}</p> : null}
      {chatError ? <p className="form-error">{chatError}</p> : null}

      <form className="assistant-chat-composer" onSubmit={handleChatSubmit}>
        <textarea
          ref={composerTextareaRef}
          onKeyDown={handleComposerKeyDown}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          disabled={isSendingPrompt}
          placeholder="Ask AI Assistant anything."
          rows={3}
          value={prompt}
        />
        <div className="assistant-composer-footer">
          <button className="assistant-plus-button" type="button" aria-label="Add context">
            <Plus size={18} />
          </button>
          <span>{aiProviderSettings.model || providerDefinition.defaultModel}</span>
          <button
            aria-label="Send message"
            className="assistant-send-button"
            disabled={!prompt.trim() || isSendingPrompt}
            type="submit"
          >
            <SendHorizontal size={18} />
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
  const userMessageLineCount = message.role === "user" ? message.content.split(/\r?\n/).length : 0;
  const shouldTruncateUserMessage = message.role === "user" && userMessageLineCount > 10;
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);

  return (
    <article className={`assistant-message ${message.role}`}>
      <div
        className={`assistant-message-bubble${shouldTruncateUserMessage && !isUserMessageExpanded ? " assistant-message-bubble-truncated" : ""}`}
      >
        <MarkdownContent content={message.content} onCopyCode={onCopyCode} onSendCode={onSendCode} />
      </div>
      {shouldTruncateUserMessage ? (
        <button
          className="assistant-message-expand"
          onClick={() => setIsUserMessageExpanded((expanded) => !expanded)}
          type="button"
        >
          {isUserMessageExpanded ? "Show less" : "More"}
        </button>
      ) : null}
      <div className="assistant-message-actions">
        <time dateTime={message.createdAt}>{formatAssistantMessageTime(message.createdAt)}</time>
        <button
          aria-label="Copy message"
          onClick={() => onCopyMessage(message)}
          title="Copy message"
          type="button"
        >
          <Copy size={10} />
        </button>
      </div>
    </article>
  );
}

type MarkdownBlock =
  | { kind: "code"; code: string; language: string }
  | { kind: "text"; text: string };

function MarkdownContent({
  content,
  onCopyCode,
  onSendCode,
}: {
  content: string;
  onCopyCode: (code: string) => void;
  onSendCode: (code: string) => void;
}) {
  return (
    <div className="markdown-content">
      {parseMarkdownBlocks(content).map((block, index) =>
        block.kind === "code" ? (
          <div className="markdown-code-block" key={`code-${index}`}>
            <div className="markdown-code-toolbar">
              <span>{block.language || "code"}</span>
              <div className="markdown-code-actions">
                <button
                  className="assistant-code-send"
                  onClick={() => onCopyCode(block.code)}
                  type="button"
                >
                  <Copy size={13} />
                  Copy
                </button>
                <button
                  className="assistant-code-send"
                  onClick={() => onSendCode(block.code)}
                  type="button"
                >
                  <Terminal size={13} />
                  Send
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

function formatProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host || "OpenAI-compatible endpoint";
  } catch {
    return "OpenAI-compatible endpoint";
  }
}

const PERFORMANCE_BUDGETS = {
  frontendReadyMs: 1_000,
  localTerminalReadyMs: 100,
  sshTerminalReadyMs: 150,
  idleMemoryBytes: 150 * 1024 * 1024,
} as const;

function StatusBar() {
  const performanceMetrics = useWorkspaceStore((state) => state.performanceMetrics);
  const launchLabel = performanceMetrics.frontendLaunchMs
    ? `UI ready ${formatDuration(performanceMetrics.frontendLaunchMs)}`
    : "UI timing pending";
  const localSessionLabel = performanceMetrics.lastLocalTerminalStart
    ? `Local ready ${formatDuration(performanceMetrics.lastLocalTerminalStart.durationMs)}`
    : "Local timing pending";
  const sshSessionLabel = performanceMetrics.lastSshTerminalStart
    ? `SSH ready ${formatDuration(performanceMetrics.lastSshTerminalStart.durationMs)}`
    : "SSH timing pending";
  const memoryLabel = performanceMetrics.workingSetBytes
    ? `Memory ${formatBytes(performanceMetrics.workingSetBytes)}`
    : "Memory pending";

  return (
    <footer className="status-bar">
      <span>
        <HardDrive size={13} />
        Local-first
      </span>
      <span>Telemetry off</span>
      <span
        className={budgetClass(performanceMetrics.frontendLaunchMs, PERFORMANCE_BUDGETS.frontendReadyMs)}
        title={`Budget: <= ${formatDuration(PERFORMANCE_BUDGETS.frontendReadyMs)} to usable UI`}
      >
        {launchLabel}
      </span>
      <span
        className={budgetClass(
          performanceMetrics.lastLocalTerminalStart?.durationMs,
          PERFORMANCE_BUDGETS.localTerminalReadyMs,
        )}
        title={`Budget: <= ${formatDuration(PERFORMANCE_BUDGETS.localTerminalReadyMs)} for new local terminal tabs`}
      >
        {localSessionLabel}
      </span>
      <span
        className={budgetClass(
          performanceMetrics.lastSshTerminalStart?.durationMs,
          PERFORMANCE_BUDGETS.sshTerminalReadyMs,
        )}
        title={`Budget: <= ${formatDuration(PERFORMANCE_BUDGETS.sshTerminalReadyMs)} after SSH authentication, excluding network time`}
      >
        {sshSessionLabel}
      </span>
      <span
        className={budgetClass(
          performanceMetrics.workingSetBytes,
          PERFORMANCE_BUDGETS.idleMemoryBytes,
        )}
        title={`${performanceMetrics.memorySource ?? "Memory source pending"} | Budget: <= ${formatBytes(
          PERFORMANCE_BUDGETS.idleMemoryBytes,
        )} idle working set`}
      >
        {memoryLabel}
      </span>
    </footer>
  );
}

function budgetClass(value: number | undefined, budget: number) {
  if (value === undefined) {
    return "metric-pending";
  }

  return value <= budget ? "metric-ok" : "metric-over";
}

function formatDuration(durationMs: number) {
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

function formatBytes(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(mib >= 100 ? 0 : 1)} MiB`;
}

export default App;
