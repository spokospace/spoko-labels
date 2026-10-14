import { render, validateTemplate, type Template } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { autoMapping, fieldKey, mapInput, positionKey, templateFields } from "../src/data/mapping.js";
import { fold, search, searchIndex } from "../src/data/search.js";
import { makeRow } from "../src/data/table.js";
import { HEAD_MM, labelTexts } from "../src/preview.js";
import { builtinTemplate } from "../src/templates/builtin.js";
import { nodeEnvironment, nodeFonts } from "./node-environment.js";

// A made-up template that binds by position, as templates imported from the NIIMBOT app do ("A0", "C0").
const positional: Template = {
  version: 1,
  name: "Positional (made up)",
  size: { width: 50, height: 30 },
  elements: [
    { type: "text", x: 2, y: 2, width: 46, height: 8, content: { bindIndex: 0 }, font: { family: "HarmonyOS Sans", size: 4 } },
    { type: "text", x: 2, y: 11, width: 46, height: 8, content: { bindIndex: 2 }, font: { family: "HarmonyOS Sans", size: 4 } },
    { type: "qr", x: 30, y: 20, width: 9, height: 9, content: { bindIndex: 2 } },
  ],
};

const PROTOTYPE_NAMES = Object.getOwnPropertyNames(Object.prototype).sort();
const product = builtinTemplate("product")?.template as Template;

describe("templateFields", () => {
  it("lists bind names in element order, each once, then the positions", () => {
    expect(templateFields(product)).toEqual([
      { kind: "name", name: "Name" },
      { kind: "name", name: "Variant" },
      { kind: "name", name: "Price" },
      { kind: "name", name: "SKU" },
    ]);
    expect(templateFields(positional)).toEqual([
      { kind: "position", index: 0 },
      { kind: "position", index: 2 },
    ]);
  });
});

describe("autoMapping", () => {
  it("matches names ignoring case and diacritics, an exact name first", () => {
    const fields = [
      { kind: "name", name: "Nazwa" },
      { kind: "name", name: "Cena" },
      { kind: "name", name: "Miasto" },
      { kind: "name", name: "Kod" },
    ] as const;
    const mapping = autoMapping(fields, ["NAZWA", "céna", "Cena ", "Cena", "Łódź"]);
    expect(mapping.get("name:Nazwa")).toBe("NAZWA");
    expect(mapping.get("name:Cena")).toBe("Cena");
    expect(mapping.get("name:Miasto")).toBeNull();
    expect(mapping.get("name:Kod")).toBeNull();
    expect(autoMapping([{ kind: "name", name: "Lodz" }], ["Łódź"]).get("name:Lodz")).toBe("Łódź");
  });

  it("gives a position the source column at that position", () => {
    const mapping = autoMapping(templateFields(positional), ["A", "B"]);
    expect(mapping.get("position:0")).toBe("A");
    expect(mapping.get("position:2")).toBeNull();
  });
});

describe("mapInput", () => {
  it("keys rows by the template's bind names for a template that binds by name", () => {
    const fields = templateFields(product);
    const source = ["name", "PRICE", "__proto__"];
    const rows = [makeRow([["name", "Herbata Demo"], ["PRICE", "9,99 zł"], ["__proto__", "DEMO-9"]])];
    const mapping = new Map(autoMapping(fields, source));
    mapping.set(fieldKey({ kind: "name", name: "SKU" }), "__proto__");
    const input = mapInput(fields, mapping, source, rows);
    expect(input.columns).toBeUndefined();
    // Variant has no column: no key, so render reports missing-column.
    expect(input.rows).toEqual([{ Name: "Herbata Demo", Price: "9,99 zł", SKU: "DEMO-9" }]);
  });

  it("gives each position a key of its own, with columns in template position order", () => {
    const fields = templateFields(positional);
    const source = ["Tool", "__proto__", "URL"];
    const rows = [makeRow([["Tool", "Wkrętarka demo"], ["__proto__", "proto"], ["URL", "https://example.com/t/1"]])];
    const input = mapInput(fields, new Map([["position:0", "__proto__"], ["position:2", "URL"]]), source, rows);
    expect(input.columns).toEqual([positionKey(0), positionKey(1), positionKey(2)]);
    // Position 1 is not used by the template and has no pick, so the rows hold no key for it.
    expect(input.rows).toEqual([makeRow([[positionKey(0), "proto"], [positionKey(2), "https://example.com/t/1"]])]);
  });

  it("leaves an unpicked position out of the rows, so render reports missing-column", async () => {
    const fields = templateFields(positional);
    const source = ["A", "B", "C"];
    const rows = [makeRow([["A", "a"], ["B", "b"], ["C", "c"]])];
    const input = mapInput(fields, new Map([["position:0", "A"], ["position:2", null]]), source, rows);
    expect(input.rows[0]).toEqual(makeRow([[positionKey(0), "a"]]));
    const fonts = await nodeFonts();
    const { warnings } = render(positional, { row: input.rows[0] ?? {}, columns: input.columns ?? [] }, { environment: nodeEnvironment, fonts, printableWidth: HEAD_MM });
    expect(warnings.map((w) => w.code)).toContain("missing-column");
  });

  it("keeps a named field and a position apart when the bind name equals a source column", () => {
    // Made up: a template binding "Price" by name and position 0, over a sheet whose first column is "Price".
    const mixed: Template = {
      ...positional,
      elements: [
        { type: "text", x: 2, y: 2, width: 46, height: 8, content: { bind: "Price" }, font: { family: "HarmonyOS Sans", size: 4 } },
        { type: "text", x: 2, y: 11, width: 46, height: 8, content: { bindIndex: 0 }, font: { family: "HarmonyOS Sans", size: 4 } },
      ],
    };
    const fields = templateFields(mixed);
    const source = ["Price", "Cost"];
    const rows = [makeRow([["Price", "10 zł"], ["Cost", "7 zł"]])];
    const input = mapInput(fields, new Map([["name:Price", "Cost"], ["position:0", "Price"]]), source, rows);
    expect(input.rows[0]).toEqual(makeRow([["Price", "7 zł"], [positionKey(0), "10 zł"]]));
    const label = validateTemplate(mixed, { printableWidth: HEAD_MM }).template;
    expect(label && labelTexts(label, { row: input.rows[0] ?? {}, columns: input.columns ?? [] }).map((x) => x.value)).toEqual(["7 zł", "10 zł"]);
  });

  it("maps and renders a __proto__ column, and leaves Object.prototype untouched", async () => {
    const source = ["__proto__", "constructor"];
    const rows = [makeRow([["__proto__", "Proto Demo"], ["constructor", "T-0009"]])];
    const fonts = await nodeFonts();
    const options = { environment: nodeEnvironment, fonts, printableWidth: HEAD_MM };

    const byPosition = mapInput(templateFields(positional), new Map([["position:0", "__proto__"], ["position:2", "constructor"]]), source, rows);
    const data = { row: byPosition.rows[0] ?? {}, columns: byPosition.columns ?? [] };
    expect(render(positional, data, options).warnings).toEqual([]);
    const label = validateTemplate(positional, { printableWidth: HEAD_MM }).template;
    expect(label && labelTexts(label, data)).toEqual([
      { kind: "text", value: "Proto Demo" },
      { kind: "text", value: "T-0009" },
      { kind: "qr", value: "T-0009" },
    ]);

    const fields = templateFields(product);
    const byName = mapInput(fields, new Map(fields.map((f) => [fieldKey(f), "__proto__"])), source, rows);
    expect(Object.hasOwn(byName.rows[0] ?? {}, "Name")).toBe(true);
    expect(render(product, { row: byName.rows[0] ?? {} }, options).warnings).toEqual([]);

    expect(Object.getPrototypeOf(byPosition.rows[0])).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(PROTOTYPE_NAMES);
  });

  it("ignores a pick of a column the source does not have", () => {
    const fields = templateFields(product);
    const input = mapInput(fields, new Map([["name:Name", "gone"]]), ["Name"], [makeRow([["Name", "x"]])]);
    expect(input.rows).toEqual([{}]);
  });
});

describe("search", () => {
  const table = {
    columns: ["Name", "City"],
    rows: [makeRow([["Name", "Jan Przykładowy"], ["City", "Łódź"]]), makeRow([["Name", "Anna Demo"], ["City", "Kraków"]]), makeRow([["Name", "Zoë"], ["City", "Straße"]])],
  };
  const index = searchIndex(table);

  it("matches any column, ignoring case and diacritics", () => {
    expect(search(index, "lodz")).toEqual([0]);
    expect(search(index, "KRAKOW")).toEqual([1]);
    expect(search(index, "przykladowy")).toEqual([0]);
    expect(search(index, "zoe strasse")).toEqual([2]);
  });

  it("needs every word, and an empty query matches every row", () => {
    expect(search(index, "anna lodz")).toEqual([]);
    expect(search(index, "  ")).toEqual([0, 1, 2]);
  });

  it("folds text", () => {
    expect(fold("ŁÓDŹ Żółć")).toBe("lodz zolc");
  });
});
