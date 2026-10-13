import type { LineElement } from "@spokospace/labels-render";
import { finite, get, round, type ElementContext } from "./context.js";
import type { Box } from "./element.js";

/** Thinnest line, mm (as in the prototype); render paints at least one dot anyway. */
const MIN_THICKNESS = 0.1;

/**
 * A Niimbot `line`: a solid bar `lineWidth` thick along the top edge of a wide box, or the left edge of a
 * tall one (the prototype's placement, which matched the app's prints).
 */
export function convertLine(ctx: ElementContext, box: Box): LineElement {
  const lineWidth = get(ctx.raw, "lineWidth");
  const horizontal = box.width >= box.height;
  const stored = finite(lineWidth) && lineWidth > 0 ? lineWidth : horizontal ? box.height : box.width;
  const thickness = round(Math.max(stored, MIN_THICKNESS));

  const lineType = get(ctx.raw, "lineType");
  if (lineType !== undefined && lineType !== 1) ctx.approximated("lineType", "dashed");
  if (get(ctx.raw, "colorReverse") === 1) ctx.approximated("colorReverse", "reverse");

  return horizontal
    ? { type: "line", x: box.x, y: box.y, width: box.width, height: thickness }
    : { type: "line", x: box.x, y: box.y, width: thickness, height: box.height };
}
