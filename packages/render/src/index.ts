export {
  DEFAULTS,
  LIMITS,
  TEMPLATE_VERSION,
  type Content,
  type Element,
  type FontSpec,
  type HorizontalAlign,
  type LineElement,
  type NormalizedElement,
  type NormalizedFontSpec,
  type NormalizedQrElement,
  type NormalizedTemplate,
  type NormalizedTextElement,
  type PrintRotation,
  type QrElement,
  type QrLevel,
  type Shape,
  type Template,
  type TextElement,
  type TextFit,
  type VerticalAlign,
} from "./schema/types.js";
export type { IssueCode, TemplateIssue } from "./schema/issues.js";
export { validateTemplate, type ValidateOptions, type ValidationResult } from "./schema/validate.js";
export type { RenderData } from "./binding.js";
export { render, type RenderOptions, type RenderResult, type RenderWarning } from "./render.js";
export { turn, type RgbaImage } from "./rotate.js";
export { TemplateError } from "./errors.js";
export { loadFonts, type FontRegistry } from "./fonts/registry.js";
export { bundledFonts } from "./fonts/bundled.js";
export type { CanvasLike, Context2DLike, FontSource, RenderEnvironment } from "./environment/types.js";
export { browserEnvironment } from "./environment/browser.js";
