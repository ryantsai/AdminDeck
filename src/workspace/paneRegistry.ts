import type { TerminalRenderer } from "../terminal/renderer";

const renderers = new Map<string, TerminalRenderer>();
const inputWriters = new Map<string, (data: string) => void>();

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

export function registerPaneInputWriter(paneId: string, writer: (data: string) => void) {
  inputWriters.set(paneId, writer);
}

export function unregisterPaneInputWriter(paneId: string, writer: (data: string) => void) {
  if (inputWriters.get(paneId) === writer) {
    inputWriters.delete(paneId);
  }
}

export function writeInputToPane(paneId: string, data: string) {
  const writer = inputWriters.get(paneId);
  if (!writer) {
    return false;
  }
  writer(data);
  return true;
}
