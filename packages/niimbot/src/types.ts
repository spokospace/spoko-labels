import type { IssueCode, Template, TemplateIssue } from "@spokospace/labels-render";

/**
 * One template as the NIIMBOT desktop app stores it: the input of `importTemplates()`. Every field is read
 * defensively, so a host may build it from any source; `extractTemplates()` builds it from
 * the app's database.
 */
export interface NiimbotTemplate {
  name?: string;
  /** Label size in mm, when the source has it. */
  width?: number;
  height?: number;
  /** Names of the label roll, for example "T50*30-230WHITE"; the size is read from them when `width`/`height` are missing. */
  rollNames?: string[];
  /** As found in the source; used only to pick the newest of several copies. */
  updatedAt?: string;
  /** Niimbot elements: objects with `type`, `x`, `y`, `width`, `height` (mm) and type-specific keys. */
  elements: unknown[];
}

export interface ImportOptions {
  /** Font code to family name, for example `{ ZT123: "My Font" }`; overrides the built-in table. */
  fonts?: Readonly<Record<string, string>>;
  /** The app's own font catalogue (code to family name), used for codes missing from both tables. */
  fontCatalog?: Readonly<Record<string, string>>;
  /** Label size in mm, used only when a template has neither an explicit size nor a readable roll name. */
  defaultSize?: { width: number; height: number };
}

export type ImportWarningCode =
  | "unsupported-element"
  | "rotated-element"
  | "unsupported-style"
  | "unknown-font"
  | "unrecognized-binding"
  | "value-clamped"
  | "invalid-element";

export type ImportFailureCode = "invalid-input" | "unknown-size" | "invalid-template";

/** Which input template a result belongs to: its position in the input array and its name. */
export interface ImportSource {
  index: number;
  name?: string;
}

export interface ImportWarning {
  code: ImportWarningCode;
  /** JSON pointer into the Niimbot input template, for example "/elements/4/fontStyle". */
  path: string;
  /** For `unsupported-style`: what was approximated, for example "underline" or "adaptive". */
  feature?: string;
  /** For `invalid-element`: why the validator rejected the converted element. */
  issue?: IssueCode;
}

export interface ImportedTemplate {
  source: ImportSource;
  template: Template;
  warnings: ImportWarning[];
}

export interface ImportFailure {
  source: ImportSource;
  code: ImportFailureCode;
  /** For `invalid-template`: the validator's errors. */
  issues?: TemplateIssue[];
}

export interface ImportResult {
  templates: ImportedTemplate[];
  failures: ImportFailure[];
}

export type ExtractWarningCode = "no-templates-found" | "duplicate-template";

export interface ExtractWarning {
  code: ExtractWarningCode;
  /** For `duplicate-template`: how many copies with different content were dropped. */
  count?: number;
}

export interface ExtractResult {
  /** The templates found, in file order, with only the element keys `importTemplates()` reads. */
  templates: NiimbotTemplate[];
  /** The app's font catalogue as found in the file: font code to family name, for example "ZT021" → "Inconsolata". */
  fontCatalog: Readonly<Record<string, string>>;
  warnings: ExtractWarning[];
}
