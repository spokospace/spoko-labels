import { resolveContent, type RenderData } from "./binding.js";
import type { Context2DLike, RenderEnvironment } from "./environment/types.js";
import { TemplateError } from "./errors.js";
import { chooseFace, type FontRegistry } from "./fonts/registry.js";
import { layoutQr } from "./layout/qr.js";
import { checkPlacement } from "./layout/safe-area.js";
import { layoutText } from "./layout/text.js";
import { boxToDots, DOTS_PER_MM, dotsToMm, toDots, type DotRect } from "./layout/units.js";
import type { IssueCode, RenderWarning } from "./schema/issues.js";
import type { NormalizedQrElement, NormalizedTextElement } from "./schema/types.js";
import { validateWithSources } from "./schema/validate.js";
import { threshold } from "./threshold.js";

export interface RenderOptions {
  environment: RenderEnvironment;
  /** From `loadFonts()`. */
  fonts: FontRegistry;
  /** Width the print head covers, in mm (48 for a NIIMBOT B1); enables `outside-printable-area`. */
  printableWidth?: number;
}

export type { RenderWarning };

export interface RenderResult {
  /** RGBA, every pixel black (0, 0, 0, 255) or white (255, 255, 255, 255); feeds `imageToRows()` directly. */
  image: { width: number; height: number; data: Uint8ClampedArray };
  warnings: RenderWarning[];
}

const BLACK = "#000";
const WHITE = "#fff";

type Warn = (code: IssueCode, path: string) => void;

function fillBlack(ctx: Context2DLike, r: DotRect): void {
  ctx.fillStyle = BLACK;
  ctx.fillRect(r.x, r.y, r.width, r.height);
}

/**
 * Render one label: validate the template, bind the row, lay out and draw every element, threshold to pure
 * black and white. Synchronous once fonts are loaded.
 *
 * Every validation issue of a renderable template comes back as a warning with its own code and path (an
 * element with an error is skipped); rendering adds its own warnings (missing columns and fonts, overflow,
 * QR problems, drawn content outside the safe or printable area).
 *
 * @throws TemplateError when the template has a template-level error.
 */
export function render(template: unknown, data: RenderData, options: RenderOptions): RenderResult {
  const { printableWidth } = options;
  const validated = validateWithSources(template, printableWidth === undefined ? {} : { printableWidth });
  const t = validated.template;
  if (!t) throw new TemplateError(validated.issues);

  const warnings: RenderWarning[] = validated.issues.map(({ code, path }) => ({ code, path }));
  const warn: Warn = (code, path) => {
    if (!warnings.some((w) => w.code === code && w.path === path)) warnings.push({ code, path });
  };

  const width = toDots(t.size.width);
  const height = toDots(t.size.height);
  const canvas = options.environment.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The environment's canvas has no 2D context");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, width, height);

  t.elements.forEach((element, i) => {
    const path = `/elements/${validated.sources[i] ?? i}`;
    const box = boxToDots(element);
    let drawn: DotRect[];
    if (element.type === "line") {
      fillBlack(ctx, box);
      drawn = [box];
    } else if (element.type === "qr") {
      drawn = drawQr(ctx, element, box, data, path, warn);
    } else {
      drawn = drawText(ctx, element, box, data, options.fonts, path, warn);
    }
    // What was actually drawn can leave the box (overflowing text, a QR code too big for it).
    for (const rect of drawn) {
      for (const code of checkPlacement(dotsToMm(rect), t, printableWidth, true)) warn(code, path);
    }
  });

  // getImageData returns a fresh copy, so it can be thresholded in place.
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return { image: { width, height, data: threshold(pixels) }, warnings };
}

function drawQr(
  ctx: Context2DLike,
  element: NormalizedQrElement,
  box: DotRect,
  data: RenderData,
  path: string,
  warn: Warn,
): DotRect[] {
  const content = resolveContent(element.content, data, "qr");
  if (content.missing) warn("missing-column", `${path}/content`);
  const qr = layoutQr(content.value, element.level, box);
  if (qr.kind === "empty") {
    warn("qr-empty", path);
    return [];
  }
  if (qr.kind === "too-long") {
    warn("qr-too-long", path);
    return [];
  }
  if (qr.tooSmall) warn("qr-too-small", path);
  ctx.fillStyle = BLACK;
  const { rect, moduleSize, modules } = qr;
  // One rectangle per run of dark modules in a row: the same dots as one per module, far fewer canvas calls.
  for (let row = 0; row < modules; row++) {
    let start = -1;
    for (let col = 0; col <= modules; col++) {
      const dark = col < modules && qr.isDark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        ctx.fillRect(rect.x + start * moduleSize, rect.y + row * moduleSize, (col - start) * moduleSize, moduleSize);
        start = -1;
      }
    }
  }
  return [rect];
}

function drawText(
  ctx: Context2DLike,
  element: NormalizedTextElement,
  box: DotRect,
  data: RenderData,
  fonts: FontRegistry,
  path: string,
  warn: Warn,
): DotRect[] {
  const content = resolveContent(element.content, data, "text");
  if (content.missing) warn("missing-column", `${path}/content`);
  if (content.truncated) warn("value-truncated", `${path}/content`);
  const drawn: DotRect[] = [];
  if (element.reverse) {
    fillBlack(ctx, box);
    drawn.push(box);
  }
  if (content.value.length === 0) return drawn;

  const spacing = element.letterSpacing * DOTS_PER_MM;
  const { face, warnings } = chooseFace(fonts, element.font, content.value, path);
  for (const w of warnings) warn(w.code, w.path);
  const setFont = (px: number) => {
    // Only the internal name and an integer size ever reach the CSS font string.
    ctx.font = `${px}px "${face.internalName}"`;
  };
  const layout = layoutText({
    text: content.value,
    box,
    sizePx: Math.max(toDots(element.font.size), 1),
    minPx: Math.max(toDots(element.minSize), 1),
    fit: element.fit,
    wrap: element.wrap,
    letterSpacing: spacing,
    lineSpacing: element.lineSpacing * DOTS_PER_MM,
    align: element.align,
    verticalAlign: element.verticalAlign,
    ascent: face.ascent,
    descent: face.descent,
    measureAt: (px) => {
      setFont(px);
      return (s) => ctx.measureText(s).width;
    },
  });
  if (layout.overflow) warn("text-overflow", path);

  setFont(layout.px);
  ctx.fillStyle = element.reverse ? WHITE : BLACK;
  for (const line of layout.lines) {
    if (spacing === 0) {
      ctx.fillText(line.text, line.x, line.baseline);
      continue;
    }
    // Letter spacing through prefix widths, which keeps the font's kerning.
    let prefix = "";
    let i = 0;
    for (const ch of line.text) {
      ctx.fillText(ch, line.x + ctx.measureText(prefix).width + spacing * i, line.baseline);
      prefix += ch;
      i++;
    }
  }
  if (layout.extent) drawn.push(layout.extent);
  return drawn;
}
