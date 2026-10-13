/**
 * Stable machine-readable issue codes. Callers translate them into user-facing text; no human-readable
 * wording is part of the contract. Codes marked "render" are raised by the renderer (a later phase).
 */
export type IssueCode =
  | "invalid-type"
  | "required"
  | "out-of-range"
  | "unsupported-version"
  | "unknown-element"
  | "unknown-property"
  | "outside-label"
  | "outside-safe-area"
  | "outside-printable-area"
  // render
  | "missing-column"
  | "value-truncated"
  | "missing-font"
  | "missing-glyphs"
  | "text-overflow"
  | "qr-empty"
  | "qr-too-long"
  | "qr-too-small";

/** A non-fatal finding of `render()`: what and where (a JSON pointer into the input template). */
export interface RenderWarning {
  code: IssueCode;
  path: string;
}

export interface TemplateIssue {
  /** "error" removes the element it belongs to, or makes the whole template unusable. */
  severity: "error" | "warning";
  code: IssueCode;
  /** JSON pointer into the input, for example "/elements/3/font/size"; "" is the template itself. */
  path: string;
}
