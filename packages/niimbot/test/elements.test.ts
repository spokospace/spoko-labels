import { bundledFonts } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { DEFAULT_FAMILY } from "../src/fonts/codes.js";
import { importTemplates, LETTER_SPACING_SCALE, NIIMBOT_FONT_FAMILIES, type ImportOptions } from "../src/index.js";
import { niimbotLine, niimbotQr, niimbotTemplate, niimbotText } from "./fixtures/templates.js";

/** Imports one element on a 50x30 label; returns the converted element (if any) and the warnings. */
function one(raw: unknown, options?: ImportOptions) {
  const { templates, failures } = importTemplates([niimbotTemplate({ elements: [raw] })], options);
  expect(failures).toEqual([]);
  return { element: templates[0]?.template.elements[0], warnings: templates[0]?.warnings ?? [] };
}

describe("every element", () => {
  it("skips unsupported types and rotated elements", () => {
    expect(one({ ...niimbotText(), type: "barcode" })).toEqual({ element: undefined, warnings: [{ code: "unsupported-element", path: "/elements/0/type" }] });
    expect(one({ ...niimbotText(), type: "image" }).warnings[0]?.code).toBe("unsupported-element");
    expect(one(niimbotText({ rotate: 270 }))).toEqual({ element: undefined, warnings: [{ code: "rotated-element", path: "/elements/0/rotate" }] });
    expect(one(niimbotText({ rotate: 360 })).element).toBeDefined();
  });

  it("rejects malformed geometry and non-objects", () => {
    expect(one("made-up").warnings).toEqual([{ code: "invalid-element", path: "/elements/0", issue: "invalid-type" }]);
    expect(one(niimbotText({ x: undefined })).warnings).toEqual([{ code: "invalid-element", path: "/elements/0", issue: "required" }]);
    expect(one(niimbotText({ width: "30" })).warnings).toEqual([{ code: "invalid-element", path: "/elements/0", issue: "invalid-type" }]);
    expect(one(niimbotText({ height: Number.NaN })).warnings[0]?.issue).toBe("invalid-type");
  });

  it("drops an element the validator rejects, with the validator's code", () => {
    expect(one(niimbotText({ width: 0 }))).toEqual({ element: undefined, warnings: [{ code: "invalid-element", path: "/elements/0", issue: "out-of-range" }] });
    expect(one(niimbotText({ fontSize: -1 })).warnings).toEqual([{ code: "invalid-element", path: "/elements/0", issue: "out-of-range" }]);
    expect(one(niimbotText({ fontSize: "4" })).warnings[0]?.issue).toBe("invalid-type");
  });

  it("rounds geometry to 0.001 mm", () => {
    expect(one(niimbotText({ x: 12.299999, y: -0.0001, width: 30.12345 })).element).toMatchObject({ x: 12.3, y: 0, width: 30.123 });
  });
});

describe("text", () => {
  it("maps the defaults to a minimal element", () => {
    expect(one(niimbotText()).element).toEqual({
      type: "text",
      x: 2,
      y: 2,
      width: 30,
      height: 6,
      content: { text: "Blue crate" },
      font: { family: "HarmonyOS Sans", size: 4 },
      fit: "shrink",
    });
  });

  it("applies the letter-spacing correction and rounds it", () => {
    expect(LETTER_SPACING_SCALE).toBe(1.65);
    expect(one(niimbotText({ letterSpacing: 0.2, wordSpacing: 0.2 })).element).toMatchObject({ letterSpacing: 0.33 });
    expect(one(niimbotText({ letterSpacing: 0.3, wordSpacing: 0.3 })).element).toMatchObject({ letterSpacing: 0.495 });
  });

  it("clamps values outside the v1 ranges", () => {
    const big = one(niimbotText({ fontSize: 71.8, letterSpacing: 4, wordSpacing: 4, lineSpacing: -6 }));
    expect(big.element).toMatchObject({ font: { size: 50 }, letterSpacing: 5, lineSpacing: -5 });
    expect(big.warnings).toEqual([
      { code: "value-clamped", path: "/elements/0/fontSize" },
      { code: "value-clamped", path: "/elements/0/letterSpacing" },
      { code: "value-clamped", path: "/elements/0/lineSpacing" },
    ]);
  });

  it("reports a word spacing that differs from the letter spacing", () => {
    expect(one(niimbotText({ letterSpacing: 0, wordSpacing: 0.3 })).warnings).toEqual([
      { code: "unsupported-style", path: "/elements/0/wordSpacing", feature: "word-spacing" },
    ]);
  });

  it("treats optional numbers of the wrong type as absent", () => {
    expect(one(niimbotText({ letterSpacing: "0.3", lineSpacing: null, wordSpacing: undefined }))).toMatchObject({ warnings: [] });
  });

  it("maps both spellings of horizontal alignment, and vertical alignment", () => {
    const aligned = (extra: Record<string, unknown>) => one(niimbotText(extra)).element;
    expect(aligned({ textAlignHorizonral: 1 })).toMatchObject({ align: "center" });
    expect(aligned({ textAlignHorizonral: 2 })).toMatchObject({ align: "right" });
    const correct = niimbotText({ textAlignHorizontal: 2 });
    delete correct.textAlignHorizonral;
    expect(one(correct).element).toMatchObject({ align: "right" });
    expect(aligned({ textAlignVertical: 1 })).toMatchObject({ verticalAlign: "middle" });
    expect(aligned({ textAlignVertical: 2 })).toMatchObject({ verticalAlign: "bottom" });
    expect(aligned({ textAlignVertical: 3 })).toMatchObject({ verticalAlign: "bottom" });
    expect(one(niimbotText({ textAlignHorizonral: 7, textAlignVertical: "x" })).warnings).toEqual([
      { code: "unsupported-style", path: "/elements/0/textAlignHorizonral", feature: "align" },
      { code: "unsupported-style", path: "/elements/0/textAlignVertical", feature: "vertical-align" },
    ]);
  });

  it("maps wrap, fit, reverse and bold", () => {
    expect(one(niimbotText({ lineBreakMode: 1, textStyle: ["norm"], colorReverse: 1, fontStyle: ["bold"] })).element).toMatchObject({
      wrap: true,
      fit: "none",
      reverse: true,
      font: { bold: true },
    });
    expect(one(niimbotText({ textStyle: [] })).element).toMatchObject({ fit: "none" });
    expect(one(niimbotText({ textStyle: ["adaptive", "minimized"] }))).toMatchObject({ element: { fit: "shrink" }, warnings: [] });
  });

  it("approximates underline, italic, adaptive and auto-height with warnings", () => {
    const { element, warnings } = one(niimbotText({ fontStyle: ["underline", "italic"], textStyle: ["adaptive"], boxStyle: "auto-height" }));
    expect(element).toMatchObject({ fit: "shrink" });
    expect(warnings.map((w) => w.feature)).toEqual(["underline", "italic", "adaptive", "auto-height"]);
  });

  it("skips vertical typesetting", () => {
    expect(one(niimbotText({ typesettingMode: 2 })).warnings).toEqual([{ code: "unsupported-element", path: "/elements/0/typesettingMode" }]);
  });
});

describe("fonts", () => {
  it("falls back to a family that labels-render bundles", () => {
    expect(bundledFonts.map((f) => f.family)).toContain(DEFAULT_FAMILY);
    expect(bundledFonts.map((f) => f.family)).toContain(NIIMBOT_FONT_FAMILIES.ZT347);
  });

  const fontOf = (extra: Record<string, unknown>, options?: ImportOptions) => {
    const { element, warnings } = one(niimbotText(extra), options);
    return { font: (element as { font?: unknown } | undefined)?.font, warnings };
  };

  it("maps known codes and adds the HarmonyOS Sans fallback to every other family", () => {
    expect(fontOf({ fontCode: "ZT001" }).font).toEqual({ family: "HarmonyOS Sans", size: 4 });
    expect(fontOf({ fontCode: "ZT347" }).font).toEqual({ family: "Viga", size: 4, fallback: ["HarmonyOS Sans"] });
    for (const [code, family] of [["ZT021", "Inconsolata"], ["ZT348", "Baloo Paaji"], ["ZT063", "Markazi Text"], ["ZT015", "Cookie"]]) {
      expect(fontOf({ fontCode: code })).toEqual({ font: { family, size: 4, fallback: ["HarmonyOS Sans"] }, warnings: [] });
    }
  });

  it("treats a missing font code as the app's default", () => {
    expect(fontOf({ fontCode: undefined })).toEqual({ font: { family: "HarmonyOS Sans", size: 4 }, warnings: [] });
  });

  it("lets the host override and extend the table", () => {
    expect(fontOf({ fontCode: "ZT001" }, { fonts: { ZT001: "My Sans" } }).font).toEqual({ family: "My Sans", size: 4, fallback: ["HarmonyOS Sans"] });
    expect(fontOf({ fontCode: "ZT500" }, { fonts: { ZT500: "My Serif" } }).warnings).toEqual([]);
  });

  it("uses the app's catalogue for unknown codes, with a warning", () => {
    const catalog = { ZT636: "  Made-up Display  ", ZT700: "   " };
    expect(fontOf({ fontCode: "ZT636" }, { fontCatalog: catalog })).toEqual({
      font: { family: "Made-up Display", size: 4, fallback: ["HarmonyOS Sans"] },
      warnings: [{ code: "unknown-font", path: "/elements/0/fontCode" }],
    });
    expect(fontOf({ fontCode: "ZT700" }, { fontCatalog: catalog }).font).toEqual({ family: "HarmonyOS Sans", size: 4 });
    expect(fontOf({ fontCode: "ZT999" }).warnings).toEqual([{ code: "unknown-font", path: "/elements/0/fontCode" }]);
  });

  it("never reads inherited properties of the tables", () => {
    expect(fontOf({ fontCode: "constructor" }).font).toEqual({ family: "HarmonyOS Sans", size: 4 });
    expect(fontOf({ fontCode: "__proto__" }, { fontCatalog: {} }).warnings[0]?.code).toBe("unknown-font");
  });
});

describe("qr", () => {
  it("maps a bound QR with its level", () => {
    expect(one(niimbotQr()).element).toEqual({ type: "qr", x: 34, y: 12, width: 14, height: 14, content: { bindIndex: 1 } });
    expect(one(niimbotQr({ correctLevel: 3 })).element).toMatchObject({ level: "H" });
    expect(one(niimbotQr({ correctLevel: 9 })).warnings).toEqual([{ code: "unsupported-style", path: "/elements/0/correctLevel", feature: "level" }]);
  });

  it("skips live and form codes and other code types", () => {
    expect(one(niimbotQr({ isLive: true })).warnings).toEqual([{ code: "unsupported-element", path: "/elements/0" }]);
    expect(one(niimbotQr({ isForm: true })).element).toBeUndefined();
    expect(one(niimbotQr({ codeType: 20 })).warnings).toEqual([{ code: "unsupported-element", path: "/elements/0/codeType" }]);
  });

  it("does not reverse a QR", () => {
    expect(one(niimbotQr({ colorReverse: 1 })).warnings).toEqual([{ code: "unsupported-style", path: "/elements/0/colorReverse", feature: "reverse" }]);
  });
});

describe("line", () => {
  it("draws a horizontal line along the top edge, lineWidth thick", () => {
    expect(one(niimbotLine()).element).toEqual({ type: "line", x: 2, y: 10, width: 46, height: 0.4 });
  });

  it("draws a vertical line along the left edge", () => {
    expect(one(niimbotLine({ width: 1, height: 20, lineWidth: 0.3 })).element).toEqual({ type: "line", x: 2, y: 10, width: 0.3, height: 20 });
  });

  it("falls back to the box's short side, never thinner than 0.1 mm", () => {
    expect(one(niimbotLine({ lineWidth: 0 })).element).toMatchObject({ height: 1 });
    expect(one(niimbotLine({ lineWidth: undefined, height: 0.05 })).element).toMatchObject({ height: 0.1 });
  });

  it("draws dashed and reversed lines solid, with warnings", () => {
    expect(one(niimbotLine({ lineType: 2, colorReverse: 1 })).warnings.map((w) => w.feature)).toEqual(["dashed", "reverse"]);
  });
});
