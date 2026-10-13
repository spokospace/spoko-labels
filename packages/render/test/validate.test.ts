import { describe, expect, it } from "vitest";
import { DEFAULTS, LIMITS, validateTemplate, type TemplateIssue } from "../src/index.js";

// Made-up 50x30 label used throughout.
const text = (extra: Record<string, unknown> = {}) => ({
  type: "text",
  x: 2,
  y: 2,
  width: 30,
  height: 6,
  content: { text: "Box 12" },
  font: { family: "Barlow Semi Condensed", size: 4 },
  ...extra,
});
const qr = (extra: Record<string, unknown> = {}) => ({
  type: "qr",
  x: 34,
  y: 12,
  width: 14,
  height: 14,
  content: { bind: "Code" },
  ...extra,
});
const line = (extra: Record<string, unknown> = {}) => ({ type: "line", x: 2, y: 10, width: 46, height: 0.4, ...extra });
const template = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  size: { width: 50, height: 30 },
  elements: [text(), qr(), line()],
  ...extra,
});

const codes = (issues: TemplateIssue[]) => issues.map((i) => `${i.severity} ${i.code} ${i.path}`);

describe("validateTemplate: valid input", () => {
  it("accepts a minimal template and fills in every default", () => {
    const { template: t, issues } = validateTemplate(template());
    expect(issues).toEqual([]);
    expect(t).toEqual({
      version: 1,
      size: { width: 50, height: 30 },
      shape: { kind: "rectangle" },
      safeMargin: DEFAULTS.safeMargin,
      elements: [
        {
          type: "text",
          x: 2,
          y: 2,
          width: 30,
          height: 6,
          content: { text: "Box 12" },
          font: { family: "Barlow Semi Condensed", size: 4, bold: false, fallback: [] },
          letterSpacing: 0,
          lineSpacing: 0,
          align: "left",
          verticalAlign: "top",
          wrap: false,
          fit: "shrink",
          minSize: 0.75,
          reverse: false,
        },
        { type: "qr", x: 34, y: 12, width: 14, height: 14, content: { bind: "Code" }, level: "L" },
        { type: "line", x: 2, y: 10, width: 46, height: 0.4 },
      ],
    });
  });

  it("keeps explicit values, the name, ids and every shape kind", () => {
    const { template: t, issues } = validateTemplate(
      template({
        name: "Shelf",
        shape: { kind: "rounded", radius: 2 },
        safeMargin: 1,
        elements: [
          text({
            id: "title",
            content: { bind: "Name", bindIndex: 2 },
            font: { family: "Viga", size: 3, bold: true, fallback: ["Barlow Semi Condensed"] },
            letterSpacing: -0.2,
            lineSpacing: 0.5,
            align: "center",
            verticalAlign: "bottom",
            wrap: true,
            fit: "none",
            minSize: 1,
            reverse: true,
          }),
          qr({ content: { bindIndex: 0 }, level: "H" }),
        ],
      }),
    );
    expect(issues).toEqual([]);
    expect(t?.name).toBe("Shelf");
    expect(t?.shape).toEqual({ kind: "rounded", radius: 2 });
    expect(t?.elements[0]).toMatchObject({
      id: "title",
      content: { bind: "Name", bindIndex: 2 },
      font: { family: "Viga", size: 3, bold: true, fallback: ["Barlow Semi Condensed"] },
      align: "center",
      verticalAlign: "bottom",
      wrap: true,
      fit: "none",
      minSize: 1,
      reverse: true,
    });
    expect(t?.elements[1]).toMatchObject({ content: { bindIndex: 0 }, level: "H" });
    expect(validateTemplate(template({ shape: { kind: "circle" } })).template?.shape).toEqual({ kind: "circle" });
  });

  it("clamps minSize to the font size", () => {
    const { template: t } = validateTemplate(template({ elements: [text({ minSize: 5 })] }));
    expect(t?.elements[0]).toMatchObject({ minSize: 4 });
  });

  it("does not mutate or keep references into the input", () => {
    const input = template();
    const copy = structuredClone(input);
    const { template: t } = validateTemplate(input);
    expect(input).toEqual(copy);
    expect(t?.size).not.toBe(input.size);
  });
});

describe("validateTemplate: template-level errors give template null", () => {
  it.each([
    ["not an object", "label", ["error invalid-type "]],
    ["an array", [], ["error invalid-type "]],
    ["undefined", undefined, ["error required "]],
    ["missing version", { size: { width: 50, height: 30 }, elements: [] }, ["error required /version"]],
    ["version 2", template({ version: 2 }), ["error unsupported-version /version"]],
    ["version as a string", template({ version: "1" }), ["error unsupported-version /version"]],
    ["missing size", template({ size: undefined }), ["error required /size"]],
    ["size not an object", template({ size: [50, 30] }), ["error invalid-type /size"]],
    ["size as strings", template({ size: { width: "50", height: 30 } }), ["error invalid-type /size/width"]],
    ["zero width", template({ size: { width: 0, height: 30 } }), ["error out-of-range /size/width"]],
    ["too large", template({ size: { width: 50, height: 301 } }), ["error out-of-range /size/height"]],
    ["NaN", template({ size: { width: NaN, height: 30 } }), ["error invalid-type /size/width"]],
    ["unknown shape", template({ shape: { kind: "star" } }), ["error out-of-range /shape/kind"]],
    ["shape without kind", template({ shape: {} }), ["error required /shape/kind"]],
    ["radius too big", template({ shape: { kind: "rounded", radius: 16 } }), ["error out-of-range /shape/radius"]],
    ["missing radius", template({ shape: { kind: "rounded" } }), ["error required /shape/radius"]],
    ["negative margin", template({ safeMargin: -1 }), ["error out-of-range /safeMargin"]],
    ["margin too big", template({ safeMargin: 11 }), ["error out-of-range /safeMargin"]],
    ["name not a string", template({ name: 5 }), ["error invalid-type /name"]],
    ["missing elements", template({ elements: undefined }), ["error required /elements"]],
    ["elements not an array", template({ elements: {} }), ["error invalid-type /elements"]],
  ])("%s", (_, input, expected) => {
    const { template: t, issues } = validateTemplate(input);
    expect(t).toBeNull();
    expect(codes(issues)).toEqual(expected);
  });

  it("accepts 200 elements and refuses 201", () => {
    const many = (n: number) => template({ elements: Array.from({ length: n }, () => line()) });
    expect(validateTemplate(many(LIMITS.maxElements)).template?.elements).toHaveLength(200);
    const { template: t, issues } = validateTemplate(many(LIMITS.maxElements + 1));
    expect(t).toBeNull();
    expect(codes(issues)).toEqual(["error out-of-range /elements"]);
  });

  it("reports every template-level problem in one pass", () => {
    const { issues } = validateTemplate({ version: 3, size: { width: -1, height: "x" }, elements: 1 });
    expect(codes(issues)).toEqual([
      "error unsupported-version /version",
      "error out-of-range /size/width",
      "error invalid-type /size/height",
      "error invalid-type /elements",
    ]);
  });
});

describe("validateTemplate: element-level errors remove only that element", () => {
  const one = (element: unknown) => {
    const { template: t, issues } = validateTemplate(template({ elements: [element, line()] }));
    expect(t?.elements).toEqual([{ type: "line", x: 2, y: 10, width: 46, height: 0.4 }]);
    return codes(issues);
  };

  it.each([
    ["not an object", "text", ["error invalid-type /elements/0"]],
    ["no type", { x: 1 }, ["error required /elements/0/type"]],
    ["type not a string", { type: 1 }, ["error invalid-type /elements/0/type"]],
    ["missing x", line({ x: undefined }), ["error required /elements/0/x"]],
    ["x as a string", line({ x: "2" }), ["error invalid-type /elements/0/x"]],
    ["zero width", line({ width: 0 }), ["error out-of-range /elements/0/width"]],
    ["width over the limit", line({ width: 301 }), ["error out-of-range /elements/0/width"]],
    ["id not a string", line({ id: 7 }), ["error invalid-type /elements/0/id"]],
    ["missing content", qr({ content: undefined }), ["error required /elements/0/content"]],
    ["content not an object", qr({ content: "x" }), ["error invalid-type /elements/0/content"]],
    ["empty content", qr({ content: {} }), ["error required /elements/0/content/text"]],
    ["text not a string", qr({ content: { text: 5 } }), ["error invalid-type /elements/0/content/text"]],
    ["empty bind", qr({ content: { bind: "" } }), ["error out-of-range /elements/0/content/bind"]],
    ["fractional bindIndex", qr({ content: { bindIndex: 1.5 } }), ["error invalid-type /elements/0/content/bindIndex"]],
    ["bindIndex as a string", qr({ content: { bindIndex: "1" } }), ["error invalid-type /elements/0/content/bindIndex"]],
    ["negative bindIndex", qr({ content: { bindIndex: -1 } }), ["error out-of-range /elements/0/content/bindIndex"]],
    ["unknown QR level", qr({ level: "X" }), ["error out-of-range /elements/0/level"]],
    ["missing font", text({ font: undefined }), ["error required /elements/0/font"]],
    ["empty family", text({ font: { family: "", size: 4 } }), ["error out-of-range /elements/0/font/family"]],
    ["missing font size", text({ font: { family: "Viga" } }), ["error required /elements/0/font/size"]],
    ["hostile font size", text({ font: { family: "Viga", size: 1e6 } }), ["error out-of-range /elements/0/font/size"]],
    ["font size over 50 mm", text({ font: { family: "Viga", size: 50.1 } }), ["error out-of-range /elements/0/font/size"]],
    ["bold not a boolean", text({ font: { family: "Viga", size: 4, bold: "yes" } }), ["error invalid-type /elements/0/font/bold"]],
    ["fallback not an array", text({ font: { family: "Viga", size: 4, fallback: "Barlow" } }), ["error invalid-type /elements/0/font/fallback"]],
    [
      "nine fallbacks",
      text({ font: { family: "Viga", size: 4, fallback: Array.from({ length: 9 }, (_, i) => `F${i}`) } }),
      ["error out-of-range /elements/0/font/fallback"],
    ],
    ["empty fallback name", text({ font: { family: "Viga", size: 4, fallback: ["A", ""] } }), ["error out-of-range /elements/0/font/fallback/1"]],
    ["fallback name not a string", text({ font: { family: "Viga", size: 4, fallback: [1] } }), ["error invalid-type /elements/0/font/fallback/0"]],
    ["letter spacing too wide", text({ letterSpacing: 5.1 }), ["error out-of-range /elements/0/letterSpacing"]],
    ["letter spacing too narrow", text({ letterSpacing: -5.1 }), ["error out-of-range /elements/0/letterSpacing"]],
    ["line spacing too large", text({ lineSpacing: 10.1 }), ["error out-of-range /elements/0/lineSpacing"]],
    ["unknown align", text({ align: "justify" }), ["error out-of-range /elements/0/align"]],
    ["unknown vertical align", text({ verticalAlign: 1 }), ["error invalid-type /elements/0/verticalAlign"]],
    ["unknown fit", text({ fit: "clip" }), ["error out-of-range /elements/0/fit"]],
    ["zero minSize", text({ minSize: 0 }), ["error out-of-range /elements/0/minSize"]],
    ["wrap as a number", text({ wrap: 1 }), ["error invalid-type /elements/0/wrap"]],
    ["reverse as a string", text({ reverse: "true" }), ["error invalid-type /elements/0/reverse"]],
  ])("%s", (_, element, expected) => {
    expect(one(element)).toEqual(expected);
  });

  it("reports every problem of one element in one pass", () => {
    expect(one(text({ x: "1", content: {}, font: { family: "Viga", size: 0 }, align: "up" }))).toEqual([
      "error invalid-type /elements/0/x",
      "error required /elements/0/content/text",
      "error out-of-range /elements/0/font/size",
      "error out-of-range /elements/0/align",
    ]);
  });

  it("accepts the range bounds themselves", () => {
    const { issues } = validateTemplate(
      template({
        elements: [
          text({
            font: { family: "Viga", size: 50, fallback: Array.from({ length: 8 }, (_, i) => `F${i}`) },
            letterSpacing: -5,
            lineSpacing: 10,
            minSize: 50,
            width: 48,
            height: 26,
          }),
        ],
      }),
    );
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("validateTemplate: warnings", () => {
  it("removes an unknown element type with a warning", () => {
    const { template: t, issues } = validateTemplate(template({ elements: [{ type: "barcode" }, line()] }));
    expect(t?.elements).toHaveLength(1);
    expect(codes(issues)).toEqual(["warning unknown-element /elements/0"]);
  });

  it("drops unknown properties at every level with a warning, escaping the pointer", () => {
    const { template: t, issues } = validateTemplate(
      template({
        editor: { zoom: 2 },
        size: { width: 50, height: 30, unit: "mm" },
        shape: { kind: "rectangle", radius: 2 },
        elements: [text({ rotate: 90, content: { text: "A", style: 1 }, font: { family: "Viga", size: 4, "a/b~c": 1 } })],
      }),
    );
    expect(codes(issues)).toEqual([
      "warning unknown-property /editor",
      "warning unknown-property /size/unit",
      "warning unknown-property /shape/radius",
      "warning unknown-property /elements/0/rotate",
      "warning unknown-property /elements/0/content/style",
      "warning unknown-property /elements/0/font/a~1b~0c",
    ]);
    expect(t).not.toHaveProperty("editor");
    expect(t?.size).toEqual({ width: 50, height: 30 });
    expect(t?.elements[0]).not.toHaveProperty("rotate");
    expect(t?.elements[0]).toMatchObject({ content: { text: "A" } });
  });

  it("treats bind next to text as an unknown property of static content", () => {
    const { template: t, issues } = validateTemplate(template({ elements: [qr({ content: { text: "A", bind: "B" } })] }));
    expect(t?.elements[0]).toMatchObject({ content: { text: "A" } });
    expect(codes(issues)).toEqual(["warning unknown-property /elements/0/content/bind"]);
  });

  it("warns about placement but keeps the element", () => {
    const { template: t, issues } = validateTemplate(
      template({ shape: { kind: "rounded", radius: 2 }, elements: [line({ x: 0, y: 0, width: 10 }), line({ x: 45, width: 10 })] }),
      { printableWidth: 48 },
    );
    expect(t?.elements).toHaveLength(2);
    expect(codes(issues)).toEqual([
      "warning outside-safe-area /elements/0",
      "warning outside-printable-area /elements/0",
      "warning outside-label /elements/1",
      "warning outside-printable-area /elements/1",
    ]);
  });

  it("refuses a printableWidth that is not a positive number", () => {
    expect(() => validateTemplate(template(), { printableWidth: 0 })).toThrow(RangeError);
    expect(() => validateTemplate(template(), { printableWidth: NaN })).toThrow(RangeError);
  });
});
