// Builds the self-contained browser bundle: dist/bundle/labels-embed.js (core, render, niimbot and
// qrcode-generator in one ES module) and dist/bundle/fonts/ (the font files, unhashed, with their licenses).
// esbuild leaves `new URL("../../fonts/<file>", import.meta.url)` alone; those paths are relative to the
// packages' src/fonts/, so they are rewritten to "./fonts/<file>", relative to the bundle.
//
//   pnpm --filter @spokospace/labels-embed bundle
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const FONT_DIRS = [join(packageDir, "../render/fonts"), join(packageDir, "../niimbot/fonts")];
const FONT_URL = /new URL\(\s*(["'])\.\.\/\.\.\/fonts\/([^"']+)\1\s*,\s*import\.meta\.url\s*\)/g;

/** The published name of a font file: no characters that asset pipelines and servers mangle. */
export const publishedName = (file) => file.replace(/\[(\w+)\]/g, "-$1");

/** Builds the bundle into `outDir` (default dist/bundle) and returns what it wrote. */
export async function bundle(outDir = join(packageDir, "dist/bundle")) {
  const version = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "fonts"), { recursive: true });
  const result = await build({
    entryPoints: [join(packageDir, "src/bundle.ts")],
    tsconfig: join(packageDir, "tsconfig.json"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "eof",
    write: false,
    outfile: join(outDir, "labels-embed.js"),
    define: { __LABELS_EMBED_VERSION__: JSON.stringify(version) },
  });
  const js = result.outputFiles.find((file) => file.path.endsWith(".js"));
  if (!js) throw new Error("esbuild produced no JavaScript");

  const fonts = new Set();
  const code = js.text.replace(FONT_URL, (_match, _quote, file) => {
    fonts.add(file);
    return `new URL("./fonts/${publishedName(file)}",import.meta.url)`;
  });
  if (code.includes("../../fonts/")) throw new Error("a font URL was not rewritten");
  writeFileSync(join(outDir, "labels-embed.js"), code);

  for (const file of fonts) {
    const dir = FONT_DIRS.find((d) => existsSync(join(d, file)));
    if (!dir) throw new Error(`font file not found: ${file}`);
    copyFileSync(join(dir, file), join(outDir, "fonts", publishedName(file)));
  }
  // The licenses travel with the files (the HarmonyOS Sans agreement requires it; OFL does too).
  for (const dir of FONT_DIRS) {
    for (const file of readdirSync(dir)) {
      if (/^(LICENSE|OFL)-.*\.txt$/.test(file)) copyFileSync(join(dir, file), join(outDir, "fonts", file));
    }
  }
  return { outDir, version, fonts: [...fonts].map(publishedName).sort(), bytes: code.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { outDir, version, fonts, bytes } = await bundle();
  console.log(`labels-embed ${version}: ${join(outDir, "labels-embed.js")} (${Math.round(bytes / 1024)} kB), ${fonts.length} fonts in ${join(outDir, "fonts")}`);
}
