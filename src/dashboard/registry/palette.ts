import type { AccentName, IconName } from "../types";
import { ACCENT_NAMES, ICON_NAMES } from "../types";

export interface AccentDefinition {
  name: AccentName;
  color: string;     // strong accent
  soft: string;      // soft accent (~12% alpha)
}

export const ACCENT_PALETTE: AccentDefinition[] = [
  { name: "blue",    color: "#2563eb", soft: "rgba(37,99,235,0.12)"  },
  { name: "indigo",  color: "#4f46e5", soft: "rgba(79,70,229,0.12)"  },
  { name: "teal",    color: "#0d9488", soft: "rgba(13,148,136,0.12)" },
  { name: "green",   color: "#15915f", soft: "rgba(21,145,95,0.12)"  },
  { name: "amber",   color: "#d97706", soft: "rgba(217,119,6,0.12)"  },
  { name: "red",     color: "#dc2626", soft: "rgba(220,38,38,0.12)"  },
  { name: "purple",  color: "#7c3aed", soft: "rgba(124,58,237,0.12)" },
  { name: "pink",    color: "#db2777", soft: "rgba(219,39,119,0.12)" },
  { name: "slate",   color: "#475569", soft: "rgba(71,85,105,0.12)"  },
  { name: "cyan",    color: "#0891b2", soft: "rgba(8,145,178,0.12)"  },
  { name: "orange",  color: "#ea580c", soft: "rgba(234,88,12,0.12)"  },
  { name: "rose",    color: "#e11d48", soft: "rgba(225,29,72,0.12)"  },
  { name: "emerald", color: "#059669", soft: "rgba(5,150,105,0.12)"  },
  { name: "sky",     color: "#0284c7", soft: "rgba(2,132,199,0.12)"  },
];

export function resolveAccent(name: AccentName): AccentDefinition {
  const found = ACCENT_PALETTE.find((p) => p.name === name);
  if (!found) return ACCENT_PALETTE[0];
  return found;
}

export const ACCENT_NAMES_ALL = ACCENT_NAMES;
export const ICON_NAMES_ALL = ICON_NAMES;

export function isAccentName(value: string): value is AccentName {
  return (ACCENT_NAMES as readonly string[]).includes(value);
}

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}
