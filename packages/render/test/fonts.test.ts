/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundledFonts } from "../src/fonts/bundled.js";
import { chooseFace, loadFonts } from "../src/fonts/registry.js";
import type { FontSource, RenderEnvironment } from "../src/environment/types.js";
import readme from "../fonts/README.md?raw";
import { nodeEnvironment } from "./node-environment.js";

const fakeEnv = (): RenderEnvironment & { loaded: [string, string][] } => {
  const loaded: [string, string][] = [];
  return {
    loaded,
    createCanvas: () => {
      throw new Error("not used");
    },
    loadFont: async (source, internalName) => {
      loaded.push([source.family, internalName]);
    },
  };
};
const source = (family: string, ranges: [number, number][], bold = false): FontSource => ({
  family,
  bold,
  data: new ArrayBuffer(0),
  ascent: 0.9,
  descent: 0.2,
  unicodeRanges: ranges,
});
const LATIN1: [number, number][] = [[0x20, 0xff]];
const LATIN_EXT: [number, number][] = [[0x20, 0x17f]];

describe("bundled font files", () => {
  it("are the unmodified originals listed in fonts/README.md", () => {
    const files = new Set(bundledFonts.map((f) => (f.data as URL).href));
    expect(files.size).toBe(3);
    for (const href of files) {
      const name = href.split("/").pop() ?? "";
      const hash = createHash("sha256").update(readFileSync(fileURLToPath(href))).digest("hex");
      expect(readme).toContain(`| \`${name}\` | \`${hash}\` |`);
    }
  });

  it("ship their licenses", () => {
    const dir = new URL("../fonts/", import.meta.url);
    expect(readFileSync(new URL("OFL-Viga.txt", dir), "utf8")).toContain("SIL Open Font License");
    expect(readFileSync(new URL("LICENSE-HarmonyOS-Sans.txt", dir), "utf8")).toContain("HarmonyOS Sans Fonts License Agreement");
  });

  it("declare Polish coverage only where it exists", async () => {
    const fonts = await loadFonts(fakeEnv(), bundledFonts);
    const polish = "Zażółć gęślą jaźń ZAŻÓŁĆ GĘŚLĄ JAŹŃ";
    const choice = chooseFace(fonts, { family: "Viga", bold: false, fallback: [] }, polish, "/elements/0");
    // Viga lacks the letters, so HarmonyOS Sans is chosen without a warning.
    expect(choice.warnings).toEqual([]);
    const viga = chooseFace(fonts, { family: "Viga", bold: false, fallback: [] }, "Blue crate", "/elements/0");
    expect(choice.face.internalName).not.toBe(viga.face.internalName);
  });

  it("load into a real canvas", async () => {
    const fonts = await loadFonts(nodeEnvironment, bundledFonts);
    expect(fonts.families).toEqual(["Viga", "HarmonyOS Sans"]);
  });
});

describe("loadFonts", () => {
  it("gives every source its own internal name and groups faces by family", async () => {
    const env = fakeEnv();
    const fonts = await loadFonts(env, [source("A", LATIN1), source("B", LATIN1), source("A", LATIN1, true)]);
    expect(fonts.families).toEqual(["A", "B"]);
    const names = env.loaded.map(([, n]) => n);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(n).toMatch(/^spoko-labels-\d+$/);
    expect(Object.isFrozen(fonts)).toBe(true);
  });

  it("refuses an empty list and bad metrics", async () => {
    await expect(loadFonts(fakeEnv(), [])).rejects.toThrow(RangeError);
    await expect(loadFonts(fakeEnv(), [{ ...source("A", LATIN1), family: "" }])).rejects.toThrow(RangeError);
    await expect(loadFonts(fakeEnv(), [{ ...source("A", LATIN1), ascent: 0 }])).rejects.toThrow(RangeError);
  });

  it("rejects with the environment's error when a file does not load", async () => {
    const corrupt = new Error("corrupt");
    const env = { ...fakeEnv(), loadFont: () => Promise.reject(corrupt) };
    await expect(loadFonts(env, [source("A", LATIN1)])).rejects.toMatchObject({ message: "Could not load font A", cause: corrupt });
  });
});

describe("chooseFace", () => {
  const registry = () =>
    loadFonts(fakeEnv(), [source("Latin1", LATIN1), source("Ext", LATIN_EXT), source("Ext", LATIN_EXT, true)]);

  it("uses the requested family when it covers the text, ignoring whitespace", async () => {
    const r = await registry();
    const a = chooseFace(r, { family: "Latin1", bold: false, fallback: [] }, "abc\t\n def", "/e");
    const b = chooseFace(r, { family: "Ext", bold: false, fallback: [] }, "abc", "/e");
    expect(a.warnings).toEqual([]);
    expect(a.face.internalName).not.toBe(b.face.internalName);
  });

  it("falls back in order: fallbacks, then every registered family", async () => {
    const r = await registry();
    const ext = chooseFace(r, { family: "Ext", bold: false, fallback: [] }, "ł", "/e").face;
    expect(chooseFace(r, { family: "Latin1", bold: false, fallback: [] }, "ł", "/e")).toEqual({ face: ext, warnings: [] });
    expect(chooseFace(r, { family: "Latin1", bold: false, fallback: ["Ext"] }, "ł", "/e").face).toBe(ext);
  });

  it("warns about unregistered names with their paths and skips them", async () => {
    const r = await registry();
    const c = chooseFace(r, { family: "Nope", bold: false, fallback: ["Gone", "Latin1"] }, "a", "/elements/2");
    expect(c.warnings).toEqual([
      { code: "missing-font", path: "/elements/2/font/family" },
      { code: "missing-font", path: "/elements/2/font/fallback/0" },
    ]);
    const latin1 = chooseFace(r, { family: "Latin1", bold: false, fallback: [] }, "a", "/e").face;
    expect(c.face).toBe(latin1);
  });

  it("uses the first candidate and warns when nothing covers the text", async () => {
    const r = await registry();
    const c = chooseFace(r, { family: "Ext", bold: false, fallback: [] }, "日本", "/elements/0");
    expect(c.warnings).toEqual([{ code: "missing-glyphs", path: "/elements/0" }]);
    expect(c.face).toBe(chooseFace(r, { family: "Ext", bold: false, fallback: [] }, "a", "/e").face);
  });

  it("uses the bold face, or the regular one with a warning", async () => {
    const r = await registry();
    const extRegular = chooseFace(r, { family: "Ext", bold: false, fallback: [] }, "a", "/e").face;
    const extBold = chooseFace(r, { family: "Ext", bold: true, fallback: [] }, "a", "/e");
    expect(extBold.warnings).toEqual([]);
    expect(extBold.face).not.toBe(extRegular);
    const latinBold = chooseFace(r, { family: "Latin1", bold: true, fallback: [] }, "a", "/elements/1");
    expect(latinBold.warnings).toEqual([{ code: "missing-font", path: "/elements/1/font/bold" }]);
  });

  it("refuses a registry that loadFonts did not create", () => {
    expect(() => chooseFace({ families: ["A"] }, { family: "A", bold: false, fallback: [] }, "a", "/e")).toThrow(TypeError);
  });
});
