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
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { selectAppLauncherFile, selectAppLauncherFolder, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type {
  AppLauncherEntry,
  AppLauncherLaunchMode,
  AppLauncherSettings,
  PreparedAppLauncherEntry,
} from "../types";
import {
  isRunnablePath,
  launchAppLauncherEntry,
  loadAppLauncherSettings,
  prepareAppLauncherEntry,
  saveAppLauncherSettings,
} from "./storage";

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

export function AppLauncherWidget() {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [settings, setSettings] = useState<AppLauncherSettings>({ entries: [] });
  const [preparedById, setPreparedById] = useState<Record<string, PreparedAppLauncherEntry>>({});
  const [dialogDraft, setDialogDraft] = useState<EntryDraft | null>(null);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [addMenuState, setAddMenuState] = useState<AddMenuState | null>(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    void loadAppLauncherSettings()
      .then((nextSettings) => {
        if (!disposed) {
          setSettings(nextSettings);
        }
      })
      .catch((error) => {
        if (!disposed) {
          showStatusBarNotice(
            t("appLauncher.loadError", { message: errorMessage(error) }),
            { tone: "error" },
          );
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [showStatusBarNotice, t]);

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
      const saved = await saveAppLauncherSettings(nextSettings);
      setSettings(saved);
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
      const saved = await saveAppLauncherSettings({
        entries: settings.entries.filter((candidate) => candidate.id !== entry.id),
      });
      setSettings(saved);
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

  async function launch(entry: AppLauncherEntry, mode: AppLauncherLaunchMode) {
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
    <div className="dashboard-widget-body app-launcher-widget">
      <div className="app-launcher-widget-toolbar">
        <button
          className="secondary-button app-launcher-add"
          onClick={(event) => openAddMenuFromElement(event.currentTarget)}
          type="button"
        >
          <Plus size={14} />
          {t("common.add")}
        </button>
      </div>
      {settings.entries.length > 0 ? (
        <div className="app-launcher-tile-grid" aria-label={t("appLauncher.entriesLabel")}>
          {settings.entries.map((entry) => (
            <AppLauncherTile
              entry={entry}
              key={entry.id}
              onLaunch={launch}
              onMenu={(nextMenu) => setMenuState(nextMenu)}
              prepared={preparedById[entry.id]}
            />
          ))}
        </div>
      ) : (
        <div className="app-launcher-widget-empty">
          <AppWindow size={24} />
          <h4>{loading ? t("appLauncher.loading") : t("appLauncher.emptyTitle")}</h4>
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

function AppLauncherTile({
  entry,
  onLaunch,
  onMenu,
  prepared,
}: {
  entry: AppLauncherEntry;
  prepared?: PreparedAppLauncherEntry;
  onLaunch: (entry: AppLauncherEntry, mode: AppLauncherLaunchMode) => Promise<void>;
  onMenu: (state: MenuState) => void;
}) {
  const { t } = useTranslation();
  const missing = prepared?.exists === false;
  const iconDataUrl = prepared?.iconDataUrl ?? entry.iconDataUrl;

  function openMenuFromElement(element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    onMenu({ entry, prepared, x: bounds.left, y: bounds.bottom + 4 });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openMenuFromElement(event.currentTarget);
    }
  }

  return (
    <button
      className={`app-launcher-tile ${missing ? "missing" : ""}`}
      aria-label={t("appLauncher.launchApp", { name: entry.name })}
      onClick={() => void onLaunch(entry, "normal")}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ entry, prepared, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={handleKeyDown}
      type="button"
    >
      <span className="app-launcher-tile-icon" aria-hidden="true">
        {iconDataUrl ? (
          <img alt="" src={iconDataUrl} />
        ) : (
          <AppWindow size={20} />
        )}
      </span>
      <span className="app-launcher-tile-label">{entry.name}</span>
    </button>
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createAppLauncherPortal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
