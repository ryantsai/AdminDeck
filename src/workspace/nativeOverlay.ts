const NATIVE_BLOCKING_OVERLAY_SELECTOR = [
  ".sftp-context-menu",
  ".sftp-properties-popover",
  ".screenshot-region-overlay",
  ".transfer-conflict-backdrop",
  ".connection-dialog-backdrop",
  ".confirm-delete-backdrop",
  ".app-launcher-dialog-backdrop",
  ".settings-page",
  ".dw-catalog-backdrop",
  ".dw-customize",
].join(", ");

export function documentHasRdpBlockingOverlay(surface: Element | null) {
  return documentHasNativeBlockingOverlay(surface);
}

function documentHasNativeBlockingOverlay(surface: Element | null) {
  const surfaceRect = visibleRect(surface);
  if (!surfaceRect) {
    return false;
  }
  return Array.from(document.querySelectorAll(NATIVE_BLOCKING_OVERLAY_SELECTOR)).some((overlay) => {
    const overlayRect = visibleRect(overlay);
    return Boolean(overlayRect && rectsIntersect(surfaceRect, overlayRect));
  });
}

function visibleRect(element: Element | null) {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return rect;
}

function rectsIntersect(first: DOMRect, second: DOMRect) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}
