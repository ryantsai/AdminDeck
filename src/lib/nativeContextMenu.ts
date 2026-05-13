import { isTauriRuntime } from "./tauri";
import {
  normalizeNativeContextMenuItems,
  type NativeContextMenuItem,
  type NativeContextMenuPosition,
} from "./nativeContextMenuModel";

type TauriMenuItem =
  | {
      item: "Separator";
    }
  | {
      text: string;
      enabled?: boolean;
      action?: () => void;
    }
  | {
      text: string;
      enabled?: boolean;
      items: TauriMenuItem[];
    };

export type { NativeContextMenuItem, NativeContextMenuPosition };

export async function showNativeContextMenu(
  items: NativeContextMenuItem[],
  position: NativeContextMenuPosition,
) {
  if (!isTauriRuntime()) {
    return false;
  }

  const normalizedItems = normalizeNativeContextMenuItems(items);
  if (normalizedItems.length === 0) {
    return false;
  }

  try {
    const [{ Menu }, { LogicalPosition }] = await Promise.all([
      import("@tauri-apps/api/menu"),
      import("@tauri-apps/api/dpi"),
    ]);
    const menu = await Menu.new({
      items: normalizedItems.map(toTauriMenuItem),
    });
    await menu.popup(new LogicalPosition(Math.round(position.x), Math.round(position.y)));
    return true;
  } catch (error) {
    console.error("Failed to show native context menu", error);
    return false;
  }
}

function toTauriMenuItem(item: NativeContextMenuItem): TauriMenuItem {
  if (item.kind === "separator") {
    return { item: "Separator" };
  }

  if (item.kind === "submenu") {
    return {
      text: item.label,
      enabled: !item.disabled,
      items: item.items.map(toTauriMenuItem),
    };
  }

  return {
    text: item.label,
    enabled: !item.disabled,
    action: item.action,
  };
}
