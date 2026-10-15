// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import type { RenderEnvironment } from "@spokospace/labels-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeEnvironment } from "../../render/test/node-environment.js";
import { printLabels, type PrintOutcome, type PrintRequest } from "../src/dialog.js";
import { defineElements } from "../src/index.js";
import { PrinterSession } from "../src/session.js";
import { delay, harness } from "./fakes.js";

// happy-dom has no 2D canvas or font loading: render through labels-render's Node test environment instead.
// Under happy-dom, the fonts' import.meta.url URLs are http URLs of the test server: read the files they name
// and pass the bytes (happy-dom's URL class is not Node's, so the Node environment cannot take the URL).
const testEnvironment: RenderEnvironment = {
  createCanvas: (width, height) => nodeEnvironment.createCanvas(width, height),
  loadFont: (source, name) => {
    if (source.data instanceof ArrayBuffer) return nodeEnvironment.loadFont(source, name);
    const bytes = readFileSync(`${process.cwd()}${new URL(String(source.data)).pathname}`);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return nodeEnvironment.loadFont({ ...source, data }, name);
  },
};
vi.mock("@spokospace/labels-render", async (original) => ({
  ...(await original<typeof import("@spokospace/labels-render")>()),
  browserEnvironment: () => testEnvironment,
}));

defineElements();

const template = {
  version: 1,
  size: { width: 50, height: 30 },
  elements: [{ type: "text", x: 2, y: 2, width: 46, height: 8, content: { bind: "Name" }, font: { family: "HarmonyOS Sans", size: 4 } }],
};
const rows = [{ Name: "Blue crate" }, { Name: "Red crate" }];

const dialogOf = () => document.querySelector("spoko-print-dialog")?.shadowRoot as ShadowRoot;
const button = (text: string) =>
  [...dialogOf().querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const closeButton = () => dialogOf().querySelector<HTMLButtonElement>(".close");
const until = async (check: () => boolean) => {
  for (let i = 0; i < 400 && !check(); i++) await delay(5);
};
/** The corner ×, once a batch has let it go. */
const closeDialog = async () => {
  await until(() => closeButton()?.disabled === false);
  closeButton()?.click();
};
const ready = () => until(() => button("Print")?.disabled === false);

async function connected(): Promise<{ session: PrinterSession; prints: () => number }> {
  const h = harness();
  const session = new PrinterSession(h.deps);
  await session.connect();
  return { session, prints: () => h.printers[0]?.calls.filter((c) => c.kind === "print").length ?? 0 };
}

afterEach(() => {
  for (const el of document.querySelectorAll("spoko-print-dialog")) el.remove();
});

describe("printLabels: host bugs", () => {
  it("rejects a bad request", async () => {
    await expect(printLabels({ template, rows: [] })).rejects.toThrow(RangeError);
    await expect(printLabels({ template, rows: Array.from({ length: 201 }, () => ({})) })).rejects.toThrow(RangeError);
    await expect(printLabels({ template, rows: "x" } as unknown as PrintRequest)).rejects.toThrow(TypeError);
    await expect(printLabels({ template, rows: [1] } as unknown as PrintRequest)).rejects.toThrow(TypeError);
    await expect(printLabels({ template, rows, columns: [1] } as unknown as PrintRequest)).rejects.toThrow(TypeError);
  });

  it("allows one dialog at a time", async () => {
    const { session } = await connected();
    const first = printLabels({ template, rows }, session);
    await expect(printLabels({ template, rows }, session)).rejects.toThrow(TypeError);
    closeButton()?.click();
    await first;
  });
});

describe("printLabels: the dialog", () => {
  it("prints every row with its copies and resolves on close with the count", async () => {
    const { session, prints } = await connected();
    const outcome = printLabels({ template, rows, copies: 2, title: "Crates" }, session);
    await ready();
    expect(dialogOf().querySelector("h2")?.textContent).toBe("Crates");
    expect(dialogOf().textContent).toContain("Label 1 of 2");
    expect(dialogOf().textContent).toContain("HarmonyOS Sans © Huawei");
    button("Print")?.click();
    await until(() => dialogOf().textContent?.includes("Labels printed: 4.") ?? false);
    expect(prints()).toBe(4);
    closeButton()?.click();
    expect(await outcome).toEqual<PrintOutcome>({ printed: 4, cancelled: false });
  });

  it("remembers the density used last", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows: [rows[0]!] }, session);
    await ready();
    const select = dialogOf().querySelector("select") as HTMLSelectElement;
    select.value = "5";
    select.dispatchEvent(new Event("change"));
    closeButton()?.click();
    await outcome;
    const again = printLabels({ template, rows: [rows[0]!] }, session);
    await ready();
    expect((dialogOf().querySelector("select") as HTMLSelectElement).value).toBe("5");
    closeButton()?.click();
    await again;
  });

  it("resolves as cancelled when closed before printing", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    closeButton()?.click();
    expect(await outcome).toEqual({ printed: 0, cancelled: true });
  });

  it("shows template errors and keeps Print disabled", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template: { version: 1, size: { width: 50 }, elements: [] }, rows }, session);
    await until(() => dialogOf().textContent?.includes("The template is not valid") ?? false);
    expect(button("Print")?.disabled).toBe(true);
    closeButton()?.click();
    expect(await outcome).toEqual({ printed: 0, cancelled: false, error: { code: "template", row: 0 } });
  });

  it("offers Connect when the printer is not connected, straight from the click", async () => {
    const h = harness();
    const session = new PrinterSession(h.deps);
    const request = vi.spyOn(h.deps, "request");
    const outcome = printLabels({ template, rows }, session);
    await until(() => button("Connect printer") !== undefined);
    expect(button("Print")?.hidden).toBe(true);
    button("Connect printer")?.click();
    expect(request).toHaveBeenCalledTimes(1);
    await ready();
    closeButton()?.click();
    await outcome;
  });

  it("keeps printing when the dialog is removed, and resolves when the batch ends", async () => {
    const { session, prints } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    button("Print")?.click();
    document.querySelector("spoko-print-dialog")?.remove();
    expect(await outcome).toEqual({ printed: 2, cancelled: false });
    expect(prints()).toBe(2);
  });

  it("reopens if the browser closes it while printing, and still resolves at the end", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    button("Print")?.click();
    const dialog = dialogOf().querySelector("dialog") as HTMLDialogElement;
    dialog.close();
    await delay(1);
    expect(dialog.open).toBe(true);
    await closeDialog();
    expect(await outcome).toEqual({ printed: 2, cancelled: false });
  });

  it("lets a new dialog open once the old one was removed by a page change mid-batch", async () => {
    const { session } = await connected();
    const first = printLabels({ template, rows }, session);
    await ready();
    button("Print")?.click();
    document.querySelector("spoko-print-dialog")?.remove();
    const second = printLabels({ template, rows: [rows[0]!] }, session);
    expect(await first).toEqual({ printed: 2, cancelled: false });
    await closeDialog();
    expect(await second).toEqual({ printed: 0, cancelled: true });
  });

  it("closes from the corner, and only Cancel is left while a batch prints", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    expect(closeButton()?.disabled).toBe(false);
    expect(button("Cancel")?.hidden).toBe(true);
    expect(dialogOf().activeElement).toBe(dialogOf().querySelector("dialog"));
    button("Print")?.focus();
    button("Print")?.click();
    expect(closeButton()?.disabled).toBe(true);
    expect(button("Cancel")?.hidden).toBe(false);
    expect(dialogOf().activeElement).toBe(button("Cancel"));
    closeButton()?.click();
    expect(dialogOf().querySelector("dialog")?.open).toBe(true);
    button("Cancel")?.click();
    await until(() => closeButton()?.disabled === false);
    expect(button("Cancel")?.hidden).toBe(true);
    expect(dialogOf().activeElement).toBe(closeButton());
    closeButton()?.click();
    expect(await outcome).toEqual({ printed: 0, cancelled: true });
  });

  it("closes on Escape while idle", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    dialogOf().querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(await outcome).toEqual({ printed: 0, cancelled: true });
  });

  it("does not close on Escape while printing", async () => {
    const { session } = await connected();
    const outcome = printLabels({ template, rows }, session);
    await ready();
    button("Print")?.click();
    const dialog = dialogOf().querySelector("dialog") as HTMLDialogElement;
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(true);
    await closeDialog();
    await outcome;
  });
});
