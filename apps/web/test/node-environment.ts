/// <reference types="node" />
// A RenderEnvironment for tests: Skia through @napi-rs/canvas (a dev dependency, never shipped), as
// labels-render's own tests use.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { bundledFonts, loadFonts, type CanvasLike, type FontRegistry, type FontSource, type RenderEnvironment } from "@spokospace/labels-render";

export const nodeEnvironment: RenderEnvironment = {
  createCanvas: (width, height) => createCanvas(width, height) as unknown as CanvasLike,
  loadFont: async (source: FontSource, internalName: string) => {
    const bytes = source.data instanceof URL ? readFileSync(fileURLToPath(source.data)) : Buffer.from(new Uint8Array(source.data));
    if (!GlobalFonts.register(bytes, internalName)) throw new Error(`Could not register font ${source.family}`);
  },
};

let fonts: Promise<FontRegistry> | undefined;

/** The bundled fonts, loaded once per test file. */
export function nodeFonts(): Promise<FontRegistry> {
  fonts ??= loadFonts(nodeEnvironment, bundledFonts);
  return fonts;
}
