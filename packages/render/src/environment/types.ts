/** A font file and what the renderer needs to know about it. */
export interface FontSource {
  /** The family name templates use in `font.family`. */
  family: string;
  /** This file is the family's bold face. Default false. */
  bold?: boolean;
  /** The font file, or where the environment loads it from. `render()` never fetches anything. */
  data: ArrayBuffer | URL;
  /** Ascender per em (the font's `hhea` ascender / unitsPerEm). */
  ascent: number;
  /** Descender per em, positive (the font's `hhea` descender / unitsPerEm, sign dropped). */
  descent: number;
  /** Inclusive code point ranges the font has glyphs for. */
  unicodeRanges: readonly (readonly [number, number])[];
}

/** The subset of `CanvasRenderingContext2D` the renderer uses. */
export interface Context2DLike {
  fillStyle: unknown;
  font: string;
  textBaseline: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): Context2DLike | null;
}

/**
 * Where rendering happens. `browserEnvironment()` uses the page's canvas and `FontFace`; tests use a Node
 * canvas. `loadFont` must make the font drawable under `internalName` (and only that name) before it resolves.
 */
export interface RenderEnvironment {
  createCanvas(width: number, height: number): CanvasLike;
  loadFont(source: FontSource, internalName: string): Promise<void>;
}
