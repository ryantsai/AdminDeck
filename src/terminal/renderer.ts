import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  Terminal as XtermTerminal,
  type IDisposable,
  type ITerminalOptions,
} from "@xterm/xterm";
import type { TerminalSettings } from "../types";

export type TerminalRendererBackend = "xterm";

export type TerminalRendererCapability =
  | "alternateScreen"
  | "bracketedPaste"
  | "copySelection"
  | "hyperlinks"
  | "mouseTracking"
  | "resize"
  | "scrollback";

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

export interface TerminalRenderer {
  readonly backend: TerminalRendererBackend;
  readonly capabilities: readonly TerminalRendererCapability[];
  readonly dimensions: TerminalDimensions;
  dispose: () => void;
  fit: () => TerminalDimensions;
  focus: () => void;
  getSelection: () => string;
  onData: (handler: (data: string) => void) => IDisposable;
  onSelectionChange: (handler: () => void) => IDisposable;
  open: (element: HTMLElement) => void;
  write: (data: string) => void;
  writeln: (data: string) => void;
}

const XTERM_CAPABILITIES = [
  "alternateScreen",
  "bracketedPaste",
  "copySelection",
  "hyperlinks",
  "mouseTracking",
  "resize",
  "scrollback",
] satisfies TerminalRendererCapability[];

export function createTerminalRenderer(settings: TerminalSettings): TerminalRenderer {
  return new XtermTerminalRenderer(settings);
}

class XtermTerminalRenderer implements TerminalRenderer {
  readonly backend = "xterm";
  readonly capabilities = XTERM_CAPABILITIES;
  private readonly fitAddon = new FitAddon();
  private readonly terminal: XtermTerminal;

  constructor(settings: TerminalSettings) {
    this.terminal = new XtermTerminal(terminalOptionsFor(settings));
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
  }

  get dimensions() {
    return {
      cols: this.terminal.cols,
      rows: this.terminal.rows,
    };
  }

  dispose() {
    this.terminal.dispose();
  }

  fit() {
    this.fitAddon.fit();
    return this.dimensions;
  }

  focus() {
    this.terminal.focus();
  }

  getSelection() {
    return this.terminal.getSelection();
  }

  onData(handler: (data: string) => void) {
    return this.terminal.onData(handler);
  }

  onSelectionChange(handler: () => void) {
    return this.terminal.onSelectionChange(handler);
  }

  open(element: HTMLElement) {
    this.terminal.open(element);
  }

  write(data: string) {
    this.terminal.write(data);
  }

  writeln(data: string) {
    this.terminal.writeln(data);
  }
}

function terminalOptionsFor(settings: TerminalSettings): ITerminalOptions {
  return {
    altClickMovesCursor: false,
    convertEol: false,
    customGlyphs: true,
    cursorBlink: true,
    cursorInactiveStyle: "outline",
    cursorStyle: settings.cursorStyle,
    drawBoldTextInBrightColors: true,
    fastScrollSensitivity: 5,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    ignoreBracketedPasteMode: false,
    lineHeight: settings.lineHeight,
    macOptionClickForcesSelection: true,
    macOptionIsMeta: true,
    minimumContrastRatio: 1,
    rightClickSelectsWord: true,
    scrollOnEraseInDisplay: true,
    scrollOnUserInput: true,
    scrollback: clampScrollback(settings.scrollbackLines),
    smoothScrollDuration: 0,
    theme: {
      background: "#0c1219",
      foreground: "#d9e2ef",
      cursor: "#d9e2ef",
      selectionBackground: "#305f95",
    },
  };
}

function clampScrollback(lines: number) {
  if (!Number.isFinite(lines)) {
    return 5000;
  }

  return Math.min(Math.max(Math.round(lines), 100), 100_000);
}
