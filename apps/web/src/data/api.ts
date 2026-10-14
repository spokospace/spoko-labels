import { makeTable, MAX_BYTES, unionColumns, type DataTable } from "./table.js";

// Rows from a JSON API the user names (A4, A5): GET only, no cookies, no custom headers, HTTPS only. The
// response is an array of objects, at the top level or at a dot path such as "data.items".

export type ApiErrorCode =
  | "invalid-url"
  | "insecure-url"
  /** fetch() threw a TypeError: CORS, or no connection at all (the browser does not say which). */
  | "cors"
  /** The connection broke while the body was read. */
  | "network"
  | "http-status"
  | "too-large"
  | "timeout"
  | "cancelled"
  | "not-json"
  /** No array at the top level (with no path) or at the path. */
  | "no-array"
  | "no-rows";

export type ApiError = {
  code: ApiErrorCode;
  /** For "http-status". */
  status?: number;
  /** For "no-array": the response's top-level keys, to help pick a path. */
  keys?: string[];
};

export type ApiResult = { ok: true; table: DataTable } | { ok: false; error: ApiError };

export const TIMEOUT_MS = 15_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * The URL to request, or why it cannot be. HTTPS only; `http://localhost` and `http://127.0.0.1` are accepted
 * only when `dev` is set (`vite dev`), so a developer can test against a local API. The deployed CSP allows
 * `https:` only either way.
 */
export function checkUrl(text: string, dev: boolean): { ok: true; url: URL } | { ok: false; error: ApiError } {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { ok: false, error: { code: "invalid-url" } };
  }
  if (url.protocol === "https:") return { ok: true, url };
  if (url.protocol === "http:" && dev && LOCAL_HOSTS.has(url.hostname)) return { ok: true, url };
  return { ok: false, error: { code: url.protocol === "http:" ? "insecure-url" : "invalid-url" } };
}

/**
 * The URL as the app remembers it (A7): without the query string, the fragment and any user name or password,
 * so a token in `?key=…` is never stored. Null for text that is not a URL.
 */
export function urlToStore(text: string): string | null {
  try {
    const url = new URL(text.trim());
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return null;
  }
}

export interface LoadOptions {
  /** A dot path to the array, such as "data.items"; empty for the top level. */
  path?: string;
  /** Cancels the request (the Cancel button). */
  signal?: AbortSignal;
  /** Accept http://localhost (vite dev). */
  dev?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Fetches and reads an API's rows. Never throws: every failure comes back as an `ApiError`. */
export async function loadApi(text: string, options: LoadOptions = {}): Promise<ApiResult> {
  const checked = checkUrl(text, options.dev ?? false);
  if (!checked.ok) return checked;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? TIMEOUT_MS);
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const stopped = (): ApiResult | null =>
    timedOut ? fail("timeout") : controller.signal.aborted ? fail("cancelled") : null;

  try {
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)(checked.url.href, {
        method: "GET",
        credentials: "omit",
        signal: controller.signal,
      });
    } catch {
      // A TypeError: blocked by CORS, or no connection at all; the browser does not say which.
      return stopped() ?? fail("cors");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return { ok: false, error: { code: "http-status", status: response.status } };
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await readCapped(response, options.maxBytes ?? MAX_BYTES);
    } catch {
      return stopped() ?? fail("network");
    }
    if (!bytes) {
      controller.abort();
      return fail("too-large");
    }

    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch {
      return fail("not-json");
    }
    return tableFromJson(value, options.path ?? "");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

const fail = (code: ApiErrorCode): ApiResult => ({ ok: false, error: { code } });

/**
 * The body, read in chunks and counted as it arrives, or null once it passes `maxBytes`. `Content-Length` may
 * be missing or wrong, so only the bytes actually read count.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A JSON value as cell text: strings as they are, numbers and booleans with `String()`, null as "", the rest as JSON. */
export function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

/**
 * The array at `path` (own properties only, so "__proto__" or "constructor" in a path never reads a
 * prototype), as a table. Its columns are the union of the objects' keys in order of first appearance;
 * items that are not objects are skipped.
 */
export function tableFromJson(value: unknown, path: string): ApiResult {
  let at: unknown = value;
  for (const key of path.split(".").map((k) => k.trim()).filter(Boolean)) {
    at = (isObject(at) || Array.isArray(at)) && Object.hasOwn(at, key) ? (at as Record<string, unknown>)[key] : undefined;
  }
  if (!Array.isArray(at)) {
    return { ok: false, error: { code: "no-array", keys: isObject(value) ? Object.keys(value) : [] } };
  }

  const items = at.filter(isObject);
  const columns = unionColumns(items);
  if (columns.length === 0) return fail("no-rows");
  return { ok: true, table: makeTable(columns, items, (item, column) => (Object.hasOwn(item, column) ? jsonCell(item[column]) : "")) };
}
