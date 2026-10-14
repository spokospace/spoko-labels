import type { ErrorCode } from "@spokospace/labels-core";
import type { PrintOutcome, SessionState } from "@spokospace/labels-embed";
import type { ExtractWarningCode, ImportFailureCode, ImportWarningCode } from "@spokospace/labels-niimbot";
import type { IssueCode } from "@spokospace/labels-render";

export type Lang = "pl" | "en";
export const LANGS: readonly Lang[] = ["pl", "en"];

/** The codes labels-embed reports beyond labels-core's `ErrorCode` ("template", "render", "internal"). */
export type EmbedCode = Exclude<
  NonNullable<PrintOutcome["error"]>["code"] | NonNullable<Extract<SessionState, { kind: "disconnected" }>["error"]>,
  ErrorCode
>;

/**
 * The `feature` names labels-niimbot emits with `unsupported-style` today. The package types `feature` as a
 * plain string, so a name missing here is shown raw in a generic sentence instead of failing the type check.
 */
export type StyleFeature =
  | "value"
  | "rotate"
  | "dashed"
  | "reverse"
  | "level"
  | "underline"
  | "italic"
  | "word-spacing"
  | "align"
  | "vertical-align"
  | "adaptive"
  | "auto-height";

/**
 * Plain words for every code the packages report. Each is a `Record` over the package's own union, so
 * `pnpm typecheck` fails when a package adds a code the app does not word yet.
 */
export interface CodeDictionary {
  errors: Record<ErrorCode | EmbedCode, string>;
  issues: Record<IssueCode, string>;
  importWarnings: Record<ImportWarningCode, string>;
  importFailures: Record<ImportFailureCode, string>;
  extractWarnings: Record<ExtractWarningCode, string>;
  styleFeatures: Record<StyleFeature, string>;
}
