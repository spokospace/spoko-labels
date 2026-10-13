import { get, isObject, type Json } from "../convert/context.js";
import type { ExtractResult, ExtractWarning, NiimbotTemplate } from "../types.js";

// A defensive scan of the NIIMBOT app's Isar database (see the import spec, "Observed source format"). It
// never parses the file as a whole: it looks for JSON element arrays, then reads the template's metadata from
// bounded windows around each one. Nothing here depends on Isar's binary layout beyond what the spec records.

/** Largest file accepted. The real database is about 5 MB; the cap bounds the work. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** Largest JSON value parsed from the file. */
export const MAX_JSON_BYTES = 256 * 1024;
/** Deeper nesting is not something the app writes; giving up early keeps scans of binary noise short. */
const MAX_DEPTH = 32;
const BEFORE_WINDOW = 2 * 1024;
const AFTER_WINDOW = 4 * 1024;
const NAME_SKIP = 8;
const NAME_MIN = 2;
const NAME_MAX = 200;
const FAMILY_MAX = 100;

const bytesOf = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));
const ARRAY_OF_OBJECTS = bytesOf('[{"');
const RECORD_MARKER = bytesOf("[0,0,0,0]");
const FONT_CODE = bytesOf('"code":"ZT');
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const TIMESTAMP = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g;

/** Bytes that may appear in JSON outside a string. Anything else ends a candidate at once. */
const JSON_BYTE = new Uint8Array(256);
for (const c of ' \t\n\r[]{},:"0123456789+-.eEtrufalsn') JSON_BYTE[c.charCodeAt(0)] = 1;

const decoder = new TextDecoder("utf-8", { fatal: true });
const latin1 = new TextDecoder("latin1");

/** Only the keys `importTemplates()` reads leave the scanner; every other app key (ids, image data, URLs) is dropped. */
const ELEMENT_KEYS = [
  "type", "x", "y", "width", "height", "rotate", "value", "dataBind", "fontCode", "fontSize", "fontStyle",
  "letterSpacing", "wordSpacing", "lineSpacing", "textAlignHorizonral", "textAlignHorizontal", "textAlignVertical",
  "lineBreakMode", "textStyle", "boxStyle", "colorReverse", "typesettingMode", "codeType", "correctLevel", "isLive",
  "isForm", "lineWidth", "lineType",
] as const;
const STRING_LISTS = new Set(["fontStyle", "textStyle"]);
const GEOMETRY = ["x", "y", "width", "height"] as const;

/** Position of `pattern` in `bytes[from, to)`, or -1. */
function find(bytes: Uint8Array, pattern: Uint8Array, from: number, to = bytes.length): number {
  const last = Math.min(to, bytes.length) - pattern.length;
  const first = pattern[0] as number;
  for (let i = bytes.indexOf(first, from); i !== -1 && i <= last; i = bytes.indexOf(first, i + 1)) {
    let j = 1;
    while (j < pattern.length && bytes[i + j] === pattern[j]) j++;
    if (j === pattern.length) return i;
  }
  return -1;
}

/**
 * Bytes of bracket matching allowed per byte of file. Real files spend a small multiple of their size; only
 * crafted text full of unclosed `[{"` could spend more, and its scan stops early instead of running for minutes.
 */
const BUDGET_PER_BYTE = 8;

/** What is left of the matching budget, shared by every scan of one file. */
interface Budget {
  left: number;
}

/**
 * End (exclusive) of the JSON array or object that starts at `start`: brackets are counted outside strings,
 * strings and escapes are tracked. -1 when it does not close within `MAX_JSON_BYTES`, nests too deep, or meets
 * a byte that cannot be JSON (raw control bytes, non-ASCII outside a string).
 */
function jsonEnd(bytes: Uint8Array, start: number, budget: Budget): number {
  const limit = Math.min(bytes.length, start + MAX_JSON_BYTES);
  let depth = 0;
  let inString = false;
  let i = start;
  let end = -1;
  for (; i < limit; i++) {
    const b = bytes[i] as number;
    if (inString) {
      if (b === QUOTE) inString = false;
      else if (b === BACKSLASH) i++;
      else if (b < 0x20) break;
    } else if (!JSON_BYTE[b]) {
      break;
    } else if (b === QUOTE) {
      inString = true;
    } else if (b === OPEN_BRACKET || b === OPEN_BRACE) {
      if (++depth > MAX_DEPTH) break;
    } else if (b === CLOSE_BRACKET || b === CLOSE_BRACE) {
      if (--depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  budget.left -= i - start + 1;
  return end;
}

function parse(bytes: Uint8Array, start: number, end: number): unknown {
  try {
    return JSON.parse(decoder.decode(bytes.subarray(start, end)));
  } catch {
    return undefined;
  }
}

const isElement = (value: unknown): value is Json =>
  isObject(value) && typeof get(value, "type") === "string" && GEOMETRY.every((k) => typeof get(value, k) === "number");

/**
 * The element with only the keys the converter reads. A non-scalar where a scalar is read becomes `{}`, so the
 * converter reports what it would have for the original while none of its content leaves the scanner. A bound
 * element keeps the length of `dataBind` but not its data-source id and sheet name.
 */
function whitelist(raw: Json): Json {
  const out: Json = {};
  for (const key of ELEMENT_KEYS) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    if (key === "dataBind") {
      if (Array.isArray(value)) out[key] = value.map(() => "");
    } else if (STRING_LISTS.has(key) && Array.isArray(value)) {
      out[key] = value.filter((v) => typeof v === "string");
    } else {
      out[key] = value !== null && typeof value === "object" ? {} : value;
    }
  }
  return out;
}

/** Byte length of the printable UTF-8 character at `i` (no control characters, valid encoding), or 0. */
function printableAt(bytes: Uint8Array, i: number): number {
  const b = bytes[i];
  if (b === undefined) return 0;
  if (b < 0x80) return b >= 0x20 && b !== 0x7f ? 1 : 0;
  const n = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc2 ? 2 : 0;
  if (n === 0 || b > 0xf4) return 0;
  let cp = b & (0xff >> (n + 1));
  for (let k = 1; k < n; k++) {
    const c = bytes[i + k];
    if (c === undefined || (c & 0xc0) !== 0x80) return 0;
    cp = (cp << 6) | (c & 0x3f);
  }
  const min = [0, 0, 0xa0, 0x800, 0x10000][n] as number;
  if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return 0;
  return n;
}

/**
 * The template name after the record marker: skip at most 8 bytes that are not printable UTF-8, then take the
 * run of printable UTF-8 that follows (2 to 200 bytes). The app stores the name's byte length in that prefix and
 * the next field can start with a printable byte, so when the prefix's last non-zero byte fits the run, the run
 * is cut to it. Without such a byte the whole run is the name; the scan never requires the prefix format.
 */
function readName(bytes: Uint8Array, from: number): string | undefined {
  let start = from;
  let lengthHint = 0;
  while (start < from + NAME_SKIP && printableAt(bytes, start) === 0) {
    if (bytes[start]) lengthHint = bytes[start] as number;
    start++;
  }
  let end = start;
  for (let n = printableAt(bytes, end); n > 0 && end + n - start <= NAME_MAX; n = printableAt(bytes, end)) {
    if (lengthHint > 0 && end - start === lengthHint) break;
    end += n;
  }
  if (end - start < NAME_MIN) return undefined;
  const name = decoder.decode(bytes.subarray(start, end)).trim();
  return name.length > 0 ? name : undefined;
}

/** The last `YYYY-MM-DD HH:MM:SS` in `bytes[from, to)`. */
function lastTimestamp(bytes: Uint8Array, from: number, to: number): string | undefined {
  return latin1.decode(bytes.subarray(from, to)).match(TIMESTAMP)?.at(-1);
}

/** The roll names from the first `labelNames` array (objects with a string `name`) in `bytes[from, to)`. */
function rollNames(bytes: Uint8Array, from: number, to: number, budget: Budget): string[] | undefined {
  for (let p = find(bytes, ARRAY_OF_OBJECTS, from, to); p !== -1; p = find(bytes, ARRAY_OF_OBJECTS, p + 1, to)) {
    const end = jsonEnd(bytes, p, budget);
    if (end === -1) continue;
    const value = parse(bytes, p, end);
    if (!Array.isArray(value) || value.length === 0) continue;
    const names = value.map((v) => (isObject(v) ? get(v, "name") : undefined));
    if (names.every((n): n is string => typeof n === "string")) {
      const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return undefined;
}

/** Font code → family name from the app's catalogue objects (`{ …, "code": "ZT…", …, "fileName": … }`). */
function fontCatalog(bytes: Uint8Array, budget: Budget): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (let p = find(bytes, FONT_CODE, 0); p !== -1 && budget.left > 0; p = find(bytes, FONT_CODE, p + 1)) {
    const start = bytes.lastIndexOf(OPEN_BRACE, p);
    if (start === -1 || start < p - BEFORE_WINDOW) continue;
    const end = jsonEnd(bytes, start, budget);
    if (end <= p) continue;
    const value = parse(bytes, start, end);
    if (!isObject(value)) continue;
    const code = get(value, "code");
    const fileName = get(value, "fileName");
    if (typeof code !== "string" || !code.startsWith("ZT") || code.length > 32 || typeof fileName !== "string") continue;
    const family = fileName.trim().slice(0, FAMILY_MAX);
    if (family.length > 0 && !Object.hasOwn(catalog, code)) catalog[code] = family;
  }
  return catalog;
}

interface Found {
  start: number;
  end: number;
  elements: Json[];
}

interface Candidate {
  start: number;
  template: NiimbotTemplate;
  /** Elements and roll names as JSON: what decides whether two copies are the same. */
  content: string;
}

/** Element arrays: `[{"…` that closes within the cap and parses to objects with a type and a box. */
function elementArrays(bytes: Uint8Array, budget: Budget): Found[] {
  const found: Found[] = [];
  let p = find(bytes, ARRAY_OF_OBJECTS, 0);
  while (p !== -1 && budget.left > 0) {
    const end = jsonEnd(bytes, p, budget);
    if (end === -1) {
      p = find(bytes, ARRAY_OF_OBJECTS, p + 1);
      continue;
    }
    const value = parse(bytes, p, end);
    if (Array.isArray(value) && value.every(isElement)) found.push({ start: p, end, elements: value });
    // A closed value is skipped whole: arrays nested in it are never records of their own.
    p = find(bytes, ARRAY_OF_OBJECTS, end);
  }
  return found;
}

function records(bytes: Uint8Array, budget: Budget): Candidate[] {
  const arrays = elementArrays(bytes, budget);
  const out: Candidate[] = [];
  for (const [i, array] of arrays.entries()) {
    const windowEnd = Math.min(array.end + AFTER_WINDOW, arrays[i + 1]?.start ?? bytes.length);
    const marker = find(bytes, RECORD_MARKER, array.end, windowEnd);
    // The marker is what makes this a NIIMBOT record rather than JSON that merely looks like elements.
    if (marker === -1) continue;
    const name = readName(bytes, marker + RECORD_MARKER.length);
    const rolls = rollNames(bytes, array.end, windowEnd, budget);
    const updatedAt = lastTimestamp(bytes, Math.max(array.start - BEFORE_WINDOW, arrays[i - 1]?.end ?? 0), array.start);
    const elements = array.elements.map(whitelist);
    const template: NiimbotTemplate = {
      ...(name !== undefined && { name }),
      ...(rolls !== undefined && { rollNames: rolls }),
      ...(updatedAt !== undefined && { updatedAt }),
      elements,
    };
    out.push({ start: array.start, template, content: JSON.stringify([elements, rolls ?? null]) });
  }
  return out;
}

/** Negative when `a` is newer; a missing timestamp counts as oldest. */
const newest = (a: Candidate, b: Candidate): number => {
  const x = a.template.updatedAt ?? "";
  const y = b.template.updatedAt ?? "";
  return x > y ? -1 : x < y ? 1 : 0;
};

/**
 * Collapses copies. Identical copies (same name, elements and roll) collapse silently; for the same name with
 * different content the newest timestamp wins, and every copy with other content counts as dropped. Unnamed records
 * collapse only when identical.
 */
function deduplicate(all: Candidate[]): { kept: Candidate[]; dropped: number } {
  const groups = new Map<string, Candidate[]>();
  for (const r of all) {
    const key = r.template.name !== undefined ? `name:${r.template.name}` : `content:${r.content}`;
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  const kept: Candidate[] = [];
  let dropped = 0;
  for (const group of groups.values()) {
    const winner = group.reduce((a, b) => (newest(b, a) < 0 ? b : a));
    kept.push(winner);
    dropped += group.filter((r) => r.content !== winner.content).length;
  }
  kept.sort((a, b) => a.start - b.start);
  return { kept, dropped };
}

/**
 * Reads the templates and the font catalogue out of the NIIMBOT desktop app's database file
 * (`niimbot_db.isar`). Runs anywhere (browser or Node) on the bytes it is given and sends nothing anywhere.
 * Never throws on data: bytes it does not recognise give no templates and `no-templates-found`.
 *
 * @throws {TypeError} when `bytes` is not a `Uint8Array`
 * @throws {RangeError} when `bytes` is larger than 64 MB
 */
export function extractTemplates(bytes: Uint8Array): ExtractResult {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("extractTemplates expects a Uint8Array");
  if (bytes.length > MAX_FILE_BYTES) throw new RangeError(`File larger than ${MAX_FILE_BYTES} bytes`);
  const budget: Budget = { left: BUDGET_PER_BYTE * bytes.length + 4 * MAX_JSON_BYTES };
  const { kept, dropped } = deduplicate(records(bytes, budget));
  const warnings: ExtractWarning[] = [];
  if (kept.length === 0) warnings.push({ code: "no-templates-found" });
  if (dropped > 0) warnings.push({ code: "duplicate-template", count: dropped });
  return {
    templates: kept.map((r) => r.template),
    fontCatalog: Object.freeze(fontCatalog(bytes, budget)),
    warnings,
  };
}
