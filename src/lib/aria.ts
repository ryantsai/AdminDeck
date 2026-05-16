export function ariaExpanded(isExpanded: boolean) {
  return { "aria-expanded": isExpanded ? "true" : "false" } as const;
}

export function ariaChecked(isChecked: boolean) {
  return { "aria-checked": isChecked ? "true" : "false" } as const;
}

export function ariaHidden(isHidden: boolean) {
  return { "aria-hidden": isHidden ? "true" : "false" } as const;
}

export function ariaInvalid(isInvalid: boolean) {
  return isInvalid ? ({ "aria-invalid": "true" } as const) : {};
}

export function ariaPressed(isPressed: boolean) {
  return { "aria-pressed": isPressed ? "true" : "false" } as const;
}

export function ariaSelected(isSelected: boolean) {
  return { "aria-selected": isSelected ? "true" : "false" } as const;
}

export function menuButtonAria(isExpanded: boolean) {
  return { "aria-haspopup": "menu", ...ariaExpanded(isExpanded) } as const;
}

export function dialogButtonAria(isExpanded: boolean) {
  return { "aria-haspopup": "dialog", ...ariaExpanded(isExpanded) } as const;
}
