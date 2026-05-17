import { sortModelOptionsForProvider } from "./providerModelOptions";

const sorted = sortModelOptionsForProvider("openai", [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "gpt-5.4", label: "GPT-5.4" },
]).map((model) => model.id);

const expected = ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4", "claude-sonnet-4.6"];

if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
  throw new Error(`Models should sort by label descending, got: ${sorted.join(", ")}`);
}

const source = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
];
const result = sortModelOptionsForProvider("ollama", source);

if (result === source) {
  throw new Error("Model sorting should not mutate or return the source list.");
}
