import type { HorizontalAlign, TextFit, VerticalAlign } from "../schema/types.js";
import type { DotRect } from "./units.js";

/** Measures a string at one pixel size (the caller sets the font). */
export type Measure = (text: string) => number;

export interface TextLayoutInput {
  text: string;
  box: DotRect;
  /** Font size in pixels (= dots), and the smallest size shrink may use. */
  sizePx: number;
  minPx: number;
  fit: TextFit;
  wrap: boolean;
  /** Extra space after each character and between lines, in dots (may be fractional or negative). */
  letterSpacing: number;
  lineSpacing: number;
  align: HorizontalAlign;
  verticalAlign: VerticalAlign;
  /** Font metrics per em. */
  ascent: number;
  descent: number;
  /** A measurer for the font at the given pixel size. */
  measureAt: (px: number) => Measure;
}

export interface PlacedLine {
  text: string;
  /** Left edge and baseline, in dots. */
  x: number;
  baseline: number;
  width: number;
}

export interface TextLayout {
  px: number;
  lines: PlacedLine[];
  /** The text does not fit its box at `px` (it is still laid out and drawn). */
  overflow: boolean;
  /** What the lines cover, in dots; `null` for empty text. */
  extent: DotRect | null;
}

/** Code points, counted without allocating: every UTF-16 unit except the low half of a surrogate pair. */
const codePointCount = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit < 0xdc00 || unit > 0xdfff) n++;
  }
  return n;
};

/** Width of a line with letter spacing: spacing goes between characters, not after the last one. */
export function lineWidth(line: string, measure: Measure, letterSpacing: number): number {
  if (line.length === 0) return 0;
  return measure(line) + (letterSpacing === 0 ? 0 : letterSpacing * (codePointCount(line) - 1));
}

/**
 * Split text into lines. Paragraphs split on "\n". With `wrap`, a paragraph breaks at single spaces: a word
 * joins the current line while the line stays within `maxWidth`; the space at a break is dropped, other
 * spaces are kept; a word wider than the box gets a line of its own.
 *
 * Word widths are measured once and summed, so wrapping costs one measurement per word rather than one per
 * candidate line (kerning across a space is ignored for the decision only).
 */
export function wrapText(text: string, measure: Measure, letterSpacing: number, maxWidth: number, wrap: boolean): string[] {
  const paragraphs = text.split("\n");
  if (!wrap) return paragraphs;
  const space = measure(" ");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line: string | null = null;
    let width = 0;
    for (const word of paragraph.split(" ")) {
      const w = lineWidth(word, measure, letterSpacing);
      if (line === null) {
        line = word;
        width = w;
        continue;
      }
      // Joining adds a space and, with letter spacing, two gaps around it (or one when either side is empty).
      const gaps = letterSpacing === 0 ? 0 : letterSpacing * ((line.length > 0 ? 1 : 0) + (word.length > 0 ? 1 : 0));
      const joined = width + space + gaps + w;
      if (joined <= maxWidth) {
        line = `${line} ${word}`;
        width = joined;
      } else {
        lines.push(line);
        line = word;
        width = w;
      }
    }
    lines.push(line ?? "");
  }
  return lines;
}

interface Block {
  lines: string[];
  widths: number[];
  lineHeight: number;
  height: number;
}

function block(input: TextLayoutInput, px: number): Block {
  const measure = input.measureAt(px);
  const lines = wrapText(input.text, measure, input.letterSpacing, input.box.width, input.wrap);
  const widths = lines.map((l) => lineWidth(l, measure, input.letterSpacing));
  const lineHeight = Math.ceil(input.ascent * px) + Math.ceil(input.descent * px);
  const height = lines.length * lineHeight + (lines.length - 1) * input.lineSpacing;
  return { lines, widths, lineHeight, height };
}

/** The prototype's tolerance: a block may overhang its box by one dot and still count as fitting. */
const fits = (b: Block, box: DotRect): boolean => b.height <= box.height + 1 && Math.max(...b.widths) <= box.width + 1;

/**
 * Lay out a text element: choose the size (shrink-to-fit by binary search over whole pixels), wrap, and place
 * every line. Pure: all measuring goes through `measureAt`.
 */
export function layoutText(input: TextLayoutInput): TextLayout {
  const { box } = input;
  let px = input.sizePx;
  let b = block(input, px);
  let overflow = !fits(b, box);

  if (overflow && input.fit === "shrink") {
    let lo = Math.min(input.minPx, input.sizePx);
    let hi = input.sizePx - 1;
    let best: { px: number; b: Block } | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = block(input, mid);
      if (fits(candidate, box)) {
        best = { px: mid, b: candidate };
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best) {
      px = best.px;
      b = best.b;
      overflow = false;
    } else {
      px = Math.min(input.minPx, input.sizePx);
      b = block(input, px);
    }
  }

  const top =
    input.verticalAlign === "top"
      ? box.y
      : Math.round(input.verticalAlign === "middle" ? box.y + (box.height - b.height) / 2 : box.y + box.height - b.height);
  const ascentPx = Math.ceil(input.ascent * px);
  const lines: PlacedLine[] = b.lines.map((text, i) => {
    const width = b.widths[i] ?? 0;
    const x =
      input.align === "left"
        ? box.x
        : Math.round(input.align === "center" ? box.x + (box.width - width) / 2 : box.x + box.width - width);
    return { text, x, baseline: top + ascentPx + i * (b.lineHeight + input.lineSpacing), width };
  });

  const visible = lines.filter((l) => l.width > 0);
  let extent: DotRect | null = null;
  if (visible.length > 0) {
    const left = Math.min(...visible.map((l) => l.x));
    const right = Math.max(...visible.map((l) => l.x + l.width));
    extent = { x: left, y: top, width: right - left, height: b.height };
  }
  return { px, lines, overflow, extent };
}
