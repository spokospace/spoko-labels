import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUrl, loadApi, tableFromJson, urlToStore } from "../src/data/api.js";

// A mocked fetch; every URL and payload is made up (example.com, example.test).

afterEach(() => {
  vi.useRealTimers();
});

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, ...init });
const fetchReturning = (response: Response | (() => Response)) =>
  vi.fn<typeof fetch>(async () => (typeof response === "function" ? response() : response));

describe("loadApi", () => {
  it("GETs without cookies and reads an array of objects; columns in order of first appearance", async () => {
    const fetch = fetchReturning(json([{ id: 1, name: "Śrubka testowa" }, { name: "Demo", extra: true, id: 2 }]));
    const result = await loadApi("https://api.example.com/items?token=made-up", { fetch });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/items?token=made-up");
    expect(init).toMatchObject({ method: "GET", credentials: "omit" });
    expect(init).not.toHaveProperty("headers");
    expect(result).toEqual({
      ok: true,
      table: {
        columns: ["id", "name", "extra"],
        rows: [
          { id: "1", name: "Śrubka testowa", extra: "" },
          { id: "2", name: "Demo", extra: "true" },
        ],
        truncated: false,
      },
    });
  });

  it("finds the array at a dot path and writes nested values as JSON text", async () => {
    const body = { data: { items: [{ id: "A-1", tags: ["x", "y"], owner: { name: "Anna Demo" }, note: null }] }, page: 1 };
    const result = await loadApi("https://example.com/api", { fetch: fetchReturning(json(body)), path: " data.items " });
    expect(result.ok && result.table.rows).toEqual([{ id: "A-1", tags: '["x","y"]', owner: '{"name":"Anna Demo"}', note: "" }]);
  });

  it("keeps a key named __proto__ as an ordinary column", async () => {
    const text = '[{"__proto__":{"polluted":"yes"},"constructor":"c","name":"n"}]';
    const result = await loadApi("https://example.com/", { fetch: fetchReturning(new Response(text)) });
    expect(result.ok && result.table.columns).toEqual(["__proto__", "constructor", "name"]);
    const row = (result.ok ? result.table.rows[0] : {}) as Record<string, string>;
    expect(Object.hasOwn(row, "__proto__")).toBe(true);
    expect(row["__proto__"]).toBe('{"polluted":"yes"}');
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("words a CORS block (fetch throws a TypeError)", async () => {
    const blocked = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await loadApi("https://example.com/", { fetch: blocked })).toEqual({ ok: false, error: { code: "cors" } });
  });

  it("reports an error status and an HTML page", async () => {
    const notFound = fetchReturning(new Response("<html>Not found</html>", { status: 404 }));
    expect(await loadApi("https://example.com/", { fetch: notFound })).toEqual({ ok: false, error: { code: "http-status", status: 404 } });
    const html = fetchReturning(new Response("<!doctype html><title>Login</title>", { headers: { "content-type": "text/html" } }));
    expect(await loadApi("https://example.com/", { fetch: html })).toEqual({ ok: false, error: { code: "not-json" } });
  });

  it("names the top-level keys when the path finds no array", async () => {
    const fetch = fetchReturning(() => json({ data: { rows: [] }, meta: {} }));
    expect(await loadApi("https://example.com/", { fetch, path: "data.items" })).toEqual({ ok: false, error: { code: "no-array", keys: ["data", "meta"] } });
    expect(await loadApi("https://example.com/", { fetch })).toEqual({ ok: false, error: { code: "no-array", keys: ["data", "meta"] } });
    // A path never walks into the prototype.
    expect(await loadApi("https://example.com/", { fetch, path: "constructor.prototype" })).toMatchObject({ ok: false, error: { code: "no-array" } });
  });

  it("reports a list with no objects", async () => {
    expect(await loadApi("https://example.com/", { fetch: fetchReturning(json([1, "two", null])) })).toEqual({ ok: false, error: { code: "no-rows" } });
    expect(await loadApi("https://example.com/", { fetch: fetchReturning(json([])) })).toEqual({ ok: false, error: { code: "no-rows" } });
  });

  it("stops reading a body over 10 MB that has no Content-Length, and aborts the request", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    let signal: AbortSignal | undefined;
    const endless = vi.fn<typeof fetch>(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(body);
    });
    expect(await loadApi("https://example.com/", { fetch: endless })).toEqual({ ok: false, error: { code: "too-large" } });
    expect(pulled).toBeLessThanOrEqual(12);
    expect(cancelled).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it("decodes the body as UTF-8, across chunk boundaries", async () => {
    const bytes = new TextEncoder().encode('[{"miasto":"Łódź"}]');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split inside the two-byte "Ł".
        controller.enqueue(bytes.slice(0, 13));
        controller.enqueue(bytes.slice(13));
        controller.close();
      },
    });
    const result = await loadApi("https://example.com/", { fetch: fetchReturning(new Response(body)) });
    expect(result.ok && result.table.rows[0]).toEqual({ miasto: "Łódź" });
  });

  it("gives up after 15 s, and stops when cancelled", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const timedOut = loadApi("https://example.com/", { fetch: hanging });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await timedOut).toEqual({ ok: false, error: { code: "timeout" } });

    const cancel = new AbortController();
    const cancelled = loadApi("https://example.com/", { fetch: hanging, signal: cancel.signal });
    cancel.abort();
    expect(await cancelled).toEqual({ ok: false, error: { code: "cancelled" } });
  });

  it("refuses http:// and other schemes before fetching", async () => {
    const fetch = fetchReturning(json([]));
    expect(await loadApi("http://example.com/", { fetch })).toEqual({ ok: false, error: { code: "insecure-url" } });
    expect(await loadApi("ftp://example.com/", { fetch })).toEqual({ ok: false, error: { code: "invalid-url" } });
    expect(await loadApi("example.com/items", { fetch })).toEqual({ ok: false, error: { code: "invalid-url" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("checkUrl", () => {
  it("accepts http://localhost and 127.0.0.1 only in development", () => {
    expect(checkUrl("http://localhost:3000/items", true).ok).toBe(true);
    expect(checkUrl("http://127.0.0.1/items", true).ok).toBe(true);
    expect(checkUrl("http://localhost:3000/items", false)).toEqual({ ok: false, error: { code: "insecure-url" } });
    expect(checkUrl("http://example.com/", true)).toEqual({ ok: false, error: { code: "insecure-url" } });
    expect(checkUrl("https://example.com/", false).ok).toBe(true);
  });
});

describe("urlToStore", () => {
  it("drops the query, the fragment and any credentials", () => {
    expect(urlToStore("https://user:secret@api.example.com/v1/items?key=made-up-token&x=1#top")).toBe("https://api.example.com/v1/items");
    expect(urlToStore(" https://api.example.com/v1/items ")).toBe("https://api.example.com/v1/items");
    expect(urlToStore("not a url")).toBeNull();
  });
});

describe("tableFromJson", () => {
  it("indexes arrays in a path and skips items that are not objects", () => {
    const result = tableFromJson({ pages: [{ rows: [{ a: 1 }, "x", [1], { b: false }] }] }, "pages.0.rows");
    expect(result.ok && result.table).toEqual({ columns: ["a", "b"], rows: [{ a: "1", b: "" }, { a: "", b: "false" }], truncated: false });
  });
});
