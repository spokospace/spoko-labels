import { beforeAll, describe, expect, it } from "vitest";
import {
  bundledFonts,
  loadFonts,
  render,
  TemplateError,
  type CanvasLike,
  type FontRegistry,
  type RenderEnvironment,
} from "../src/index.js";
import { nodeEnvironment } from "./node-environment.js";

let fonts: FontRegistry;
beforeAll(async () => {
  fonts = await loadFonts(nodeEnvironment, bundledFonts);
});
const options = () => ({ environment: nodeEnvironment, fonts });

// Made-up 50x30 label and row.
const text = (extra: Record<string, unknown> = {}) => ({
  type: "text",
  x: 2,
  y: 2,
  width: 30,
  height: 7,
  content: { bind: "Name" },
  font: { family: "HarmonyOS Sans", size: 4 },
  ...extra,
});
const qr = (extra: Record<string, unknown> = {}) => ({
  type: "qr",
  x: 34,
  y: 12,
  width: 14,
  height: 14,
  content: { bind: "Code" },
  ...extra,
});
const template = (elements: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  size: { width: 50, height: 30 },
  elements,
  ...extra,
});
const row = { Name: "Blue crate", Code: "BX-0012" };

const isBlack = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4] === 0;
const blackCount = (data: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] === 0) n++;
  return n;
};

describe("render: printRotation", () => {
  // A 30 x 50 mm label with a 1 mm square in its top-left corner: 240 x 400 dots, the mark at dots 0..7.
  const marked = (printRotation?: number) =>
    template([{ type: "line", x: 0, y: 0, width: 1, height: 1 }], {
      size: { width: 30, height: 50 },
      ...(printRotation === undefined ? {} : { printRotation }),
    });

  it("turns the image clockwise and echoes the turn", () => {
    const cases: [number | undefined, number, number, [number, number]][] = [
      [undefined, 240, 400, [0, 0]],
      [0, 240, 400, [0, 0]],
      [90, 400, 240, [399, 0]], // the top-left corner goes to the top right
      [180, 240, 400, [239, 399]],
      [270, 400, 240, [0, 239]], // and to the bottom left
    ];
    for (const [rotation, width, height, [x, y]] of cases) {
      const { image, printRotation } = render(marked(rotation), {}, options());
      expect([image.width, image.height, printRotation]).toEqual([width, height, rotation ?? 0]);
      expect(isBlack(image.data, width, x, y)).toBe(true);
      expect(blackCount(image.data)).toBe(64);
    }
  });

  it("checks what was drawn against the side the head crosses", () => {
    // Text too big for its box, aligned to the bottom, spills above it: into the 1 mm strip a 48 mm head
    // misses on a 50 mm side.
    const spilling = (printRotation: number) =>
      template([{ ...text({ content: { text: "UP" } }), x: 2, y: 1.2, width: 26, height: 2, font: { family: "HarmonyOS Sans", size: 6 }, fit: "none", verticalAlign: "bottom" }], {
        size: { width: 30, height: 50 },
        printRotation,
      });
    const codesFor = (printRotation: number) =>
      render(spilling(printRotation), {}, { ...options(), printableWidth: 48 }).warnings.map((w) => w.code);
    expect(codesFor(270)).toContain("outside-printable-area");
    // Unturned, the head crosses the 30 mm width: nothing is cut.
    expect(codesFor(0)).not.toContain("outside-printable-area");
  });
});

describe("render", () => {
  it("returns a label-sized image of pure black and white pixels", () => {
    const { image, warnings } = render(template([text(), qr(), { type: "line", x: 2, y: 10, width: 46, height: 0.4 }]), { row }, options());
    expect(warnings).toEqual([]);
    expect([image.width, image.height]).toEqual([400, 240]);
    expect(image.data.length).toBe(400 * 240 * 4);
    for (let i = 0; i < image.data.length; i += 4) {
      const [r, g, b, a] = [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
      expect(r === g && g === b && (r === 0 || r === 255) && a === 255).toBe(true);
    }
    expect(blackCount(image.data)).toBeGreaterThan(1000);
  });

  it("draws a line as a filled box, at least one dot thick", () => {
    const { image } = render(template([{ type: "line", x: 1, y: 1, width: 2, height: 0.01 }]), {}, options());
    expect(blackCount(image.data)).toBe(16);
    expect(isBlack(image.data, 400, 8, 8)).toBe(true);
    expect(isBlack(image.data, 400, 8, 9)).toBe(false);
  });

  it("throws TemplateError with the issues on a template-level error", () => {
    let error: unknown;
    try {
      render({ version: 2 }, {}, options());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as TemplateError).issues.map((i) => i.code)).toContain("unsupported-version");
  });

  it("skips an invalid element, keeps its original path and renders the rest", () => {
    const { image, warnings } = render(
      template([{ type: "line", x: "1" }, { type: "barcode" }, { type: "line", x: 0, y: 0, width: 1, height: 1 }]),
      {},
      options(),
    );
    expect(warnings).toEqual([
      { code: "invalid-type", path: "/elements/0/x" },
      { code: "required", path: "/elements/0/y" },
      { code: "required", path: "/elements/0/width" },
      { code: "required", path: "/elements/0/height" },
      { code: "unknown-element", path: "/elements/1" },
    ]);
    expect(blackCount(image.data)).toBe(64);
  });

  it("points render warnings at the element's index in the input", () => {
    const { warnings } = render(template([{ type: "nope" }, qr({ content: { bind: "Missing" } })]), { row }, options());
    expect(warnings).toEqual([
      { code: "unknown-element", path: "/elements/0" },
      { code: "missing-column", path: "/elements/1/content" },
      { code: "qr-empty", path: "/elements/1" },
    ]);
  });

  it("reports QR problems", () => {
    const tooLong = render(template([qr({ content: { text: "x".repeat(3000) } })]), {}, options());
    expect(tooLong.warnings).toEqual([{ code: "qr-too-long", path: "/elements/0" }]);
    expect(blackCount(tooLong.image.data)).toBe(0);
    const tooSmall = render(template([qr({ width: 2, height: 2 })]), { row }, options());
    expect(tooSmall.warnings).toEqual([{ code: "qr-too-small", path: "/elements/0" }]);
  });

  it("reports text that does not fit at minSize, and draws it", () => {
    const { image, warnings } = render(
      template([text({ content: { text: "Ż".repeat(60) }, width: 10, height: 3, minSize: 2 })]),
      {},
      options(),
    );
    expect(warnings.map((w) => w.code)).toContain("text-overflow");
    expect(blackCount(image.data)).toBeGreaterThan(0);
  });

  it("warns when drawn content leaves the safe or printable area", () => {
    const { warnings } = render(
      template([text({ content: { text: "Long text running past the box" }, fit: "none", x: 2, width: 20 })]),
      {},
      { ...options(), printableWidth: 48 },
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        { code: "text-overflow", path: "/elements/0" },
        { code: "outside-safe-area", path: "/elements/0" },
        { code: "outside-printable-area", path: "/elements/0" },
      ]),
    );
  });

  it("reports truncated values and missing fonts", () => {
    const { warnings } = render(
      template([text({ content: { bind: "Long" }, font: { family: "Arial", size: 3, bold: true, fallback: ["Viga"] } })]),
      { row: { Long: "a".repeat(2100) } },
      options(),
    );
    expect(warnings).toEqual([
      { code: "value-truncated", path: "/elements/0/content" },
      { code: "missing-font", path: "/elements/0/font/family" },
      { code: "missing-font", path: "/elements/0/font/bold" },
      { code: "text-overflow", path: "/elements/0" },
      // The overflowing text runs past the label edge.
      { code: "outside-safe-area", path: "/elements/0" },
    ]);
  });

  it("fills the box and draws white text when reversed", () => {
    const box = { x: 0, y: 0, width: 50, height: 30 };
    const big = { ...box, content: { text: "A" }, font: { family: "HarmonyOS Sans", size: 20 } };
    const normal = render(template([text(big)]), {}, options());
    const reversed = render(template([text({ ...big, reverse: true })]), {}, options());
    // Not an exact negative: anti-aliased glyph edges cross the threshold differently on black.
    const glyph = blackCount(normal.image.data);
    expect(glyph).toBeGreaterThan(1000);
    expect(Math.abs(blackCount(reversed.image.data) - (400 * 240 - glyph))).toBeLessThan(glyph * 0.05);
  });

  it("only ever puts internal font names into ctx.font", async () => {
    const fontsSet: string[] = [];
    const recording: RenderEnvironment = {
      ...nodeEnvironment,
      createCanvas: (w, h) => {
        const canvas = nodeEnvironment.createCanvas(w, h);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no context");
        const proxy = new Proxy(ctx, {
          set: (target, key, value) => {
            if (key === "font") fontsSet.push(String(value));
            return Reflect.set(target, key, value);
          },
          get: (target, key) => {
            const v = Reflect.get(target, key) as unknown;
            return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
          },
        });
        return { width: w, height: h, getContext: () => proxy } satisfies CanvasLike;
      },
    };
    render(
      template([text({ font: { family: '900px x, serif"', size: 4, fallback: ["Viga"] }, content: { text: "Hi" } })]),
      {},
      { environment: recording, fonts: await loadFonts(recording, bundledFonts) },
    );
    expect(fontsSet.length).toBeGreaterThan(0);
    for (const f of fontsSet) expect(f).toMatch(/^\d+px "spoko-labels-\d+"$/);
  });

  it("draws negatively spaced text, whatever the alignment, inside its reported extent", () => {
    for (const align of ["left", "center", "right"] as const) {
      const { image, warnings } = render(
        template([text({ x: 2, y: 2, width: 46, height: 26, content: { text: "ABCDEFGHIJ" }, letterSpacing: -5, align })]),
        {},
        options(),
      );
      expect(warnings).toEqual([]);
      expect(blackCount(image.data)).toBeGreaterThan(50);
    }
  });

  it("refuses fonts loaded into another environment", async () => {
    const other: RenderEnvironment = { ...nodeEnvironment };
    const otherFonts = await loadFonts(other, bundledFonts);
    expect(() => render(template([text()]), { row }, { environment: nodeEnvironment, fonts: otherFonts })).toThrow(TypeError);
  });

  it("reports missing fonts even when the value is empty", () => {
    const { warnings } = render(template([text({ font: { family: "Arial", size: 3 } })]), { row: { Name: "" } }, options());
    expect(warnings).toEqual([{ code: "missing-font", path: "/elements/0/font/family" }]);
  });

  it("renders a hostile template within a time budget", () => {
    const element = text({
      x: 0,
      y: 0,
      width: 50,
      height: 30,
      wrap: true,
      font: { family: "HarmonyOS Sans", size: 50 },
      content: { text: "Żółta skrzynka ".repeat(140) },
    });
    const spaced = { ...element, wrap: false, letterSpacing: 0.1, content: { text: "Ż".repeat(2000) } };
    const start = performance.now();
    render(template(Array.from({ length: 200 }, (_, i) => (i % 2 ? element : spaced))), {}, options());
    expect(performance.now() - start).toBeLessThan(20_000);
  }, 30_000);
});
