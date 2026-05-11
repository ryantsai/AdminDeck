import { ACCENT_PALETTE, resolveAccent, isAccentName, isIconName } from "./palette";

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(ACCENT_PALETTE.length, 14);
assertEqual(resolveAccent("blue").color, "#2563eb");
assertEqual(isAccentName("blue"), true);
assertEqual(isAccentName("neon"), false);
assertEqual(isIconName("Hash"), true);
assertEqual(isIconName("NotAnIcon"), false);
