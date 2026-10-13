// Builds made-up byte files in the layout observed in the NIIMBOT app's Isar database (see the import spec,
// "Observed source format"). Every value is invented; URLs use example.invalid. No real database, template,
// data-source id or roll serial belongs here.

const encoder = new TextEncoder();

export type Part = Uint8Array | string;

export function bytes(...parts: Part[]): Uint8Array {
  const chunks = parts.map((p) => (typeof p === "string" ? encoder.encode(p) : p));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Binary filler like the bytes Isar keeps between string fields: control bytes and lone high bytes only, so it
 * never reads as JSON or as text. Deterministic for a given seed.
 */
export function noise(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    const r = state >>> 24;
    out[i] = r & 1 ? r & 0x1f : 0x80 | (r & 0x3f);
  }
  return out;
}

export interface RecordSpec {
  name?: string | undefined;
  elements: unknown[];
  rollNames?: string[] | undefined;
  updatedAt?: string | undefined;
  /** false leaves out the `[0,0,0,0]` record marker. */
  marker?: boolean | undefined;
}

const labelNames = (rolls: string[]): string =>
  JSON.stringify(rolls.map((name) => ({ languageCode: "en", languageName: "English", name })));

/**
 * One template record: noise, a thumbnail URL and an id, the timestamp, the elements JSON, `labelNames`, a run
 * of numbers and printer codes, `[0,0,0,0]` with the name behind a prefix holding its byte length, then the
 * `labelNames` again. The byte after the name belongs to the next field and is printable ("H"), as in the app.
 */
export function record(spec: RecordSpec, seed = 1): Uint8Array {
  const name = encoder.encode(spec.name ?? "");
  const rolls = spec.rollNames ? labelNames(spec.rollNames) : "";
  return bytes(
    noise(24, seed),
    "https://example.invalid/thumbnails/made-up.png",
    noise(3, seed + 1),
    "00000000-0000-0000-0000-made-up00000",
    noise(2, seed + 2),
    spec.updatedAt ?? "",
    noise(4, seed + 3),
    JSON.stringify(spec.elements),
    noise(4, seed + 4),
    rolls,
    noise(6, seed + 5),
    "B1",
    noise(2, seed + 6),
    "B21",
    noise(5, seed + 7),
    spec.marker === false ? "" : bytes("[0,0,0,0]", Uint8Array.of(0, 0, 0, name.length & 0xff, 0, 0), name, "H"),
    noise(3, seed + 8),
    rolls,
    noise(16, seed + 9),
  );
}

/** One element array, the record marker, then `prefix` and `name`: for testing how the name is read. */
export const markedName = (prefix: Uint8Array, name: string): Uint8Array =>
  bytes(noise(8), JSON.stringify([{ type: "text", x: 1, y: 1, width: 10, height: 5 }]), noise(4), "[0,0,0,0]", prefix, name, noise(4, 9));

/** A fragment of the app's font catalogue: `{ id, lpId, code, name, path, fileName, … }` objects. */
export const fontCatalog = (entries: [code: string, fileName: string][]): string =>
  JSON.stringify(
    entries.map(([code, fileName], i) => ({
      id: i + 1,
      lpId: 0,
      code,
      name: "Made-up marketing name",
      path: "https://example.invalid/fonts/made-up.ttf",
      fileName,
      classifyName: "made-up",
      isVip: false,
    })),
  );

/** A whole file: noise around the parts. */
export const isarFile = (...parts: Part[]): Uint8Array => bytes(noise(64, 7), ...parts, noise(64, 8));
