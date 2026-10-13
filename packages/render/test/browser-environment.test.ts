import { afterEach, describe, expect, it, vi } from "vitest";
import { browserEnvironment } from "../src/environment/browser.js";
import type { FontSource } from "../src/environment/types.js";

const source = (data: ArrayBuffer | URL): FontSource => ({ family: "A", data, ascent: 1, descent: 0.2, unicodeRanges: [] });

class FakeFontFace {
  static created: FakeFontFace[] = [];
  loaded = false;
  constructor(
    readonly family: string,
    readonly src: string | ArrayBuffer,
  ) {
    FakeFontFace.created.push(this);
  }
  async load() {
    this.loaded = true;
    return this;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeFontFace.created = [];
});

describe("browserEnvironment", () => {
  it("prefers OffscreenCanvas", () => {
    class FakeOffscreen {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    const canvas = browserEnvironment().createCanvas(400, 240);
    expect(canvas).toBeInstanceOf(FakeOffscreen);
    expect([canvas.width, canvas.height]).toEqual([400, 240]);
  });

  it("falls back to a canvas element", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const element = { width: 0, height: 0 };
    vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? element : null) });
    const canvas = browserEnvironment().createCanvas(400, 240);
    expect(canvas).toBe(element);
    expect([element.width, element.height]).toEqual([400, 240]);
  });

  it("loads a font under its internal name and adds it to document.fonts", async () => {
    const added: unknown[] = [];
    vi.stubGlobal("FontFace", FakeFontFace);
    vi.stubGlobal("document", { fonts: { add: (f: unknown) => added.push(f) } });
    await browserEnvironment().loadFont(source(new URL("https://example.com/f.ttf")), "spoko-labels-7");
    const [face] = FakeFontFace.created;
    expect(face?.family).toBe("spoko-labels-7");
    expect(face?.src).toBe('url("https://example.com/f.ttf")');
    expect(face?.loaded).toBe(true);
    expect(added).toEqual([face]);
  });

  it("passes font bytes through and uses self.fonts in a worker", async () => {
    const added: unknown[] = [];
    vi.stubGlobal("FontFace", FakeFontFace);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("fonts", { add: (f: unknown) => added.push(f) });
    const bytes = new ArrayBuffer(4);
    await browserEnvironment().loadFont(source(bytes), "spoko-labels-8");
    expect(FakeFontFace.created[0]?.src).toBe(bytes);
    expect(added).toHaveLength(1);
  });

  it("fails clearly when there is nowhere to add fonts", async () => {
    vi.stubGlobal("FontFace", FakeFontFace);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("fonts", undefined);
    await expect(browserEnvironment().loadFont(source(new ArrayBuffer(0)), "x")).rejects.toThrow("FontFaceSet");
  });
});
