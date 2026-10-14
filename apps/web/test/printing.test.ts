// @vitest-environment happy-dom
import { defineElements, type PrintOutcome, type PrintRequest, type SessionState } from "@spokospace/labels-embed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OFFSET } from "../src/calibration.js";
import { positionKey } from "../src/data/mapping.js";
import { makeRow, type DataTable } from "../src/data/table.js";
import { MAX_SELECTED, mountDataPanel, type DataPanel } from "../src/data-panel.js";
import type { HelpSection } from "../src/help.js";
import { setLang } from "../src/i18n/index.js";
import { mountChip, mountPrintControls, noticeForState, type PrintControls } from "../src/printing.js";
import { builtinTemplate, type BuiltinTemplate } from "../src/templates/builtin.js";

// Made-up rows and templates only. printLabels is stubbed and the session is a fake: nothing talks to a printer.

const tool = builtinTemplate("tool")!;

/** A template bound by position, as NIIMBOT imports are: column A and column C. */
const byPosition: BuiltinTemplate = {
  id: "by-position",
  name: "templateTool",
  template: {
    version: 1,
    name: "By position",
    size: { width: 50, height: 30 },
    elements: [
      { type: "text", x: 2, y: 2, width: 46, height: 8, content: { bindIndex: 0 }, font: { family: "HarmonyOS Sans", size: 4 } },
      { type: "qr", x: 30, y: 12, width: 15, height: 15, content: { bindIndex: 2 } },
    ],
  },
  sampleRows: [],
};

function tableOf(n: number): DataTable {
  const columns = ["Tool", "ID", "Place", "URL"];
  const rows = Array.from({ length: n }, (_, i) =>
    makeRow([
      ["Tool", `Narzędzie ${i + 1}`],
      ["ID", `T-${String(i + 1).padStart(4, "0")}`],
      ["Place", "Półka A"],
      ["URL", `https://example.com/t/${i + 1}`],
    ]),
  );
  return { columns, rows, truncated: false };
}

class FakeSession extends EventTarget {
  state: SessionState = { kind: "disconnected" };
  set(state: SessionState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

let session: FakeSession;
let print: ReturnType<typeof vi.fn<(request: PrintRequest) => Promise<PrintOutcome>>>;
let openHelp: ReturnType<typeof vi.fn<(section: HelpSection) => void>>;
let panel: DataPanel;
let controls: PrintControls;
let template: BuiltinTemplate;

const printButton = () => document.getElementById("print-button") as HTMLButtonElement;
const banner = () => document.getElementById("printer-banner") as HTMLElement;
const hint = () => document.getElementById("print-hint") as HTMLElement;

async function setUp(options: { template?: BuiltinTemplate; rows?: number; offset?: { x: number; y: number } } = {}) {
  template = options.template ?? tool;
  const data = document.createElement("section");
  const button = Object.assign(document.createElement("button"), { id: "print-button" });
  const hintLine = Object.assign(document.createElement("p"), { id: "print-hint" });
  const bannerLine = Object.assign(document.createElement("p"), { id: "printer-banner" });
  document.body.replaceChildren(bannerLine, data, button, hintLine);
  const table = tableOf(options.rows ?? 5);
  panel = mountDataPanel(data, {
    template,
    onChange: () => controls?.refresh(),
    readFile: async () => ({ ok: true, table }),
  });
  controls = mountPrintControls({
    button,
    hint: hintLine,
    banner: bannerLine,
    data: panel,
    template: () => template,
    offset: () => options.offset ?? { ...DEFAULT_OFFSET },
    openHelp,
    session,
    print,
  });
  if (options.rows !== 0) await panel.openFile(new Blob([]));
}

function selectRows(...indices: number[]): void {
  for (const i of indices) {
    const box = document.querySelector<HTMLInputElement>(`tbody tr[data-index="${i}"] input`) as HTMLInputElement;
    box.click();
  }
}

beforeEach(() => {
  setLang("en");
  session = new FakeSession();
  print = vi.fn<(request: PrintRequest) => Promise<PrintOutcome>>(async () => ({ printed: 1, cancelled: false }));
  openHelp = vi.fn<(section: HelpSection) => void>();
});

afterEach(() => {
  controls?.dispose();
  localStorage.clear();
});

describe("the print request", () => {
  it("holds the selected rows mapped by name, in source order, with the calibration", async () => {
    await setUp({ offset: { x: -1, y: 1.5 } });
    selectRows(3, 1);
    expect(printButton().textContent).toBe("Print selected (2)");
    await controls.print();
    expect(print).toHaveBeenCalledTimes(1);
    const request = print.mock.calls[0]?.[0] as PrintRequest;
    expect(request).toEqual({
      template: tool.template,
      rows: [
        { Tool: "Narzędzie 2", ID: "T-0002", Place: "Półka A", URL: "https://example.com/t/2" },
        { Tool: "Narzędzie 4", ID: "T-0004", Place: "Półka A", URL: "https://example.com/t/4" },
      ],
      offsetMm: { x: -1, y: 1.5 },
      lang: "en",
    });
    expect(request).not.toHaveProperty("columns");
  });

  it("follows the pickers", async () => {
    await setUp();
    const pick = document.querySelector<HTMLSelectElement>('select[data-field="name:Place"]') as HTMLSelectElement;
    pick.value = "";
    pick.dispatchEvent(new Event("change"));
    selectRows(0);
    await controls.print();
    expect(print.mock.calls[0]?.[0].rows).toEqual([{ Tool: "Narzędzie 1", ID: "T-0001", URL: "https://example.com/t/1" }]);
  });

  it("holds the rows and the column order for a template bound by position", async () => {
    await setUp({ template: byPosition });
    selectRows(0, 2);
    await controls.print();
    const request = print.mock.calls[0]?.[0] as PrintRequest;
    expect(request.columns).toEqual([positionKey(0), positionKey(1), positionKey(2)]);
    expect(request.rows).toEqual([
      { [positionKey(0)]: "Narzędzie 1", [positionKey(2)]: "Półka A" },
      { [positionKey(0)]: "Narzędzie 3", [positionKey(2)]: "Półka A" },
    ]);
    expect(request.offsetMm).toEqual(DEFAULT_OFFSET);
  });

  it("prints the previewed row when nothing is selected", async () => {
    await setUp();
    document.querySelector('tbody tr[data-index="2"] td:nth-child(2)')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(printButton().textContent).toBe("Print this label");
    await controls.print();
    expect(print.mock.calls[0]?.[0].rows).toEqual([{ Tool: "Narzędzie 3", ID: "T-0003", Place: "Półka A", URL: "https://example.com/t/3" }]);
  });

  it("prints the template's sample row before any data is loaded", async () => {
    await setUp({ rows: 0 });
    expect(printButton().disabled).toBe(false);
    printButton().click();
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    expect(print.mock.calls[0]?.[0].rows).toEqual([tool.sampleRows[0]]);
  });
});

describe("the print button", () => {
  it("calls printLabels synchronously from the click, before the handler returns", async () => {
    await setUp();
    printButton().click();
    expect(print).toHaveBeenCalledTimes(1);
    expect(printButton().disabled).toBe(true);
    await vi.waitFor(() => expect(printButton().disabled).toBe(false));
  });

  it("is disabled above the 200-label limit", async () => {
    await setUp({ rows: MAX_SELECTED + 1 });
    const all = document.getElementById("select-all-shown") as HTMLInputElement;
    all.click();
    expect(printButton().textContent).toBe(`Print selected (${MAX_SELECTED + 1})`);
    expect(printButton().disabled).toBe(true);
    expect(hint().textContent).toBe(`Select at most ${MAX_SELECTED} rows to print.`);
    await controls.print();
    expect(print).not.toHaveBeenCalled();
    selectRows(0);
    expect(printButton().disabled).toBe(false);
    expect(hint().hidden).toBe(true);
  });

  it("is disabled without Web Bluetooth, and leaves the banner to the browser banners", async () => {
    session.state = { kind: "unsupported", reason: "no-bluetooth" };
    await setUp();
    expect(printButton().disabled).toBe(true);
    expect(hint().textContent).toContain("Chrome or Edge");
    session.set({ kind: "unsupported", reason: "no-bluetooth" });
    expect(banner().hidden).toBe(true);
    expect(noticeForState(session.state)).toBeNull();
  });

  it("is disabled when the search matches no row", async () => {
    await setUp();
    const search = document.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    search.value = "nothing like this";
    search.dispatchEvent(new Event("input"));
    expect(printButton().disabled).toBe(true);
  });

  it("follows the language", async () => {
    await setUp();
    selectRows(0);
    session.set({ kind: "disconnected", error: "no-response" });
    setLang("pl");
    controls.translate();
    expect(printButton().textContent).toBe("Drukuj zaznaczone (1)");
    expect(banner().textContent).toContain("Drukarka nie odpowiada.");
  });
});

describe("the printer banner", () => {
  it("words a failed print's code and links to its help section", async () => {
    print.mockResolvedValueOnce({ printed: 0, cancelled: false, error: { code: "device-unreachable", row: 0 } });
    await setUp();
    await controls.print();
    expect(banner().hidden).toBe(false);
    expect(banner().textContent).toContain("Label 1 did not print.");
    expect(banner().textContent).toContain("NIIMBOT phone app");
    const link = banner().querySelector<HTMLButtonElement>("button[data-help]") as HTMLButtonElement;
    expect(link.textContent).toBe("Help: The phone app and the connection");
    link.click();
    expect(openHelp).toHaveBeenCalledWith("phone");
  });

  it("has no help link for a template error", async () => {
    print.mockResolvedValueOnce({ printed: 0, cancelled: false, error: { code: "template", row: 0 } });
    await setUp();
    await controls.print();
    expect(banner().textContent).toContain("The template is not valid.");
    expect(banner().querySelector("button[data-help]")).toBeNull();
  });

  it("stays away after a print that worked or was cancelled", async () => {
    await setUp();
    await controls.print();
    expect(banner().hidden).toBe(true);
    print.mockResolvedValueOnce({ printed: 0, cancelled: true });
    await controls.print();
    expect(banner().hidden).toBe(true);
  });

  it("says so when printLabels rejects (a dialog already open)", async () => {
    print.mockRejectedValueOnce(new TypeError("printLabels: a print dialog is already open"));
    await setUp();
    await controls.print();
    expect(banner().textContent).toContain("Something went wrong");
    expect(printButton().disabled).toBe(false);
  });

  it("shows a failed connect from the chip: disconnected with device-unreachable", async () => {
    await setUp();
    session.set({ kind: "connecting" });
    session.set({ kind: "disconnected", error: "device-unreachable" });
    expect(controls.notice).toEqual({ kind: "error", code: "device-unreachable" });
    expect(banner().hidden).toBe(false);
    expect(banner().textContent).toContain("could not be reached");
    expect(banner().querySelector<HTMLElement>("button[data-help]")?.dataset.help).toBe("phone");
    // A new connect clears it.
    session.set({ kind: "connecting" });
    expect(banner().hidden).toBe(true);
  });

  it("shows nothing when the chooser is closed, or for a disconnect without an error", async () => {
    await setUp();
    session.set({ kind: "disconnected", error: "chooser-cancelled" });
    expect(banner().hidden).toBe(true);
    expect(controls.notice).toBeNull();
    session.set({ kind: "connected", name: "B1-DEMO" });
    session.set({ kind: "disconnected" });
    expect(banner().hidden).toBe(true);
    expect(noticeForState({ kind: "disconnected" })).toBeNull();
  });

  it("clears a session banner when the state no longer has one, and can be dismissed", async () => {
    await setUp();
    session.set({ kind: "busy-elsewhere" });
    expect(banner().textContent).toContain("another tab");
    expect(banner().querySelector<HTMLElement>("button[data-help]")?.dataset.help).toBe("tab");
    session.set({ kind: "disconnected" });
    expect(banner().hidden).toBe(true);
    session.set({ kind: "disconnected", error: "disconnected" });
    expect(banner().hidden).toBe(false);
    ([...banner().querySelectorAll("button")].find((b) => b.textContent === "Dismiss") as HTMLButtonElement).click();
    expect(banner().hidden).toBe(true);
  });
});

describe("the session listener", () => {
  it("is removed by dispose()", async () => {
    await setUp();
    controls.dispose();
    session.set({ kind: "disconnected", error: "device-unreachable" });
    expect(banner().hidden).toBe(true);
  });
});

describe("the printer chip", () => {
  it("is mounted with the language, and redraws when its lang attribute changes", () => {
    defineElements();
    const slot = document.createElement("span");
    document.body.replaceChildren(slot);
    const chip = mountChip(slot, "en");
    const label = () => chip.shadowRoot?.querySelector(".label")?.textContent;
    const english = label();
    chip.setAttribute("lang", "pl");
    expect(slot.firstElementChild).toBe(chip);
    expect(label()).not.toBe(english);
  });
});
