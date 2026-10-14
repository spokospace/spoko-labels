/// <reference types="node" />
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

const out = mkdtempSync(join(tmpdir(), "labels-web-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

describe("the app build", () => {
  it("ships every referenced font file next to its license, and the headers", async () => {
    await build({ configFile, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    const assets = join(out, "assets");
    const files = readdirSync(assets);
    const code = files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(assets, f), "utf8"))
      .join("\n");

    // Every font name in the code is a file in assets/; the render fonts are always there.
    const referenced = [...new Set([...code.matchAll(/([\w-]+\.ttf)/g)].map((m) => m[1] as string))];
    expect(referenced.length).toBeGreaterThanOrEqual(3);
    for (const font of referenced) expect(files, font).toContain(font);
    for (const family of ["Viga-Regular", "HarmonyOS_Sans_Medium", "HarmonyOS_Sans_Bold"]) {
      expect(referenced.some((f) => f.startsWith(`${family}-`)), family).toBe(true);
    }
    // Fonts are files, never inlined, and asset names carry no brackets.
    expect(code).not.toContain("data:font");
    expect(files.some((f) => /[[\]]/.test(f))).toBe(false);

    expect(readFileSync(join(assets, "LICENSE-HarmonyOS-Sans.txt"), "utf8")).toContain("HarmonyOS Sans");
    for (const ofl of ["Viga", "Inconsolata", "BalooPaaji", "MarkaziText", "Cookie"]) {
      expect(existsSync(join(assets, `OFL-${ofl}.txt`)), ofl).toBe(true);
    }

    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).not.toContain("__APP_VERSION__");
    // The full commit the deploy script compares with HEAD.
    expect(html).toMatch(/<meta name="spoko-labels-commit" content="[0-9a-f]{40}">/);
    expect(html).toContain("Font: HarmonyOS Sans © Huawei Device Co., Ltd.");
    // No inline script: the CSP allows scripts from the app's own origin only.
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(readFileSync(join(out, "_headers"), "utf8")).toContain("Content-Security-Policy");
  }, 60_000);
});
