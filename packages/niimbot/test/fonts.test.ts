/// <reference types="node" />
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundledFonts, loadFonts, type RenderEnvironment } from "@spokospace/labels-render";
import { describe, expect, it } from "vitest";
import { niimbotFonts, NIIMBOT_FONT_FAMILIES } from "../src/index.js";
import readme from "../fonts/README.md?raw";

const fakeEnv = (): RenderEnvironment & { loaded: string[] } => {
  const loaded: string[] = [];
  return {
    loaded,
    createCanvas: () => {
      throw new Error("not used");
    },
    loadFont: async (source) => {
      loaded.push(source.family);
    },
  };
};

const paths = niimbotFonts.map((f) => fileURLToPath(f.data as URL));
const families = (sources: readonly { family: string }[]) => [...new Set(sources.map((f) => f.family))];

describe("niimbotFonts", () => {
  it("point at files in fonts/", () => {
    expect(niimbotFonts.every((f) => f.data instanceof URL)).toBe(true);
    for (const path of paths) expect(existsSync(path), path).toBe(true);
    expect(new Set(paths).size).toBe(niimbotFonts.length);
  });

  it("are the unmodified originals listed in fonts/README.md", () => {
    for (const path of paths) {
      const name = path.split(/[\\/]/).pop() ?? "";
      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(readme).toContain(`| \`${name}\` | \`${hash}\` |`);
    }
  });

  it("ship an OFL license next to every family", () => {
    for (const family of families(niimbotFonts)) {
      const license = new URL(`../fonts/OFL-${family.replaceAll(" ", "")}.txt`, import.meta.url);
      expect(readFileSync(license, "utf8"), family).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("cover the font table together with render's bundled fonts", () => {
    const ours = families(niimbotFonts);
    const render = families(bundledFonts);
    expect(ours.filter((f) => render.includes(f))).toEqual([]);
    expect([...render, ...ours].sort()).toEqual([...new Set(Object.values(NIIMBOT_FONT_FAMILIES))].sort());
  });

  it("have a bold face only for Inconsolata", () => {
    expect(niimbotFonts.filter((f) => f.bold).map((f) => f.family)).toEqual(["Inconsolata"]);
  });

  it("load with loadFonts next to render's bundled fonts", async () => {
    const env = fakeEnv();
    const fonts = await loadFonts(env, [...bundledFonts, ...niimbotFonts]);
    expect(fonts.families).toEqual(["Viga", "HarmonyOS Sans", "Inconsolata", "Baloo Paaji", "Markazi Text", "Cookie"]);
    expect(env.loaded).toHaveLength(bundledFonts.length + niimbotFonts.length);
  });
});
