import { validateTemplate, type Template } from "@spokospace/labels-render";
import { isObject } from "../data/api.js";
import { templateFields } from "../data/mapping.js";
import { columnLetter, makeRow, type Row } from "../data/table.js";
import { LANGS, t, type Lang } from "../i18n/index.js";
import { readStored, STORAGE_KEYS, writeStored } from "../storage.js";
import type { AppTemplate } from "./app-template.js";

// The templates the user imported from the NIIMBOT app, kept in localStorage with their name and import date
// (A7). Each has an id of its own (`imp-…`), so it never equals a built-in id. Reading is defensive: the stored
// JSON may be edited, truncated or written by a later version. An entry whose template no longer validates is
// listed as broken, so the user can remove it; anything that is not an entry at all is dropped.

export interface StoredTemplate {
  id: string;
  /** The name as imported, shown as text. */
  name: string;
  /** The import date, `YYYY-MM-DD`. */
  importedAt: string;
  template: Template;
}

/** A stored entry whose template fails `validateTemplate()`: shown with Remove, never rendered. */
export interface BrokenTemplate {
  id: string;
  name: string;
  importedAt: string;
}

export interface ImportedTemplates {
  templates: StoredTemplate[];
  broken: BrokenTemplate[];
}

export const IMPORTED_ID_PREFIX = "imp-";

/** A fresh id, `imp-` and 16 hex digits from the browser's random source. */
export function newImportedId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return IMPORTED_ID_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Today's date in local time, `YYYY-MM-DD`: what "Imported {date}" shows. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** An entry for a template just imported: a fresh id and today's date. */
export function newStoredTemplate(name: string, template: Template): StoredTemplate {
  return { id: newImportedId(), name, importedAt: today(), template };
}

/** The stored templates, read and validated; `broken` lists the entries that no longer validate. */
export function readImported(): ImportedTemplates {
  const result: ImportedTemplates = { templates: [], broken: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readStored(STORAGE_KEYS.importedTemplates) ?? "[]");
  } catch {
    return result;
  }
  if (!Array.isArray(parsed)) return result;
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!isObject(entry) || typeof entry.id !== "string" || !entry.id.startsWith(IMPORTED_ID_PREFIX) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const name = typeof entry.name === "string" ? entry.name : "";
    const importedAt = typeof entry.importedAt === "string" ? entry.importedAt : "";
    if (validateTemplate(entry.template).template) result.templates.push({ id: entry.id, name, importedAt, template: entry.template as Template });
    else result.broken.push({ id: entry.id, name, importedAt });
  }
  return result;
}

/** Writes the list; false when the browser does not let the page store it (it then lasts for this tab). */
export function writeImported(templates: readonly StoredTemplate[]): boolean {
  return writeStored(STORAGE_KEYS.importedTemplates, JSON.stringify(templates));
}

/**
 * One sample row per language for a template without sample data of its own: each named field holds its own
 * name, and each column a positional field reads ("Column C") holds its name too, so the preview shows which
 * field goes where. The columns before the last bound one are present and empty, so "Use sample data" lines
 * the positions up the way a sheet would.
 */
export function sampleRowsFor(template: Template): Readonly<Record<Lang, readonly Row[]>> {
  const fields = templateFields(template);
  const positions = fields.flatMap((f) => (f.kind === "position" ? [f.index] : []));
  const width = positions.length > 0 ? Math.max(...positions) + 1 : 0;
  const rowFor = (lang: Lang): Row =>
    makeRow([
      ...fields.flatMap((f): [string, string][] => (f.kind === "name" ? [[f.name, f.name]] : [])),
      ...Array.from({ length: width }, (_, i): [string, string] => {
        const column = t("xlsxColumn", { letter: columnLetter(i) }, lang);
        return [column, positions.includes(i) ? column : ""];
      }),
    ]);
  const rows = {} as Record<Lang, readonly Row[]>;
  for (const lang of LANGS) rows[lang] = [rowFor(lang)];
  return rows;
}

export function toAppTemplate(stored: StoredTemplate): AppTemplate {
  return { id: stored.id, name: { text: stored.name }, template: stored.template, sampleRows: sampleRowsFor(stored.template) };
}

export interface TemplateStore {
  readonly templates: readonly StoredTemplate[];
  readonly broken: readonly BrokenTemplate[];
  /** False when the browser refused the last write: the templates last for this tab only. */
  readonly saved: boolean;
  /** An imported template by its id, as the app works with it (converted once per entry). */
  find(id: string): AppTemplate | undefined;
  add(entries: readonly StoredTemplate[]): void;
  /** Removes a template or a broken entry; nothing happens for an unknown id. */
  remove(id: string): void;
}

/** The imported templates of this browser, read once and written back after every change. */
export function templateStore(): TemplateStore {
  let { templates, broken } = readImported();
  let saved = true;
  const converted = new Map<string, AppTemplate>();
  return {
    get templates() {
      return templates;
    },
    get broken() {
      return broken;
    },
    get saved() {
      return saved;
    },
    find(id) {
      let app = converted.get(id);
      if (!app) {
        const stored = templates.find((s) => s.id === id);
        if (!stored) return undefined;
        app = toAppTemplate(stored);
        converted.set(id, app);
      }
      return app;
    },
    add(entries) {
      templates = [...templates, ...entries];
      saved = writeImported(templates);
    },
    remove(id) {
      templates = templates.filter((s) => s.id !== id);
      broken = broken.filter((b) => b.id !== id);
      converted.delete(id);
      saved = writeImported(templates);
    },
  };
}
