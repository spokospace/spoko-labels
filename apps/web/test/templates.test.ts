import { render, validateTemplate } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { LANGS, MESSAGES } from "../src/i18n/index.js";
import { HEAD_MM } from "../src/preview.js";
import { BUILTIN_TEMPLATES, builtinTemplate, DEFAULT_TEMPLATE_ID } from "../src/templates/builtin.js";
import { nodeEnvironment, nodeFonts } from "./node-environment.js";

describe("built-in templates", () => {
  it("have unique ids, a name in both languages and the default among them", () => {
    const ids = BUILTIN_TEMPLATES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(builtinTemplate(DEFAULT_TEMPLATE_ID)).toBeDefined();
    for (const b of BUILTIN_TEMPLATES) {
      expect(MESSAGES.en[b.name], b.id).toBeTruthy();
      expect(MESSAGES.pl[b.name], b.id).toBeTruthy();
    }
  });

  it("cover a QR code and an upright template printed turned", () => {
    expect(BUILTIN_TEMPLATES.some((b) => b.template.elements.some((e) => e.type === "qr"))).toBe(true);
    expect(BUILTIN_TEMPLATES.some((b) => b.template.printRotation === 90 || b.template.printRotation === 270)).toBe(true);
  });

  for (const b of BUILTIN_TEMPLATES) {
    describe(b.id, () => {
      it("passes validateTemplate with no issues", () => {
        const result = validateTemplate(b.template, { printableWidth: HEAD_MM });
        expect(result.issues).toEqual([]);
        expect(result.template).toBeDefined();
      });

      it("prints 50 x 30 mm", () => {
        const { width, height } = b.template.size;
        const turned = (b.template.printRotation ?? 0) % 180 !== 0;
        expect(turned ? { width: height, height: width } : { width, height }).toEqual({ width: 50, height: 30 });
      });

      it("has sample rows in every language, with the same columns and count, rendering without warnings", async () => {
        const fonts = await nodeFonts();
        const columns = Object.keys(b.sampleRows.en[0] ?? {});
        expect(b.sampleRows.en.length).toBeGreaterThan(0);
        for (const lang of LANGS) {
          expect(b.sampleRows[lang].length, lang).toBe(b.sampleRows.en.length);
          for (const row of b.sampleRows[lang]) {
            expect(Object.keys(row), lang).toEqual(columns);
            const { warnings } = render(b.template, { row }, { environment: nodeEnvironment, fonts, printableWidth: HEAD_MM });
            expect(warnings, JSON.stringify(row)).toEqual([]);
          }
        }
      });
    });
  }
});
