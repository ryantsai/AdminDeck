import type { TerminalRenderer } from "../terminal/renderer";

const renderers = new Map<string, TerminalRenderer>();

export function registerPaneRenderer(paneId: string, renderer: TerminalRenderer) {
  renderers.set(paneId, renderer);
}

export function unregisterPaneRenderer(paneId: string, renderer: TerminalRenderer) {
  if (renderers.get(paneId) === renderer) {
    renderers.delete(paneId);
  }
}

export function getPaneRenderer(paneId: string): TerminalRenderer | undefined {
  return renderers.get(paneId);
}
