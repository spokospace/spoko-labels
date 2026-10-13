import { B1 } from "@spokospace/labels-core";
import { beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES } from "../examples/demo/templates.js";
import { bundledFonts, loadFonts, render, validateTemplate, type FontRegistry } from "../src/index.js";
import { nodeEnvironment } from "./node-environment.js";

const HEAD_MM = B1.headDots / B1.dotsPerMm;
let fonts: FontRegistry;
beforeAll(async () => {
  fonts = await loadFonts(nodeEnvironment, bundledFonts);
});

describe("demo templates", () => {
  it("have unique ids", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  for (const t of TEMPLATES) {
    it(`${t.id}: is a valid 50x30 template that fits the B1 head`, () => {
      const { template, issues } = validateTemplate(t.template, { printableWidth: HEAD_MM });
      expect(issues).toEqual([]);
      expect(template?.size).toEqual({ width: 50, height: 30 });
    });

    it(`${t.id}: renders its sample row without warnings`, () => {
      const { image, warnings } = render(t.template, { row: t.row }, { environment: nodeEnvironment, fonts, printableWidth: HEAD_MM });
      expect(warnings).toEqual([]);
      expect([image.width, image.height]).toEqual([400, 240]);
    });
  }
});
