import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_JSON_BYTES } from "../src/extract/scan.js";
import { extractTemplates, importTemplates } from "../src/index.js";
import { bytes, fontCatalog, isarFile, markedName, noise, record, type RecordSpec } from "./fixtures/isar.js";
import { BOUND, FIXTURE_SET, niimbotLine, niimbotQr, niimbotText } from "./fixtures/templates.js";

const ROLL = "T50*30-230WHITE";
const spec = (extra: Partial<RecordSpec> = {}): RecordSpec => ({
  name: "Storage box",
  elements: [niimbotText(), niimbotLine()],
  rollNames: [ROLL],
  updatedAt: "2026-01-02 03:04:05",
  ...extra,
});
const names = (file: Uint8Array) => extractTemplates(file).templates.map((t) => t.name);

describe("extractTemplates", () => {
  it("reads two records with their names, rolls, timestamps and elements, in file order", () => {
    const result = extractTemplates(
      isarFile(record(spec()), record(spec({ name: "Półka – regał 3", rollNames: ["T40*12-160"], updatedAt: undefined }), 20)),
    );
    expect(result.warnings).toEqual([]);
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0]).toMatchObject({ name: "Storage box", rollNames: [ROLL], updatedAt: "2026-01-02 03:04:05" });
    expect(result.templates[1]).toEqual({ name: "Półka – regał 3", rollNames: ["T40*12-160"], elements: expect.any(Array) });
    expect(result.templates[0]?.elements[0]).toMatchObject({ type: "text", x: 2, y: 2, width: 30, height: 6, value: "Blue crate" });
  });

  it("keeps only the keys the converter reads, and blanks data-source ids", () => {
    const elements = [
      niimbotText({ value: { nested: "made-up secret" }, dataBind: BOUND, fontStyle: ["bold", 7, { a: 1 }] }),
      { ...niimbotText(), type: "image", imageUrl: "https://example.invalid/made-up.png", imageData: "bWFkZS11cA==" },
      niimbotQr({ rotate: { odd: true } }),
    ];
    const [template] = extractTemplates(isarFile(record(spec({ elements })))).templates;
    expect(template?.elements[0]).toMatchObject({ value: {}, dataBind: ["", ""], fontStyle: ["bold"] });
    expect(template?.elements[0]).not.toHaveProperty("id");
    expect(template?.elements[0]).not.toHaveProperty("elementColor");
    expect(template?.elements[1]).not.toHaveProperty("imageUrl");
    expect(template?.elements[2]).toMatchObject({ rotate: {} });
    const json = JSON.stringify(template);
    for (const secret of ["made-up secret", "made-up-source", "Sheet-made-up", "example.invalid", "bWFkZS11cA=="]) {
      expect(json).not.toContain(secret);
    }
  });

  it("gives importTemplates what it would have read from the original elements", () => {
    // The one template sized by width and height gets a roll of the same size: the database has no explicit size.
    const sources = FIXTURE_SET.map((t) => ({
      name: t["name"] as string,
      elements: t["elements"] as unknown[],
      rollNames: (t["rollNames"] as string[] | undefined) ?? ["T30*20-made-up"],
    }));
    const file = isarFile(...sources.map((t, i) => record(t, i * 50)));
    const extracted = importTemplates(extractTemplates(file).templates);
    const original = importTemplates(FIXTURE_SET.map((t, i) => ({ ...t, rollNames: sources[i]?.rollNames })));
    expect(extracted).toEqual(original);
  });

  describe("duplicates", () => {
    it("collapses identical copies silently", () => {
      const result = extractTemplates(isarFile(record(spec()), record(spec({ updatedAt: "2026-05-05 05:05:05" }), 30)));
      expect(result.templates).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    });

    it("keeps the newest of differing copies at its own position, with duplicate-template", () => {
      const stale = record(spec({ elements: [niimbotText({ value: "old" })], updatedAt: "2026-01-01 00:00:00" }));
      const other = record(spec({ name: "Other" }), 40);
      const fresh = record(spec({ elements: [niimbotText({ value: "new" })], updatedAt: "2026-02-01 00:00:00" }), 80);
      const result = extractTemplates(isarFile(stale, other, fresh));
      expect(result.templates.map((t) => [t.name, (t.elements[0] as { value: string }).value])).toEqual([
        ["Other", "Blue crate"],
        ["Storage box", "new"],
      ]);
      expect(result.warnings).toEqual([{ code: "duplicate-template", count: 1 }]);
    });

    it("keeps the first in file order when timestamps are equal or missing", () => {
      for (const updatedAt of [undefined, "2026-03-03 03:03:03"]) {
        const a = record(spec({ elements: [niimbotText({ value: "first" })], updatedAt }));
        const b = record(spec({ elements: [niimbotText({ value: "second" })], updatedAt }), 40);
        const [kept] = extractTemplates(isarFile(a, b)).templates;
        expect((kept?.elements[0] as { value: string }).value).toBe("first");
      }
    });

    it("collapses unnamed records only when identical", () => {
      const unnamed = (value: string, seed: number) => record(spec({ name: undefined, elements: [niimbotText({ value })] }), seed);
      const result = extractTemplates(isarFile(unnamed("a", 1), unnamed("a", 30), unnamed("b", 60)));
      expect(result.templates.map((t) => t.name)).toEqual([undefined, undefined]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("names", () => {
    it("cuts the name to the byte length in its prefix, so the next field's byte stays out", () => {
      expect(names(isarFile(record(spec({ name: "Zażółć" }))))).toEqual(["Zażółć"]);
      // From 32 to 126 bytes the length byte is printable itself ("(" for 40, "A" for 65).
      for (const length of [31, 32, 40, 65, 126, 127, 200]) {
        expect(names(isarFile(record(spec({ name: "n".repeat(length) }))))).toEqual(["n".repeat(length)]);
      }
      expect(names(isarFile(record(spec({ name: "Półka – regał z narzędziami 3" }))))).toEqual(["Półka – regał z narzędziami 3"]);
    });

    it("takes the whole printable run when the prefix has no usable length", () => {
      expect(names(isarFile(markedName(Uint8Array.of(0, 0, 0, 0, 0, 0), "Crate 7")))).toEqual(["Crate 7"]);
    });

    it("caps a name at 200 bytes and drops names shorter than 2", () => {
      expect(names(isarFile(markedName(Uint8Array.of(0, 0), "x".repeat(250))))[0]).toHaveLength(200);
      expect(names(isarFile(record(spec({ name: "x" }))))).toEqual([undefined]);
    });
  });

  it("reads the label size and print rotation from the template object, which win over the roll name", () => {
    const upright = record(spec({ canvas: { width: 30, height: 50, rotate: 270 } }));
    const [template] = extractTemplates(isarFile(upright)).templates;
    expect(template).toMatchObject({ width: 30, height: 50, rotate: 270, rollNames: [ROLL] });
    const [imported] = importTemplates([template]).templates;
    expect(imported?.template).toMatchObject({ size: { width: 30, height: 50 }, printRotation: 270 });
  });

  it("keeps the roll-name size when the object's layout does not match the known schema", () => {
    const [template] = extractTemplates(isarFile(record(spec({ canvas: { width: 30, height: 50, rotate: 270, staticSize: 200 } })))).templates;
    expect(template).not.toHaveProperty("width");
    expect(template).not.toHaveProperty("rotate");
    expect(importTemplates([template]).templates[0]?.template.size).toEqual({ width: 50, height: 30 });
  });

  it("extracts a record without labelNames without rolls, which then fails with unknown-size", () => {
    const { templates } = extractTemplates(isarFile(record(spec({ rollNames: undefined }))));
    expect(templates[0]).not.toHaveProperty("rollNames");
    expect(importTemplates(templates).failures).toEqual([{ source: { index: 0, name: "Storage box" }, code: "unknown-size" }]);
  });

  it("reads the font catalogue: trimmed, at most 100 characters, the first occurrence of a code wins", () => {
    const file = isarFile(
      fontCatalog([["ZT021", " Inconsolata "], ["ZT063", "Markazi Text Bold"], ["XX001", "Not a code"], ["ZT777", "F".repeat(150)]]),
      noise(20, 3),
      fontCatalog([["ZT021", "Something else"], ["ZT500", "   "]]),
      record(spec()),
    );
    const { fontCatalog: catalog, templates } = extractTemplates(file);
    expect(catalog).toEqual({ ZT021: "Inconsolata", ZT063: "Markazi Text Bold", ZT777: "F".repeat(100) });
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(templates).toHaveLength(1);
  });

  describe("unrecognized input", () => {
    it("finds nothing in empty or random bytes", () => {
      for (const file of [new Uint8Array(0), noise(100_000, 5)]) {
        expect(extractTemplates(file)).toEqual({ templates: [], fontCatalog: {}, warnings: [{ code: "no-templates-found" }] });
      }
    });

    it("needs the record marker: element-like JSON in a foreign file is not a template", () => {
      const foreign = isarFile(record(spec({ marker: false })), "{\"shapes\":", JSON.stringify([niimbotText()]), "}");
      expect(extractTemplates(foreign).warnings).toEqual([{ code: "no-templates-found" }]);
    });

    it("skips a truncated array and still finds the next record", () => {
      const truncated = JSON.stringify([niimbotText(), niimbotLine()]).slice(0, 150);
      expect(names(isarFile(truncated, noise(10, 4), record(spec())))).toEqual(["Storage box"]);
    });

    it("ignores an element array larger than 256 kB", () => {
      const big = (length: number) => record(spec({ elements: [niimbotText({ value: "x".repeat(length) })] }));
      const fits = MAX_JSON_BYTES - JSON.stringify([niimbotText({ value: "" })]).length;
      expect(names(isarFile(big(fits)))).toEqual(["Storage box"]);
      expect(names(isarFile(big(fits + 1)))).toEqual([]);
    });

    it("stays fast on text full of unclosed arrays", () => {
      const start = performance.now();
      expect(extractTemplates(bytes('[{"'.repeat(400_000))).templates).toEqual([]);
      expect(extractTemplates(bytes('[{"a":1},'.repeat(150_000))).templates).toEqual([]);
      expect(extractTemplates(bytes('"code":"ZT'.repeat(500_000))).fontCatalog).toEqual({});
      expect(performance.now() - start).toBeLessThan(2000);
    });

    it("reports scan-incomplete when the matching budget runs out", () => {
      const filler = `[{"a":"${"x".repeat(1000)}"`.repeat(300);
      const { templates, warnings } = extractTemplates(bytes(filler, record(spec())));
      expect(templates).toEqual([]);
      expect(warnings).toEqual([{ code: "no-templates-found" }, { code: "scan-incomplete" }]);
    });
  });

  it("scans a 5 MB file in under a second", () => {
    const records = Array.from({ length: 40 }, (_, i) =>
      record(spec({ name: `Template ${i}`, elements: [niimbotText({ value: `Box ${i}` }), niimbotLine(), niimbotQr()] }), i * 10),
    );
    const filler = noise(120_000, 11);
    const file = isarFile(...records.flatMap((r) => [r, filler]));
    expect(file.length).toBeGreaterThan(4_800_000);
    const start = performance.now();
    const { templates } = extractTemplates(file);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(templates).toHaveLength(40);
  });

  it("rejects what is not a Uint8Array, and files over 64 MB", () => {
    for (const bad of [new ArrayBuffer(8), [1, 2], "text", null]) {
      expect(() => extractTemplates(bad as unknown as Uint8Array)).toThrow(TypeError);
    }
    expect(() => extractTemplates(new Uint8Array(MAX_FILE_BYTES + 1))).toThrow(RangeError);
  });
});
