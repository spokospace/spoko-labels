import type { IssueCode } from "../schema/issues.js";
import type { Shape } from "../schema/types.js";

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
}

/** Rounding slack, so a box placed exactly on an edge (after float arithmetic) is not reported. */
const EPSILON = 1e-6;

/**
 * Where a rectangle sits relative to the label. Returns at most one of `outside-label` (reaches past the
 * label size) and `outside-safe-area` (inside the label but leaves the shape inset by `safeMargin`), plus
 * `outside-printable-area` when `printableWidth` is given and the rectangle leaves the centered strip the
 * print head covers. Works for element boxes and for what the renderer actually drew.
 */
export function checkPlacement(rect: Rect, label: LabelGeometry, printableWidth?: number): IssueCode[] {
  const codes: IssueCode[] = [];
  const { width, height } = label.size;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (rect.x < -EPSILON || rect.y < -EPSILON || right > width + EPSILON || bottom > height + EPSILON) {
    codes.push("outside-label");
  } else if (!corners(rect).every(([px, py]) => insideSafeArea(px, py, label))) {
    // Both the rectangle and every supported safe area are convex, so checking the corners is enough.
    codes.push("outside-safe-area");
  }

  if (printableWidth !== undefined && printableWidth < width) {
    const left = (width - printableWidth) / 2;
    if (rect.x < left - EPSILON || right > left + printableWidth + EPSILON) codes.push("outside-printable-area");
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
