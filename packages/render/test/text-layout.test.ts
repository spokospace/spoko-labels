import { describe, expect, it } from "vitest";
import { layoutText, lineWidth, wrapText, type Measure, type TextLayoutInput } from "../src/layout/text.js";
import { boxToDots, toDots } from "../src/layout/units.js";

// A fixed-width fake font: every code point is half the pixel size wide.
const measureAt =
  (px: number): Measure =>
  (s) =>
    Array.from(s).length * px * 0.5;
const fixed10 = measureAt(10);

const input = (extra: Partial<TextLayoutInput> = {}): TextLayoutInput => ({
  text: "Blue crate",
  box: { x: 10, y: 20, width: 200, height: 40 },
  sizePx: 20,
  minPx: 6,
  fit: "shrink",
  wrap: false,
  letterSpacing: 0,
  lineSpacing: 0,
  align: "left",
  verticalAlign: "top",
  ascent: 0.8,
  descent: 0.2,
  measureAt,
  ...extra,
});

describe("units", () => {
  it("rounds edges, not sizes, and keeps at least one dot", () => {
    expect(toDots(1.06)).toBe(8);
    expect(boxToDots({ x: 0.06, y: 0, width: 0.06, height: 0.01 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    // Two boxes that touch in mm touch in dots.
    const a = boxToDots({ x: 1.07, y: 0, width: 2.01, height: 1 });
    const b = boxToDots({ x: 3.08, y: 0, width: 1, height: 1 });
    expect(a.x + a.width).toBe(b.x);
  });
});

describe("lineWidth", () => {
  it("adds letter spacing between code points only", () => {
    expect(lineWidth("abc", fixed10, 0)).toBe(15);
    expect(lineWidth("abc", fixed10, 2)).toBe(19);
    expect(lineWidth("😀a", fixed10, 2)).toBe(12); // two code points, one gap
    expect(lineWidth("", fixed10, 2)).toBe(0);
  });
});

describe("wrapText", () => {
  it("returns paragraphs as lines without wrap", () => {
    expect(wrapText("a b\nc", fixed10, 0, 1, false)).toEqual(["a b", "c"]);
  });

  it("breaks at spaces while the line fits (no tolerance)", () => {
    // 5 dots per character; "aa bb" is 25 dots.
    expect(wrapText("aa bb cc", fixed10, 0, 25, true)).toEqual(["aa bb", "cc"]);
    expect(wrapText("aa bb cc", fixed10, 0, 24, true)).toEqual(["aa", "bb", "cc"]);
  });

  it("keeps a word wider than the box on its own line", () => {
    expect(wrapText("a verylongword b", fixed10, 0, 20, true)).toEqual(["a", "verylongword", "b"]);
  });

  it("keeps leading, trailing and repeated spaces but drops the one at a break", () => {
    expect(wrapText(" a  b ", fixed10, 0, 100, true)).toEqual([" a  b "]);
    expect(wrapText("aaaa bbbb", fixed10, 0, 20, true)).toEqual(["aaaa", "bbbb"]);
  });

  it("wraps each paragraph separately, empty ones included", () => {
    expect(wrapText("aa bb\n\ncc", fixed10, 0, 10, true)).toEqual(["aa", "bb", "", "cc"]);
  });

  it("counts letter spacing exactly like lineWidth when joining", () => {
    // "ab cd" with spacing 1: 25 + 4 gaps = 29.
    expect(lineWidth("ab cd", fixed10, 1)).toBe(29);
    expect(wrapText("ab cd", fixed10, 1, 29, true)).toEqual(["ab cd"]);
    expect(wrapText("ab cd", fixed10, 1, 28, true)).toEqual(["ab", "cd"]);
  });
});

describe("layoutText", () => {
  it("keeps the size when the text fits, and places the first baseline at top + ceil(ascent)", () => {
    const l = layoutText(input());
    expect(l.px).toBe(20);
    expect(l.overflow).toBe(false);
    expect(l.lines).toEqual([{ text: "Blue crate", x: 10, baseline: 36, width: 100, spacing: 0 }]);
    expect(l.extent).toEqual({ x: 10, y: 20, width: 100, height: 20 });
  });

  it("shrinks to the largest size that fits, within the one-dot tolerance", () => {
    // 10 code points at 0.5 px each: fits a 61-dot-wide box at 12 px (60 dots), and at 12.2 within tolerance.
    const l = layoutText(input({ box: { x: 0, y: 0, width: 59, height: 40 } }));
    expect(l.px).toBe(12);
    expect(l.overflow).toBe(false);
  });

  it("matches a linear step-down search for every box width", () => {
    for (let width = 30; width <= 120; width++) {
      const box = { x: 0, y: 0, width, height: 40 };
      let expected = 20;
      while (expected > 6 && Array.from("Blue crate").length * expected * 0.5 > width + 1) expected--;
      expect(layoutText(input({ box })).px).toBe(expected);
    }
  });

  it("rewraps at every tried size", () => {
    // At 20 px each word needs its own line (60 dots high, too tall). At 12 px three lines are 3 × 13 = 39 dots.
    const tall = layoutText(input({ text: "aaaa bbbb cccc", wrap: true, box: { x: 0, y: 0, width: 50, height: 40 } }));
    expect(tall.lines.map((x) => x.text)).toEqual(["aaaa", "bbbb", "cccc"]);
    expect(tall.px).toBe(12);
    // A shorter box forces a smaller size, where two words share a line again.
    const short = layoutText(input({ text: "aaaa bbbb cccc", wrap: true, box: { x: 0, y: 0, width: 50, height: 20 } }));
    expect(short.lines.map((x) => x.text)).toEqual(["aaaa bbbb", "cccc"]);
    expect(short.px).toBe(10); // 2 lines × (8 + 2) = 20 dots
    expect(short.overflow).toBe(false);
  });

  it("stops at minSize and reports overflow", () => {
    const l = layoutText(input({ text: "x".repeat(100), box: { x: 0, y: 0, width: 50, height: 40 } }));
    expect(l.px).toBe(6);
    expect(l.overflow).toBe(true);
  });

  it("keeps the size with fit none and reports overflow", () => {
    const l = layoutText(input({ fit: "none", box: { x: 0, y: 0, width: 50, height: 40 } }));
    expect(l.px).toBe(20);
    expect(l.overflow).toBe(true);
  });

  it("uses minPx when it is larger than the size", () => {
    expect(layoutText(input({ sizePx: 5, minPx: 8 })).px).toBe(5);
  });

  it("aligns horizontally per line, rounding to whole dots", () => {
    const box = { x: 0, y: 0, width: 101, height: 60 };
    const text = "aa\nbbbb";
    const center = layoutText(input({ text, box, align: "center" })).lines.map((l) => l.x);
    const right = layoutText(input({ text, box, align: "right" })).lines.map((l) => l.x);
    expect(center).toEqual([Math.round((101 - 20) / 2), Math.round((101 - 40) / 2)]);
    expect(right).toEqual([81, 61]);
  });

  it("aligns the block vertically and spaces lines", () => {
    const box = { x: 0, y: 10, width: 200, height: 100 };
    const text = "a\nb";
    // Line height 16 + 4 = 20, block 20 + 5 + 20 = 45.
    const base = { text, box, sizePx: 20, lineSpacing: 5 } as const;
    expect(layoutText(input({ ...base, verticalAlign: "top" })).lines.map((l) => l.baseline)).toEqual([26, 51]);
    expect(layoutText(input({ ...base, verticalAlign: "middle" })).lines.map((l) => l.baseline)).toEqual([54, 79]);
    expect(layoutText(input({ ...base, verticalAlign: "bottom" })).lines.map((l) => l.baseline)).toEqual([81, 106]);
  });

  it("limits negative letter spacing to the narrowest character, so the pen never moves backwards", () => {
    // Every character is 5 dots wide at 10 px: spacing is limited to -5, the characters stack up.
    const l = layoutText(input({ text: "abcd", sizePx: 10, letterSpacing: -40 }));
    expect(l.lines[0]?.spacing).toBe(-5);
    expect(l.lines[0]?.width).toBe(5);
    expect(l.extent).toEqual({ x: 10, y: 20, width: 5, height: 10 });
    expect(layoutText(input({ text: "abcd", sizePx: 10, letterSpacing: -2 })).lines[0]?.spacing).toBe(-2);
  });

  it("has no extent for empty text", () => {
    expect(layoutText(input({ text: "" })).extent).toBeNull();
  });

  it("reports the extent of overflowing text past its box", () => {
    const l = layoutText(input({ text: "x".repeat(40), fit: "none", box: { x: 5, y: 0, width: 50, height: 40 } }));
    expect(l.extent).toEqual({ x: 5, y: 0, width: 400, height: 20 });
  });

  it("stays fast on hostile input", () => {
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      layoutText(input({ text: "word ".repeat(400), wrap: true, sizePx: 400, box: { x: 0, y: 0, width: 384, height: 240 } }));
    }
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
