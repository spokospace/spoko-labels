// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defineElements } from "../src/index.js";
import { PrinterSession } from "../src/session.js";
import { batteryPercent, type SpokoPrinterStatus } from "../src/status.js";
import { delay, FakeLocks, harness } from "./fakes.js";

defineElements();

function chip(session: PrinterSession, lang = "en"): { el: SpokoPrinterStatus; button: HTMLButtonElement; text: () => string } {
  const el = document.createElement("spoko-printer-status") as unknown as SpokoPrinterStatus;
  el.session = session;
  el.setAttribute("lang", lang);
  document.body.append(el);
  const button = el.shadowRoot?.querySelector("button") as HTMLButtonElement;
  return { el, button, text: () => button.textContent ?? "" };
}

describe("batteryPercent", () => {
  it("turns the printer's 0–4 level into quarters and keeps a percentage as it is", () => {
    expect([0, 1, 2, 3, 4].map(batteryPercent)).toEqual([0, 25, 50, 75, 100]);
    expect(batteryPercent(60)).toBe(60);
    expect(batteryPercent(150)).toBe(100);
  });
});

describe("<spoko-printer-status>", () => {
  it("connects on click and shows the printer, then offers Disconnect", async () => {
    const session = new PrinterSession(harness().deps);
    const { el, button, text } = chip(session);
    expect(text()).toBe("Connect printer");
    expect(el.dataset["state"]).toBe("disconnected");
    button.click();
    await delay(5);
    expect(text()).toBe("Printer: B1-TEST · battery ~75%");
    button.click();
    const menu = el.shadowRoot?.querySelector(".menu") as HTMLElement;
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    (menu.querySelector("button") as HTMLButtonElement).click();
    await delay(5);
    expect(text()).toBe("Connect printer");
    el.remove();
  });

  it("announces the state politely and speaks Polish", () => {
    const session = new PrinterSession(harness(undefined, { isSupported: () => false }).deps);
    const { el, button, text } = chip(session, "pl");
    expect(text()).toBe("Brak Bluetooth");
    expect(button.disabled).toBe(true);
    expect(el.shadowRoot?.querySelector("[aria-live=polite]")).not.toBeNull();
    el.remove();
  });

  it("shows a failed connection's reason", async () => {
    const session = new PrinterSession(harness(undefined, { request: () => Promise.reject(Object.assign(new Error("x"), {})) }).deps);
    const { el, button } = chip(session);
    button.click();
    await delay(5);
    const error = el.shadowRoot?.querySelector(".error") as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("try again");
    el.remove();
  });

  it("shows another tab's hold and stops listening once removed", async () => {
    const locks = new FakeLocks();
    const first = new PrinterSession(harness(locks).deps);
    await first.connect();
    const second = new PrinterSession(harness(locks).deps);
    const { el, text } = chip(second);
    await delay(5);
    expect(text()).toBe("Printer in use in another tab");
    el.remove();
    await first.disconnect();
    await delay(5);
    // Removed: the label is not updated any more (no listener left behind).
    expect(text()).toBe("Printer in use in another tab");
  });

  it("keeps working when its container is re-rendered (a Livewire morph)", async () => {
    const session = new PrinterSession(harness().deps);
    const container = document.createElement("div");
    document.body.append(container);
    const first = document.createElement("spoko-printer-status") as unknown as SpokoPrinterStatus;
    first.session = session;
    container.append(first);
    container.innerHTML = "<spoko-printer-status></spoko-printer-status>";
    const again = container.querySelector("spoko-printer-status") as unknown as SpokoPrinterStatus;
    again.session = session;
    again.connectedCallback();
    const button = again.shadowRoot?.querySelector("button") as HTMLButtonElement;
    button.click();
    await delay(5);
    expect(button.textContent).toContain("B1-TEST");
    container.remove();
  });
});
