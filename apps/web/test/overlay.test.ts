import { createCanvas } from "@napi-rs/canvas";
import { render, validateTemplate, type NormalizedTemplate, type Shape } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { drawOverlay, overlayGeometry, toDesign, type OverlayLabel } from "../src/overlay.js";
import { buildPreview, DOTS_PER_MM, HEAD_MM, labelTexts, warningText } from "../src/preview.js";
import { builtinTemplate } from "../src/templates/builtin.js";
import { nodeEnvironment, nodeFonts } from "./node-environment.js";

const label = (shape: Shape, width = 50, height = 30, printRotation: 0 | 90 = 0, safeMargin = 1): OverlayLabel => ({
  size: { width, height },
  shape,
  safeMargin,
  printRotation,
});

/** Draws the overlay at 8 px per mm (one pixel per printed dot) and returns a pixel reader. */
function paint(l: OverlayLabel): (x: number, y: number) => [number, number, number, number] {
  const scale = DOTS_PER_MM;
  const canvas = createCanvas(l.size.width * scale, l.size.height * scale);
  const ctx = canvas.getContext("2d");
  drawOverlay(ctx, overlayGeometry(l, HEAD_MM), scale);
  const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
  };
}

const shaded = ([, , , a]: number[]) => (a ?? 0) > 0;
const reddish = ([r, g, b, a]: number[]) => (a ?? 0) > 0 && (r ?? 0) > (g ?? 0) + 40 && (r ?? 0) > (b ?? 0) + 40;
const bluish = ([r, , b, a]: number[]) => (a ?? 0) > 0 && (b ?? 0) > (r ?? 0) + 40;

describe("overlay geometry", () => {
  it("shades 1 mm strips on both sides of a 50 mm label for the 48 mm head", () => {
    expect(overlayGeometry(label({ kind: "rectangle" }), HEAD_MM).headStrips).toEqual([
      { x: 0, y: 0, width: 1, height: 30 },
      { x: 49, y: 0, width: 1, height: 30 },
    ]);
  });

  it("puts the strips at the top and bottom of a design printed a quarter turn", () => {
    expect(overlayGeometry(label({ kind: "rounded", radius: 2 }, 30, 50, 90), HEAD_MM).headStrips).toEqual([
      { x: 0, y: 0, width: 30, height: 1 },
      { x: 0, y: 49, width: 30, height: 1 },
    ]);
    // Upright but not turned: 30 mm across the head, nothing outside it.
    expect(overlayGeometry(label({ kind: "rectangle" }, 30, 50, 0), HEAD_MM).headStrips).toEqual([]);
  });

  it("insets the safe area by the margin, reducing a rounded corner's radius", () => {
    const g = overlayGeometry(label({ kind: "rounded", radius: 2 }, 50, 30, 0, 1.5), HEAD_MM);
    expect(g.label).toEqual({ x: 0, y: 0, width: 50, height: 30, shape: { kind: "rounded", radius: 2 } });
    expect(g.safeArea).toEqual({ x: 1.5, y: 1.5, width: 47, height: 27, shape: { kind: "rounded", radius: 0.5 } });
    expect(overlayGeometry(label({ kind: "circle" }, 30, 30, 0, 2), HEAD_MM).safeArea).toEqual({
      x: 2,
      y: 2,
      width: 26,
      height: 26,
      shape: { kind: "circle" },
    });
    expect(overlayGeometry(label({ kind: "rectangle" }, 50, 30, 0, 0), HEAD_MM).safeArea).toBeNull();
  });
});

describe("overlay drawing", () => {
  it("rectangle: only the head strips are shaded at the corners", () => {
    const px = paint(label({ kind: "rectangle" }, 50, 30, 0, 0));
    expect(reddish(px(2, 2))).toBe(true); // inside the left 1 mm strip
    expect(reddish(px(397, 2))).toBe(true); // inside the right strip
    expect(shaded(px(10, 1))).toBe(false); // the corner of a rectangle is on the label
    expect(shaded(px(200, 120))).toBe(false);
  });

  it("rounded: the corners outside the shape are shaded, the middle is clear", () => {
    const px = paint(label({ kind: "rounded", radius: 2 }, 50, 30, 0, 0));
    expect(shaded(px(10, 1))).toBe(true);
    expect(shaded(px(30, 1))).toBe(false);
    expect(shaded(px(200, 120))).toBe(false);
  });

  it("circle: everything outside the ellipse is shaded", () => {
    const px = paint(label({ kind: "circle" }, 30, 30, 0, 0));
    expect(shaded(px(10, 10))).toBe(true);
    expect(shaded(px(120, 120))).toBe(false);
    expect(shaded(px(120, 2))).toBe(false); // the top of the circle
  });

  it("printRotation 90: the head strips run across the top and the bottom", () => {
    const px = paint(label({ kind: "rectangle" }, 30, 50, 90, 0));
    expect(reddish(px(120, 2))).toBe(true);
    expect(reddish(px(120, 397))).toBe(true);
    expect(shaded(px(2, 200))).toBe(false); // the sides are under the head
  });

  it("draws the safe area as a dashed line on the inset edge", () => {
    const px = paint(label({ kind: "rectangle" }, 50, 30, 0, 2));
    // The top edge of the safe area is at 2 mm = 16 px; a dashed line is on along part of any 10 px run.
    const run = Array.from({ length: 20 }, (_, i) => px(100 + i, 16));
    expect(run.some(bluish)).toBe(true);
    expect(run.some((p) => !bluish(p))).toBe(true);
    expect(shaded(px(100, 40))).toBe(false);
  });
});

describe("toDesign", () => {
  it("turns a printed image back to the design orientation", () => {
    // 2 x 1 pixels, red then green; printed turned 90 degrees clockwise it is 1 x 2, red on top.
    const printed = { width: 1, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const design = toDesign(printed, 90);
    expect([design.width, design.height]).toEqual([2, 1]);
    expect([...design.data]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(toDesign(printed, 0)).toBe(printed);
  });
});

describe("preview model", () => {
  it("shows an upright template in its design orientation", async () => {
    const upright = builtinTemplate("upright");
    if (!upright) throw new Error("no upright template");
    const row = upright.sampleRows.en[0] ?? {};
    const model = buildPreview(upright.template, { row }, nodeEnvironment, await nodeFonts());
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect([model.image.width, model.image.height]).toEqual([240, 400]);
    // The printed image is the turned one: 50 x 30 mm across the head.
    const printed = render(upright.template, { row }, { environment: nodeEnvironment, fonts: await nodeFonts() }).image;
    expect([printed.width, printed.height]).toEqual([400, 240]);
  });

  it("lists the label's texts and QR contents as the canvas's text alternative", () => {
    const tool = builtinTemplate("tool");
    const normalized = validateTemplate(tool?.template).template as NormalizedTemplate;
    const row = tool?.sampleRows.en[0] ?? {};
    expect(labelTexts(normalized, { row })).toEqual([
      { kind: "text", value: row.Tool },
      { kind: "text", value: row.ID },
      { kind: "text", value: row.Place },
      { kind: "qr", value: row.URL },
    ]);
    // Only own properties are read, so a column named after an Object.prototype member is just missing.
    const t = { ...normalized, elements: [{ ...normalized.elements[0], content: { bind: "constructor" } }] } as NormalizedTemplate;
    expect(labelTexts(t, { row: {} })).toEqual([]);
  });

  it("words template errors instead of throwing", async () => {
    const model = buildPreview({ version: 1, elements: [] }, {}, nodeEnvironment, await nodeFonts());
    expect(model.ok).toBe(false);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it("names the element a warning belongs to", () => {
    expect(warningText({ code: "missing-column", path: "/elements/2/content" })).toBe(
      "No data for this field; it prints empty. (element 3)",
    );
    expect(warningText({ code: "unsupported-version", path: "" })).toBe("This template version is not supported.");
  });
});
