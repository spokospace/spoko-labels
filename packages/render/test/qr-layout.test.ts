import qrcode from "qrcode-generator";
import { describe, expect, it } from "vitest";
import { layoutQr } from "../src/layout/qr.js";

const box = (width: number, height = width) => ({ x: 10, y: 20, width, height });

describe("layoutQr", () => {
  it("draws nothing for empty content", () => {
    expect(layoutQr("", "L", box(100))).toEqual({ kind: "empty" });
  });

  it("uses whole dots per module and centers the symbol", () => {
    const l = layoutQr("BX-0012", "L", box(100, 120));
    if (l.kind !== "ok") throw new Error(l.kind);
    expect(l.modules).toBe(21); // version 1
    expect(l.moduleSize).toBe(4); // floor(100 / 21)
    expect(l.rect).toEqual({ x: 10 + 8, y: 20 + 18, width: 84, height: 84 });
    expect(l.tooSmall).toBe(false);
  });

  it("picks a larger version for a higher error-correction level", () => {
    const text = "https://example.com/item/0012";
    const sizes = (["L", "M", "Q", "H"] as const).map((level) => {
      const l = layoutQr(text, level, box(200));
      if (l.kind !== "ok") throw new Error(l.kind);
      return l.modules;
    });
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes[3]).toBeGreaterThan(sizes[0] ?? 0);
  });

  it("encodes UTF-8 without touching the library's global byte conversion", () => {
    const before = qrcode.stringToBytes;
    const l = layoutQr("Żółta skrzynka", "M", box(100));
    expect(qrcode.stringToBytes).toBe(before);
    if (l.kind !== "ok") throw new Error(l.kind);
    // The same symbol as a reference run with a UTF-8 byte converter swapped in temporarily.
    const reference = qrcode(0, "M");
    const saved = qrcode.stringToBytes;
    qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));
    try {
      reference.addData("Żółta skrzynka", "Byte");
      reference.make();
    } finally {
      qrcode.stringToBytes = saved;
    }
    expect(l.modules).toBe(reference.getModuleCount());
    for (let r = 0; r < l.modules; r++) for (let c = 0; c < l.modules; c++) expect(l.isDark(r, c)).toBe(reference.isDark(r, c));
  });

  it("reports content that does not fit any symbol", () => {
    expect(layoutQr("x".repeat(3000), "L", box(400))).toEqual({ kind: "too-long" });
    expect(layoutQr("x".repeat(1300), "H", box(400))).toEqual({ kind: "too-long" });
  });

  it("draws at one dot per module, centered and overflowing, when the box is too small", () => {
    const l = layoutQr("BX-0012", "L", box(15));
    if (l.kind !== "ok") throw new Error(l.kind);
    expect(l.tooSmall).toBe(true);
    expect(l.moduleSize).toBe(1);
    expect(l.rect).toEqual({ x: 10 - 3, y: 20 - 3, width: 21, height: 21 });
  });

  it("is exactly at the limit when the box equals the module count", () => {
    const l = layoutQr("BX-0012", "L", box(21));
    if (l.kind !== "ok") throw new Error(l.kind);
    expect(l.tooSmall).toBe(false);
    expect(l.rect).toEqual({ x: 10, y: 20, width: 21, height: 21 });
  });
});
