/// <reference types="node" />
// A RenderEnvironment for tests: Skia through @napi-rs/canvas (a dev dependency, never shipped).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { CanvasLike, FontSource, RenderEnvironment } from "../src/environment/types.js";

export const nodeEnvironment: RenderEnvironment = {
  createCanvas: (width, height) => createCanvas(width, height) as unknown as CanvasLike,
  loadFont: async (source: FontSource, internalName: string) => {
    const bytes =
      source.data instanceof URL ? readFileSync(fileURLToPath(source.data)) : Buffer.from(new Uint8Array(source.data));
    if (!GlobalFonts.register(bytes, internalName)) throw new Error(`Could not register font ${source.family}`);
  },
};
