/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = join(appDir, "../../packages");

// The packages' `exports` point at dist/, which a fresh checkout does not have. Resolving them to their
// sources lets `vite dev`, `vite build` and the tests run without building the packages first; the fonts'
// `new URL("../../fonts/…", import.meta.url)` still resolves from src/ (and Vite copies them as assets).
const PACKAGES = ["core", "render", "niimbot", "embed"] as const;
const alias = Object.fromEntries(PACKAGES.map((name) => [`@spokospace/labels-${name}`, join(packagesDir, name, "src/index.ts")]));

/** Where the font files and their licenses live. */
export const FONT_DIRS = [join(packagesDir, "render/fonts"), join(packagesDir, "niimbot/fonts")];
const LICENSE_FILE = /^(LICENSE|OFL)-.*\.txt$/;

export interface AppVersion {
  /** The full commit hash, with "-dirty" when the tree had changes; scripts/deploy.mjs compares it with HEAD. */
  commit: string;
  /** "<short commit> <commit date>", shown in the footer so a deploy can be checked against the merged commit. */
  label: string;
}

const runGit = (args: string[]): string => execFileSync("git", args, { cwd: appDir, encoding: "utf8" });

/**
 * The commit the build comes from. A build of a tree with uncommitted or untracked files is marked "-dirty":
 * it is not that commit, and the deploy script refuses it.
 */
export function appVersion(git: (args: string[]) => string = runGit): AppVersion {
  try {
    const [commit, short, date] = git(["log", "-1", "--format=%H %h %cs"]).trim().split(" ");
    const dirty = git(["status", "--porcelain"]).trim() !== "" ? "-dirty" : "";
    if (commit && short && date) return { commit: commit + dirty, label: `${short}${dirty} ${date}` };
  } catch {
    // Not a git checkout: build anyway, unversioned.
  }
  return { commit: "unknown", label: "unknown" };
}

/**
 * Copies the font licenses into dist/licenses/, unchanged and unhashed. Vite copies the font files themselves
 * (they are referenced from code) but not the licenses, which nothing imports. The HarmonyOS Sans agreement and
 * the SIL OFL both ask for the license to travel with the font. They are not put in assets/: that folder is
 * cached for a year as immutable, which suits hashed names only.
 */
function fontLicenses(): Plugin {
  return {
    name: "spoko-labels:font-licenses",
    apply: "build",
    writeBundle(options) {
      const licenses = join(options.dir ?? join(appDir, "dist"), "licenses");
      mkdirSync(licenses, { recursive: true });
      for (const dir of FONT_DIRS) {
        for (const file of readdirSync(dir)) if (LICENSE_FILE.test(file)) copyFileSync(join(dir, file), join(licenses, file));
      }
    },
  };
}

/**
 * Writes the version into index.html as text (the CSP allows no inline script): the footer's label, and the
 * full commit in `<meta name="spoko-labels-commit">` for the deploy script.
 */
function versionInHtml(version: AppVersion): Plugin {
  return {
    name: "spoko-labels:version",
    transformIndexHtml: (html) => html.replace("__APP_VERSION__", version.label).replace("__APP_COMMIT__", version.commit),
  };
}

/** A published asset name: no characters that asset pipelines and servers mangle ("MarkaziText[wght]"). */
const publishedName = (name: string): string => name.replace(/\[(\w+)\]/g, "-$1");

export default defineConfig({
  root: appDir,
  resolve: { alias },
  plugins: [fontLicenses(), versionInHtml(appVersion())],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Fonts stay files next to their licenses, never data: URLs.
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        assetFileNames: (asset) => {
          const name = publishedName(asset.names[0] ?? "asset");
          const dot = name.lastIndexOf(".");
          return `assets/${dot > 0 ? name.slice(0, dot) : name}-[hash][extname]`;
        },
      },
    },
  },
});
