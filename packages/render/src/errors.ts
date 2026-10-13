import type { TemplateIssue } from "./schema/issues.js";

/** `render()` was given a template it cannot render at all (a template-level validation error). */
export class TemplateError extends Error {
  readonly issues: TemplateIssue[];

  constructor(issues: TemplateIssue[]) {
    const first = issues.find((i) => i.severity === "error");
    super(`Invalid template${first ? `: ${first.code} at "${first.path}"` : ""}`);
    this.name = "TemplateError";
    this.issues = issues;
  }
}
