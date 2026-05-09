export function documentHasWebviewOverlay() {
  // DOM overlays cannot reliably stack above native child HWND surfaces
  // such as WebView2 and the RDP ActiveX host, so native views park while
  // these menus/overlays are open.
  return Boolean(
    document.querySelector(
      ".quick-connect-menu, .rail-context-menu, .sftp-context-menu, .sftp-properties-popover, .screenshot-menu, .screenshot-region-overlay, .transfer-conflict-backdrop, .connection-dialog-backdrop, .settings-page",
    ),
  );
}
