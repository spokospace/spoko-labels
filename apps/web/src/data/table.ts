// The shape every data source is loaded into: column names in source order, and rows of text keyed by them.
// Column names come from files and APIs, so a name can be "__proto__" or "constructor". Rows are built with
// Object.fromEntries, which defines each key as an own property; nothing is ever assigned into `{}`, and
// lookups go through Object.hasOwn.

/** One row of a source: text cells keyed by column name (own properties only). */
export type Row = Readonly<Record<string, string>>;

export interface DataTable {
  columns: readonly string[];
  rows: readonly Row[];
  /** The source had more rows than `MAX_ROWS`; only the first ones were kept. */
  truncated: boolean;
}

/** At most this many rows are loaded from a file or an API (A14). */
export const MAX_ROWS = 10_000;
/** The size limit for an xlsx file and for an API response (A14). */
export const MAX_BYTES = 10 * 1024 * 1024;

/** A cell of a row, or "" when the row has no such column. */
export function cell(row: Row, column: string): string {
  return Object.hasOwn(row, column) ? (row[column] as string) : "";
}

/** Builds a row from its cells, in column order; "__proto__" stays an ordinary key. */
export function makeRow(entries: Iterable<readonly [string, string]>): Row {
  return Object.fromEntries(entries);
}

/**
 * A table of at most `MAX_ROWS` rows, with `truncated` set when items were left out. `cellOf` gives each cell's
 * text, by column name and position.
 */
export function makeTable<T>(columns: readonly string[], items: readonly T[], cellOf: (item: T, column: string, index: number) => string): DataTable {
  return {
    columns,
    rows: items.slice(0, MAX_ROWS).map((item) => makeRow(columns.map((column, i) => [column, cellOf(item, column, i)]))),
    truncated: items.length > MAX_ROWS,
  };
}

/** The keys of the first `limit` objects, in order of first appearance. */
export function unionColumns(items: readonly object[], limit = MAX_ROWS): string[] {
  const columns = new Set<string>();
  for (const item of items.slice(0, limit)) for (const key of Object.keys(item)) columns.add(key);
  return [...columns];
}

/** The spreadsheet letter of a 0-based column index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/**
 * Column names that are all different and none empty: an empty name becomes `emptyName(letter)` and a repeated
 * one gets a number, "Name (2)", skipping numbers already taken.
 */
export function uniqueNames(raw: readonly string[], emptyName: (letter: string) => string): string[] {
  const named = raw.map((name, i) => name.trim() || emptyName(columnLetter(i)));
  const taken = new Set<string>();
  const names: string[] = [];
  for (const name of named) {
    let unique = name;
    for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
    taken.add(unique);
    names.push(unique);
  }
  return names;
}
