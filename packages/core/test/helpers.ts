import type { ImageLike } from "../src/index.js";

export const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Deterministic pseudo-random RGBA image; the same generator is used by generate-prototype-vectors.mjs. */
export function syntheticImage(width: number, height: number, seed: number): ImageLike {
  let s = seed >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 24;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = next();
    data[i * 4 + 1] = next();
    data[i * 4 + 2] = next();
    data[i * 4 + 3] = next() < 32 ? 0 : 255;
  }
  return { width, height, data };
}

/** Solid RGBA image of one color. */
export function solidImage(width: number, height: number, rgba: [number, number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}
