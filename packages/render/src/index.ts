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
  type NormalizedLineElement,
  type NormalizedQrElement,
  type NormalizedTemplate,
  type NormalizedTextElement,
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
export { resolveContent, type RenderData, type ResolvedContent } from "./binding.js";
