// @vitest-environment happy-dom
import { B1, OFFSET_LIMITS_MM } from "@spokospace/labels-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AXES, DEFAULT_OFFSET, loadOffset, OFFSET_LIMITS, parseOffset, saveOffset, validAxis } from "../src/calibration.js";
import { setLang } from "../src/i18n/index.js";
import { mountSettingsPanel, readNumber } from "../src/settings-panel.js";
import { STORAGE_KEYS } from "../src/storage.js";

describe("the calibration limits", () => {
  it("are labels-core's: a value at the limit passes, one past it does not", () => {
    expect(OFFSET_LIMITS).toEqual({ x: { min: -OFFSET_LIMITS_MM.x, max: OFFSET_LIMITS_MM.x }, y: { min: 0, max: OFFSET_LIMITS_MM.y } });
    for (const axis of AXES) {
      const { min, max } = OFFSET_LIMITS[axis];
      expect([min, max].map((v) => validAxis(axis, v))).toEqual([true, true]);
      expect([min - 0.01, max + 0.01, Number.NaN].map((v) => validAxis(axis, v))).toEqual([false, false, false]);
    }
  });

  it("default to the B1's own offset", () => {
    expect(DEFAULT_OFFSET).toBe(B1.offsetMm);
  });
});

describe("the stored calibration", () => {
  afterEach(() => localStorage.clear());

  it("reads back what was saved", () => {
    expect(saveOffset({ x: -1.5, y: 2 })).toBe(true);
    expect(loadOffset()).toEqual({ x: -1.5, y: 2 });
  });

  it("falls back to the default when missing, not JSON, out of range or not numbers", () => {
    const stored = [null, "", "nope", "[]", "null", '{"x":0}', '{"x":0,"y":11}', '{"x":-9,"y":1}', '{"x":"1","y":"1"}', '{"x":null,"y":1}'];
    for (const value of stored) expect(parseOffset(value)).toEqual(DEFAULT_OFFSET);
    localStorage.setItem(STORAGE_KEYS.offsetMm, '{"x":1,"y":99}');
    expect(loadOffset()).toEqual(DEFAULT_OFFSET);
  });

  it("works when localStorage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadOffset(broken)).toEqual(DEFAULT_OFFSET);
    expect(saveOffset({ x: 1, y: 1 }, broken)).toBe(false);
  });
});

describe("the settings panel", () => {
  beforeEach(() => {
    setLang("en");
    document.body.replaceChildren();
  });
  afterEach(() => localStorage.clear());

  const input = (axis: "x" | "y") => document.getElementById(`offset-${axis}`) as HTMLInputElement;
  const type = (axis: "x" | "y", value: string) => {
    input(axis).value = value;
    input(axis).dispatchEvent(new Event("input"));
  };
  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;

  it("reads numbers with a comma or a point", () => {
    expect(readNumber("0,5")).toBe(0.5);
    expect(readNumber(" -1.25 ")).toBe(-1.25);
    expect(readNumber("")).toBeNaN();
    expect(readNumber("abc")).toBeNaN();
    for (const text of ["1e1", "0x1", "Infinity", "+1", ".5", "1.", "1,2,3", "- 1", "1 2"]) expect(readNumber(text)).toBeNaN();
    expect(readNumber("10")).toBe(10);
  });

  it("shows the stored value, uses and stores a valid change, and ignores an invalid one", () => {
    saveOffset({ x: 1, y: 2 });
    const panel = mountSettingsPanel(document.body, { openHelp: vi.fn() });
    expect(input("x").value).toBe("1");
    expect(input("y").value).toBe("2");

    type("y", "1,5");
    expect(panel.offset()).toEqual({ x: 1, y: 1.5 });
    expect(loadOffset()).toEqual({ x: 1, y: 1.5 });

    type("y", "12");
    expect(input("y").getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById("offset-y-error")?.textContent).toContain("from 0 to 10");
    expect(panel.offset()).toEqual({ x: 1, y: 1.5 });
    type("x", "-8.5");
    expect(panel.offset()).toEqual({ x: 1, y: 1.5 });
    expect(loadOffset()).toEqual({ x: 1, y: 1.5 });

    type("x", "-8");
    expect(input("x").getAttribute("aria-invalid")).toBe("false");
    expect(panel.offset()).toEqual({ x: -8, y: 1.5 });
  });

  it("starts from the default when the stored value is invalid", () => {
    localStorage.setItem(STORAGE_KEYS.offsetMm, '{"x":0,"y":-1}');
    const panel = mountSettingsPanel(document.body, { openHelp: vi.fn() });
    expect(panel.offset()).toEqual(DEFAULT_OFFSET);
    expect(input("y").value).toBe("0.5");
  });

  it("shows the values with the language's decimal separator", () => {
    saveOffset({ x: -1.5, y: 0.5 });
    const panel = mountSettingsPanel(document.body, { openHelp: vi.fn() });
    expect(input("y").value).toBe("0.5");
    setLang("pl");
    panel.refresh();
    expect([input("x").value, input("y").value]).toEqual(["-1,5", "0,5"]);
    expect(document.getElementById("offset-y-hint")?.textContent).toBe("Od 0 do 10 mm. Większa wartość przesuwa wydruk w dół.");
    setLang("en");
  });

  it("resets to the B1 default", () => {
    saveOffset({ x: 3, y: 4 });
    const panel = mountSettingsPanel(document.body, { openHelp: vi.fn() });
    button("Reset to default").click();
    expect(panel.offset()).toEqual(DEFAULT_OFFSET);
    expect(input("y").value).toBe("0.5");
    expect(loadOffset()).toEqual(DEFAULT_OFFSET);
  });

  it("says when the browser does not store it, and still uses the value", () => {
    const panel = mountSettingsPanel(document.body, { openHelp: vi.fn(), load: () => ({ ...DEFAULT_OFFSET }), save: () => false });
    type("y", "2");
    expect(panel.offset()).toEqual({ x: 0, y: 2 });
    expect(document.body.textContent).toContain("does not let the page store settings");
  });

  it("links to the calibration help", () => {
    const openHelp = vi.fn();
    mountSettingsPanel(document.body, { openHelp });
    button("How to calibrate").click();
    expect(openHelp).toHaveBeenCalledWith("calibration");
  });
});
