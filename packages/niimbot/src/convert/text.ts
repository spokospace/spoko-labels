import { LIMITS, type HorizontalAlign, type TextElement, type VerticalAlign } from "@spokospace/labels-render";
import { DEFAULT_FAMILY, DEFAULT_FONT_CODE, familyFor } from "../fonts/codes.js";
import { convertContent } from "./binding.js";
import { finite, get, type ElementContext } from "./context.js";
import type { Box } from "./element.js";

/**
 * Niimbot's `letterSpacing` renders about 1.65× wider than the stored value (measured on the app's own
 * thumbnails: 0.3 gives about 0.5 mm between letters). Template v1 stores true millimetres.
 */
export const LETTER_SPACING_SCALE = 1.65;

const HORIZONTAL: Record<number, HorizontalAlign> = { 0: "left", 1: "center", 2: "right" };
// 3 is read as bottom, as the prototype did; the app's meaning of 2 vs 3 is not documented.
const VERTICAL: Record<number, VerticalAlign> = { 0: "top", 1: "middle", 2: "bottom", 3: "bottom" };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
/** An optional number that is not finite counts as absent. */
const optionalNumber = (ctx: ElementContext, key: string): number | undefined => {
  const value = get(ctx.raw, key);
  return finite(value) ? value : undefined;
};

function alignment<T>(ctx: ElementContext, key: string, table: Record<number, T>, fallback: T, feature: string): T {
  const value = get(ctx.raw, key);
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" && Object.hasOwn(table, value)) return table[value] as T;
  ctx.approximated(key, feature);
  return fallback;
}

/** A Niimbot `text` element, or `null` when it is skipped. */
export function convertText(ctx: ElementContext, box: Box): TextElement | null {
  const typesetting = get(ctx.raw, "typesettingMode");
  if (typesetting !== undefined && typesetting !== 1) {
    ctx.warn("unsupported-element", "typesettingMode");
    return null;
  }
  const content = convertContent(ctx);

  // Font
  const rawCode = get(ctx.raw, "fontCode");
  const code = typeof rawCode === "string" && rawCode.length > 0 ? rawCode : DEFAULT_FONT_CODE;
  const { family, known } = familyFor(code, ctx.options.fonts, ctx.options.fontCatalog);
  if (!known) ctx.warn("unknown-font", "fontCode");
  const rawSize = get(ctx.raw, "fontSize");
  // A size that is not a finite number is passed on as is: the validator rejects the element.
  const size = finite(rawSize) ? ctx.clamped("fontSize", rawSize, -Infinity, LIMITS.maxFontSize) : rawSize;
  const style = strings(get(ctx.raw, "fontStyle"));
  for (const feature of ["underline", "italic"]) if (style.includes(feature)) ctx.approximated("fontStyle", feature);
  const font: TextElement["font"] = { family, size: size as number };
  if (style.includes("bold")) font.bold = true;
  // Without a fallback, render would try the registered families in order, and Viga lacks most Polish letters.
  if (family !== DEFAULT_FAMILY) font.fallback = [DEFAULT_FAMILY];

  // Spacing
  const letter = optionalNumber(ctx, "letterSpacing") ?? 0;
  const word = optionalNumber(ctx, "wordSpacing");
  if (word !== undefined && word !== letter) ctx.approximated("wordSpacing", "word-spacing");
  const letterSpacing = ctx.clamped("letterSpacing", letter * LETTER_SPACING_SCALE, LIMITS.letterSpacing.min, LIMITS.letterSpacing.max);
  const lineSpacing = ctx.clamped("lineSpacing", optionalNumber(ctx, "lineSpacing") ?? 0, LIMITS.lineSpacing.min, LIMITS.lineSpacing.max);

  const align = alignment(ctx, Object.hasOwn(ctx.raw, "textAlignHorizonral") ? "textAlignHorizonral" : "textAlignHorizontal", HORIZONTAL, "left", "align");
  const verticalAlign = alignment(ctx, "textAlignVertical", VERTICAL, "top", "vertical-align");

  const textStyle = strings(get(ctx.raw, "textStyle"));
  let fit: TextElement["fit"] = "none";
  if (textStyle.includes("minimized")) fit = "shrink";
  else if (textStyle.includes("adaptive")) {
    fit = "shrink";
    ctx.approximated("textStyle", "adaptive");
  }
  if (get(ctx.raw, "boxStyle") === "auto-height") ctx.approximated("boxStyle", "auto-height");

  const element: TextElement = { type: "text", ...box, content, font };
  if (letterSpacing !== 0) element.letterSpacing = letterSpacing;
  if (lineSpacing !== 0) element.lineSpacing = lineSpacing;
  if (align !== "left") element.align = align;
  if (verticalAlign !== "top") element.verticalAlign = verticalAlign;
  if (get(ctx.raw, "lineBreakMode") === 1) element.wrap = true;
  element.fit = fit;
  if (get(ctx.raw, "colorReverse") === 1) element.reverse = true;
  return element;
}
