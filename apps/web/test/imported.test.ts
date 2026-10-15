// @vitest-environment happy-dom
import type { Template } from "@spokospace/labels-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { positionKey } from "../src/data/mapping.js";
import { setLang } from "../src/i18n/index.js";
import { STORAGE_KEYS } from "../src/storage.js";
import { sampleInput, templateName } from "../src/templates/app-template.js";
import {
  IMPORTED_ID_PREFIX,
  newImportedId,
  newStoredTemplate,
  readImported,
  sampleRowsFor,
  templateStore,
  toAppTemplate,
  today,
  writeImported,
  type StoredTemplate,
} from "../src/templates/imported.js";

// Made-up templates only.
const byPosition: Template = {
  version: 1,
  name: "Crate",
  size: { width: 50, height: 30 },
  elements: [
    { type: "text", x: 2, y: 2, width: 30, height: 6, content: { bindIndex: 2 }, font: { family: "Inconsolata", size: 4 } },
    { type: "qr", x: 34, y: 12, width: 14, height: 14, content: { bindIndex: 0 } },
  ],
};
const byName: Template = {
  version: 1,
  size: { width: 50, height: 30 },
  elements: [{ type: "text", x: 2, y: 2, width: 30, height: 6, content: { bind: "Name" }, font: { family: "HarmonyOS Sans", size: 4 } }],
};
const stored = (id: string, template: Template = byPosition): StoredTemplate => ({ id, name: `Saved ${id}`, importedAt: "2026-10-15", template });

beforeEach(() => setLang("en"));
afterEach(() => localStorage.clear());

describe("imported template ids", () => {
  it("are namespaced and never repeat", () => {
    const ids = new Set(Array.from({ length: 50 }, newImportedId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^imp-[0-9a-f]{16}$/);
    expect(IMPORTED_ID_PREFIX).toBe("imp-");
  });

  it("date the import in local time", () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    const entry = newStoredTemplate("Crate", byName);
    expect(entry).toEqual({ id: expect.stringMatching(/^imp-/), name: "Crate", importedAt: today(), template: byName });
  });
});

describe("the template store", () => {
  it("adds, finds (converted once), removes and writes back after every change", () => {
    const store = templateStore();
    expect(store.templates).toEqual([]);
    store.add([stored("imp-1"), stored("imp-2", byName)]);
    expect(readImported().templates.map((s) => s.id)).toEqual(["imp-1", "imp-2"]);
    const found = store.find("imp-1");
    expect(found?.name).toEqual({ text: "Saved imp-1" });
    expect(store.find("imp-1")).toBe(found);
    expect(store.find("product")).toBeUndefined();
    store.remove("imp-1");
    expect(store.templates.map((s) => s.id)).toEqual(["imp-2"]);
    expect(store.find("imp-1")).toBeUndefined();
    expect(readImported().templates.map((s) => s.id)).toEqual(["imp-2"]);
    expect(store.saved).toBe(true);
  });

  it("removes a broken entry too", () => {
    localStorage.setItem(STORAGE_KEYS.importedTemplates, JSON.stringify([{ id: "imp-bad", name: "Broken", template: {} }]));
    const store = templateStore();
    expect(store.broken.map((b) => b.id)).toEqual(["imp-bad"]);
    store.remove("imp-bad");
    expect(store.broken).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.importedTemplates)).toBe("[]");
  });

  it("keeps the templates for the tab when the browser refuses to store, and says so", () => {
    const store = templateStore();
    const refusing = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    store.add([stored("imp-1")]);
    refusing.mockRestore();
    expect(store.saved).toBe(false);
    expect(store.find("imp-1")).toBeDefined();
  });
});

describe("reading and writing imported templates", () => {
  it("starts empty, and keeps what was written", () => {
    expect(readImported()).toEqual({ templates: [], broken: [] });
    expect(writeImported([stored("imp-1"), stored("imp-2", byName)])).toBe(true);
    const read = readImported();
    expect(read.templates.map((s) => s.id)).toEqual(["imp-1", "imp-2"]);
    expect(read.templates[0]?.template).toEqual(byPosition);
    expect(read.broken).toEqual([]);
  });

  it("lists an entry whose template no longer validates as broken, and drops what is not an entry", () => {
    localStorage.setItem(
      STORAGE_KEYS.importedTemplates,
      JSON.stringify([
        stored("imp-ok"),
        { id: "imp-bad", name: "Edited by hand", importedAt: "2026-10-01", template: { version: 1, elements: "nope" } },
        { id: "imp-ok", name: "a repeat of the first id", template: byName },
        { id: "product", name: "a built-in id", template: byName },
        "text",
        null,
        42,
      ]),
    );
    const read = readImported();
    expect(read.templates.map((s) => s.id)).toEqual(["imp-ok"]);
    expect(read.broken).toEqual([{ id: "imp-bad", name: "Edited by hand", importedAt: "2026-10-01" }]);
  });

  it("reads nothing from JSON that is not a list, or not JSON", () => {
    localStorage.setItem(STORAGE_KEYS.importedTemplates, "{");
    expect(readImported()).toEqual({ templates: [], broken: [] });
    localStorage.setItem(STORAGE_KEYS.importedTemplates, '{"id":"imp-1"}');
    expect(readImported()).toEqual({ templates: [], broken: [] });
  });

  it("reports a browser that refuses to store", () => {
    const refusing = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(writeImported([stored("imp-1")])).toBe(false);
    refusing.mockRestore();
  });
});

describe("sample rows for an imported template", () => {
  it("name every column a positional field reads, with the columns before it present and empty", () => {
    const rows = sampleRowsFor(byPosition);
    expect(rows.en).toEqual([{ "Column A": "Column A", "Column B": "", "Column C": "Column C" }]);
    expect(rows.pl).toEqual([{ "Kolumna A": "Kolumna A", "Kolumna B": "", "Kolumna C": "Kolumna C" }]);
  });

  it("hold the bind name of a named field", () => {
    expect(sampleRowsFor(byName).en).toEqual([{ Name: "Name" }]);
  });

  it("map onto the template with the column order a positional template needs", () => {
    const input = sampleInput(toAppTemplate(stored("imp-1")));
    expect(input?.columns).toEqual([positionKey(0), positionKey(1), positionKey(2)]);
    expect(input?.rows).toEqual([{ [positionKey(0)]: "Column A", [positionKey(2)]: "Column C" }]);
  });

  it("give the app template the stored name as text", () => {
    const app = toAppTemplate({ ...stored("imp-1"), name: "<b>Crate</b>" });
    expect(app.id).toBe("imp-1");
    expect(app.name).toEqual({ text: "<b>Crate</b>" });
    expect(templateName(app)).toBe("<b>Crate</b>");
  });
});
