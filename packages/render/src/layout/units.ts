import type { HorizontalAlign, VerticalAlign } from "../schema/types.js";

/** Rendering resolution: 203 dpi heads print 8 dots per millimetre. */
export const DOTS_PER_MM = 8;

/** A rectangle in whole dots. */
export interface DotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const toDots = (mm: number): number => Math.round(mm * DOTS_PER_MM);

/**
 * A box in mm to whole dots. Edges are rounded, not sizes, so boxes that touch in mm touch in dots too.
 * A box thinner than one dot still covers one dot.
 */
export function boxToDots(box: { x: number; y: number; width: number; height: number }): DotRect {
  const x = toDots(box.x);
  const y = toDots(box.y);
  return {
    x,
    y,
    width: Math.max(toDots(box.x + box.width) - x, 1),
    height: Math.max(toDots(box.y + box.height) - y, 1),
  };
}

/** A rectangle in dots back to mm, for the placement checks. */
export const dotsToMm = (r: DotRect) => ({
  x: r.x / DOTS_PER_MM,
  y: r.y / DOTS_PER_MM,
  width: r.width / DOTS_PER_MM,
  height: r.height / DOTS_PER_MM,
});

/**
 * Where a run of `size` dots starts inside `room` dots that begin at `start`, for an alignment:
 * at the start (`left`, `top`: `start` as given), centered, or at the end (`right`, `bottom`); those two are
 * rounded to whole dots. Every caller passes whole-dot boxes.
 */
export function alignIn(start: number, room: number, size: number, at: HorizontalAlign | VerticalAlign): number {
  if (at === "left" || at === "top") return start;
  return Math.round(at === "center" || at === "middle" ? start + (room - size) / 2 : start + room - size);
}
