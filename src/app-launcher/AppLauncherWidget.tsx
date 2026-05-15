import {
  AppWindow,
  FilePlus,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  DragEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { selectAppLauncherFile, selectAppLauncherFolder, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import { useDashboardStore } from "../dashboard/state/dashboardStore";
import type { DashboardWidgetInstance } from "../dashboard/types";
import type {
  AppLauncherEntry,
  AppLauncherLaunchMode,
  AppLauncherSettings,
  PreparedAppLauncherEntry,
} from "../types";
import {
  appLauncherNameFromPath,
  isRunnablePath,
  launchAppLauncherEntry,
  parseAppLauncherSettingsJson,
  prepareAppLauncherEntry,
  reorderAppLauncherEntries,
  serializeAppLauncherSettings,
} from "./storage";

type ReorderPlacement = "before" | "after";

type EntryDraft = {
  id: string;
  name: string;
  path: string;
  arguments: string;
  workingDirectory: string;
  iconDataUrl: string;
  createdAt: string;
};

type MenuState = {
  entry: AppLauncherEntry;
  prepared?: PreparedAppLauncherEntry;
  x: number;
  y: number;
};

type AddMenuState = {
  x: number;
  y: number;
};

type ReorderTarget = {
  id: string;
  placement: ReorderPlacement;
};

type PointerReorderState = {
  entryId: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

export function AppLauncherWidget({ instance }: { instance: DashboardWidgetInstance }) {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const updateInstance = useDashboardStore((state) => state.updateInstance);
  const editMode = useDashboardStore((state) => state.editMode);
  const [settings, setSettings] = useState<AppLauncherSettings>(() =>
    parseAppLauncherSettingsJson(instance.settingsValuesJson),
  );
  const [preparedById, setPreparedById] = useState<Record<string, PreparedAppLauncherEntry>>({});
  const [dialogDraft, setDialogDraft] = useState<EntryDraft | null>(null);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [addMenuState, setAddMenuState] = useState<AddMenuState | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | null>(null);
  const draggedEntryIdRef = useRef<string | null>(null);
  const pointerReorderRef = useRef<PointerReorderState | null>(null);
  const suppressNextLaunchRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSettings(parseAppLauncherSettingsJson(instance.settingsValuesJson));
  }, [instance.settingsValuesJson]);

  useEffect(() => {
    if (editMode) {
      return;
    }
    draggedEntryIdRef.current = null;
    setDraggedEntryId(null);
    setReorderTarget(null);
  }, [editMode]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (disposed) {
        return;
      }
      if (event.payload.type === "over") {
        setIsDropTarget(isPositionInsideWidget(event.payload.position.x, event.payload.position.y));
      } else if (event.payload.type === "drop") {
        const inside = isPositionInsideWidget(event.payload.position.x, event.payload.position.y);
        setIsDropTarget(false);
        if (inside) {
          void saveDroppedPaths(event.payload.paths);
        }
      } else {
        setIsDropTarget(false);
      }
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [instance.id, settings.entries, showStatusBarNotice, t, updateInstance]);

  useEffect(() => {
    let disposed = false;
    async function refreshEntries() {
      const pairs = await Promise.all(
        settings.entries.map(async (entry) => {
          try {
            return [entry.id, await prepareAppLauncherEntry(entry.path)] as const;
          } catch {
            return [
              entry.id,
              {
                name: entry.name,
                path: entry.path,
                exists: false,
                runnable: isRunnablePath(entry.path),
                iconDataUrl: entry.iconDataUrl ?? null,
              },
            ] as const;
          }
        }),
      );
      if (!disposed) {
        setPreparedById(Object.fromEntries(pairs));
      }
    }
    void refreshEntries();
    return () => {
      disposed = true;
    };
  }, [settings.entries]);

  useEffect(() => {
    if (!menuState) {
      return;
    }
    function closeMenu(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) {
        return;
      }
      setMenuState(null);
    }
    function closeMenuOnKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenuOnKey);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenuOnKey);
    };
  }, [menuState]);

  useEffect(() => {
    if (!addMenuState) {
      return;
    }
    function closeMenu(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && addMenuRef.current?.contains(target)) {
        return;
      }
      setAddMenuState(null);
    }
    function closeMenuOnKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setAddMenuState(null);
      }
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenuOnKey);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenuOnKey);
    };
  }, [addMenuState]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node || !menuState) {
      return;
    }
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(menuState.x, window.innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(menuState.y, window.innerHeight - bounds.height - 8))}px`;
  }, [menuState]);

  useLayoutEffect(() => {
    const node = addMenuRef.current;
    if (!node || !addMenuState) {
      return;
    }
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(addMenuState.x, window.innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(addMenuState.y, window.innerHeight - bounds.height - 8))}px`;
  }, [addMenuState]);

  function openAddMenuFromElement(element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    setAddMenuState({ x: bounds.left, y: bounds.bottom + 4 });
  }

  function isPositionInsideWidget(x: number, y: number) {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) {
      return false;
    }
    const scale = window.devicePixelRatio || 1;
    return (
      isPointInsideBounds(x, y, bounds)
      || isPointInsideBounds(x / scale, y / scale, bounds)
    );
  }

  async function addAppEntry() {
    let selectedPath: string | null = null;
    if (isTauriRuntime()) {
      try {
        selectedPath = await selectAppLauncherFile({
          allFilesFilterName: t("appLauncher.allFilesFilter"),
          filterName: t("appLauncher.fileFilter"),
          kind: "app",
          title: t("appLauncher.selectAppTitle"),
        });
      } catch (error) {
        showStatusBarNotice(
          t("appLauncher.selectError", { message: errorMessage(error) }),
          { tone: "error" },
        );
        openDraftDialog();
        return;
      }
      if (!selectedPath) {
        return;
      }
    }

    await saveSelectedPath(selectedPath);
  }

  async function addFileEntry() {
    let selectedPath: string | null = null;
    if (isTauriRuntime()) {
      try {
        selectedPath = await selectAppLauncherFile({
          allFilesFilterName: t("appLauncher.allFilesFilter"),
          filterName: t("appLauncher.fileFilter"),
          kind: "file",
          title: t("appLauncher.selectFileTitle"),
        });
      } catch (error) {
        showStatusBarNotice(
          t("appLauncher.selectError", { message: errorMessage(error) }),
          { tone: "error" },
        );
        openDraftDialog();
        return;
      }
      if (!selectedPath) {
        return;
      }
    }

    await saveSelectedPath(selectedPath);
  }

  async function saveSelectedPath(selectedPath: string | null) {
    try {
      const prepared = selectedPath ? await prepareAppLauncherEntry(selectedPath) : undefined;
      if (selectedPath) {
        await saveDraft(createDraft(prepared?.path ?? selectedPath, prepared));
        return;
      }
      openDraftDialog();
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.selectError", { message: errorMessage(error) }),
        { tone: "error" },
      );
      openDraftDialog(selectedPath ?? "");
    }
  }

  async function addFolderEntry() {
    let selectedPath: string | null = null;
    if (isTauriRuntime()) {
      try {
        selectedPath = await selectAppLauncherFolder({
          title: t("appLauncher.selectFolderTitle"),
        });
      } catch (error) {
        showStatusBarNotice(
          t("appLauncher.selectError", { message: errorMessage(error) }),
          { tone: "error" },
        );
        openDraftDialog();
        return;
      }
      if (!selectedPath) {
        return;
      }
    }

    await saveSelectedPath(selectedPath);
  }

  function openDraftDialog(path = "", prepared?: PreparedAppLauncherEntry) {
    setDialogDraft(createDraft(path, prepared));
  }

  function createDraft(path: string, prepared?: PreparedAppLauncherEntry): EntryDraft {
    const now = new Date().toISOString();
    return {
      id: `app-launcher-${Date.now()}`,
      name: prepared?.name ?? "",
      path,
      arguments: "",
      workingDirectory: "",
      iconDataUrl: prepared?.iconDataUrl ?? "",
      createdAt: now,
    };
  }

  function editEntry(entry: AppLauncherEntry) {
    setDialogDraft({
      id: entry.id,
      name: entry.name,
      path: entry.path,
      arguments: entry.arguments ?? "",
      workingDirectory: entry.workingDirectory ?? "",
      iconDataUrl: entry.iconDataUrl ?? "",
      createdAt: entry.createdAt,
    });
  }

  async function saveDraft(draft: EntryDraft) {
    const now = new Date().toISOString();
    const nextEntry: AppLauncherEntry = {
      id: draft.id,
      name: draft.name.trim(),
      path: draft.path.trim(),
      arguments: optionalText(draft.arguments),
      workingDirectory: optionalText(draft.workingDirectory),
      iconDataUrl: optionalText(draft.iconDataUrl),
      railPinned: false,
      createdAt: draft.createdAt,
      updatedAt: now,
    };
    const exists = settings.entries.some((entry) => entry.id === draft.id);
    const nextSettings = {
      entries: exists
        ? settings.entries.map((entry) => (entry.id === draft.id ? nextEntry : entry))
        : [...settings.entries, nextEntry],
    };
    try {
      await saveSettings(nextSettings);
      setDialogDraft(null);
      showStatusBarNotice(t("appLauncher.savedStatus", { name: nextEntry.name }), {
        tone: "success",
      });
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.saveError", { message: errorMessage(error) }),
        { tone: "error" },
      );
    }
  }

  async function removeEntry(entry: AppLauncherEntry) {
    try {
      await saveSettings({
        entries: settings.entries.filter((candidate) => candidate.id !== entry.id),
      });
      showStatusBarNotice(t("appLauncher.removedStatus", { name: entry.name }), {
        tone: "info",
      });
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.saveError", { message: errorMessage(error) }),
        { tone: "error" },
      );
    }
  }

  async function saveDroppedPaths(paths: string[]) {
    const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
    if (uniquePaths.length === 0) {
      return;
    }

    try {
      const now = new Date().toISOString();
      const droppedEntries = await Promise.all(
        uniquePaths.map(async (path, index) => {
          let prepared: PreparedAppLauncherEntry | undefined;
          try {
            prepared = await prepareAppLauncherEntry(path);
          } catch {
            prepared = undefined;
          }
          const entryPath = prepared?.path ?? path;
          const entryName = prepared?.name ?? appLauncherNameFromPath(entryPath);
          return {
            id: `app-launcher-${Date.now()}-${index}`,
            name: entryName,
            path: entryPath,
            arguments: null,
            workingDirectory: null,
            iconDataUrl: prepared?.iconDataUrl ?? null,
            railPinned: false,
            createdAt: now,
            updatedAt: now,
          } satisfies AppLauncherEntry;
        }),
      );
      await saveSettings({ entries: [...settings.entries, ...droppedEntries] });
      const lastEntry = droppedEntries[droppedEntries.length - 1];
      if (lastEntry) {
        showStatusBarNotice(t("appLauncher.savedStatus", { name: lastEntry.name }), {
          tone: "success",
        });
      }
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.saveError", { message: errorMessage(error) }),
        { tone: "error" },
      );
    }
  }

  async function saveReorderedEntry(
    draggedId: string,
    targetId: string,
    placement: ReorderPlacement,
  ) {
    const nextEntries = reorderAppLauncherEntries(settings.entries, draggedId, targetId, placement);
    if (nextEntries === settings.entries) {
      return;
    }
    try {
      await saveSettings({ entries: nextEntries });
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.saveError", { message: errorMessage(error) }),
        { tone: "error" },
      );
    }
  }

  function handleEntryPointerDown(event: ReactPointerEvent<HTMLDivElement>, entryId: string) {
    if (!editMode || event.button !== 0 || (event.target as HTMLElement).closest(".app-launcher-tile-remove")) {
      return;
    }
    pointerReorderRef.current = {
      entryId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleEntryPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointerState = pointerReorderRef.current;
    if (!editMode || !pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const moved = Math.abs(event.clientX - pointerState.startX) + Math.abs(event.clientY - pointerState.startY);
    if (!pointerState.active && moved < 4) {
      return;
    }
    if (!pointerState.active) {
      pointerState.active = true;
      suppressNextLaunchRef.current = true;
      draggedEntryIdRef.current = pointerState.entryId;
      setDraggedEntryId(pointerState.entryId);
    }

    const targetTile = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(".app-launcher-tile[data-app-launcher-entry-id]");
    const targetId = targetTile?.dataset.appLauncherEntryId;
    if (!targetTile || !targetId || targetId === pointerState.entryId) {
      setReorderTarget(null);
      return;
    }
    setReorderTarget({ id: targetId, placement: reorderPlacementFromPoint(event.clientX, targetTile) });
  }

  function finishPointerReorder(event: ReactPointerEvent<HTMLDivElement>) {
    const pointerState = pointerReorderRef.current;
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }
    pointerReorderRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const target = reorderTarget;
    setReorderTarget(null);
    draggedEntryIdRef.current = null;
    setDraggedEntryId(null);
    window.setTimeout(() => {
      suppressNextLaunchRef.current = false;
    }, 0);
    if (!editMode || !pointerState.active || !target || target.id === pointerState.entryId) {
      return;
    }
    event.preventDefault();
    void saveReorderedEntry(pointerState.entryId, target.id, target.placement);
  }

  function handleBrowserDragOver(event: DragEvent<HTMLDivElement>) {
    if (draggedEntryId || isTauriRuntime() || !hasBrowserDropPayload(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDropTarget(true);
  }

  function handleBrowserDrop(event: DragEvent<HTMLDivElement>) {
    if (draggedEntryId || isTauriRuntime()) {
      return;
    }
    event.preventDefault();
    setIsDropTarget(false);
    const paths = pathsFromBrowserDrop(event);
    void saveDroppedPaths(paths);
  }

  async function saveSettings(nextSettings: AppLauncherSettings) {
    const normalized = parseAppLauncherSettingsJson(serializeAppLauncherSettings(nextSettings));
    setSettings(normalized);
    await updateInstance(instance.id, {
      settingsValuesJson: serializeAppLauncherSettings(normalized),
    });
  }

  async function launch(entry: AppLauncherEntry, mode: AppLauncherLaunchMode) {
    if (editMode || suppressNextLaunchRef.current) {
      return;
    }
    try {
      await launchAppLauncherEntry(entry, mode);
      showStatusBarNotice(t("appLauncher.launchStatus", { name: entry.name }), {
        tone: "success",
      });
    } catch (error) {
      showStatusBarNotice(
        t("appLauncher.launchError", { message: errorMessage(error) }),
        { tone: "error" },
      );
    }
  }

  return (
    <div
      className={`dashboard-widget-body app-launcher-widget${isDropTarget ? " is-drop-target" : ""}${editMode ? " is-managing" : ""}`}
      onDragLeave={() => setIsDropTarget(false)}
      onDragOver={handleBrowserDragOver}
      onDrop={handleBrowserDrop}
      ref={rootRef}
    >
      <div className="app-launcher-widget-toolbar">
        <button
          className="secondary-button app-launcher-add"
          aria-label={t("common.add")}
          onClick={(event) => openAddMenuFromElement(event.currentTarget)}
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>
      {settings.entries.length > 0 ? (
        <div className="app-launcher-tile-grid" aria-label={t("appLauncher.entriesLabel")}>
          {settings.entries.map((entry) => (
            <AppLauncherTile
              entry={entry}
              editMode={editMode}
              key={entry.id}
              isDragging={draggedEntryId === entry.id}
              reorderPlacement={
                reorderTarget?.id === entry.id && draggedEntryId !== entry.id
                  ? reorderTarget.placement
                  : null
              }
              onLaunch={launch}
              onMenu={(nextMenu) => setMenuState(nextMenu)}
              onPointerCancelEntry={finishPointerReorder}
              onPointerDownEntry={handleEntryPointerDown}
              onPointerMoveEntry={handleEntryPointerMove}
              onPointerUpEntry={finishPointerReorder}
              onRemove={removeEntry}
              prepared={preparedById[entry.id]}
            />
          ))}
        </div>
      ) : (
        <div className="app-launcher-widget-empty">
          <AppWindow size={24} />
          <h4>{t("appLauncher.emptyTitle")}</h4>
          <p>{t("appLauncher.emptyHint")}</p>
        </div>
      )}
      {dialogDraft
        ? createAppLauncherPortal(
            <AppLauncherDialog
              draft={dialogDraft}
              onClose={() => setDialogDraft(null)}
              onSave={saveDraft}
              onUpdate={setDialogDraft}
            />,
          )
        : null}
      {menuState
        ? createAppLauncherPortal(
            <AppLauncherMenu
              menuRef={menuRef}
              onClose={() => setMenuState(null)}
              onEdit={editEntry}
              onLaunch={launch}
              onRemove={removeEntry}
              state={menuState}
            />,
          )
        : null}
      {addMenuState
        ? createAppLauncherPortal(
            <AppLauncherAddMenu
              menuRef={addMenuRef}
              onAddApp={addAppEntry}
              onAddFile={addFileEntry}
              onAddFolder={addFolderEntry}
              onClose={() => setAddMenuState(null)}
            />,
          )
        : null}
    </div>
  );
}

function reorderPlacementFromPoint(clientX: number, target: HTMLElement): ReorderPlacement {
  const bounds = target.getBoundingClientRect();
  return clientX >= bounds.left + bounds.width / 2 ? "after" : "before";
}

function isPointInsideBounds(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function AppLauncherTile({
  entry,
  editMode,
  isDragging,
  reorderPlacement,
  onLaunch,
  onMenu,
  onPointerCancelEntry,
  onPointerDownEntry,
  onPointerMoveEntry,
  onPointerUpEntry,
  onRemove,
  prepared,
}: {
  entry: AppLauncherEntry;
  editMode: boolean;
  isDragging: boolean;
  reorderPlacement: ReorderPlacement | null;
  prepared?: PreparedAppLauncherEntry;
  onLaunch: (entry: AppLauncherEntry, mode: AppLauncherLaunchMode) => Promise<void>;
  onMenu: (state: MenuState) => void;
  onPointerCancelEntry: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDownEntry: (event: ReactPointerEvent<HTMLDivElement>, entryId: string) => void;
  onPointerMoveEntry: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUpEntry: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRemove: (entry: AppLauncherEntry) => Promise<void>;
}) {
  const { t } = useTranslation();
  const missing = prepared?.exists === false;
  const iconDataUrl = prepared?.iconDataUrl ?? entry.iconDataUrl;

  function openMenuFromElement(element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    onMenu({ entry, prepared, x: bounds.left, y: bounds.bottom + 4 });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (editMode) {
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openMenuFromElement(event.currentTarget);
    }
  }

  return (
    <div
      aria-label={editMode ? entry.name : undefined}
      className={`app-launcher-tile ${missing ? "missing" : ""}${isDragging ? " is-reordering" : ""}${reorderPlacement ? ` is-reorder-${reorderPlacement}` : ""}`}
      data-app-launcher-entry-id={entry.id}
      draggable={false}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!editMode) {
          onMenu({ entry, prepared, x: event.clientX, y: event.clientY });
        }
      }}
      onPointerCancel={onPointerCancelEntry}
      onPointerDown={(event) => onPointerDownEntry(event, entry.id)}
      onPointerMove={onPointerMoveEntry}
      onPointerUp={onPointerUpEntry}
    >
      {editMode ? (
        <button
          className="app-launcher-tile-remove"
          aria-label={t("appLauncher.remove")}
          draggable={false}
          onClick={(event) => {
            event.stopPropagation();
            void onRemove(entry);
          }}
          type="button"
        >
          <X size={12} />
        </button>
      ) : null}
      {editMode ? (
        <div className="app-launcher-tile-launch" aria-hidden="true">
          <AppLauncherTileContent entryName={entry.name} iconDataUrl={iconDataUrl} />
        </div>
      ) : (
        <button
          className="app-launcher-tile-launch"
          aria-label={t("appLauncher.launchApp", { name: entry.name })}
          onClick={() => void onLaunch(entry, "normal")}
          onKeyDown={handleKeyDown}
          type="button"
        >
          <AppLauncherTileContent entryName={entry.name} iconDataUrl={iconDataUrl} />
        </button>
      )}
    </div>
  );
}

function AppLauncherTileContent({
  entryName,
  iconDataUrl,
}: {
  entryName: string;
  iconDataUrl: string | null | undefined;
}) {
  return (
    <>
      <span className="app-launcher-tile-icon" aria-hidden="true">
        {iconDataUrl ? (
          <img alt="" draggable={false} src={iconDataUrl} />
        ) : (
          <AppWindow size={20} />
        )}
      </span>
      <span className="app-launcher-tile-label">{entryName}</span>
    </>
  );
}

function AppLauncherDialog({
  draft,
  onClose,
  onSave,
  onUpdate,
}: {
  draft: EntryDraft;
  onClose: () => void;
  onSave: (draft: EntryDraft) => Promise<void>;
  onUpdate: (draft: EntryDraft) => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const canSave = draft.name.trim() && draft.path.trim();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave || saving) {
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop app-launcher-dialog-backdrop">
      <form className="app-launcher-dialog" onSubmit={(event) => void handleSubmit(event)}>
        <header>
          <div>
            <p className="panel-label">{t("appLauncher.dialogLabel")}</p>
            <h2>{t("appLauncher.dialogTitle")}</h2>
          </div>
        </header>
        <label className="app-launcher-field">
          <span>{t("appLauncher.name")}</span>
          <input
            value={draft.name}
            onChange={(event) => onUpdate({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="app-launcher-field">
          <span>{t("appLauncher.path")}</span>
          <input
            value={draft.path}
            onChange={(event) => onUpdate({ ...draft, path: event.target.value })}
          />
        </label>
        <label className="app-launcher-field">
          <span>{t("appLauncher.arguments")}</span>
          <input
            placeholder={t("appLauncher.argumentsPlaceholder")}
            value={draft.arguments}
            onChange={(event) => onUpdate({ ...draft, arguments: event.target.value })}
          />
        </label>
        <label className="app-launcher-field">
          <span>{t("appLauncher.workingDirectory")}</span>
          <input
            placeholder={t("appLauncher.workingDirectoryPlaceholder")}
            value={draft.workingDirectory}
            onChange={(event) => onUpdate({ ...draft, workingDirectory: event.target.value })}
          />
        </label>
        <div className="app-launcher-dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button className="primary-button" disabled={!canSave || saving} type="submit">
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function AppLauncherMenu({
  menuRef,
  onClose,
  onEdit,
  onLaunch,
  onRemove,
  state,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onEdit: (entry: AppLauncherEntry) => void;
  onLaunch: (entry: AppLauncherEntry, mode: AppLauncherLaunchMode) => Promise<void>;
  onRemove: (entry: AppLauncherEntry) => Promise<void>;
  state: MenuState;
}) {
  const { t } = useTranslation();
  const runnable = state.prepared?.runnable ?? isRunnablePath(state.entry.path);
  return (
    <div
      ref={menuRef}
      className="terminal-menu app-launcher-menu"
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      <MenuButton
        icon={<Play size={14} />}
        label={t("appLauncher.runNormal")}
        onClick={() => {
          onClose();
          void onLaunch(state.entry, "normal");
        }}
      />
      <MenuButton
        disabled={!runnable}
        icon={<Shield size={14} />}
        label={t("appLauncher.runAdmin")}
        onClick={() => {
          onClose();
          void onLaunch(state.entry, "admin");
        }}
      />
      <MenuButton
        disabled={!runnable}
        icon={<UserRound size={14} />}
        label={t("appLauncher.runAsUser")}
        onClick={() => {
          onClose();
          void onLaunch(state.entry, "differentUser");
        }}
      />
      <MenuButton
        icon={<Pencil size={14} />}
        label={t("appLauncher.edit")}
        onClick={() => {
          onClose();
          onEdit(state.entry);
        }}
      />
      <MenuButton
        danger
        icon={<Trash2 size={14} />}
        label={t("appLauncher.remove")}
        onClick={() => {
          onClose();
          void onRemove(state.entry);
        }}
      />
    </div>
  );
}

function AppLauncherAddMenu({
  menuRef,
  onAddApp,
  onAddFile,
  onAddFolder,
  onClose,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  onAddApp: () => Promise<void>;
  onAddFile: () => Promise<void>;
  onAddFolder: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      ref={menuRef}
      className="terminal-menu app-launcher-menu app-launcher-add-menu"
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      <MenuButton
        icon={<AppWindow size={14} />}
        label={t("appLauncher.addMenuApp")}
        onClick={() => {
          onClose();
          void onAddApp();
        }}
      />
      <MenuButton
        icon={<FilePlus size={14} />}
        label={t("appLauncher.addMenuFile")}
        onClick={() => {
          onClose();
          void onAddFile();
        }}
      />
      <MenuButton
        icon={<FolderPlus size={14} />}
        label={t("appLauncher.addMenuFolder")}
        onClick={() => {
          onClose();
          void onAddFolder();
        }}
      />
    </div>
  );
}

function MenuButton({
  danger,
  disabled,
  icon,
  label,
  onClick,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`terminal-menu-item ${danger ? "danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hasBrowserDropPayload(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.files.length > 0 || event.dataTransfer.getData("text/plain").trim().length > 0;
}

function pathsFromBrowserDrop(event: DragEvent<HTMLElement>) {
  const filePaths = Array.from(event.dataTransfer.files)
    .map((file) => filePathFromBrowserFile(file))
    .filter(Boolean);
  const textPaths = event.dataTransfer
    .getData("text/plain")
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter(Boolean);
  return [...filePaths, ...textPaths];
}

function filePathFromBrowserFile(file: File) {
  const candidate = file as File & { path?: unknown; webkitRelativePath?: string };
  if (typeof candidate.path === "string" && candidate.path.trim()) {
    return candidate.path;
  }
  if (candidate.webkitRelativePath) {
    return candidate.webkitRelativePath;
  }
  return file.name;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createAppLauncherPortal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
