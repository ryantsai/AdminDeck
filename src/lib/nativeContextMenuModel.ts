export type NativeContextMenuItem =
  | {
      kind: "item";
      label: string;
      iconSvg?: string;
      disabled?: boolean;
      action: () => void;
    }
  | {
      kind: "submenu";
      label: string;
      iconSvg?: string;
      disabled?: boolean;
      items: NativeContextMenuItem[];
    }
  | {
      kind: "separator";
    };

export type NativeContextMenuPosition = {
  x: number;
  y: number;
};

export function normalizeNativeContextMenuItems(
  items: NativeContextMenuItem[],
): NativeContextMenuItem[] {
  const normalized: NativeContextMenuItem[] = [];

  for (const item of items) {
    if (item.kind === "separator") {
      if (normalized.length > 0 && normalized[normalized.length - 1]?.kind !== "separator") {
        normalized.push(item);
      }
      continue;
    }

    if (item.kind === "submenu") {
      const submenuItems = normalizeNativeContextMenuItems(item.items);
      if (submenuItems.length === 0) {
        continue;
      }
      normalized.push({
        ...item,
        items: submenuItems,
      });
      continue;
    }

    normalized.push(item);
  }

  while (normalized[normalized.length - 1]?.kind === "separator") {
    normalized.pop();
  }

  return normalized;
}
