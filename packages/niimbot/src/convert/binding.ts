import type { Content } from "@spokospace/labels-render";
import { get, present, type ElementContext } from "./context.js";

/** "C0": the letters are a spreadsheet column of the data source, the digits are ignored. */
const COLUMN_REFERENCE = /^([A-Z]{1,2})\d+$/;

/** Spreadsheet column letters to a 0-based index: A = 0, Z = 25, AA = 26. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/**
 * The content of a text or QR element. A non-empty `dataBind` with a column reference in `value` binds by
 * position; anything else is static text.
 */
export function convertContent(ctx: ElementContext): Content {
  const value = get(ctx.raw, "value");
  const dataBind = get(ctx.raw, "dataBind");
  const bound = Array.isArray(dataBind) && dataBind.length > 0;

  // Text, numbers and booleans become text; anything else (objects, arrays, functions) is emptied, warned.
  const scalar = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  if (!scalar && present(value)) {
    ctx.approximated("value", "value");
    return { text: "" };
  }
  const text = scalar ? String(value) : "";

  if (!bound) return { text };
  const match = COLUMN_REFERENCE.exec(text);
  if (match?.[1] !== undefined) return { bindIndex: columnIndex(match[1]) };
  ctx.warn("unrecognized-binding", "value");
  return { text };
}
