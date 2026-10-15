// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { PrintOutcome } from "../src/dialog.js";
import { delay } from "./fakes.js";

describe("the bundle entry", () => {
  it("installs window.spokoLabels once, defines the elements and prints on spoko-labels:print", async () => {
    await import("../src/bundle.js");
    const installed = (window as unknown as { spokoLabels: { version: string; printLabels: unknown } }).spokoLabels;
    expect(installed.version).toBe("dev");
    expect(typeof installed.printLabels).toBe("function");
    expect(customElements.get("spoko-printer-status")).toBeDefined();
    expect(customElements.get("spoko-print-dialog")).toBeDefined();

    const printed = new Promise<PrintOutcome>((resolve) =>
      window.addEventListener("spoko-labels:printed", (event) => resolve((event as CustomEvent<PrintOutcome>).detail), { once: true }),
    );
    const template = { version: 1, size: { width: 50, height: 30 }, elements: [] };
    window.dispatchEvent(new CustomEvent("spoko-labels:print", { detail: { template, rows: [{}] } }));
    await delay(5);
    const dialog = document.querySelector("spoko-print-dialog");
    expect(dialog).not.toBeNull();
    // happy-dom has no Bluetooth: the session is unsupported; closing resolves as cancelled.
    dialog?.shadowRoot?.querySelector<HTMLButtonElement>(".close")?.click();
    expect(await printed).toEqual({ printed: 0, cancelled: true });
  });

  it("logs a host bug instead of throwing from the event", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.dispatchEvent(new CustomEvent("spoko-labels:print", { detail: { template: {}, rows: [] } }));
    await delay(5);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
