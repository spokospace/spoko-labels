import { makeTable, MAX_BYTES, uniqueNames, type DataTable } from "./table.js";

// An xlsx file in the browser: the first sheet, its first row as the column names, every cell as text (A3).
// read-excel-file (and fflate) are loaded only when a file is opened.

/** "load-failed": the reader itself could not be downloaded (offline, or a new deploy removed the old chunk). */
export type XlsxErrorCode = "too-large" | "not-xlsx" | "no-rows" | "load-failed";

export type XlsxResult = { ok: true; table: DataTable } | { ok: false; error: XlsxErrorCode };

/** The part of read-excel-file this module uses. */
export interface SheetReader {
  readSheet(input: ArrayBuffer): Promise<unknown[][]>;
}

const loadReader = async (): Promise<SheetReader> => {
  const { readSheet } = await import("read-excel-file/browser");
  return { readSheet: (input) => readSheet(input) as Promise<unknown[][]> };
};

/** "Column C" for a column without a name. */
const defaultEmptyName = (letter: string): string => `Column ${letter}`;

/**
 * Reads the first sheet of an xlsx file. A file over `MAX_BYTES` is not read at all. Never throws for a bad
 * file: a zip that is not a spreadsheet, a password-protected file (not a zip at all) and an old .xls file are
 * all "not-xlsx".
 */
export async function readXlsx(
  file: Blob,
  options: { emptyName?: (letter: string) => string; load?: () => Promise<SheetReader>; maxUnpacked?: number } = {},
): Promise<XlsxResult> {
  if (file.size > MAX_BYTES) return { ok: false, error: "too-large" };
  let modules: [typeof import("fflate"), SheetReader];
  try {
    modules = await Promise.all([import("fflate"), (options.load ?? loadReader)()]);
  } catch {
    return { ok: false, error: "load-failed" };
  }
  const [fflate, reader] = modules;
  let sheet: unknown[][];
  try {
    const stored = storedZip(fflate, new Uint8Array(await file.arrayBuffer()), options.maxUnpacked ?? MAX_UNPACKED_BYTES);
    if (!stored) return { ok: false, error: "too-large" };
    sheet = await reader.readSheet(stored);
  } catch {
    return { ok: false, error: "not-xlsx" };
  }
  return tableFromSheet(sheet, options.emptyName ?? defaultEmptyName);
}

/** The unpacked size a file may have. It is held about three times over while reading, so it stays phone-sized. */
export const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
/** Compressed bytes fed to the inflater per step, which bounds what one step can unpack (~1000:1 at most). */
const FEED_BYTES = 16 * 1024;

/**
 * The same archive with its XML parts stored uncompressed, or null when they unpack to more than `maxUnpacked`
 * (a zip bomb). The bytes actually inflated are counted, never the sizes the zip headers claim.
 */
function storedZip(
  { Unzip, UnzipInflate, zipSync }: typeof import("fflate"),
  bytes: Uint8Array,
  maxUnpacked: number,
): ArrayBuffer | null {
  // Repacked uncompressed because read-excel-file's async fflate unzip inflates big parts in a blob: Web
  // Worker, which the CSP (no worker-src) blocks; stored parts are only sliced, on the page.
  const parts: Record<string, Uint8Array> = Object.create(null);
  let unpacked = 0;
  let tooLarge = false;
  let failure: unknown = null;
  const unzip = new Unzip((file) => {
    // Only the parts read-excel-file reads (it ignores anything else): skips images and other media.
    if (!/\.(xml|rels)$/i.test(file.name)) return;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, data, final) => {
      if (error) failure ??= error;
      if (error || tooLarge) return;
      unpacked += data.length;
      if (unpacked > maxUnpacked) {
        tooLarge = true;
        return;
      }
      chunks.push(data);
      if (final) parts[file.name] = concat(chunks);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let at = 0; at < bytes.length && !tooLarge && failure === null; at += FEED_BYTES) {
    unzip.push(bytes.subarray(at, at + FEED_BYTES), at + FEED_BYTES >= bytes.length);
  }
  if (tooLarge) return null;
  if (failure !== null) throw failure;
  const zipped = zipSync(parts, { level: 0 });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0] as Uint8Array;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** A cell as text: numbers with `String(n)`, dates as `YYYY-MM-DD` (UTC: xlsx dates have no time zone). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return String(value);
}

/** The sheet's rows as a table: the first row names the columns; rows with no text at all are skipped. */
export function tableFromSheet(sheet: readonly (readonly unknown[])[], emptyName: (letter: string) => string = defaultEmptyName): XlsxResult {
  const text = sheet.map((row) => row.map(cellText));
  // The table is as wide as the last cell that holds something, in any row.
  const width = text.reduce((max, row) => Math.max(max, row.findLastIndex((v) => v !== "") + 1), 0);
  const [header, ...body] = text;
  const rows = body.filter((row) => row.some((v) => v !== ""));
  if (!header || width === 0 || rows.length === 0) return { ok: false, error: "no-rows" };

  const columns = uniqueNames(Array.from({ length: width }, (_, i) => header[i] ?? ""), emptyName);
  return { ok: true, table: makeTable(columns, rows, (row, _column, i) => row[i] ?? "") };
}
