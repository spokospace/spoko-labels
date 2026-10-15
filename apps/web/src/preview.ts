import { B1 } from "@spokospace/labels-core";
import {
  render,
  validateTemplate,
  type Content,
  type FontRegistry,
  type NormalizedTemplate,
  type RenderData,
  type RenderEnvironment,
  type RenderWarning,
  type RgbaImage,
} from "@spokospace/labels-render";
import { issueText, t } from "./i18n/index.js";
import { drawOverlay, overlayGeometry, toDesign } from "./overlay.js";

export const DOTS_PER_MM = B1.dotsPerMm;
/** The width the B1's 384-dot head covers: 48 mm. */
export const HEAD_MM = B1.headDots / B1.dotsPerMm;
/** Overlay canvas pixels per printed dot: lines stay crisp when the preview is scaled up. */
const OVERLAY_PX_PER_DOT = 3;

export type PreviewModel =
  | {
      ok: true;
      /** The rendered dots, turned back to the design orientation. */
      image: RgbaImage;
      /** The validated template (defaults filled in), for the overlays and the text alternative. */
      label: NormalizedTemplate;
      warnings: RenderWarning[];
    }
  | { ok: false; warnings: RenderWarning[] };

/** Renders one label for the preview. Never throws for a bad template: its errors come back as warnings. */
export function buildPreview(template: unknown, data: RenderData, environment: RenderEnvironment, fonts: FontRegistry): PreviewModel {
  const { template: label, issues } = validateTemplate(template, { printableWidth: HEAD_MM });
  if (!label) {
    const errors = issues.filter((i) => i.severity === "error").map(({ code, path }) => ({ code, path }));
    return { ok: false, warnings: errors };
  }
  // render() validates again on its own; that is cheap next to drawing, and keeps its warning paths exact.
  const result = render(template, data, { environment, fonts, printableWidth: HEAD_MM });
  return { ok: true, image: toDesign(result.image, result.printRotation), label, warnings: result.warnings };
}

/** A warning in words, with the element it belongs to (numbered from 1, as a person counts). */
export function warningText(warning: RenderWarning): string {
  const message = issueText(warning.code);
  const element = /^\/elements\/(\d+)/.exec(warning.path);
  return element ? t("warningAt", { message, n: Number(element[1]) + 1 }) : message;
}

export interface LabelText {
  kind: "text" | "qr";
  value: string;
}

/** The value an element shows, looked up the way labels-render does (own properties only). */
function contentValue(content: Content, data: RenderData): string {
  if ("text" in content) return content.text;
  const { row, columns } = data;
  const lookup = (name: string | undefined) => (row && name !== undefined && Object.hasOwn(row, name) ? row[name] : undefined);
  let value = "bind" in content ? lookup(content.bind) : undefined;
  if (value === undefined && content.bindIndex !== undefined) value = lookup(columns?.[content.bindIndex]);
  return value === undefined || value === null ? "" : String(value);
}

/** What the label says, in drawing order: the preview canvas's text alternative. */
export function labelTexts(label: NormalizedTemplate, data: RenderData): LabelText[] {
  const texts: LabelText[] = [];
  for (const element of label.elements) {
    if (element.type === "line") continue;
    const value = contentValue(element.content, data).trim();
    if (value) texts.push({ kind: element.type, value });
  }
  return texts;
}

export interface PreviewElements {
  /** Wraps the two canvases; its aspect ratio follows the label. */
  stage: HTMLElement;
  image: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  /** The text alternative: what the label says. */
  texts: HTMLUListElement;
  warnings: HTMLUListElement;
  size: HTMLElement;
  turned: HTMLElement;
}

function item(text: string): HTMLLIElement {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

/** Puts a rendered label onto a canvas, one canvas pixel per printed dot. */
export function drawImage(canvas: HTMLCanvasElement, image: RgbaImage): void {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
}

/** Shows a preview model. Everything from the template or the data is set as text. */
export function showPreview(els: PreviewElements, model: PreviewModel | null, data: RenderData): void {
  els.warnings.replaceChildren(...(model?.warnings ?? []).map((w) => item(warningText(w))));
  if (!model?.ok) {
    els.stage.hidden = true;
    els.texts.replaceChildren();
    els.turned.hidden = true;
    els.size.textContent = model ? t("templateInvalid") : "";
    return;
  }
  const { image, label } = model;
  if (model.warnings.length === 0) els.warnings.append(item(t("noWarnings")));

  els.stage.hidden = false;
  els.stage.style.aspectRatio = `${image.width} / ${image.height}`;
  els.stage.style.maxWidth = `${image.width * 2}px`;
  drawImage(els.image, image);
  els.image.setAttribute("aria-label", t("previewAlt", { width: label.size.width, height: label.size.height }));

  const scale = DOTS_PER_MM * OVERLAY_PX_PER_DOT;
  els.overlay.width = image.width * OVERLAY_PX_PER_DOT;
  els.overlay.height = image.height * OVERLAY_PX_PER_DOT;
  const ctx = els.overlay.getContext("2d");
  if (ctx) drawOverlay(ctx, overlayGeometry(label, HEAD_MM), scale);

  const texts = labelTexts(label, data);
  els.texts.replaceChildren(
    ...(texts.length === 0
      ? [item(t("previewNothing"))]
      : texts.map((x) => item(x.kind === "qr" ? t("previewQr", { value: x.value }) : t("previewText", { text: x.value })))),
  );
  els.size.textContent = t("previewSize", {
    width: image.width,
    height: image.height,
    widthMm: image.width / DOTS_PER_MM,
    heightMm: image.height / DOTS_PER_MM,
  });
  els.turned.hidden = label.printRotation === 0;
  els.turned.textContent = t("previewTurned", { degrees: label.printRotation });
}
