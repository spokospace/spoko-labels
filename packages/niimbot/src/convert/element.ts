import type { Element } from "@spokospace/labels-render";
import { finite, get, round, type ElementContext } from "./context.js";
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
      ctx.warn("invalid-element", undefined, { issue: value === undefined ? "required" : "invalid-type" });
      return null;
    }
    box[key] = round(value);
  }
  return box as Box;
}

/** Whether `rotate` turns the element: 90, 180, 270 (any multiple of 360 counts as unrotated). */
const rotated = (value: unknown): boolean => finite(value) && value % 360 !== 0;

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
