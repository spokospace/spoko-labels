import { B1 } from "@spokospace/labels-core";
import { niimbotFonts } from "@spokospace/labels-niimbot";
import { bundledFonts, loadFonts, render, validateTemplate } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { nodeEnvironment } from "../../render/test/node-environment.js";
import { TEMPLATES } from "../examples/host/templates.js";

const HEAD_MM = B1.headDots / B1.dotsPerMm;
const row = { name: "Klucz dynamometryczny 1/2 cala", code: "N-0001", location: "Regał A-2", url: "https://example.invalid/t/1" };

describe("the example host's templates", () => {
  for (const [type, template] of Object.entries(TEMPLATES)) {
    it(`${type}: is valid and renders a made-up record without warnings`, async () => {
      expect(validateTemplate(template, { printableWidth: HEAD_MM }).issues).toEqual([]);
      const fonts = await loadFonts(nodeEnvironment, [...bundledFonts, ...niimbotFonts]);
      const { warnings, image } = render(template, { row }, { environment: nodeEnvironment, fonts, printableWidth: HEAD_MM });
      expect(warnings).toEqual([]);
      expect([image.width, image.height]).toEqual([400, 240]);
    });
  }
});
