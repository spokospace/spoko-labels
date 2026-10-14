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
  /** The source had more columns than `MAX_COLUMNS`; only the first ones were kept. */
  columnsTruncated?: boolean;
}

/** At most this many rows are loaded from a file or an API (A14). */
export const MAX_ROWS = 10_000;
/** At most this many columns are kept: 10,000 rows of thousands of sparse keys would not fit a phone. */
export const MAX_COLUMNS = 500;
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
 * A table of at most `MAX_ROWS` rows and `MAX_COLUMNS` columns, with `truncated` / `columnsTruncated` set when
 * some were left out. `cellOf` gives each cell's text, by column name and position. Rows are sparse: an empty
 * cell is not stored, and `cell()` reads it as "".
 */
export function makeTable<T>(columns: readonly string[], items: readonly T[], cellOf: (item: T, column: string, index: number) => string): DataTable {
  const kept = columns.slice(0, MAX_COLUMNS);
  const rows = items.slice(0, MAX_ROWS).map((item) =>
    makeRow(kept.flatMap((column, i) => {
      const text = cellOf(item, column, i);
      return text === "" ? [] : [[column, text] as const];
    })),
  );
  return { columns: kept, rows, truncated: items.length > MAX_ROWS, ...(columns.length > MAX_COLUMNS && { columnsTruncated: true }) };
}

/**
 * The keys of the first `MAX_ROWS` objects, in order of first appearance; it stops one past `MAX_COLUMNS`, so
 * makeTable can tell that columns were cut without collecting them all.
 */
export function unionColumns(items: readonly object[]): string[] {
  const columns = new Set<string>();
  for (const item of items.slice(0, MAX_ROWS)) {
    for (const key of Object.keys(item)) {
      columns.add(key);
      if (columns.size > MAX_COLUMNS) return [...columns];
    }
  }
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
