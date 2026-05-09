import { confirmTrustedSshHostKey, connectionToolbarTitle, uniqueRuntimeId, usesNativeSshHostKeyVerification } from "../connections/utils";
import { ScreenshotMenu } from "../workspace/ScreenshotMenu";
import { WikiPagesButton } from "../wiki/WikiPagesButton";
import { ArrowDown, ChevronDown, Download, FolderPlus, Pencil, RefreshCw, Terminal, Trash2, Upload, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import type { DragEvent as ReactDragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import audioIcon from "../assets/file-icons/audio.svg";
import cIcon from "../assets/file-icons/c.svg";
import certificateIcon from "../assets/file-icons/certificate.svg";
import consoleIcon from "../assets/file-icons/console.svg";
import cppIcon from "../assets/file-icons/cpp.svg";
import csharpIcon from "../assets/file-icons/csharp.svg";
import cssIcon from "../assets/file-icons/css.svg";
import databaseIcon from "../assets/file-icons/database.svg";
import dockerIcon from "../assets/file-icons/docker.svg";
import documentIcon from "../assets/file-icons/document.svg";
import exeIcon from "../assets/file-icons/exe.svg";
import fileIcon from "../assets/file-icons/file.svg";
import folderIcon from "../assets/file-icons/folder.svg";
import fontIcon from "../assets/file-icons/font.svg";
import gitIcon from "../assets/file-icons/git.svg";
import goIcon from "../assets/file-icons/go.svg";
import htmlIcon from "../assets/file-icons/html.svg";
import imageIcon from "../assets/file-icons/image.svg";
import javaIcon from "../assets/file-icons/java.svg";
import javascriptIcon from "../assets/file-icons/javascript.svg";
import jsonIcon from "../assets/file-icons/json.svg";
import keyIcon from "../assets/file-icons/key.svg";
import lockIcon from "../assets/file-icons/lock.svg";
import logIcon from "../assets/file-icons/log.svg";
import markdownIcon from "../assets/file-icons/markdown.svg";
import pdfIcon from "../assets/file-icons/pdf.svg";
import phpIcon from "../assets/file-icons/php.svg";
import powerpointIcon from "../assets/file-icons/powerpoint.svg";
import powershellIcon from "../assets/file-icons/powershell.svg";
import pythonIcon from "../assets/file-icons/python.svg";
import reactIcon from "../assets/file-icons/react.svg";
import rubyIcon from "../assets/file-icons/ruby.svg";
import rustIcon from "../assets/file-icons/rust.svg";
import settingsIcon from "../assets/file-icons/settings.svg";
import svgIcon from "../assets/file-icons/svg.svg";
import tableIcon from "../assets/file-icons/table.svg";
import tomlIcon from "../assets/file-icons/toml.svg";
import typescriptIcon from "../assets/file-icons/typescript.svg";
import videoIcon from "../assets/file-icons/video.svg";
import wordIcon from "../assets/file-icons/word.svg";
import xmlIcon from "../assets/file-icons/xml.svg";
import yamlIcon from "../assets/file-icons/yaml.svg";
import zipIcon from "../assets/file-icons/zip.svg";
import { invokeCommand, isTauriRuntime, type LocalDirectoryEntry, type SftpDirectoryEntry, type SftpPathProperties, type SftpTransferProgress, type SftpTransferResult } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { FileEntry, SftpSettings, WorkspaceTab } from "../types";

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

export function SftpWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const { t } = useTranslation();
  const openTerminalHere = useWorkspaceStore((state) => state.openTerminalHere);
  const connection = tab.connection;
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [localFiles, setLocalFiles] = useState<FileEntry[]>([]);
  const [remotePath, setRemotePath] = useState(".");
  const [remoteFiles, setRemoteFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState(t("sftp.connecting"));
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
      setLocalStatus(t("sftp.tauriUnavailable"));
      setLocalFiles([]);
      return;
    }

    setIsLocalLoading(true);
    setLocalStatus(path ? t("sftp.openingFolder") : t("sftp.loadingLocal"));
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
      setStatus(t("sftp.noSshConnection"));
      return;
    }

    if (!isTauriRuntime()) {
      setStatus(t("sftp.tauriUnavailable"));
      return;
    }

    let disposed = false;
    let sessionStarted = false;
    const requestedSessionId = uniqueRuntimeId(`${connection.id}-sftp`);
    sessionIdRef.current = requestedSessionId;
    setIsRemoteLoading(true);
    setStatus(t("sftp.verifyingHost"));

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

        setStatus(t("sftp.openingSftp"));
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
        setStatus(t("sftp.connected"));
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
    await loadRemoteDirectory(remotePath, t("sftp.refreshing"));
  };

  const loadRemoteDirectory = async (path: string, loadingStatus = t("sftp.openingFolder")) => {
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
      setStatus(t("sftp.connected"));
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
        detail: t("sftp.sessionUnavailable"),
      });
      activeTransferIdRef.current = null;
      return;
    }

    setTransferState(transfer.id, {
      state: "active",
      detail: t("sftp.preparing"),
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
          detail: t("sftp.waitingToOverwrite"),
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
            detail: t("sftp.waitingToOverwrite"),
            overwriteBehavior: "overwrite",
          });
          return;
        }

        setTransferState(transfer.id, {
          state: decision === "skip" ? "canceled" : "failed",
          progress: 100,
          detail: decision === "skip" ? t("sftp.skippedExisting") : t("sftp.transferCanceled"),
        });
        return;
      }

      setTransferState(transfer.id, {
        state: message.includes("transfer canceled") ? "canceled" : "failed",
        progress: 100,
        detail: message.includes("transfer canceled") ? t("sftp.canceled") : message,
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
      let overwriteBehavior: SftpSettings["overwriteBehavior"] = "fail";
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
        detail: t("sftp.waiting"),
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
        detail: t("sftp.canceledBeforeStart"),
      });
      return;
    }

    if (transfer.state !== "active") {
      return;
    }

    setTransferState(transfer.id, { detail: t("sftp.canceling") });
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

    const name = window.prompt(t("sftp.newRemoteFolder"));
    if (name === null) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus(t("sftp.folderNameBlank"));
      return;
    }

    setIsRemoteLoading(true);
    setStatus(t("sftp.creatingFolder"));
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
      setStatus(t("sftp.remoteNameBlank"));
      return;
    }
    if (trimmedName === selected.name) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus(t("sftp.renaming"));
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
        ? t("sftp.deleteRemoteItemConfirm", { kind: selected[0].kind, name: selected[0].name })
        : t("sftp.deleteRemoteItemsMultiple", { count: selected.length }),
    );
    if (!shouldDelete) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus(t("sftp.deleting"));
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
        setStatus(t("sftp.sessionUnavailable"));
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

  const isConnected = status === t("sftp.connected") && Boolean(sessionIdRef.current);
  const isTransferring = transfers.some((transfer) => transfer.state === "active");
  const activeTransferCount = transfers.filter((transfer) => transfer.state === "active").length;
  const clearableTransferCount = transfers.filter((transfer) =>
    TRANSFER_HISTORY_STATES.includes(transfer.state),
  ).length;
  const toolbarTitle = tab.toolbarTitle ?? (connection ? connectionToolbarTitle(connection) : tab.title);

  return (
    <section
      className={isActive ? "sftp-workspace active" : "sftp-workspace"}
      ref={workspaceRef}
    >
      <div className="workspace-toolbar">
        <div>
          <strong>{toolbarTitle}</strong>
          <span>{status === t("sftp.connected") ? tab.subtitle : status}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="toolbar-button"
            disabled={!isConnected || selectedLocalFiles.length === 0}
            onClick={() => handleUpload()}
            type="button"
          >
            <Upload size={15} />
            {t("sftp.upload")}
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected || selectedRemoteFiles.length === 0 || !localPath}
            onClick={() => handleDownload()}
            type="button"
          >
            <Download size={15} />
            {t("sftp.download")}
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected}
            onClick={handleOpenTerminalHere}
            type="button"
          >
            <Terminal size={15} />
            {t("sftp.terminal")}
          </button>
          <ScreenshotMenu targetLabel={t("sftp.screenshotTarget", { title: tab.title })} targetRef={workspaceRef} />
          {connection ? (
            <WikiPagesButton
              buttonClassName="toolbar-button toolbar-icon-button"
              connectionId={connection.id}
              iconSize={15}
            />
          ) : null}
        </div>
      </div>

      <div className="file-manager">
        <FilePane
          side="local"
          title={t("sftp.local")}
          path={localPath || localStatus || t("sftp.localFiles")}
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
          title={t("sftp.remote")}
          path={remotePath}
          files={remoteFiles}
          isLoading={isRemoteLoading}
          status={status === t("sftp.connected") ? "" : status}
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
          <strong>{t("sftp.transferActivity")}</strong>
          <div className="transfer-queue-actions">
            <span>{t("sftp.transferCountActive", { count: activeTransferCount })}</span>
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
              {t("sftp.clear")}
            </button>
          </div>
        </header>
        {transfers.length === 0 ? (
          <div className="transfer-row transfer-row-muted">{t("sftp.noTransfers")}</div>
        ) : null}
        {transfers.map((transfer) => (
          <div className="transfer-row" key={transfer.id}>
            <span>
              {t(transfer.direction === "upload" ? "sftp.upload" : "sftp.download")} {transfer.name}
            </span>
            <progress value={transfer.progress} max="100" />
            <small className={`transfer-state transfer-state-${transfer.state}`}>
              {transfer.state}
            </small>
            <small>{transfer.detail}</small>
            <button
              className="row-action"
              aria-label={t("sftp.cancelTransferName", { name: transfer.name })}
              disabled={!["active", "queued"].includes(transfer.state)}
              onClick={() => void handleCancelTransfer(transfer)}
              title={t("sftp.cancelTransferName", { name: transfer.name })}
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
  return sortKey === "name" ? i18next.t("sftp.name") : i18next.t("sftp.date");
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
    return i18next.t("sftp.folder");
  }
  if (file.kind === "symlink") {
    return i18next.t("sftp.symlink");
  }
  const extension = fileExtension(file.name);
  return extension ? i18next.t("sftp.fileTypeLabel", { ext: extension.toUpperCase() }) : i18next.t("sftp.file");
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
  const { t } = useTranslation();
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
      "application/x-kkterm-sftp-items",
      JSON.stringify({ side, names }),
    );
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("application/x-kkterm-sftp-items")) {
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
        event.dataTransfer.getData("application/x-kkterm-sftp-items"),
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
              aria-label={t("sftp.openParentFolderAria", { pane: title.toLowerCase() })}
            disabled={!onGoUp || isLoading}
            onClick={onGoUp}
            title={t("sftp.openParentFolderAria", { pane: title.toLowerCase() })}
            type="button"
          >
            <ChevronDown className="up-icon" size={15} />
          </button>
          {hasMutationActions && (
            <>
              <button
                className="icon-button"
                aria-label={t("sftp.createFolderAria", { pane: title.toLowerCase() })}
                disabled={!onCreateFolder || isLoading}
                onClick={onCreateFolder}
                title={t("sftp.createFolderAria", { pane: title.toLowerCase() })}
                type="button"
              >
                <FolderPlus size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={t("sftp.renameSelectedAria", { pane: title.toLowerCase() })}
                disabled={!canRenameSelected}
                onClick={() => beginRename()}
                title={t("sftp.renameSelectedAria", { pane: title.toLowerCase() })}
                type="button"
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={t("sftp.deleteSelectedAria", { pane: title.toLowerCase() })}
                disabled={!onDeleteSelected || selectedNames.length === 0 || isLoading}
                onClick={onDeleteSelected}
                title={t("sftp.deleteSelectedAria", { pane: title.toLowerCase() })}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button
            className="icon-button file-sort-button"
            aria-label={t("sftp.sortByAria", { pane: title.toLowerCase(), key: nextSortKey })}
            onClick={() => setSortKey(nextSortKey)}
            title={t("sftp.sortByTitle", { key: nextSortKey })}
            type="button"
          >
            <ArrowDown size={15} />
            <span>{fileSortLabel(sortKey)}</span>
          </button>
          <button
            className="icon-button"
            aria-label={t("sftp.refreshFilesAria", { pane: title.toLowerCase() })}
            disabled={!onRefresh || isLoading}
            onClick={onRefresh}
            title={t("sftp.refreshFilesAria", { pane: title.toLowerCase() })}
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
        {isLoading && <div className="file-row file-row-muted">{t("sftp.loading")}</div>}
        {!isLoading && status && <div className="file-row file-row-muted">{status}</div>}
        {!isLoading && !status && sortedFiles.length === 0 && (
          <div className="file-row file-row-muted">{t("sftp.noFiles")}</div>
        )}
        {sortedFiles.map((file) => {
          const isEditing = editingName === file.name;
          const isSelected = selectedNames.includes(file.name);
          const fileTitle = file.kind === "folder" ? t("sftp.doubleClickToOpenFile", { name: file.name }) : file.name;
          const fileContents = (
            <>
              <FileTypeIcon file={file} />
              {isEditing ? (
                <input
                  aria-label={t("sftp.renameFileAria", { name: file.name })}
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
  const { t } = useTranslation();
  const isFolder = conflict.isFolder;

  return (
    <div className="dialog-backdrop transfer-conflict-backdrop" role="presentation">
      <div className="transfer-conflict-dialog" role="dialog" aria-label={t("sftp.transferConflict")}>
        <header>
          <div>
            <strong>{isFolder ? t("sftp.folderExists") : t("sftp.fileExists")}</strong>
            <span>{conflict.direction === "upload" ? t("sftp.uploadConflict") : t("sftp.downloadConflict")}</span>
          </div>
          <button
            className="icon-button"
            aria-label={t("sftp.cancelTransferConflict")}
            onClick={() => onDecision("cancel")}
            type="button"
          >
            <X size={15} />
          </button>
        </header>
        <p>
          {t("sftp.targetExistsDetail", { kind: isFolder ? t("sftp.folder").toLowerCase() : t("sftp.file").toLowerCase(), name: conflict.name })}
        </p>
        <code>{conflict.targetPath}</code>
        {conflict.remainingConflicts > 0 ? (
          <small>
            {t("sftp.moreConflictsDetail", { count: conflict.remainingConflicts })}
          </small>
        ) : null}
        <div className="transfer-conflict-actions">
          <button className="secondary-button" onClick={() => onDecision("skip")} type="button">
            {t("sftp.skip")}
          </button>
          <button className="secondary-button" onClick={() => onDecision("cancel")} type="button">
            {t("sftp.cancelTransfer")}
          </button>
          <button className="primary-button" onClick={() => onDecision("overwrite")} type="button">
            {t("sftp.overwrite")}
          </button>
          <button
            className="primary-button"
            onClick={() => onDecision("overwriteAll")}
            type="button"
          >
            {t("sftp.overwriteAll")}
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
  const { t } = useTranslation();
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

  const transferLabel = menu.side === "local" ? t("sftp.transferUpload") : t("sftp.transferDownload");
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
        {t("sftp.transfer")}
        <small>{transferLabel}</small>
      </button>
      <button disabled={!canRename} onClick={() => onRename(menu)} role="menuitem" type="button">
        {t("sftp.renameItem")}
      </button>
      <button disabled={!canDelete} onClick={() => onDelete(menu)} role="menuitem" type="button">
        {t("sftp.deleteLabel")}
      </button>
      <button onClick={() => onProperties(menu)} role="menuitem" type="button">
        {t("sftp.properties")}
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
  const { t } = useTranslation();
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

  function parseOptionalOwner(value: string, label: "Owner" | "Group") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(label === "Owner" ? t("sftp.ownerMustBeNumber") : t("sftp.groupMustBeNumber"));
    }
    return parsed;
  }

  async function handleSave() {
    setError("");

    if (mode.trim() && !/^[0-7]{3,4}$/.test(mode.trim())) {
      setError(t("sftp.modeHint"));
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
    <div className="sftp-properties-popover" role="dialog" aria-label={t("sftp.sftpProperties")}>
      <header>
        <div>
          <strong>{properties.entry.name}</strong>
          <span>{properties.path}</span>
        </div>
        <button className="icon-button" aria-label={t("sftp.closeProperties")} onClick={onClose} type="button">
          <X size={15} />
        </button>
      </header>
      <div className="properties-grid">
        <span>{t("sftp.type")}</span>
        <strong>{remoteProperties?.kind ?? properties.entry.kind}</strong>
        <span>{t("sftp.size")}</span>
        <strong>{formatFileSize(size)}</strong>
        <span>{t("sftp.modified")}</span>
        <strong>{formatRemoteTime(modified)}</strong>
        <span>{t("sftp.accessed")}</span>
        <strong>{formatRemoteTime(accessed)}</strong>
        <span>{t("sftp.owner")}</span>
        <strong>{owner}</strong>
        <span>{t("sftp.group")}</span>
        <strong>{group}</strong>
        <span>{t("sftp.mode")}</span>
        <strong>{modeValue || "-"}</strong>
      </div>
      {isRemote ? (
        <div className="properties-edit-grid">
          <label>
            <span>{t("sftp.chmod")}</span>
            <input
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setMode(event.currentTarget.value)}
              value={mode}
            />
          </label>
          <label>
            <span>{t("sftp.chownUid")}</span>
            <input
              inputMode="numeric"
              onChange={(event) => setUid(event.currentTarget.value)}
              value={uid}
            />
          </label>
          <label>
            <span>{t("sftp.chownGid")}</span>
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
          {t("common.close")}
        </button>
        {isRemote ? (
          <button className="primary-button" disabled={isSaving} onClick={() => void handleSave()} type="button">
            {t("sftp.save")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
