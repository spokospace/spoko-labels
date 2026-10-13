import type { PrintRotation } from "./schema/types.js";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** `image` turned `degrees` clockwise; the same object at 0. One RGBA pixel is copied as one 32-bit word. */
export function turn(image: RgbaImage, degrees: PrintRotation): RgbaImage {
  if (degrees === 0) return image;
  const { width: w, height: h } = image;
  const outWidth = degrees === 180 ? w : h;
  // Where the pixel at (x, y) lands, as an index into the turned image.
  const target =
    degrees === 90
      ? (x: number, y: number) => x * outWidth + (h - 1 - y)
      : degrees === 180
        ? (x: number, y: number) => (h - 1 - y) * outWidth + (w - 1 - x)
        : (x: number, y: number) => (w - 1 - x) * outWidth + y;
  // A copy keeps the view aligned whatever the source's byte offset.
  const from = new Uint32Array(image.data.slice().buffer);
  const out = new Uint8ClampedArray(image.data.length);
  const to = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) to[target(x, y)] = from[y * w + x] as number;
  return { width: outWidth, height: degrees === 180 ? h : w, data: out };
}
