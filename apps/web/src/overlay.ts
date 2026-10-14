import { turn, type NormalizedTemplate, type PrintRotation, type RgbaImage, type Shape } from "@spokospace/labels-render";

// The preview's overlays, in the design orientation: the label's shape, the safe area and the strips the
// print head does not cover. Geometry is in mm; drawing scales it to canvas pixels. Adapted from the render
// demo (packages/render/examples/demo/main.js), which stays as it is.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShapedRect = Rect & { shape: Shape };

export interface OverlayGeometry {
  /** The label itself, at the origin. */
  label: ShapedRect;
  /** The shape inset by the safe margin, as labels-render checks it; null without a margin. */
  safeArea: ShapedRect | null;
  /** The strips outside the print head (empty when the head covers the label). */
  headStrips: Rect[];
}

export type OverlayLabel = Pick<NormalizedTemplate, "size" | "shape" | "safeMargin" | "printRotation">;

export function overlayGeometry(label: OverlayLabel, headMm: number): OverlayGeometry {
  const { width, height } = label.size;
  const { shape, safeMargin: m } = label;
  let safeArea: ShapedRect | null = null;
  if (m > 0 && width > 2 * m && height > 2 * m) {
    // Insetting a rounded rectangle keeps it rounded with the radius reduced by the margin; a circle (an
    // ellipse) has both semi-axes reduced, the approximation labels-render uses.
    const inset: Shape = shape.kind === "rounded" ? { kind: "rounded", radius: Math.max(shape.radius - m, 0) } : shape;
    safeArea = { x: m, y: m, width: width - 2 * m, height: height - 2 * m, shape: inset };
  }

  // The head prints a centered strip across the printed image's width. A quarter turn puts the design's
  // height across the head, so the uncovered strips are then at the top and the bottom of the design.
  const headStrips: Rect[] = [];
  const acrossWidth = label.printRotation % 180 === 0;
  const side = acrossWidth ? width : height;
  if (side > headMm) {
    const s = (side - headMm) / 2;
    if (acrossWidth) headStrips.push({ x: 0, y: 0, width: s, height }, { x: width - s, y: 0, width: s, height });
    else headStrips.push({ x: 0, y: 0, width, height: s }, { x: 0, y: height - s, width, height: s });
  }
  return { label: { x: 0, y: 0, width, height, shape }, safeArea, headStrips };
}

/** The part of a 2D context the overlay draws with: a browser canvas or @napi-rs/canvas in tests. */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "save"
  | "restore"
  | "beginPath"
  | "moveTo"
  | "rect"
  | "roundRect"
  | "ellipse"
  | "fill"
  | "stroke"
  | "fillRect"
  | "clearRect"
  | "setLineDash"
>;

export const OVERLAY_COLORS = {
  outsideShape: "rgba(119, 119, 119, 0.47)",
  outsideHead: "rgba(229, 57, 53, 0.4)",
  safeArea: "#1e88e5",
} as const;

function shapePath(ctx: OverlayContext, r: ShapedRect, scale: number): void {
  const [x, y, w, h] = [r.x * scale, r.y * scale, r.width * scale, r.height * scale];
  if (r.shape.kind === "circle") {
    ctx.moveTo(x + w, y + h / 2);
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (r.shape.kind === "rounded") {
    ctx.roundRect(x, y, w, h, Math.min(r.shape.radius * scale, w / 2, h / 2));
  } else {
    ctx.rect(x, y, w, h);
  }
}

/** Draws the overlays onto a transparent canvas of the label's size times `scale` (pixels per mm). */
export function drawOverlay(ctx: OverlayContext, g: OverlayGeometry, scale: number): void {
  const width = g.label.width * scale;
  const height = g.label.height * scale;
  ctx.clearRect(0, 0, width, height);

  // Outside the label shape: the canvas minus the shape, filled even-odd.
  ctx.save();
  ctx.fillStyle = OVERLAY_COLORS.outsideShape;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  shapePath(ctx, g.label, scale);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.save();
  ctx.fillStyle = OVERLAY_COLORS.outsideHead;
  for (const s of g.headStrips) ctx.fillRect(s.x * scale, s.y * scale, s.width * scale, s.height * scale);
  ctx.restore();

  if (g.safeArea) {
    ctx.save();
    ctx.strokeStyle = OVERLAY_COLORS.safeArea;
    ctx.lineWidth = Math.max(1, scale / 8);
    ctx.setLineDash([scale * 0.75, scale * 0.5]);
    ctx.beginPath();
    shapePath(ctx, g.safeArea, scale);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The printed image turned back to the design orientation. `render()` returns the image already turned by
 * the template's `printRotation`; the preview shows the label as it was designed, the way the overlays and the
 * element positions are expressed.
 */
export function toDesign(image: RgbaImage, printRotation: PrintRotation): RgbaImage {
  return turn(image, ((360 - printRotation) % 360) as PrintRotation);
}
