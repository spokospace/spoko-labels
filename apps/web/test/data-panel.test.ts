// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../src/data/api.js";
import { makeRow, type DataTable } from "../src/data/table.js";
import type { XlsxResult } from "../src/data/xlsx.js";
import { MAX_SELECTED, mountDataPanel, PAGE_SIZE, type DataPanelOptions } from "../src/data-panel.js";
import { setLang } from "../src/i18n/index.js";
import { STORAGE_KEYS } from "../src/storage.js";
import { builtinTemplate } from "../src/templates/builtin.js";

// Made-up rows only.
const tool = builtinTemplate("tool")!;
const product = builtinTemplate("product")!;

function tableOf(n: number, extra: Record<string, string> = {}): DataTable {
  const columns = ["Tool", "ID", "Place", "URL", ...Object.keys(extra)];
  const rows = Array.from({ length: n }, (_, i) =>
    makeRow([
      ["Tool", i === 1 ? "Łopata demo" : `Narzędzie ${i + 1}`],
      ["ID", `T-${String(i + 1).padStart(4, "0")}`],
      ["Place", "Półka A"],
      ["URL", `https://example.com/t/${i + 1}`],
      ...Object.entries(extra),
    ]),
  );
  return { columns, rows, truncated: false };
}

let container: HTMLElement;
let onChange: ReturnType<typeof vi.fn<() => void>>;

function mount(options: Partial<DataPanelOptions> = {}) {
  return mountDataPanel(container, { template: tool, onChange, ...options });
}

const bodyRows = () => [...container.querySelectorAll<HTMLTableRowElement>("tbody tr[data-index]")];
const status = () => container.querySelector(".status")?.textContent ?? "";
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

beforeEach(() => {
  setLang("en");
  container = document.createElement("section");
  document.body.replaceChildren(container);
  onChange = vi.fn<() => void>();
});

afterEach(() => {
  localStorage.clear();
});

describe("the data panel", () => {
  it("starts with no data, and previews a sample row", () => {
    const panel = mount();
    expect(status()).toContain("No data yet");
    expect(container.querySelector<HTMLElement>(".data-body")?.hidden).toBe(true);
    expect(panel.previewData()).toEqual({ row: tool.sampleRows[0] });
    expect(panel.previewText()).toContain("sample row");
  });

  it("uses the template's sample rows as a source, with the fields matched", () => {
    const panel = mount();
    button("Use sample data").click();
    expect(bodyRows()).toHaveLength(tool.sampleRows.length);
    expect(container.querySelector(".source-line")?.textContent).toContain("Tool with QR code");
    const picks = [...container.querySelectorAll<HTMLSelectElement>(".mapping select")];
    expect(picks.map((s) => s.selectedOptions[0]?.textContent)).toEqual(["Tool", "ID", "Place", "URL"]);
    expect(panel.previewData()).toEqual({ row: tool.sampleRows[0] });
    expect(onChange).toHaveBeenCalled();
  });

  it("follows the template with sample data, and re-matches other sources", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(3) }) });
    panel.useSample();
    panel.setTemplate(product);
    expect(panel.state.source?.table.rows).toEqual(product.sampleRows);
    await panel.openFile(new Blob([]));
    panel.setTemplate(product);
    // The file's columns do not match the product template's fields.
    expect([...panel.state.mapping.values()]).toEqual([null, null, null, null]);
    expect(panel.state.source?.kind).toBe("xlsx");
  });

  it("previews a clicked row through the picks", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(5) }) });
    await panel.openFile(new Blob([]));
    bodyRows()[2]?.querySelector("td:nth-child(3)")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel.state.previewIndex).toBe(2);
    expect(panel.previewData().row).toMatchObject({ Tool: "Narzędzie 3", ID: "T-0003" });
    expect(bodyRows()[2]?.getAttribute("aria-current")).toBe("true");
    expect(panel.previewText()).toBe("Row 3 of 5.");

    // A picker change re-maps the preview.
    const pick = container.querySelector<HTMLSelectElement>('select[data-field="name:Tool"]') as HTMLSelectElement;
    pick.value = "3";
    pick.dispatchEvent(new Event("change"));
    expect(panel.previewData().row).toMatchObject({ Tool: "https://example.com/t/3" });
    pick.value = "";
    pick.dispatchEvent(new Event("change"));
    expect(panel.previewData().row).not.toHaveProperty("Tool");
  });

  it("searches any column ignoring case and diacritics, and says when nothing matches", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(5) }) });
    await panel.openFile(new Blob([]));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    input.value = "LOPATA";
    input.dispatchEvent(new Event("input"));
    expect(bodyRows().map((r) => r.dataset.index)).toEqual(["1"]);
    input.value = "t-0005 polka";
    input.dispatchEvent(new Event("input"));
    expect(bodyRows().map((r) => r.dataset.index)).toEqual(["4"]);
    input.value = "nothing like this";
    input.dispatchEvent(new Event("input"));
    expect(bodyRows()).toHaveLength(0);
    expect(container.querySelector("tbody td.empty")?.textContent).toBe("No rows match the search.");
    expect(container.querySelector<HTMLInputElement>("#select-all-shown")?.disabled).toBe(true);
  });

  it("selects with checkboxes and 'select all shown', and counts", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(5) }) });
    await panel.openFile(new Blob([]));
    const box = bodyRows()[0]?.querySelector("input") as HTMLInputElement;
    box.click();
    expect([...panel.state.selected]).toEqual([0]);
    expect(container.querySelector(".count")?.textContent).toBe("1 selected");

    const search = container.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    search.value = "t-0004";
    search.dispatchEvent(new Event("input"));
    const all = container.querySelector<HTMLInputElement>("#select-all-shown") as HTMLInputElement;
    expect(all.checked).toBe(false);
    all.click();
    expect([...panel.state.selected].sort()).toEqual([0, 3]);
    expect(all.checked).toBe(true);
    expect(container.querySelector(".count")?.textContent).toBe("2 selected");

    search.value = "";
    search.dispatchEvent(new Event("input"));
    expect(all.indeterminate).toBe(true);
    all.click();
    expect(panel.state.selected.size).toBe(5);
    all.click();
    expect(panel.state.selected.size).toBe(0);
    expect(container.querySelector(".count")?.textContent).toBe("No rows selected.");
  });

  it("works with the keyboard: arrows move the preview, space selects", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(4) }) });
    await panel.openFile(new Blob([]));
    const rows = bodyRows();
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    key(rows[0] as Element, "ArrowDown");
    expect(panel.state.previewIndex).toBe(1);
    expect(document.activeElement).toBe(bodyRows()[1]);
    expect(bodyRows().map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);
    key(bodyRows()[1] as Element, " ");
    expect([...panel.state.selected]).toEqual([1]);
    expect(bodyRows()[1]?.querySelector("input")?.checked).toBe(true);
    key(bodyRows()[1] as Element, "End");
    expect(panel.state.previewIndex).toBe(3);
    key(bodyRows()[3] as Element, "ArrowDown");
    expect(panel.state.previewIndex).toBe(3);
    key(bodyRows()[3] as Element, "Home");
    key(bodyRows()[0] as Element, "ArrowUp");
    expect(panel.state.previewIndex).toBe(0);
  });

  it(`shows the ${MAX_SELECTED}-label limit when more rows are selected`, async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(MAX_SELECTED + 1) }) });
    await panel.openFile(new Blob([]));
    const limit = container.querySelector<HTMLElement>(".banner") as HTMLElement;
    // Only the first page is drawn; "select all shown" still covers every matching row.
    expect(bodyRows()).toHaveLength(PAGE_SIZE);
    container.querySelector<HTMLInputElement>("#select-all-shown")?.click();
    expect(panel.state.selected.size).toBe(MAX_SELECTED + 1);
    expect(limit.hidden).toBe(false);
    expect(limit.textContent).toBe(`You can print at most ${MAX_SELECTED} labels at once (${MAX_SELECTED + 1} selected).`);
    (bodyRows()[0]?.querySelector("input") as HTMLInputElement).click();
    expect(limit.hidden).toBe(true);
  });

  it("draws long sources a page at a time", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(PAGE_SIZE + 10) }) });
    await panel.openFile(new Blob([]));
    expect(bodyRows()).toHaveLength(PAGE_SIZE);
    const more = button("Show 10 more");
    expect(container.querySelector(".more")?.textContent).toBe(`Showing ${PAGE_SIZE} of ${PAGE_SIZE + 10} rows.`);
    more.click();
    expect(bodyRows()).toHaveLength(PAGE_SIZE + 10);
    expect(more.hidden).toBe(true);
    expect(panel.state.shown).toHaveLength(PAGE_SIZE + 10);
  });

  it("shows loaded text as text, never as HTML", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const table: DataTable = { columns: [evil, "ID"], rows: [makeRow([[evil, evil], ["ID", "1"]])], truncated: false };
    const panel = mount({ readFile: async () => ({ ok: true, table }) });
    await panel.openFile(Object.assign(new Blob([]), { name: `${evil}.xlsx` }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("thead")?.textContent).toContain(evil);
    expect(bodyRows()[0]?.textContent).toContain(evil);
    expect(container.querySelector(".source-line")?.textContent).toContain(evil);
    // The column name, for the phone list layout, is an attribute.
    expect(bodyRows()[0]?.querySelector("td[data-label]")?.getAttribute("data-label")).toBe(evil);
  });

  it("words file errors and keeps the previous data", async () => {
    const results: XlsxResult[] = [
      { ok: true, table: tableOf(2) },
      { ok: false, error: "too-large" },
      { ok: false, error: "not-xlsx" },
      { ok: false, error: "no-rows" },
    ];
    const panel = mount({ readFile: async () => results.shift() as XlsxResult });
    await panel.openFile(new Blob([]));
    await panel.openFile(new Blob([]));
    expect(status()).toBe("This file is too large (limit 10 MB). Nothing was read.");
    await panel.openFile(new Blob([]));
    expect(status()).toBe("This file could not be read as an xlsx file.");
    await panel.openFile(new Blob([]));
    expect(status()).toBe("No rows found in the first sheet.");
    expect(panel.state.source?.table.rows).toHaveLength(2);
  });

  it("notes a source cut at 10,000 rows", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: { ...tableOf(3), truncated: true } }) });
    await panel.openFile(Object.assign(new Blob([]), { name: "made-up.xlsx" }));
    expect(container.querySelector(".source-line")?.textContent).toBe("File made-up.xlsx: 3 rows. Only the first 10000 rows were loaded.");
    expect(panel.state.source?.kind).toBe("xlsx");
  });

  describe("loading from a URL", () => {
    it("shows the form with a note, loads, remembers the URL without its query, and reloads", async () => {
      const loadUrl = vi.fn<(url: string, options?: object) => Promise<ApiResult>>(async () => ({ ok: true, table: tableOf(2) }));
      const panel = mount({ loadUrl });
      button("Load from URL").click();
      const form = container.querySelector("form") as HTMLFormElement;
      expect(form.hidden).toBe(false);
      expect(form.textContent).toContain("Only the address without ?… and #… is remembered");
      (container.querySelector("#api-url") as HTMLInputElement).value = "https://api.example.com/items?key=made-up#x";
      (container.querySelector("#api-path") as HTMLInputElement).value = "data.items";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => expect(panel.state.source?.kind).toBe("api"));
      expect(loadUrl).toHaveBeenCalledWith("https://api.example.com/items?key=made-up#x", expect.objectContaining({ path: "data.items" }));
      expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBe("https://api.example.com/items");
      expect(localStorage.getItem(STORAGE_KEYS.apiPath)).toBe("data.items");
      expect(container.querySelector(".source-line")?.textContent).toBe("From https://api.example.com/items: 2 rows.");

      button("Reload").click();
      await vi.waitFor(() => expect(loadUrl).toHaveBeenCalledTimes(2));
      expect(loadUrl.mock.calls[1]?.[0]).toBe("https://api.example.com/items?key=made-up#x");
    });

    it("prefills the remembered URL and path", () => {
      localStorage.setItem(STORAGE_KEYS.apiUrl, "https://api.example.com/items");
      localStorage.setItem(STORAGE_KEYS.apiPath, "data");
      mount();
      expect((container.querySelector("#api-url") as HTMLInputElement).value).toBe("https://api.example.com/items");
      expect((container.querySelector("#api-path") as HTMLInputElement).value).toBe("data");
    });

    it("shows loading with Cancel, and keeps the previous data when cancelled", async () => {
      const loadUrl = vi.fn(
        (_url: string, options: { signal?: AbortSignal } = {}) =>
          new Promise<ApiResult>((resolve) => {
            options.signal?.addEventListener("abort", () => resolve({ ok: false, error: { code: "cancelled" } }));
          }),
      );
      const panel = mount({ loadUrl, readFile: async () => ({ ok: true, table: tableOf(2) }) });
      await panel.openFile(new Blob([]));
      const loading = panel.loadUrl("https://example.com/", "");
      expect(status()).toBe("Loading from the URL…");
      expect(container.querySelector(".status")?.classList.contains("loading")).toBe(true);
      const cancel = button("Cancel");
      expect(cancel.hidden).toBe(false);
      cancel.click();
      await loading;
      expect(status()).toBe("Loading stopped.");
      expect(cancel.hidden).toBe(true);
      expect(panel.state.source?.kind).toBe("xlsx");
    });

    it("words the API errors", async () => {
      const errors: ApiResult[] = [
        { ok: false, error: { code: "cors" } },
        { ok: false, error: { code: "http-status", status: 503 } },
        { ok: false, error: { code: "not-json" } },
        { ok: false, error: { code: "no-array", keys: ["data", "meta"] } },
        { ok: false, error: { code: "no-array", keys: [] } },
        { ok: false, error: { code: "timeout" } },
        { ok: false, error: { code: "too-large" } },
        { ok: false, error: { code: "insecure-url" } },
      ];
      const panel = mount({ loadUrl: async () => errors.shift() as ApiResult });
      const texts: string[] = [];
      for (const path of ["", "", "", "data.items", ""]) {
        await panel.loadUrl("https://example.com/", path);
        texts.push(status());
      }
      for (let i = 0; i < 3; i++) {
        await panel.loadUrl("https://example.com/", "");
        texts.push(status());
      }
      expect(texts[0]).toContain("(CORS)");
      expect(texts[1]).toBe("The server answered with an error: HTTP 503.");
      expect(texts[2]).toBe("The response is not JSON.");
      expect(texts[3]).toBe("No list found at “data.items”. Top-level keys: data, meta.");
      expect(texts[4]).toBe("The response is not a list. Give the path to the list. Top-level keys: none.");
      expect(texts[5]).toBe("The server did not answer in 15 s. Loading stopped.");
      expect(texts[6]).toBe("The response is too large (limit 10 MB).");
      expect(texts[7]).toBe("Only https:// addresses can be loaded.");
      expect(panel.state.source).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBeNull();
    });
  });

  it("is a grid whose rows say whether they are selected", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(3) }) });
    await panel.openFile(new Blob([]));
    expect(container.querySelector("table")?.getAttribute("role")).toBe("grid");
    expect(bodyRows().map((r) => r.getAttribute("aria-selected"))).toEqual(["false", "false", "false"]);
    key(bodyRows()[0] as Element, " ");
    (bodyRows()[2]?.querySelector("input") as HTMLInputElement).click();
    expect(bodyRows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "false", "true"]);
    container.querySelector<HTMLInputElement>("#select-all-shown")?.click();
    expect(bodyRows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "true", "true"]);
    container.querySelector<HTMLInputElement>("#select-all-shown")?.click();
    expect(bodyRows().map((r) => r.getAttribute("aria-selected"))).toEqual(["false", "false", "false"]);
  });

  it("moves the preview to the first match when the search hides the previewed row, or to none", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(5) }) });
    await panel.openFile(new Blob([]));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    const type = (text: string) => {
      search.value = text;
      search.dispatchEvent(new Event("input"));
    };
    type("t-0004");
    expect(panel.state.previewIndex).toBe(3);
    expect(panel.previewData().row).toMatchObject({ ID: "T-0004" });
    type("t-000");
    // Row 4 is still shown, so the preview stays.
    expect(panel.state.previewIndex).toBe(3);
    type("no such row");
    expect(panel.state.previewIndex).toBe(-1);
    expect(panel.previewText()).toBe("No row matches the search; the preview shows the template empty.");
    expect(panel.previewData().row).toEqual({ Tool: "", ID: "", Place: "", URL: "" });
  });

  it("applies only the newest load when two resolve out of order", async () => {
    let finishFile: (result: XlsxResult) => void = () => {};
    const panel = mount({
      readFile: () => new Promise<XlsxResult>((resolve) => (finishFile = resolve)),
      loadUrl: async () => ({ ok: false, error: { code: "not-json" } }),
    });
    // A slow file, then a URL that fails at once: the file's late success must not replace the error.
    const slow = panel.openFile(new Blob([]));
    await panel.loadUrl("https://example.com/", "");
    finishFile({ ok: true, table: tableOf(2) });
    await slow;
    expect(panel.state.source).toBeNull();
    expect(status()).toBe("The response is not JSON.");

    // A slow URL, then a file that loads: the URL's late success is ignored too.
    let finishUrl: (result: ApiResult) => void = () => {};
    const panel2 = mountDataPanel(container, {
      template: tool,
      onChange,
      readFile: async () => ({ ok: true, table: tableOf(3) }),
      loadUrl: () => new Promise<ApiResult>((resolve) => (finishUrl = resolve)),
    });
    const slowUrl = panel2.loadUrl("https://example.com/", "");
    await panel2.openFile(new Blob([]));
    finishUrl({ ok: true, table: tableOf(7) });
    await slowUrl;
    expect(panel2.state.source?.kind).toBe("xlsx");
    expect(panel2.state.source?.table.rows).toHaveLength(3);
  });

  it("redraws its texts in the other language", async () => {
    const panel = mount({ readFile: async () => ({ ok: true, table: tableOf(2) }) });
    await panel.openFile(new Blob([]));
    setLang("pl");
    panel.refresh();
    expect(container.querySelector(".count")?.textContent).toBe("Nie zaznaczono wierszy.");
    expect(panel.previewText()).toBe("Wiersz 1 z 2.");
  });
});
