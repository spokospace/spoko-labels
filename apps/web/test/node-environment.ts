/// <reference types="node" />
// A RenderEnvironment for tests: Skia through @napi-rs/canvas (a dev dependency, never shipped), as
// labels-render's own tests use.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { loadFonts, type CanvasLike, type FontRegistry, type FontSource, type RenderEnvironment } from "@spokospace/labels-render";
import { ALL_FONTS } from "../src/fonts.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The file a font URL points at. Under happy-dom, `new URL("../../fonts/…", import.meta.url)` in a package
 * resolves against the document's http origin instead of the module's file URL, keeping the path from the repo
 * root; that path is mapped back onto the checkout.
 */
const fontFile = (url: URL): string => (url.protocol === "file:" ? fileURLToPath(url) : join(repoRoot, decodeURIComponent(url.pathname)));

export const nodeEnvironment: RenderEnvironment = {
  createCanvas: (width, height) => createCanvas(width, height) as unknown as CanvasLike,
  loadFont: async (source: FontSource, internalName: string) => {
    const bytes = source.data instanceof URL ? readFileSync(fontFile(source.data)) : Buffer.from(new Uint8Array(source.data));
    if (!GlobalFonts.register(bytes, internalName)) throw new Error(`Could not register font ${source.family}`);
  },
};

let fonts: Promise<FontRegistry> | undefined;

/** Every font the app can draw with, loaded once per test file. */
export function nodeFonts(): Promise<FontRegistry> {
  fonts ??= loadFonts(nodeEnvironment, ALL_FONTS);
  return fonts;
}
