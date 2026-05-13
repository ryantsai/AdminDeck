export function documentHasWebviewOverlay() {
  // DOM overlays cannot reliably stack above native child HWND surfaces
  // such as WebView2 and the RDP ActiveX host, so native views park while
  // these menus/overlays are open.
  return Boolean(
    document.querySelector(
      ".quick-connect-menu, .tree-context-menu, .tree-context-submenu-menu, .add-connection-menu, .rail-context-menu, .sftp-context-menu, .sftp-properties-popover, .screenshot-menu, .screenshot-region-overlay, .transfer-conflict-backdrop, .connection-dialog-backdrop, .confirm-delete-backdrop, .app-launcher-dialog-backdrop, .settings-page, .dw-catalog-backdrop, .dw-customize",
    ),
  );
}
