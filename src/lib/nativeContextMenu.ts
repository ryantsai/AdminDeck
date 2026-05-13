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
      icon?: unknown;
      enabled?: boolean;
      action?: () => void;
    }
  | {
      text: string;
      icon?: unknown;
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
    const { Image } = await import("@tauri-apps/api/image");
    const menu = await Menu.new({
      items: await Promise.all(normalizedItems.map((item) => toTauriMenuItem(item, Image))),
    });
    await menu.popup(new LogicalPosition(Math.round(position.x), Math.round(position.y)));
    return true;
  } catch (error) {
    console.error("Failed to show native context menu", error);
    return false;
  }
}

async function toTauriMenuItem(
  item: NativeContextMenuItem,
  imageFactory: typeof import("@tauri-apps/api/image").Image,
): Promise<TauriMenuItem> {
  if (item.kind === "separator") {
    return { item: "Separator" };
  }

  if (item.kind === "submenu") {
    return {
      text: item.label,
      icon: item.iconSvg ? await optionalSvgMenuIconToImage(item.iconSvg, imageFactory) : undefined,
      enabled: !item.disabled,
      items: await Promise.all(item.items.map((submenuItem) => toTauriMenuItem(submenuItem, imageFactory))),
    };
  }

  return {
    text: item.label,
    icon: item.iconSvg ? await optionalSvgMenuIconToImage(item.iconSvg, imageFactory) : undefined,
    enabled: !item.disabled,
    action: item.action,
  };
}

const rasterizedIconCache = new Map<string, Promise<unknown>>();

async function optionalSvgMenuIconToImage(
  svg: string,
  imageFactory: typeof import("@tauri-apps/api/image").Image,
) {
  try {
    return await svgMenuIconToImage(svg, imageFactory);
  } catch (error) {
    console.warn("Failed to rasterize native menu icon", error);
    return undefined;
  }
}

async function svgMenuIconToImage(
  svg: string,
  imageFactory: typeof import("@tauri-apps/api/image").Image,
) {
  const cacheKey = `${MENU_ICON_SIZE}:${svg}`;
  const cachedIcon = rasterizedIconCache.get(cacheKey);
  if (cachedIcon) {
    return cachedIcon;
  }

  const icon = rasterizeSvgToRgba(svg, MENU_ICON_SIZE).then(({ rgba, width, height }) =>
    imageFactory.new(rgba, width, height),
  );
  rasterizedIconCache.set(cacheKey, icon);
  return icon;
}

const MENU_ICON_SIZE = 16;

export function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function rasterizeSvgToRgba(svg: string, size: number) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("SVG menu icons require a browser runtime");
  }

  const image = new window.Image();
  image.width = size;
  image.height = size;
  image.src = svgToDataUrl(svg.replace(/currentColor/g, "#1f2937"));
  await decodeImage(image);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }

  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return {
    rgba: context.getImageData(0, 0, size, size).data,
    width: size,
    height: size,
  };
}

async function decodeImage(image: HTMLImageElement) {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to decode SVG menu icon"));
  });
}
