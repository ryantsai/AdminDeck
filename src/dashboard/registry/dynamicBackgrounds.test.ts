import {
  DYNAMIC_BACKGROUNDS,
  getDashboardDynamicBackgroundHostClassName,
  isDynamicBackgroundId,
} from "./dynamicBackgrounds";

const dynamicBackgroundCount: 9 = DYNAMIC_BACKGROUNDS.length as 9;
void dynamicBackgroundCount;

const expectedIds = [
  "aurora",
  "raindrops",
  "starfield",
  "nebula",
  "embers",
  "lava",
  "matrix",
  "synthwave",
  "confetti",
] as const;

for (const id of expectedIds) {
  if (!isDynamicBackgroundId(id)) {
    throw new Error(`Dynamic Dashboard background id should be accepted: ${id}`);
  }
}

if (isDynamicBackgroundId("none")) {
  throw new Error("Theme default should not be stored as a dynamic Dashboard background.");
}

if (getDashboardDynamicBackgroundHostClassName() !== "dw-canvas-bg dw-dynamic-bg-layer") {
  throw new Error("Dynamic Dashboard backgrounds should use the stable scroll-level background placement class.");
}
