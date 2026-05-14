import { fitImageDimensions } from "./iconImage.ts";

const wide = fitImageDimensions(1200, 600);
if (wide.width !== 384 || wide.height !== 192) {
  throw new Error(`Wide icon should fit to 384x192, got ${wide.width}x${wide.height}.`);
}

const tall = fitImageDimensions(600, 1200);
if (tall.width !== 192 || tall.height !== 384) {
  throw new Error(`Tall icon should fit to 192x384, got ${tall.width}x${tall.height}.`);
}

const square = fitImageDimensions(800, 800);
if (square.width !== 384 || square.height !== 384) {
  throw new Error(`Square icon should fit to 384x384, got ${square.width}x${square.height}.`);
}
