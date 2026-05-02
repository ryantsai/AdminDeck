import { FitAddon } from "@xterm/addon-fit";
import {
  SearchAddon,
  type ISearchOptions,
  type ISearchResultChangeEvent,
} from "@xterm/addon-search";
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
  getSelection: () => string;
  onData: (handler: (data: string) => void) => IDisposable;
  onSearchResultsChange: (handler: (result: ISearchResultChangeEvent) => void) => IDisposable;
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

  constructor(settings: TerminalSettings) {
    this.terminal = new XtermTerminal(terminalOptionsFor(settings));
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
    this.terminal.loadAddon(new WebLinksAddon());
  }

  get dimensions() {
    const pixels = pixelDimensionsFor(this.hostElement);
    return {
      cols: this.terminal.cols,
      pixelHeight: pixels.pixelHeight,
      pixelWidth: pixels.pixelWidth,
      rows: this.terminal.rows,
    };
  }

  dispose() {
    this.hostElement = null;
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
  }

  write(data: string) {
    this.terminal.write(data);
  }

  writeln(data: string) {
    this.terminal.writeln(data);
  }
}

function pixelDimensionsFor(element: HTMLElement | null) {
  return {
    pixelHeight: Math.max(0, Math.round(element?.clientHeight ?? 0)),
    pixelWidth: Math.max(0, Math.round(element?.clientWidth ?? 0)),
  };
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
