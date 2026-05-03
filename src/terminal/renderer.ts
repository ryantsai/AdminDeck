import { FitAddon } from "@xterm/addon-fit";
import {
  SearchAddon,
  type ISearchOptions,
  type ISearchResultChangeEvent,
} from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
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
  | "search"
  | "scrollback";

export interface TerminalDimensions {
  cols: number;
  pixelHeight: number;
  pixelWidth: number;
  rows: number;
}

export interface TerminalRenderer {
  readonly backend: TerminalRendererBackend;
  readonly capabilities: readonly TerminalRendererCapability[];
  readonly dimensions: TerminalDimensions;
  clearSearch: () => void;
  dispose: () => void;
  fit: () => TerminalDimensions;
  findNext: (term: string) => boolean;
  findPrevious: (term: string) => boolean;
  focus: () => void;
  attachCustomKeyEventHandler: (handler: (event: KeyboardEvent) => boolean) => void;
  getSelection: () => string;
  onData: (handler: (data: string) => void) => IDisposable;
  onSearchResultsChange: (handler: (result: ISearchResultChangeEvent) => void) => IDisposable;
  onSelectionChange: (handler: () => void) => IDisposable;
  open: (element: HTMLElement) => void;
  write: (data: string) => void;
  writeln: (data: string) => void;
  setFontSize: (size: number) => void;
  getFontSize: () => number;
  getBufferText: () => string;
  onFocus: (handler: () => void) => IDisposable;
}

const XTERM_CAPABILITIES = [
  "alternateScreen",
  "bracketedPaste",
  "copySelection",
  "hyperlinks",
  "mouseTracking",
  "resize",
  "search",
  "scrollback",
] satisfies TerminalRendererCapability[];

const SEARCH_OPTIONS: ISearchOptions = {
  decorations: {
    matchBackground: "#24384f",
    matchBorder: "#5aa0ff",
    matchOverviewRuler: "#5aa0ff",
    activeMatchBackground: "#f7c948",
    activeMatchBorder: "#f7c948",
    activeMatchColorOverviewRuler: "#f7c948",
  },
};

export function createTerminalRenderer(settings: TerminalSettings): TerminalRenderer {
  return new XtermTerminalRenderer(settings);
}

class XtermTerminalRenderer implements TerminalRenderer {
  readonly backend = "xterm";
  readonly capabilities = XTERM_CAPABILITIES;
  private readonly fitAddon = new FitAddon();
  private hostElement: HTMLElement | null = null;
  private readonly searchAddon = new SearchAddon({ highlightLimit: 500 });
  private readonly terminal: XtermTerminal;
  private webglAddon: WebglAddon | null = null;
  private webglContextLossDisposable: IDisposable | null = null;

  constructor(settings: TerminalSettings) {
    this.terminal = new XtermTerminal(terminalOptionsFor(settings));
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
    this.terminal.loadAddon(new WebLinksAddon());
  }

  get dimensions() {
    const pixels = contentPixelDimensionsFor(this.terminal.element ?? this.hostElement);
    return {
      cols: this.terminal.cols,
      pixelHeight: pixels.pixelHeight,
      pixelWidth: pixels.pixelWidth,
      rows: this.terminal.rows,
    };
  }

  dispose() {
    this.hostElement = null;
    this.disposeWebglAddon();
    this.terminal.dispose();
  }

  clearSearch() {
    this.searchAddon.clearDecorations();
    this.terminal.clearSelection();
  }

  fit() {
    this.fitAddon.fit();
    return this.dimensions;
  }

  findNext(term: string) {
    const normalizedTerm = term.trim();
    if (!normalizedTerm) {
      this.clearSearch();
      return false;
    }

    return this.searchAddon.findNext(normalizedTerm, {
      ...SEARCH_OPTIONS,
      incremental: true,
    });
  }

  findPrevious(term: string) {
    const normalizedTerm = term.trim();
    if (!normalizedTerm) {
      this.clearSearch();
      return false;
    }

    return this.searchAddon.findPrevious(normalizedTerm, SEARCH_OPTIONS);
  }

  focus() {
    this.terminal.focus();
  }

  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
    this.terminal.attachCustomKeyEventHandler(handler);
  }

  getSelection() {
    return this.terminal.getSelection();
  }

  onData(handler: (data: string) => void) {
    return this.terminal.onData(handler);
  }

  onSearchResultsChange(handler: (result: ISearchResultChangeEvent) => void) {
    return this.searchAddon.onDidChangeResults(handler);
  }

  onSelectionChange(handler: () => void) {
    return this.terminal.onSelectionChange(handler);
  }

  open(element: HTMLElement) {
    this.hostElement = element;
    this.terminal.open(element);
    this.tryEnableWebglRenderer();
  }

  private tryEnableWebglRenderer() {
    if (this.webglAddon) {
      return;
    }

    let addon: WebglAddon;
    try {
      addon = new WebglAddon();
    } catch {
      // WebGL2 unavailable (driver, headless RDP, blocklist) — stay on DOM.
      return;
    }

    try {
      this.terminal.loadAddon(addon);
    } catch {
      addon.dispose();
      return;
    }

    this.webglContextLossDisposable = addon.onContextLoss(() => {
      // GPU context evicted (sleep/wake, GPU reset). Drop the addon and let
      // xterm fall back to its DOM renderer for subsequent frames.
      this.disposeWebglAddon();
    });
    this.webglAddon = addon;
  }

  private disposeWebglAddon() {
    this.webglContextLossDisposable?.dispose();
    this.webglContextLossDisposable = null;
    this.webglAddon?.dispose();
    this.webglAddon = null;
  }

  write(data: string) {
    this.terminal.write(data);
  }

  writeln(data: string) {
    this.terminal.writeln(data);
  }

  setFontSize(size: number) {
    const clamped = Math.min(Math.max(Math.round(size), 6), 64);
    this.terminal.options.fontSize = clamped;
    try {
      this.fitAddon.fit();
    } catch {
      // Fit may throw if the host is detached; safe to ignore.
    }
  }

  getFontSize() {
    return this.terminal.options.fontSize ?? 14;
  }

  getBufferText() {
    const lines: string[] = [];
    const buffers = [this.terminal.buffer.normal, this.terminal.buffer.alternate];
    const seen = new Set<typeof buffers[number]>();
    for (const buffer of buffers) {
      if (!buffer || seen.has(buffer)) {
        continue;
      }
      seen.add(buffer);
      const total = buffer.length;
      for (let row = 0; row < total; row += 1) {
        const line = buffer.getLine(row);
        if (!line) {
          continue;
        }
        lines.push(line.translateToString(true));
      }
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.join("\n");
  }

  onFocus(handler: () => void) {
    return this.terminal.textarea
      ? listenToFocus(this.terminal.textarea, handler)
      : { dispose: () => undefined };
  }
}

function listenToFocus(textarea: HTMLTextAreaElement, handler: () => void): IDisposable {
  textarea.addEventListener("focus", handler);
  return {
    dispose: () => textarea.removeEventListener("focus", handler),
  };
}

function contentPixelDimensionsFor(element: HTMLElement | null) {
  const style = element ? window.getComputedStyle(element) : null;
  const horizontalPadding =
    numericStyleValue(style?.paddingLeft) + numericStyleValue(style?.paddingRight);
  const verticalPadding =
    numericStyleValue(style?.paddingTop) + numericStyleValue(style?.paddingBottom);

  return {
    pixelHeight: Math.max(0, Math.round((element?.clientHeight ?? 0) - verticalPadding)),
    pixelWidth: Math.max(0, Math.round((element?.clientWidth ?? 0) - horizontalPadding)),
  };
}

function numericStyleValue(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
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
      selectionInactiveBackground: "#1e3a5f",
    },
  };
}

function clampScrollback(lines: number) {
  if (!Number.isFinite(lines)) {
    return 5000;
  }

  return Math.min(Math.max(Math.round(lines), 100), 100_000);
}
