import type { Element } from "@spokospace/labels-render";
import { finite, get, present, round, type ElementContext } from "./context.js";
import { convertLine } from "./line.js";
import { convertQr } from "./qr.js";
import { convertText } from "./text.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GEOMETRY = ["x", "y", "width", "height"] as const;

/** The element's box, rounded; `null` with `invalid-element` when a coordinate is missing or not a finite number. */
function readBox(ctx: ElementContext): Box | null {
  const box: Partial<Box> = {};
  for (const key of GEOMETRY) {
    const value = get(ctx.raw, key);
    if (!finite(value)) {
      ctx.warn("invalid-element", undefined, { issue: present(value) ? "invalid-type" : "required" });
      return null;
    }
    box[key] = round(value);
  }
  return box as Box;
}

/**
 * Whether `rotate` may turn the element. Only a finite multiple of 360 (or no value) is unrotated; anything
 * else, a string or `NaN` included, is skipped rather than printed in a possibly wrong orientation.
 */
const rotated = (value: unknown): boolean => present(value) && !(finite(value) && value % 360 === 0);

/** One Niimbot element as a template v1 element, or `null` (with a warning) when it is skipped. */
export function convertElement(ctx: ElementContext): Element | null {
  const type = get(ctx.raw, "type");
  if (type !== "text" && type !== "qrcode" && type !== "line") {
    ctx.warn("unsupported-element", "type");
    return null;
  }
  if (rotated(get(ctx.raw, "rotate"))) {
    ctx.warn("rotated-element", "rotate");
    return null;
  }
  const box = readBox(ctx);
  if (!box) return null;
  if (type === "text") return convertText(ctx, box);
  if (type === "qrcode") return convertQr(ctx, box);
  return convertLine(ctx, box);
}
