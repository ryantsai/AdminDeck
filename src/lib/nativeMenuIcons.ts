function lucide(paths: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const nativeMenuIcons = {
  arrowDown: lucide(`<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>`),
  arrowLeft: lucide(`<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>`),
  arrowRight: lucide(`<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`),
  arrowUp: lucide(`<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>`),
  camera: lucide(`<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>`),
  download: lucide(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>`),
  folderPlus: lucide(`<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`),
  keyRound: lucide(`<path d="M2.59 13.41A2 2 0 0 0 2 14.83V17a2 2 0 0 0 2 2h2v-2h2v-2h2l1.59-1.59"/><circle cx="14.5" cy="9.5" r="5.5"/>`),
  layoutDashboard: lucide(`<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>`),
  panelRight: lucide(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>`),
  pencil: lucide(`<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`),
  pin: lucide(`<path d="M12 17v5"/><path d="M5 17h14"/><path d="M15 3.5 17.5 6 14 12l2 2v3H8v-3l2-2L6.5 6 9 3.5Z"/>`),
  pinOff: lucide(`<path d="M2 2l20 20"/><path d="M12 17v5"/><path d="M8 17h8"/><path d="M10 12 6.5 6 9 3.5 15 9.5"/><path d="M14 12l2 2v3H8v-3l1.7-1.7"/><path d="M14 4h3.5L15 8"/>`),
  plus: lucide(`<path d="M5 12h14"/><path d="M12 5v14"/>`),
  rotateCcw: lucide(`<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`),
  save: lucide(`<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8A2 2 0 0 1 21 8.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7H7v7"/><path d="M7 3v5h8"/>`),
  scanLine: lucide(`<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>`),
  server: lucide(`<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>`),
  settings: lucide(`<path d="M9.67 2h4.66l.51 2.55a8 8 0 0 1 1.72 1l2.44-.84 2.33 4.04-1.94 1.7a8 8 0 0 1 0 2l1.94 1.7-2.33 4.04-2.44-.84a8 8 0 0 1-1.72 1L14.33 22H9.67l-.51-2.55a8 8 0 0 1-1.72-1L5 19.29l-2.33-4.04 1.94-1.7a8 8 0 0 1 0-2l-1.94-1.7L5 5.81l2.44.84a8 8 0 0 1 1.72-1z"/><circle cx="12" cy="12" r="3"/>`),
  terminal: lucide(`<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>`),
  trash: lucide(`<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>`),
} as const;
