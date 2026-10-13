/// <reference types="node" />
// Golden images: every case renders a made-up label and compares it with test/golden/<name>.png.
//
//   UPDATE_GOLDEN=1 pnpm test     rewrite the images and test/golden/manifest.json
//
// Policy (spec, "Golden images and platforms"): on the platform and @napi-rs/canvas version recorded in the
// manifest every image must match exactly. Elsewhere, images without text must still match exactly and
// images with text may differ in at most 0.2% of their pixels. A mismatch writes <name>.actual.png next to
// the golden for review.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import { bundledFonts, loadFonts, render, type FontRegistry } from "../src/index.js";
import { nodeEnvironment } from "./node-environment.js";

const dir = new URL("./golden/", import.meta.url);
const manifestUrl = new URL("manifest.json", dir);
const update = process.env.UPDATE_GOLDEN === "1";
const canvasVersion = (createRequire(import.meta.url)("@napi-rs/canvas/package.json") as { version: string }).version;
const platform = `${process.platform}-${process.arch}`;

interface Manifest {
  platform: string;
  canvas: string;
}
const manifest: Manifest | null = existsSync(manifestUrl)
  ? (JSON.parse(readFileSync(manifestUrl, "utf8")) as Manifest)
  : null;
const samePlatform = manifest?.platform === platform && manifest.canvas === canvasVersion;

const label = (elements: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  size: { width: 50, height: 30 },
  elements,
  ...extra,
});
const text = (x: number, y: number, width: number, height: number, content: string, extra: Record<string, unknown> = {}) => ({
  type: "text",
  x,
  y,
  width,
  height,
  content: { text: content },
  font: { family: "HarmonyOS Sans", size: 4 },
  ...extra,
});

// All data is made up.
const cases: { name: string; hasText: boolean; template: unknown; row?: Record<string, unknown> }[] = [
  { name: "text-basic", hasText: true, template: label([text(2, 2, 46, 8, "Blue crate 12")]) },
  {
    name: "text-wrap-shrink",
    hasText: true,
    template: label([
      text(2, 2, 46, 12, "A long product name that has to wrap and shrink to fit", { wrap: true, font: { family: "HarmonyOS Sans", size: 6 } }),
      text(2, 16, 46, 6, "One line that must shrink to fit the width", { font: { family: "HarmonyOS Sans", size: 6 } }),
    ]),
  },
  {
    name: "text-alignment",
    hasText: true,
    template: label(
      (["top", "middle", "bottom"] as const).flatMap((verticalAlign, row) =>
        (["left", "center", "right"] as const).map((align, col) =>
          text(1 + col * 16, 1 + row * 9.5, 16, 9.5, `${align[0]}${verticalAlign[0]}`, { align, verticalAlign, font: { family: "Viga", size: 3 } }),
        ),
      ),
    ),
  },
  {
    name: "text-reverse-bold",
    hasText: true,
    template: label([
      text(2, 2, 46, 12, "SHELF A", { reverse: true, align: "center", verticalAlign: "middle", font: { family: "HarmonyOS Sans", size: 7, bold: true } }),
      text(2, 16, 46, 12, "Normal", { align: "center", verticalAlign: "middle", font: { family: "HarmonyOS Sans", size: 7, bold: true } }),
    ]),
  },
  {
    name: "text-letter-spacing",
    hasText: true,
    template: label([
      text(2, 2, 46, 8, "SPACED", { letterSpacing: 1, font: { family: "Viga", size: 5 } }),
      text(2, 12, 46, 8, "TIGHT TEXT", { letterSpacing: -0.3, font: { family: "Viga", size: 5 } }),
      text(2, 22, 46, 6, "two\nlines", { lineSpacing: -0.5, font: { family: "Viga", size: 2.5 } }),
    ]),
  },
  {
    name: "text-polish-fallback",
    hasText: true,
    template: label([
      text(2, 2, 46, 8, "Viga: Blue crate", { font: { family: "Viga", size: 4 } }),
      text(2, 12, 46, 8, "Viga → Żółta skrzynka", { font: { family: "Viga", size: 4 } }),
      text(2, 22, 46, 6, "Zażółć gęślą jaźń", { font: { family: "HarmonyOS Sans", size: 4 } }),
    ]),
  },
  {
    name: "qr-levels",
    hasText: false,
    template: label(
      (["L", "M", "Q", "H"] as const).map((level, i) => ({
        type: "qr",
        x: 1 + i * 12,
        y: 9,
        width: 12,
        height: 12,
        content: { text: "https://example.com/item/0012" },
        level,
      })),
    ),
  },
  {
    name: "lines",
    hasText: false,
    template: label([
      { type: "line", x: 1, y: 1, width: 48, height: 0.4 },
      { type: "line", x: 1, y: 28.6, width: 48, height: 0.4 },
      { type: "line", x: 1, y: 1, width: 0.4, height: 28 },
      { type: "line", x: 48.6, y: 1, width: 0.4, height: 28 },
      { type: "line", x: 10, y: 15, width: 30, height: 0.05 },
    ]),
  },
  {
    name: "storage-box",
    hasText: true,
    template: label(
      [
        {
          type: "text",
          x: 2,
          y: 2,
          width: 46,
          height: 7,
          content: { bind: "Code" },
          font: { family: "Viga", size: 6 },
        },
        { type: "line", x: 2, y: 9.5, width: 46, height: 0.4 },
        {
          type: "text",
          x: 2,
          y: 11,
          width: 30,
          height: 10,
          content: { bind: "Name" },
          font: { family: "HarmonyOS Sans", size: 3.2 },
          wrap: true,
        },
        { type: "qr", x: 34, y: 11, width: 14, height: 14, content: { bind: "Code" }, level: "M" },
        {
          type: "text",
          x: 2,
          y: 22,
          width: 22,
          height: 6,
          content: { bind: "Shelf" },
          font: { family: "HarmonyOS Sans", size: 4.5, bold: true },
          reverse: true,
          align: "center",
          verticalAlign: "middle",
        },
      ],
      { shape: { kind: "rounded", radius: 2 } },
    ),
    row: { Code: "BX-0012", Name: "Niebieska skrzynka na kable i ładowarki", Shelf: "A-03" },
  },
];

let fonts: FontRegistry;
beforeAll(async () => {
  fonts = await loadFonts(nodeEnvironment, bundledFonts);
  if (update) {
    writeFileSync(manifestUrl, `${JSON.stringify({ platform, canvas: canvasVersion } satisfies Manifest, null, 2)}\n`);
  }
});

function toPng(image: { width: number; height: number; data: Uint8ClampedArray }): Buffer {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(image.width, image.height);
  imageData.data.set(image.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas.encodeSync("png");
}

async function fromPng(bytes: Buffer): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const img = await loadImage(bytes);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
}

describe("golden images", () => {
  it("has a manifest", () => {
    expect(manifest ?? update).toBeTruthy();
  });

  for (const c of cases) {
    it(c.name, async () => {
      const { image, warnings } = render(c.template, { row: c.row ?? {} }, { environment: nodeEnvironment, fonts });
      expect(warnings).toEqual([]);
      const goldenUrl = new URL(`${c.name}.png`, dir);
      if (update || !existsSync(goldenUrl)) {
        writeFileSync(goldenUrl, toPng(image));
        if (!update) throw new Error(`No golden image for ${c.name}; wrote one, review and commit it`);
        return;
      }
      const golden = await fromPng(readFileSync(goldenUrl));
      expect([golden.width, golden.height]).toEqual([image.width, image.height]);
      let diff = 0;
      for (let i = 0; i < golden.data.length; i += 4) if (golden.data[i] !== image.data[i]) diff++;
      if (diff > 0) console.info(`golden ${c.name}: ${diff} pixels differ`);
      const allowed = samePlatform || !c.hasText ? 0 : Math.floor(image.width * image.height * 0.002);
      if (diff > allowed) writeFileSync(new URL(`${c.name}.actual.png`, dir), toPng(image));
      expect(diff, `${diff} pixels differ (allowed ${allowed}); see ${c.name}.actual.png`).toBeLessThanOrEqual(allowed);
    });
  }
});
