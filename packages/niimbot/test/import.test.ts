import { validateTemplate } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { importTemplates } from "../src/index.js";
import readme from "../README.md?raw";
import { FIXTURE_SET, niimbotTemplate, niimbotText } from "./fixtures/templates.js";

describe("importTemplates", () => {
  it("imports the made-up fixture set exactly as pinned (the import output is a protected contract)", () => {
    expect(JSON.stringify(importTemplates(FIXTURE_SET), null, 2)).toMatchSnapshot();
  });

  it("is deterministic", () => {
    expect(JSON.stringify(importTemplates(FIXTURE_SET))).toBe(JSON.stringify(importTemplates(structuredClone(FIXTURE_SET))));
  });

  it("emits only templates that pass validateTemplate() without errors", () => {
    const { templates } = importTemplates(FIXTURE_SET);
    expect(templates.length).toBeGreaterThan(0);
    for (const { template } of templates) {
      expect(validateTemplate(template).issues.filter((i) => i.severity === "error")).toEqual([]);
    }
  });

  it("never copies app keys, ids or URLs into the output", () => {
    const output = JSON.stringify(importTemplates(FIXTURE_SET).templates.map((t) => t.template));
    for (const leaked of ["made-up-source", "Sheet-made-up", "example.invalid", "dataBind", "fontCode", "000000"]) {
      expect(output).not.toContain(leaked);
    }
  });

  it("isolates templates: one bad template never stops the rest", () => {
    const hostile = niimbotTemplate();
    Object.defineProperty(hostile, "elements", {
      enumerable: true,
      get() {
        throw new Error("made-up getter");
      },
    });
    const { templates, failures } = importTemplates([niimbotTemplate(), hostile, null, { elements: "x" }, niimbotTemplate({ name: "Last" })]);
    expect(templates.map((t) => t.source)).toEqual([{ index: 0, name: "Storage box" }, { index: 4, name: "Last" }]);
    expect(failures).toEqual([
      { source: { index: 1, name: "Storage box" }, code: "invalid-input" },
      { source: { index: 2 }, code: "invalid-input" },
      { source: { index: 3 }, code: "invalid-input" },
    ]);
  });

  it("fails a template without a size unless the host gives a default", () => {
    const sizeless = niimbotTemplate({ rollNames: [] });
    expect(importTemplates([sizeless]).failures).toEqual([{ source: { index: 0, name: "Storage box" }, code: "unknown-size" }]);
    expect(importTemplates([sizeless], { defaultSize: { width: 40, height: 30 } }).templates[0]?.template.size).toEqual({ width: 40, height: 30 });
  });

  it("fails a template with more than 200 converted elements, counted after skips", () => {
    const many = (n: number, extra: unknown[] = []) => niimbotTemplate({ elements: [...Array.from({ length: n }, () => niimbotText()), ...extra] });
    const skipped = Array.from({ length: 5 }, () => niimbotText({ rotate: 90 }));
    expect(importTemplates([many(200, skipped)]).templates).toHaveLength(1);
    const { failures } = importTemplates([many(201)]);
    expect(failures).toEqual([{ source: { index: 0, name: "Storage box" }, code: "invalid-template", issues: [{ severity: "error", code: "out-of-range", path: "/elements" }] }]);
  });

  it("keeps warnings in element order, including the validator's", () => {
    const { templates } = importTemplates([
      niimbotTemplate({ elements: [niimbotText({ width: 0 }), niimbotText({ rotate: 90 }), niimbotText({ fontCode: "ZT999" })] }),
    ]);
    expect(templates[0]?.warnings.map((w) => w.path)).toEqual(["/elements/0", "/elements/1/rotate", "/elements/2/fontCode"]);
    expect(templates[0]?.template.elements).toHaveLength(1);
  });

  it("imports a template whose elements were all skipped as an empty, valid template", () => {
    const { templates } = importTemplates([niimbotTemplate({ elements: [niimbotText({ rotate: 90 })] })]);
    expect(templates[0]?.template.elements).toEqual([]);
  });

  it("turns the app's print rotation into printRotation: a multiple of 90, else 0 with a warning", () => {
    const rotation = (rotate: unknown) => importTemplates([niimbotTemplate({ rotate })]).templates[0];
    expect([undefined, null, 0, 90, 270, -90, 450, 720].map((r) => rotation(r)?.printRotation)).toEqual([0, 0, 0, 90, 270, 270, 90, 0]);
    for (const bad of [45, "270", Number.NaN]) {
      expect(rotation(bad)).toMatchObject({ printRotation: 0, warnings: [{ code: "unsupported-style", path: "/rotate", feature: "rotate" }] });
    }
  });

  it("omits an empty or non-string name", () => {
    const { templates } = importTemplates([niimbotTemplate({ name: "   " }), niimbotTemplate({ name: 7 })]);
    expect(templates.map((t) => [t.source, t.template.name])).toEqual([[{ index: 0 }, undefined], [{ index: 1 }, undefined]]);
  });

  it("reports holes in a host-built sparse elements array", () => {
    const elements: unknown[] = [];
    elements[1] = niimbotText();
    const { templates } = importTemplates([niimbotTemplate({ elements })]);
    expect(templates[0]?.warnings).toEqual([{ code: "invalid-element", path: "/elements/0", issue: "invalid-type" }]);
    expect(templates[0]?.template.elements).toHaveLength(1);
  });

  it("checks sizes after rounding", () => {
    expect(importTemplates([niimbotTemplate({ width: 0.0004, height: 30 })]).templates[0]?.template.size).toEqual({ width: 50, height: 30 });
    expect(() => importTemplates([], { defaultSize: { width: 0.0004, height: 30 } })).toThrow(TypeError);
  });

  it("accepts null options", () => {
    expect(importTemplates([niimbotTemplate()], null).templates).toHaveLength(1);
    expect(importTemplates([niimbotTemplate()], { defaultSize: null } as unknown as object).templates).toHaveLength(1);
  });

  it("throws only for host bugs", () => {
    expect(() => importTemplates("x" as unknown as unknown[])).toThrow(TypeError);
    expect(() => importTemplates([], "x" as unknown as object)).toThrow(TypeError);
    expect(() => importTemplates([], { defaultSize: { width: 0, height: 30 } })).toThrow(TypeError);
    expect(() => importTemplates([], { defaultSize: { width: 50, height: 301 } })).toThrow(TypeError);
  });

  it("documents every warning and failure code in the README", () => {
    for (const code of ["unsupported-element", "rotated-element", "unsupported-style", "unknown-font", "unrecognized-binding", "value-clamped", "invalid-element", "invalid-input", "unknown-size", "invalid-template"]) {
      expect(readme).toContain(`\`${code}\``);
    }
  });
});
