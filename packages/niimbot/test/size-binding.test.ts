import { describe, expect, it } from "vitest";
import { importTemplates } from "../src/index.js";
import { columnIndex } from "../src/convert/binding.js";
import { convertSize } from "../src/convert/size.js";
import { BOUND, niimbotTemplate, niimbotText } from "./fixtures/templates.js";

describe("convertSize", () => {
  it("prefers an explicit width and height", () => {
    expect(convertSize({ width: 40, height: 12.5, rollNames: ["T50*30-230"] }, undefined)).toEqual({ width: 40, height: 12.5 });
  });

  it("reads the first roll name with a usable size", () => {
    expect(convertSize({ rollNames: ["made-up", 7, "T0*30", "T50*30-230WHITE", "T40*12"] }, undefined)).toEqual({ width: 50, height: 30 });
    expect(convertSize({ rollNames: ["T40*12.5-160-ZZ"] }, undefined)).toEqual({ width: 40, height: 12.5 });
  });

  it("ignores explicit sizes out of range or of the wrong type", () => {
    expect(convertSize({ width: 0, height: 30, rollNames: ["T50*30"] }, undefined)).toEqual({ width: 50, height: 30 });
    expect(convertSize({ width: "50", height: 30 }, undefined)).toBeUndefined();
    expect(convertSize({ rollNames: ["T301*30"] }, undefined)).toBeUndefined();
  });

  it("falls back to defaultSize, never to a silent 50x30", () => {
    expect(convertSize({ rollNames: ["made-up"] }, { width: 40, height: 30 })).toEqual({ width: 40, height: 30 });
    expect(convertSize({}, undefined)).toBeUndefined();
  });
});

describe("bindings", () => {
  it("turns column letters into 0-based indexes", () => {
    expect(["A", "C", "Z", "AA", "AZ", "BA"].map(columnIndex)).toEqual([0, 2, 25, 26, 51, 52]);
  });

  const contentOf = (extra: Record<string, unknown>) => {
    const { templates } = importTemplates([niimbotTemplate({ elements: [niimbotText(extra)] })]);
    return { content: templates[0]?.template.elements[0], warnings: templates[0]?.warnings };
  };

  it("binds a column reference by position and ignores the digits", () => {
    expect(contentOf({ value: "C0", dataBind: BOUND }).content).toMatchObject({ content: { bindIndex: 2 } });
    expect(contentOf({ value: "AA17", dataBind: BOUND }).content).toMatchObject({ content: { bindIndex: 26 } });
  });

  it("keeps static text when dataBind is empty, even if it looks like a reference", () => {
    const { content, warnings } = contentOf({ value: "C0", dataBind: [] });
    expect(content).toMatchObject({ content: { text: "C0" } });
    expect(warnings).toEqual([]);
  });

  it("imports a bound element without a column reference as static text, with a warning", () => {
    const { content, warnings } = contentOf({ value: "c0", dataBind: BOUND });
    expect(content).toMatchObject({ content: { text: "c0" } });
    expect(warnings).toEqual([{ code: "unrecognized-binding", path: "/elements/0/value" }]);
  });

  it("converts scalar values and empties the rest", () => {
    expect(contentOf({ value: 12 }).content).toMatchObject({ content: { text: "12" } });
    expect(contentOf({ value: null }).content).toMatchObject({ content: { text: "" } });
    expect(contentOf({ value: undefined }).content).toMatchObject({ content: { text: "" } });
    const object = contentOf({ value: { made: "up" } });
    expect(object.content).toMatchObject({ content: { text: "" } });
    expect(object.warnings).toEqual([{ code: "unsupported-style", path: "/elements/0/value", feature: "value" }]);
  });
});
