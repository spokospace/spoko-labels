import type { CanvasLike, FontSource, RenderEnvironment } from "./types.js";

/**
 * Rendering in a browser page or worker: an `OffscreenCanvas` when available (else a `<canvas>` element), and
 * fonts loaded with `FontFace` into `document.fonts` (or the worker's `self.fonts`) under their internal name.
 * Loading a font from a URL fetches it; that happens in `loadFonts()`, never in `render()`.
 */
export function browserEnvironment(): RenderEnvironment {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height) as unknown as CanvasLike;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as CanvasLike;
    },
    async loadFont(source: FontSource, internalName: string): Promise<void> {
      const data = source.data instanceof URL ? `url("${source.data.href}")` : source.data;
      const face = new FontFace(internalName, data);
      await face.load();
      const fonts = (globalThis as { document?: Document }).document?.fonts ?? (globalThis as unknown as { fonts?: FontFaceSet }).fonts;
      if (!fonts) throw new Error("No FontFaceSet to add fonts to");
      fonts.add(face);
    },
  };
}
