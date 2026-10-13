import { describe, expect, it } from "vitest";
import { checkPlacement, type LabelGeometry } from "../src/layout/safe-area.js";
import type { Shape } from "../src/schema/types.js";

const label = (shape: Shape, safeMargin = 0): LabelGeometry => ({ size: { width: 50, height: 30 }, shape, safeMargin });
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("checkPlacement: label bounds", () => {
  const plain = label({ kind: "rectangle" });

  it("accepts a box that fills the label exactly", () => {
    expect(checkPlacement(rect(0, 0, 50, 30), plain)).toEqual([]);
  });

  it("tolerates float noise on the edge", () => {
    expect(checkPlacement(rect(0.1 + 0.2 - 0.3, 0, 50 - 1e-9, 30), plain)).toEqual([]);
  });

  it.each([
    ["left", rect(-0.1, 5, 10, 5)],
    ["top", rect(5, -0.1, 10, 5)],
    ["right", rect(45, 5, 5.1, 5)],
    ["bottom", rect(5, 25, 10, 5.1)],
  ])("reports a box past the %s edge as outside-label only", (_, r) => {
    expect(checkPlacement(r, label({ kind: "rounded", radius: 2 }, 1))).toEqual(["outside-label"]);
  });
});

describe("checkPlacement: safe area", () => {
  it("rectangle with a margin", () => {
    const l = label({ kind: "rectangle" }, 1);
    expect(checkPlacement(rect(1, 1, 48, 28), l)).toEqual([]);
    expect(checkPlacement(rect(0.9, 1, 10, 10), l)).toEqual(["outside-safe-area"]);
    expect(checkPlacement(rect(40, 20, 9.1, 5), l)).toEqual(["outside-safe-area"]);
  });

  it("rounded corners: a box corner inside the corner radius is outside", () => {
    const l = label({ kind: "rounded", radius: 2 });
    expect(checkPlacement(rect(0, 0, 10, 10), l)).toEqual(["outside-safe-area"]);
    // Along the straight edges the full label is usable.
    expect(checkPlacement(rect(0, 2, 10, 10), l)).toEqual([]);
    expect(checkPlacement(rect(2, 0, 10, 10), l)).toEqual([]);
    // 45 degrees into the corner: (2 - 2/sqrt2) is exactly on the arc.
    const onArc = 2 - Math.SQRT2;
    expect(checkPlacement(rect(onArc, onArc, 10, 10), l)).toEqual([]);
    expect(checkPlacement(rect(onArc - 0.01, onArc - 0.01, 10, 10), l)).toEqual(["outside-safe-area"]);
    // The bottom-right arc point at 45 degrees is (48 + 1/sqrt2 * 2, 28 + 1/sqrt2 * 2) = (49.414, 29.414).
    expect(checkPlacement(rect(45, 25, 4.41, 4.41), l)).toEqual([]);
    expect(checkPlacement(rect(45, 25, 4.42, 4.42), l)).toEqual(["outside-safe-area"]);
  });

  it("rounded corners with a margin: the radius shrinks by the margin", () => {
    const l = label({ kind: "rounded", radius: 2 }, 1);
    // The inset shape is a rounded rectangle from (1,1) with radius 1.
    expect(checkPlacement(rect(1, 2, 5, 5), l)).toEqual([]);
    expect(checkPlacement(rect(1, 1, 5, 5), l)).toEqual(["outside-safe-area"]);
    const onArc = 2 - Math.SQRT1_2;
    expect(checkPlacement(rect(onArc, onArc, 5, 5), l)).toEqual([]);
  });

  it("a margin larger than the radius leaves square corners", () => {
    const l = label({ kind: "rounded", radius: 1 }, 2);
    expect(checkPlacement(rect(2, 2, 5, 5), l)).toEqual([]);
  });

  it("circle: corners must lie inside the inscribed ellipse", () => {
    const l = label({ kind: "circle" });
    expect(checkPlacement(rect(20, 10, 10, 10), l)).toEqual([]);
    expect(checkPlacement(rect(0, 0, 10, 10), l)).toEqual(["outside-safe-area"]);
    // Ends of the axes are on the ellipse.
    expect(checkPlacement(rect(0, 15, 50, 0), l)).toEqual([]);
    expect(checkPlacement(rect(25, 0, 0, 30), l)).toEqual([]);
    // (0.2, 13): (24.8/25)^2 + (2/15)^2 = 1.002, just outside.
    expect(checkPlacement(rect(0.2, 13, 49.6, 4), l)).toEqual(["outside-safe-area"]);
    expect(checkPlacement(rect(1, 14, 48, 2), l)).toEqual([]);
  });

  it("circle with a margin", () => {
    const l = label({ kind: "circle" }, 1);
    expect(checkPlacement(rect(1, 15, 48, 0), l)).toEqual([]);
    expect(checkPlacement(rect(0.5, 15, 1, 0), l)).toEqual(["outside-safe-area"]);
  });

  it("a margin that leaves no safe area flags everything", () => {
    const l: LabelGeometry = { size: { width: 10, height: 10 }, shape: { kind: "rectangle" }, safeMargin: 5 };
    expect(checkPlacement(rect(5, 5, 0, 0), l)).toEqual(["outside-safe-area"]);
  });
});

describe("checkPlacement: printable area", () => {
  const plain = label({ kind: "rectangle" });

  it("is skipped without printableWidth", () => {
    expect(checkPlacement(rect(0, 0, 50, 30), plain)).toEqual([]);
  });

  it("flags the strips outside a centered 48 mm head on a 50 mm label", () => {
    expect(checkPlacement(rect(1, 0, 48, 30), plain, 48)).toEqual([]);
    expect(checkPlacement(rect(0.9, 0, 10, 5), plain, 48)).toEqual(["outside-printable-area"]);
    expect(checkPlacement(rect(40, 0, 9.1, 5), plain, 48)).toEqual(["outside-printable-area"]);
  });

  it("does nothing when the head is at least as wide as the label", () => {
    expect(checkPlacement(rect(0, 0, 50, 30), plain, 50)).toEqual([]);
    expect(checkPlacement(rect(0, 0, 50, 30), plain, 72)).toEqual([]);
  });

  it("reports the printable strip together with outside-label", () => {
    expect(checkPlacement(rect(-1, 0, 5, 5), plain, 48)).toEqual(["outside-label", "outside-printable-area"]);
  });
});
