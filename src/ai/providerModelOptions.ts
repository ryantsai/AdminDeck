import type { AiProviderKind } from "../types";

type ProviderModelOption = {
  id: string;
  label: string;
};

const OPENROUTER_MODEL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareModelsByNameDescending(
  left: ProviderModelOption,
  right: ProviderModelOption,
) {
  const byLabel = OPENROUTER_MODEL_COLLATOR.compare(right.label, left.label);
  if (byLabel !== 0) return byLabel;
  return OPENROUTER_MODEL_COLLATOR.compare(right.id, left.id);
}

export function sortModelOptionsForProvider<T extends ProviderModelOption>(
  _providerKind: AiProviderKind,
  models: T[],
) {
  return [...models].sort(compareModelsByNameDescending);
}
