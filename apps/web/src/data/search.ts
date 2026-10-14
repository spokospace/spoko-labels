import { cell, type DataTable } from "./table.js";

// Searching the rows of a source: any column, ignoring case and diacritics ("lodz" finds "Łódź").

// Letters that Unicode does not split into a base letter and a mark, so NFD leaves them as they are.
const UNSPLIT: Readonly<Record<string, string>> = { ł: "l", đ: "d", ø: "o", ß: "ss", æ: "ae", œ: "oe", ı: "i" };

/** Text folded for comparing: lower case, without diacritics. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[łđøßæœı]/g, (ch) => UNSPLIT[ch] ?? ch);
}

/** Each row's cells folded into one string, built once per source. */
export function searchIndex(table: Pick<DataTable, "columns" | "rows">): string[] {
  return table.rows.map((row) => fold(table.columns.map((c) => cell(row, c)).join("\n")));
}

/**
 * The indexes of the rows that match `query`: every word of the query appears in some cell of the row. An
 * empty query matches every row.
 */
export function search(index: readonly string[], query: string): number[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches: number[] = [];
  index.forEach((text, i) => {
    if (words.every((w) => text.includes(w))) matches.push(i);
  });
  return matches;
}
