/// <reference types="node" />
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { refusal } from "../scripts/deploy.mjs";
import { appVersion } from "../vite.config.js";

const out = mkdtempSync(join(tmpdir(), "labels-web-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

describe("the build version", () => {
  const git = (status: string) => (args: string[]) =>
    args[0] === "log" ? "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 a1b2c3d 2026-10-14\n" : status;

  it("is the commit and its date for a clean tree", () => {
    expect(appVersion(git(""))).toEqual({ commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", label: "a1b2c3d 2026-10-14" });
  });

  it("is marked dirty when the tree has changes, so the deploy script refuses it", () => {
    const version = appVersion(git(" M apps/web/src/main.ts\n"));
    expect(version).toEqual({ commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678-dirty", label: "a1b2c3d-dirty 2026-10-14" });
    const html = `<meta name="spoko-labels-commit" content="${version.commit}">`;
    const head = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
    const repo = (args: string[]) => (args[0] === "rev-parse" ? head : "");
    expect(refusal({ git: repo, readIndex: () => html })).toMatch(/was not built from a1b2c3d/);
  });

  it("is unknown outside a git checkout", () => {
    expect(appVersion(() => { throw new Error("not a git repository"); })).toEqual({ commit: "unknown", label: "unknown" });
  });
});

describe("the app build", () => {
  it("ships every referenced font file, the font licenses and the headers", async () => {
    await build({ configFile, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    const assets = join(out, "assets");
    const files = readdirSync(assets);
    const code = files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(assets, f), "utf8"))
      .join("\n");

    const html = readFileSync(join(out, "index.html"), "utf8");
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

    // The licenses are in licenses/, outside the immutable cache of assets/.
    const licenses = join(out, "licenses");
    expect(readFileSync(join(licenses, "LICENSE-HarmonyOS-Sans.txt"), "utf8")).toContain("HarmonyOS Sans");
    for (const ofl of ["Viga", "Inconsolata", "BalooPaaji", "MarkaziText", "Cookie"]) {
      expect(existsSync(join(licenses, `OFL-${ofl}.txt`)), ofl).toBe(true);
    }
    expect(files.some((f) => f.endsWith(".txt"))).toBe(false);
    expect(html).toContain('href="/licenses/LICENSE-HarmonyOS-Sans.txt"');

    expect(html).not.toContain("__APP_VERSION__");
    // The full commit the deploy script compares with HEAD.
    expect(html).toMatch(/<meta name="spoko-labels-commit" content="[0-9a-f]{40}(-dirty)?">/);
    expect(html).toContain("Font: HarmonyOS Sans © Huawei Device Co., Ltd.");
    // No inline script: the CSP allows scripts from the app's own origin only.
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(readFileSync(join(out, "_headers"), "utf8")).toContain("Content-Security-Policy");
  }, 60_000);
});
