/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bundle } from "../scripts/bundle.mjs";

const out = mkdtempSync(join(tmpdir(), "labels-embed-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the browser bundle", () => {
  it("is one module whose fonts are files next to it, with their licenses", async () => {
    const { fonts, version } = await bundle(out);
    const code = readFileSync(join(out, "labels-embed.js"), "utf8");
    expect(code).not.toContain("data:font");
    expect(code).not.toContain("../../fonts/");
    expect(code).not.toContain("__LABELS_EMBED_VERSION__");
    expect(code).toContain(JSON.stringify(version));
    // Every font URL in the code resolves, relative to the bundle, to a file that was copied.
    const urls = [...code.matchAll(/new URL\("\.\/fonts\/([^"]+)",import\.meta\.url\)/g)].map((m) => m[1] as string);
    expect([...new Set(urls)].sort()).toEqual(fonts);
    expect(fonts).toHaveLength(8);
    for (const font of fonts) {
      expect(font).not.toMatch(/[[\]]/);
      expect(existsSync(join(out, "fonts", font)), font).toBe(true);
    }
    expect(readFileSync(join(out, "fonts", "LICENSE-HarmonyOS-Sans.txt"), "utf8")).toContain("HarmonyOS Sans");
    for (const ofl of ["Viga", "Inconsolata", "BalooPaaji", "MarkaziText", "Cookie"]) {
      expect(existsSync(join(out, "fonts", `OFL-${ofl}.txt`)), ofl).toBe(true);
    }
    // esbuild runs for real here; on a busy machine (the whole suite in parallel) it can take a few seconds.
  }, 30_000);
});
