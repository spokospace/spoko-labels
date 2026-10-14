import type { Element, NormalizedElement } from "@spokospace/labels-render";
import { fold } from "./search.js";
import { cell, makeRow, type Row } from "./table.js";

// Matching the source's columns to the template's fields (A6). The source rows are never changed: the app
// builds the input that render() (and, in Phase 3, printLabels) receives from the pickers.
// - A field bound by name (`bind`) gets a row key of that name, holding the picked column's value.
// - A field bound by position (`bindIndex`, NIIMBOT imports) is looked up through `columns`: each position gets
//   a key of its own ("\u0000pos-0", …), so it can never collide with a bind name or a source column name.

export type Field = { kind: "name"; name: string } | { kind: "position"; index: number };

/** A stable key for a field, for the mapping and the picker elements. */
export function fieldKey(field: Field): string {
  return field.kind === "name" ? `name:${field.name}` : `position:${field.index}`;
}

/** Each field's picked column; a missing or null entry is "no column". */
export type Mapping = ReadonlyMap<string, string | null>;

/**
 * The template's data fields, in element order, each once: the `bind` names, then the `bindIndex` positions
 * of elements without a name (render tries `bind` first), in position order.
 */
export function templateFields(template: { readonly elements: readonly (Element | NormalizedElement)[] }): Field[] {
  const names: string[] = [];
  const positions: number[] = [];
  for (const element of template.elements) {
    if (!("content" in element)) continue;
    const { content } = element;
    if ("bind" in content) {
      if (!names.includes(content.bind)) names.push(content.bind);
    } else if ("bindIndex" in content && !positions.includes(content.bindIndex)) {
      positions.push(content.bindIndex);
    }
  }
  return [
    ...names.map((name): Field => ({ kind: "name", name })),
    ...positions.sort((a, b) => a - b).map((index): Field => ({ kind: "position", index })),
  ];
}

/**
 * The automatic picks: a named field takes the column of the same name, ignoring case and diacritics (an exact
 * match wins); a positional field takes the source column at its position, as the NIIMBOT app reads its
 * sheets ("C0" is column C).
 */
export function autoMapping(fields: readonly Field[], columns: readonly string[]): Map<string, string | null> {
  const mapping = new Map<string, string | null>();
  for (const field of fields) {
    let column: string | undefined;
    if (field.kind === "name") {
      column = columns.find((c) => c === field.name) ?? columns.find((c) => fold(c.trim()) === fold(field.name.trim()));
    } else {
      column = columns[field.index];
    }
    mapping.set(fieldKey(field), column ?? null);
  }
  return mapping;
}

/** The input for render() and printLabels: rows, plus the column order when the template binds by position. */
export interface MappedInput {
  rows: Row[];
  columns?: string[];
}

/** The row key a position is read from; the NUL makes it a name no bind name or file column uses. */
export const positionKey = (index: number): string => `\u0000pos-${index}`;

/**
 * Builds the input from the source rows and the picks. Every position up to the highest one gets its own key in
 * `columns`. A field with no pick, named or positional, has no key in the rows, so render reports
 * `missing-column` and the field prints empty.
 */
export function mapInput(fields: readonly Field[], mapping: Mapping, sourceColumns: readonly string[], rows: readonly Row[]): MappedInput {
  const picked = (field: Field): string | null => {
    const column = mapping.get(fieldKey(field));
    return column !== undefined && column !== null && sourceColumns.includes(column) ? column : null;
  };
  const named: { key: string; column: string }[] = [];
  const byPosition = new Map<number, string | null>();
  for (const field of fields) {
    const column = picked(field);
    if (field.kind === "position") byPosition.set(field.index, column);
    else if (column !== null) named.push({ key: field.name, column });
  }
  if (byPosition.size === 0) return { rows: rows.map((row) => makeRow(named.map(({ key, column }) => [key, cell(row, column)]))) };

  const length = Math.max(...byPosition.keys()) + 1;
  const columns = Array.from({ length }, (_, i) => positionKey(i));
  const positional = columns.flatMap((key, i) => {
    const column = byPosition.get(i);
    return column ? [{ key, column }] : [];
  });
  const entries = [...named, ...positional];
  return {
    rows: rows.map((row) => makeRow(entries.map(({ key, column }) => [key, cell(row, column)]))),
    columns,
  };
}
