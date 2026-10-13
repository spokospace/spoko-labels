/**
 * Template format, version 1. All geometry is in millimetres; the origin is the top-left corner of the
 * label and `y` grows down. Rendering converts to dots at 8 dots per mm.
 */

export const TEMPLATE_VERSION = 1;

/** Upper and lower bounds the validator enforces. Values outside them are `out-of-range`. */
export const LIMITS = {
  /** Largest label width or height, mm. */
  maxLabelSize: 300,
  maxElements: 200,
  maxSafeMargin: 10,
  maxFontSize: 50,
  letterSpacing: { min: -5, max: 5 },
  lineSpacing: { min: -5, max: 10 },
  maxFallbackFonts: 8,
  /** Text values longer than this many code points are cut (with a `value-truncated` warning). */
  maxTextLength: 2000,
} as const;

/** Values the validator fills in for omitted optional fields. */
export const DEFAULTS = {
  safeMargin: 0,
  letterSpacing: 0,
  lineSpacing: 0,
  align: "left",
  verticalAlign: "top",
  wrap: false,
  fit: "shrink",
  /** 0.75 mm is 6 dots. */
  minSize: 0.75,
  reverse: false,
  bold: false,
  level: "L",
} as const;

export type Shape = { kind: "rectangle" } | { kind: "rounded"; radius: number } | { kind: "circle" };

/** Where an element's value comes from: static text, or a data column by name or by position. */
export type Content = { text: string } | { bind: string; bindIndex?: number } | { bindIndex: number };

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type TextFit = "shrink" | "none";
export type QrLevel = "L" | "M" | "Q" | "H";

export interface FontSpec {
  /** A family name registered with the renderer, for example "HarmonyOS Sans". */
  family: string;
  /** Em size in mm. */
  size: number;
  bold?: boolean;
  /** Families to try, in order, when `family` lacks glyphs for the text. */
  fallback?: string[];
}

interface BoxBase {
  /** Free-form, for editors; not rendered. */
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement extends BoxBase {
  type: "text";
  content: Content;
  font: FontSpec;
  /** mm added between characters; may be negative. */
  letterSpacing?: number;
  /** mm added between lines. */
  lineSpacing?: number;
  align?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  /** Wrap at spaces; without it each `\n`-separated paragraph is one line. */
  wrap?: boolean;
  /** "shrink" lowers the size until the text fits its box; "none" keeps the size and warns on overflow. */
  fit?: TextFit;
  /** The smallest em size shrink may reach, mm. */
  minSize?: number;
  /** Fill the box black and draw the text white. */
  reverse?: boolean;
}

export interface QrElement extends BoxBase {
  type: "qr";
  content: Content;
  /** Error-correction level. */
  level?: QrLevel;
}

/** A filled rectangle: a horizontal line is a wide, thin box. */
export interface LineElement extends BoxBase {
  type: "line";
}

export type Element = TextElement | QrElement | LineElement;

export interface Template {
  version: 1;
  /** Display only. */
  name?: string;
  /** The label, mm. */
  size: { width: number; height: number };
  /** Default `{ kind: "rectangle" }`. Used for the preview and the safe-area warning only. */
  shape?: Shape;
  /** An extra inset from the shape's edge that should stay clear, mm. Default 0. */
  safeMargin?: number;
  /** Painted in array order: later elements on top. */
  elements: Element[];
}

// The shapes `validateTemplate()` returns: every default filled in, unknown properties removed.

export interface NormalizedFontSpec {
  family: string;
  size: number;
  bold: boolean;
  fallback: string[];
}

export interface NormalizedTextElement extends BoxBase {
  type: "text";
  content: Content;
  font: NormalizedFontSpec;
  letterSpacing: number;
  lineSpacing: number;
  align: HorizontalAlign;
  verticalAlign: VerticalAlign;
  wrap: boolean;
  fit: TextFit;
  /** Never larger than `font.size`. */
  minSize: number;
  reverse: boolean;
}

export interface NormalizedQrElement extends BoxBase {
  type: "qr";
  content: Content;
  level: QrLevel;
}

export type NormalizedElement = NormalizedTextElement | NormalizedQrElement | LineElement;

export interface NormalizedTemplate {
  version: 1;
  name?: string;
  size: { width: number; height: number };
  shape: Shape;
  safeMargin: number;
  elements: NormalizedElement[];
}
