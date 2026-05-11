export type DashboardWidgetCategory = "hash" | "network" | "quick" | "report";

export type DashboardWidgetKind =
  | "hashCalculator"
  | "subnetCalculator"
  | "quickTools"
  | "report"
  | "agent";

export type QuickToolId =
  | "urlEncode"
  | "urlDecode"
  | "base64Encode"
  | "base64Decode"
  | "unixToIso";

export interface DashboardWidgetDefinition {
  id: string;
  kind: DashboardWidgetKind;
  category: DashboardWidgetCategory;
  titleKey?: string;
  summaryKey?: string;
  title?: string;
  summary?: string;
  body?: string;
  createdBy?: "builtIn" | "agent";
}

export interface Ipv4SubnetResult {
  ok: true;
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  firstUsableAddress: string;
  lastUsableAddress: string;
  subnetMask: string;
  wildcardMask: string;
  totalAddresses: string;
  usableHosts: string;
}

export type Ipv4SubnetCalculation =
  | Ipv4SubnetResult
  | { ok: false; reason: "invalidFormat" | "invalidAddress" | "invalidPrefix" };

export type AgentWidgetResult =
  | { ok: true; widget: DashboardWidgetDefinition }
  | {
      ok: false;
      reason:
        | "invalidJson"
        | "invalidTitle"
        | "invalidCategory"
        | "invalidSummary"
        | "invalidBody";
    };

export const DASHBOARD_BUILTIN_WIDGETS: DashboardWidgetDefinition[] = [
  {
    id: "hash-calculator",
    kind: "hashCalculator",
    category: "hash",
    titleKey: "dashboard.hashTitle",
    summaryKey: "dashboard.hashSummary",
    createdBy: "builtIn",
  },
  {
    id: "ipv4-subnet-calculator",
    kind: "subnetCalculator",
    category: "network",
    titleKey: "dashboard.subnetTitle",
    summaryKey: "dashboard.subnetSummary",
    createdBy: "builtIn",
  },
  {
    id: "quick-tools",
    kind: "quickTools",
    category: "quick",
    titleKey: "dashboard.quickToolsTitle",
    summaryKey: "dashboard.quickToolsSummary",
    createdBy: "builtIn",
  },
  {
    id: "maintenance-report",
    kind: "report",
    category: "report",
    titleKey: "dashboard.reportTitle",
    summaryKey: "dashboard.reportSummary",
    createdBy: "builtIn",
  },
];

export function calculateIpv4Subnet(input: string): Ipv4SubnetCalculation {
  const match = /^([0-9]{1,3}(?:\.[0-9]{1,3}){3})\/([0-9]{1,2})$/.exec(
    input.trim(),
  );
  if (!match) {
    return { ok: false, reason: "invalidFormat" };
  }

  const address = parseIpv4Address(match[1] ?? "");
  if (address === undefined) {
    return { ok: false, reason: "invalidAddress" };
  }

  const prefix = Number(match[2]);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return { ok: false, reason: "invalidPrefix" };
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcard = (~mask) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const usableHosts = prefix >= 31 ? totalAddresses : Math.max(0, totalAddresses - 2);

  return {
    ok: true,
    cidr: `${formatIpv4Address(address)}/${prefix}`,
    networkAddress: formatIpv4Address(network),
    broadcastAddress: formatIpv4Address(broadcast),
    firstUsableAddress: formatIpv4Address(prefix >= 31 ? network : network + 1),
    lastUsableAddress: formatIpv4Address(prefix >= 31 ? broadcast : broadcast - 1),
    subnetMask: formatIpv4Address(mask),
    wildcardMask: formatIpv4Address(wildcard),
    totalAddresses: String(totalAddresses),
    usableHosts: String(usableHosts),
  };
}

export async function calculateTextHashes(input: string) {
  const bytes = new TextEncoder().encode(input);
  const [sha1, sha256] = await Promise.all([
    digestHex("SHA-1", bytes),
    digestHex("SHA-256", bytes),
  ]);
  return {
    bytes: String(bytes.length),
    characters: String(input.length),
    sha1,
    sha256,
  };
}

export function transformQuickTool(toolId: QuickToolId, input: string) {
  try {
    switch (toolId) {
      case "urlEncode":
        return { ok: true as const, output: encodeURIComponent(input) };
      case "urlDecode":
        return { ok: true as const, output: decodeURIComponent(input) };
      case "base64Encode":
        return { ok: true as const, output: btoa(unescape(encodeURIComponent(input))) };
      case "base64Decode":
        return { ok: true as const, output: decodeURIComponent(escape(atob(input))) };
      case "unixToIso": {
        const numeric = Number(input.trim());
        if (!Number.isFinite(numeric)) {
          return { ok: false as const, output: "", reason: "invalidNumber" };
        }
        const milliseconds = numeric > 9_999_999_999 ? numeric : numeric * 1000;
        return { ok: true as const, output: new Date(milliseconds).toISOString() };
      }
    }
  } catch {
    return { ok: false as const, output: "", reason: "invalidInput" };
  }
}

export function normalizeAgentWidgetDefinition(rawJson: string): AgentWidgetResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "invalidJson" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalidJson" };
  }
  const candidate = parsed as Record<string, unknown>;
  const title = normalizeText(candidate.title, 64);
  if (!title) {
    return { ok: false, reason: "invalidTitle" };
  }
  const category = candidate.category;
  if (!isDashboardWidgetCategory(category)) {
    return { ok: false, reason: "invalidCategory" };
  }
  const summary = normalizeText(candidate.summary, 180);
  if (!summary) {
    return { ok: false, reason: "invalidSummary" };
  }
  const body = normalizeText(candidate.body, 2000);
  if (!body) {
    return { ok: false, reason: "invalidBody" };
  }
  const id = normalizeWidgetId(candidate.id, title);

  return {
    ok: true,
    widget: {
      id,
      kind: "agent",
      category,
      title,
      summary,
      body,
      createdBy: "agent",
    },
  };
}

function parseIpv4Address(input: string) {
  const parts = input.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    value = ((value << 8) | octet) >>> 0;
  }
  return value >>> 0;
}

function formatIpv4Address(value: number) {
  return [24, 16, 8, 0]
    .map((shift) => String((value >>> shift) & 255))
    .join(".");
}

async function digestHex(algorithm: AlgorithmIdentifier, bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    return "";
  }
  const digest = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeWidgetId(value: unknown, title: string) {
  const candidate = normalizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (candidate) {
    return candidate;
  }
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `agent-${titleSlug || "widget"}`;
}

function isDashboardWidgetCategory(
  category: unknown,
): category is DashboardWidgetCategory {
  return (
    category === "hash" ||
    category === "network" ||
    category === "quick" ||
    category === "report"
  );
}
