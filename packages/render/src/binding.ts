import { LIMITS, type Content } from "./schema/types.js";

/** The data one label is rendered from: a row of cells, and the column order for positional bindings. */
export interface RenderData {
  row?: Readonly<Record<string, unknown>>;
  /** Column names in their source order; `bindIndex` looks a name up here. */
  columns?: readonly string[];
}

export interface ResolvedContent {
  value: string;
  /** The binding named no column of the row (`missing-column`). */
  missing: boolean;
  /** The text was longer than `LIMITS.maxTextLength` code points and was cut (`value-truncated`). */
  truncated: boolean;
}

/**
 * The string an element shows. `bind` is tried first, then `bindIndex` through `columns`. A name resolves
 * only through an own property of `row`, so names such as "constructor" or "__proto__" never read the
 * prototype. A resolved cell is converted with `String()`; `null` and `undefined` become "".
 *
 * Text (`kind: "text"`) is capped at `LIMITS.maxTextLength` code points. QR content is never cut, because a
 * shortened QR code would still scan, to a different value.
 */
export function resolveContent(content: Content, data: RenderData, kind: "text" | "qr"): ResolvedContent {
  let cell: { value: unknown } | undefined;
  if ("text" in content) {
    cell = { value: content.text };
  } else {
    const { row, columns } = data;
    if ("bind" in content) cell = lookup(row, content.bind);
    if (!cell && content.bindIndex !== undefined) cell = lookup(row, columns?.[content.bindIndex]);
  }

  const value = cell?.value === undefined || cell.value === null ? "" : String(cell.value);
  // A string of at most maxTextLength UTF-16 units cannot have more code points than that.
  if (kind === "text" && value.length > LIMITS.maxTextLength) {
    const cut = cutAtCodePoint(value, LIMITS.maxTextLength);
    if (cut !== undefined) return { value: cut, missing: !cell, truncated: true };
  }
  return { value, missing: !cell, truncated: false };
}

/** The first `max` code points of `value`, or `undefined` when it has no more than that. */
function cutAtCodePoint(value: string, max: number): string | undefined {
  let count = 0;
  let end = 0;
  for (const ch of value) {
    if (count === max) return value.slice(0, end);
    count++;
    end += ch.length;
  }
  return undefined;
}

function lookup(row: RenderData["row"], name: string | undefined): { value: unknown } | undefined {
  return row !== undefined && name !== undefined && Object.hasOwn(row, name) ? { value: row[name] } : undefined;
}
