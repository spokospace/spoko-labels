// @vitest-environment happy-dom
import { MAX_FILE_BYTES, type ExtractResult, type NiimbotTemplate } from "@spokospace/labels-niimbot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../src/i18n/index.js";
import { mountImportPanel, NIIMBOT_DB_PATH, type ImportPanelOptions } from "../src/niimbot-import.js";
import type { StoredTemplate } from "../src/templates/imported.js";
import { nodeEnvironment, nodeFonts } from "./node-environment.js";

// Made-up NIIMBOT templates, in the shape the app's database holds (see packages/niimbot/test/fixtures).
// Values are invented; `dataBind` names a made-up data source.
const text = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "text",
  x: 2,
  y: 2,
  width: 30,
  height: 6,
  rotate: 0,
  value: "Blue crate",
  dataBind: [],
  fontCode: "ZT001",
  fontSize: 4,
  fontStyle: [],
  letterSpacing: 0,
  textAlignHorizonral: 0,
  textAlignVertical: 0,
  lineMode: 2,
  boxStyle: "fixed-width-height",
  colorReverse: 0,
  ...extra,
});
const bound = (column: string) => ({ value: column, dataBind: ["made-up-source", "Sheet-made-up"] });

const crate: NiimbotTemplate = {
  name: "Crate",
  width: 50,
  height: 30,
  elements: [text(bound("C0")), text({ y: 10, ...bound("A0"), fontStyle: ["underline"] })],
};
const hostile: NiimbotTemplate = { name: "<img src=x onerror=alert(1)>", width: 50, height: 30, elements: [text()] };
const sizeless: NiimbotTemplate = { name: "No roll", elements: [text()] };

const extracted = (templates: NiimbotTemplate[], warnings: ExtractResult["warnings"] = []): ExtractResult => ({ templates, fontCatalog: {}, warnings });

let onAdd: ReturnType<typeof vi.fn<(templates: StoredTemplate[]) => void>>;
let fonts: Awaited<ReturnType<typeof nodeFonts>>;

function mount(options: Partial<ImportPanelOptions> = {}) {
  return mountImportPanel(document.body, { environment: nodeEnvironment, fonts: () => fonts, onAdd, ...options });
}

const items = () => [...document.querySelectorAll<HTMLLIElement>(".import-list > li")];
const status = () => document.querySelector("#import-panel .status")?.textContent ?? "";
const button = (text: string) => [...document.querySelectorAll("#import-panel button")].find((b) => b.textContent === text) as HTMLButtonElement;

beforeEach(async () => {
  setLang("en");
  document.body.replaceChildren();
  onAdd = vi.fn<(templates: StoredTemplate[]) => void>();
  fonts = await nodeFonts();
});

afterEach(() => localStorage.clear());

describe("the NIIMBOT import panel", () => {
  it("tells where the file is, and that it stays on the page", () => {
    mount();
    const body = document.querySelector("#import-panel .panel-body")?.textContent ?? "";
    expect(body).toContain("nothing is uploaded");
    expect(document.querySelector("#import-panel code")?.textContent).toBe(NIIMBOT_DB_PATH);
    expect(body).toContain("Close the NIIMBOT app first");
    expect(document.querySelector<HTMLInputElement>('#import-panel input[type="file"]')?.accept).toBe(".isar");
  });

  it("lists the templates found, ticked, with their notes in words, and the failures with a reason", () => {
    const panel = mount();
    panel.review(extracted([crate, sizeless], [{ code: "duplicate-template", count: 1 }]));
    expect(status()).toBe("");
    expect(document.querySelector(".import-results")?.textContent).toContain("Templates found: 2. Ready to add: 1. Not imported: 1.");
    expect(items()).toHaveLength(1);
    const [item] = items();
    expect(item?.querySelector("strong")?.textContent).toBe("Crate");
    expect(item?.querySelector("small")?.textContent).toBe("50 × 30 mm");
    expect(item?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
    expect([...(item?.querySelectorAll(".import-notes li") ?? [])].map((li) => li.textContent)).toEqual(["Approximated: underlined text."]);
    // A thumbnail at the label's size in dots, with a text alternative.
    const canvas = item?.querySelector("canvas");
    expect([canvas?.width, canvas?.height]).toEqual([400, 240]);
    expect(canvas?.getAttribute("aria-label")).toBe("Preview of Crate");
    expect([...document.querySelectorAll(".import-results .warnings li")].map((li) => li.textContent)).toEqual([
      "The file holds older copies of a template; the newest one is kept.",
      "No roll: The label size could not be read.",
    ]);
    expect(button("Add selected (1)")).toBeDefined();
  });

  it("shows a hostile name as text", () => {
    mount().review(extracted([hostile]));
    expect(document.querySelector("img")).toBeNull();
    expect(items()[0]?.querySelector("strong")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(items()[0]?.querySelector("canvas")?.getAttribute("aria-label")).toBe("Preview of <img src=x onerror=alert(1)>");
  });

  it("hands the ticked templates over with fresh ids and today's date, then closes", () => {
    const panel = mount();
    panel.open();
    panel.review(extracted([crate, hostile]));
    const [, second] = items();
    const box = second?.querySelector("input") as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(button("Add selected (1)")).toBeDefined();
    button("Add selected (1)").click();
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [added] = onAdd.mock.calls[0] as [StoredTemplate[]];
    expect(added).toHaveLength(1);
    expect(added[0]?.id).toMatch(/^imp-/);
    expect(added[0]?.name).toBe("Crate");
    expect(added[0]?.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The converted template binds by position, as the NIIMBOT app does.
    expect(added[0]?.template.elements.map((e) => ("content" in e ? e.content : null))).toEqual([{ bindIndex: 2 }, { bindIndex: 0 }]);
    expect(panel.element.open).toBe(false);
    expect(document.querySelector<HTMLElement>(".import-results")?.hidden).toBe(true);
  });

  it("disables Add when nothing is ticked", () => {
    mount().review(extracted([crate]));
    const box = items()[0]?.querySelector("input") as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(button("Add selected (0)").disabled).toBe(true);
  });

  it("explains a file with no templates, with where the file lives", () => {
    mount().review(extracted([], [{ code: "no-templates-found" }]));
    expect(status()).toContain("No templates were found in this file");
    expect(document.querySelector<HTMLElement>(".import-results")?.hidden).toBe(true);
  });

  it("refuses a file over the limit without reading it", async () => {
    const extract = vi.fn<(bytes: Uint8Array) => ExtractResult>();
    const panel = mount({ extract });
    const big = { size: MAX_FILE_BYTES + 1, arrayBuffer: () => Promise.reject(new Error("not read")) } as unknown as Blob;
    await panel.readFile(big);
    expect(extract).not.toHaveBeenCalled();
    expect(status()).toContain("too large (limit 64 MB)");
  });

  it("reads a file through the extractor, and words a file the browser cannot read", async () => {
    const extract = vi.fn<(bytes: Uint8Array) => ExtractResult>(() => extracted([crate]));
    const panel = mount({ extract });
    await panel.readFile(new Blob([new Uint8Array([1, 2, 3])]));
    expect(extract).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(items()).toHaveLength(1);

    const locked = { size: 10, arrayBuffer: () => Promise.reject(new Error("locked")) } as unknown as Blob;
    await panel.readFile(locked);
    expect(status()).toContain("Close the NIIMBOT app and try again");
    expect(items()).toHaveLength(0);
  });

  it("redraws its text in the other language", () => {
    const panel = mount();
    panel.review(extracted([sizeless]));
    setLang("pl");
    panel.refresh();
    expect(document.querySelector("#import-panel h2")?.textContent).toBe("Import z aplikacji NIIMBOT");
    expect(document.querySelector(".import-results .warnings li")?.textContent).toBe("No roll: Nie udało się odczytać rozmiaru etykiety.");
  });
});
