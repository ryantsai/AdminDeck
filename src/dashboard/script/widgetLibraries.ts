// Widget library registry for AI-authored dashboard script widgets.
//
// Each entry is lazily loaded as a raw string and injected into the widget
// sandbox via a blob: URL <script> tag in buildSrcdoc. Vite splits each
// dynamic import into its own chunk so libraries only enter memory when a
// widget actually requests them.
//
// The widget script declares which libraries it needs via ScriptBody.libraries.
// Each requested library is loaded before the widget source runs and exposes
// a documented global (see WIDGET_LIBRARIES.global).

export interface WidgetLibrary {
  /** Stable key used in widget JSON to request the library. */
  key: string;
  /** Global identifier exposed inside the widget iframe scope. */
  global: string;
  /** One-line description used in AI instructions. */
  description: string;
  /** Lazily fetched, normalized source ready to inject as a classic <script>. */
  load: () => Promise<string>;
}

async function rawDefault(loader: () => Promise<{ default: string }>): Promise<string> {
  const mod = await loader();
  return mod.default;
}

async function loadPrism(): Promise<string> {
  const parts = await Promise.all([
    rawDefault(() => import("prismjs/prism.js?raw")),
    rawDefault(() => import("prismjs/components/prism-bash.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-json.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-yaml.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-python.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-javascript.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-typescript.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-sql.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-markdown.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-toml.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-ini.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-nginx.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-docker.min.js?raw")),
    rawDefault(() => import("prismjs/components/prism-diff.min.js?raw")),
  ]);
  return parts.join("\n;\n");
}

async function loadMarked(): Promise<string> {
  return rawDefault(() => import("widget-lib:marked?global=marked"));
}

export const WIDGET_LIBRARIES: Record<string, WidgetLibrary> = {
  mermaid: {
    key: "mermaid",
    global: "mermaid",
    description: "Text-to-diagram (flowchart, sequence, gantt, class, state, er, pie). Render into a measured kk-panel and re-run or scale SVG on resize.",
    load: () => rawDefault(() => import("widget-lib:mermaid?global=mermaid")),
  },
  echarts: {
    key: "echarts",
    global: "echarts",
    description: "Apache ECharts data visualization (bar, line, scatter, treemap, heatmap, radar). Mount in a measured kk-stage/kk-panel and call chart.resize() on viewport resize.",
    load: () => rawDefault(() => import("widget-lib:echarts?global=echarts")),
  },
  chartjs: {
    key: "chartjs",
    global: "Chart",
    description: "Chart.js canvas charts (bar, line, pie, doughnut, radar). Use responsive canvas sizing and call chart.resize() when KK.onViewportResize fires.",
    load: () => rawDefault(() => import("widget-lib:chart.js?global=Chart")),
  },
  qrcode: {
    key: "qrcode",
    global: "QRCode",
    description: "QR code generator (canvas, SVG, data URL).",
    load: () => rawDefault(() => import("widget-lib:qrcode?global=QRCode")),
  },
  jsbarcode: {
    key: "jsbarcode",
    global: "JsBarcode",
    description: "1D barcode renderer (Code128, EAN, UPC, ITF) to SVG or canvas.",
    load: () => rawDefault(() => import("jsbarcode/dist/JsBarcode.all.min.js?raw")),
  },
  jspdf: {
    key: "jspdf",
    global: "jspdf",
    description: "PDF generation. Access as window.jspdf.jsPDF.",
    load: () => rawDefault(() => import("widget-lib:jspdf?global=jspdf")),
  },
  mathjs: {
    key: "mathjs",
    global: "math",
    description: "Expression parser, algebra, matrices, unit conversion.",
    load: () => rawDefault(() => import("widget-lib:mathjs?global=math")),
  },
  papaparse: {
    key: "papaparse",
    global: "Papa",
    description: "CSV parsing and serialization (Papa.parse / Papa.unparse).",
    load: () => rawDefault(() => import("papaparse/papaparse.min.js?raw")),
  },
  pica: {
    key: "pica",
    global: "pica",
    description: "High-quality in-browser image resizing (canvas to canvas).",
    load: () => rawDefault(() => import("pica/dist/pica.min.js?raw")),
  },
  dayjs: {
    key: "dayjs",
    global: "dayjs",
    description: "Lightweight date parsing, formatting, arithmetic (Moment.js API).",
    load: () => rawDefault(() => import("dayjs/dayjs.min.js?raw")),
  },
  konva: {
    key: "konva",
    global: "Konva",
    description: "Interactive canvas stage/layer model with events. Size the Stage from KK.getViewport() and update stage.size() on resize.",
    load: () => rawDefault(() => import("widget-lib:konva?global=Konva")),
  },
  roughjs: {
    key: "roughjs",
    global: "rough",
    description: "Hand-drawn / sketch style rendering to canvas or SVG.",
    load: () => rawDefault(() => import("roughjs/bundled/rough.js?raw")),
  },
  alasql: {
    key: "alasql",
    global: "alasql",
    description: "SQL queries over JavaScript arrays of objects.",
    load: () => rawDefault(() => import("widget-lib:alasql?global=alasql")),
  },
  three: {
    key: "three",
    global: "THREE",
    description: "Three.js 3D scenes (scene, camera, renderer, geometry, materials). Size from KK.getViewport(), update camera on resize, and fit camera to scene bounds.",
    load: () => rawDefault(() => import("widget-lib:three?global=THREE")),
  },
  pixijs: {
    key: "pixijs",
    global: "PIXI",
    description: "PixiJS 2D WebGL rendering (sprites, graphics, animations). Use KK.getViewport() for renderer size and renderer.resize() on resize.",
    load: () => rawDefault(() => import("widget-lib:pixi.js?global=PIXI")),
  },
  matter: {
    key: "matter",
    global: "Matter",
    description: "2D physics engine (bodies, constraints, collisions). Pair with measured canvas bounds and explicit wall/floor bodies sized from KK.getViewport().",
    load: () => rawDefault(() => import("matter-js/build/matter.min.js?raw")),
  },
  prism: {
    key: "prism",
    global: "Prism",
    description:
      "Syntax highlighting (bash, json, yaml, python, js, ts, sql, markdown, toml, ini, nginx, docker, diff).",
    load: loadPrism,
  },
  jsyaml: {
    key: "jsyaml",
    global: "jsyaml",
    description: "YAML 1.2 load/dump (jsyaml.load, jsyaml.dump).",
    load: () => rawDefault(() => import("widget-lib:js-yaml?global=jsyaml")),
  },
  gridjs: {
    key: "gridjs",
    global: "gridjs",
    description: "Sortable/filterable/paginated HTML tables. Mount inside kk-panel, constrain height, and keep columns compact for widget widths.",
    load: () => rawDefault(() => import("widget-lib:gridjs?global=gridjs")),
  },
  ansitohtml: {
    key: "ansitohtml",
    global: "AnsiToHtml",
    description: "Convert ANSI escape color codes in log output to HTML spans.",
    load: () => rawDefault(() => import("widget-lib:ansi-to-html?global=AnsiToHtml")),
  },
  cronstrue: {
    key: "cronstrue",
    global: "cronstrue",
    description: "Render cron expressions as human-readable text.",
    load: () => rawDefault(() => import("cronstrue/dist/cronstrue.min.js?raw")),
  },
  cronparser: {
    key: "cronparser",
    global: "cronParser",
    description: "Parse cron expressions and iterate upcoming execution times.",
    load: () => rawDefault(() => import("widget-lib:cron-parser?global=cronParser")),
  },
  jwtdecode: {
    key: "jwtdecode",
    global: "jwt_decode",
    description: "Decode JSON Web Tokens (header + payload, no signature verify).",
    load: () => rawDefault(() => import("jwt-decode/build/jwt-decode.js?raw")),
  },
  diffmatchpatch: {
    key: "diffmatchpatch",
    global: "diff_match_patch",
    description: "Character/word/line diff algorithm by Google.",
    load: () => rawDefault(() => import("widget-lib:diff-match-patch?global=diff_match_patch")),
  },
  chroma: {
    key: "chroma",
    global: "chroma",
    description: "Color manipulation and continuous-value color scales for data viz.",
    load: () => rawDefault(() => import("widget-lib:chroma-js?global=chroma")),
  },
  leaflet: {
    key: "leaflet",
    global: "L",
    description: "Interactive maps (tile layers, markers, popups). Requires network: true. Mount in kk-stage and call map.invalidateSize() on resize.",
    load: () => rawDefault(() => import("leaflet/dist/leaflet.js?raw")),
  },
  fflate: {
    key: "fflate",
    global: "fflate",
    description: "Fast gzip / deflate / zip compression and decompression.",
    load: () => rawDefault(() => import("widget-lib:fflate?global=fflate")),
  },
  marked: {
    key: "marked",
    global: "marked",
    description: "Markdown to HTML renderer (already in the app bundle).",
    load: loadMarked,
  },
  animejs: {
    key: "animejs",
    global: "anime",
    description:
      "DOM/SVG/CSS property animation (number countup, SVG path draw, attribute tweens, timelines). Use for data-driven transitions, not decorative entrance effects.",
    load: () => rawDefault(() => import("widget-lib:animejs?global=anime")),
  },
};

const LEGACY_GLOBAL_LIBRARY_PATTERNS: { key: string; pattern: RegExp }[] = [
  { key: "mermaid", pattern: /\bmermaid\b/ },
  { key: "animejs", pattern: /\banime\b/ },
];

export function resolveWidgetLibraryKeys(keys: string[] | undefined, source: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  function add(key: string) {
    if (!WIDGET_LIBRARIES[key] || seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  }

  keys?.forEach(add);
  for (const entry of LEGACY_GLOBAL_LIBRARY_PATTERNS) {
    if (entry.pattern.test(source)) add(entry.key);
  }
  return ordered;
}

const sourceCache = new Map<string, Promise<string>>();

/**
 * Returns the injectable source for a known library key, or null if the key
 * is not registered. Sources are cached for the lifetime of the app.
 */
export function loadWidgetLibrary(key: string): Promise<string> | null {
  const entry = WIDGET_LIBRARIES[key];
  if (!entry) return null;
  let cached = sourceCache.get(key);
  if (!cached) {
    cached = entry.load().catch((err) => {
      sourceCache.delete(key);
      throw err;
    });
    sourceCache.set(key, cached);
  }
  return cached;
}

/** Resolve a list of requested library keys to their injectable sources. */
export async function loadWidgetLibraries(
  keys: string[] | undefined,
): Promise<{ key: string; global: string; source: string }[]> {
  if (!keys || keys.length === 0) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const key of keys) {
    if (seen.has(key) || !WIDGET_LIBRARIES[key]) continue;
    seen.add(key);
    ordered.push(key);
  }
  const sources = await Promise.all(
    ordered.map(async (key) => {
      const source = await loadWidgetLibrary(key)!;
      return { key, global: WIDGET_LIBRARIES[key].global, source };
    }),
  );
  return sources;
}

/** Catalog summary used to brief the AI assistant on available libraries. */
export function libraryCatalogForAi(): string {
  return Object.values(WIDGET_LIBRARIES)
    .map((lib) => `  - ${lib.key} (global: ${lib.global}): ${lib.description}`)
    .join("\n");
}
