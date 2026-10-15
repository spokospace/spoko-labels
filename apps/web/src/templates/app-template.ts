import type { Template } from "@spokospace/labels-render";
import { autoMapInput, type MappedInput } from "../data/mapping.js";
import type { Row } from "../data/table.js";
import { getLang, t, type Lang, type MessageKey } from "../i18n/index.js";

// What the template list, the Data panel and Print work with: a built-in template or one the user imported.

export interface AppTemplate {
  /**
   * Built-in ids are plain words (`product`); imported ids start with `imp-`, so the two never collide. Stable:
   * once deep links ship (`#template=<id>`), an id is not renamed or removed without a deprecation window.
   */
  id: string;
  /** A message key for a built-in template, or the name as imported, shown as text. */
  name: MessageKey | { text: string };
  template: Template;
  /** Rows keyed by the template's bind names (or its positional columns), written in each app language. */
  sampleRows: Readonly<Record<Lang, readonly Row[]>>;
}

/** The name shown in the list, in the current language. */
export function templateName(template: Pick<AppTemplate, "name">): string {
  return typeof template.name === "string" ? t(template.name) : template.name.text;
}

/** "50 × 30 mm", with "printed turned" for a template designed upright. */
export function templateSizeText(template: Template): string {
  return t(template.printRotation ? "templateSizeTurned" : "templateSize", template.size);
}

/**
 * The template's first sample row, mapped the way a loaded source is, so a template bound by position (an
 * import) gets its column order too. Null for a template without sample rows.
 */
export function sampleInput(template: Pick<AppTemplate, "template" | "sampleRows">, lang: Lang = getLang()): MappedInput | null {
  const sample = template.sampleRows[lang][0];
  return sample ? autoMapInput(template.template, [sample]) : null;
}
