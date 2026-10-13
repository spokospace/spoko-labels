import type { IssueCode } from "../schema/issues.js";
import type { PrintRotation, Shape } from "../schema/types.js";

/** An axis-aligned rectangle in mm. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelGeometry {
  size: { width: number; height: number };
  shape: Shape;
  safeMargin: number;
  /** A quarter turn (90, 270) puts the label's height across the print head. Default 0. */
  printRotation?: PrintRotation;
}

/** Rounding slack, so a box placed exactly on an edge (after float arithmetic) is not reported. */
const EPSILON = 1e-6;

/**
 * Where a rectangle sits relative to the label. Returns at most one of `outside-label` (reaches past the
 * label size) and `outside-safe-area` (inside the label but leaves the shape inset by `safeMargin`), plus
 * `outside-printable-area` when `printableWidth` is given and the rectangle leaves the centered strip the
 * print head covers (across the label's width, or its height when the label is printed turned a quarter).
 * With `drawn` (what the renderer actually painted rather than an element box) leaving the label is
 * reported as `outside-safe-area`: `outside-label` describes element boxes only.
 */
export function checkPlacement(rect: Rect, label: LabelGeometry, printableWidth?: number, drawn = false): IssueCode[] {
  const codes: IssueCode[] = [];
  const { width, height } = label.size;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (rect.x < -EPSILON || rect.y < -EPSILON || right > width + EPSILON || bottom > height + EPSILON) {
    codes.push(drawn ? "outside-safe-area" : "outside-label");
  } else if (!corners(rect).every(([px, py]) => insideSafeArea(px, py, label))) {
    // Both the rectangle and every supported safe area are convex, so checking the corners is enough.
    codes.push("outside-safe-area");
  }

  if (printableWidth !== undefined) {
    const acrossWidth = (label.printRotation ?? 0) % 180 === 0;
    const side = acrossWidth ? width : height;
    const [start, end] = acrossWidth ? [rect.x, right] : [rect.y, bottom];
    const left = (side - printableWidth) / 2;
    if (left > 0 && (start < left - EPSILON || end > left + printableWidth + EPSILON)) codes.push("outside-printable-area");
  }
  return codes;
}

function corners(rect: Rect): [number, number][] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [
    [rect.x, rect.y],
    [right, rect.y],
    [rect.x, bottom],
    [right, bottom],
  ];
}

function insideSafeArea(px: number, py: number, label: LabelGeometry): boolean {
  const { width, height } = label.size;
  const m = label.safeMargin;
  const left = m;
  const top = m;
  const right = width - m;
  const bottom = height - m;
  if (right <= left || bottom <= top) return false;

  switch (label.shape.kind) {
    case "rectangle":
      return inRect(px, py, left, top, right, bottom);
    case "rounded": {
      if (!inRect(px, py, left, top, right, bottom)) return false;
      // Insetting a rounded rectangle by m keeps it rounded, with the radius reduced by m.
      const r = Math.max(label.shape.radius - m, 0);
      const cx = Math.min(Math.max(px, left + r), right - r);
      const cy = Math.min(Math.max(py, top + r), bottom - r);
      return Math.hypot(px - cx, py - cy) <= r + EPSILON;
    }
    case "circle": {
      // The ellipse inscribed in the label, with both semi-axes reduced by the margin. For a circle this is
      // exactly the inset shape; for an elongated ellipse it is an approximation that is slightly generous
      // near the ends of the long axis (a true offset curve is not an ellipse).
      const a = width / 2 - m;
      const b = height / 2 - m;
      const dx = (px - width / 2) / a;
      const dy = (py - height / 2) / b;
      return dx * dx + dy * dy <= 1 + EPSILON;
    }
  }
}

function inRect(px: number, py: number, left: number, top: number, right: number, bottom: number): boolean {
  return px >= left - EPSILON && px <= right + EPSILON && py >= top - EPSILON && py <= bottom + EPSILON;
}
