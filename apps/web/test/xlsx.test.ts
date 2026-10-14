import { describe, expect, it } from "vitest";
import { MAX_BYTES, MAX_ROWS } from "../src/data/table.js";
import { cellText, readXlsx, tableFromSheet, type SheetReader } from "../src/data/xlsx.js";
import { makeXlsx } from "./xlsx-fixture.js";

// Made-up sheets only.
const file = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);

describe("readXlsx", () => {
  it("reads the first sheet: names from the first row, every cell as text", async () => {
    const xlsx = makeXlsx(
      [
        ["Name", "", "Name", "__proto__", "Price", "Added", null],
        ["Herbata Przykładowa", "x", "Zielona", "proto value", 19.99, new Date(Date.UTC(2026, 0, 31)), null],
        ["Example Beans", null, "", "", 7, new Date(Date.UTC(1999, 11, 1)), null],
        [null, null, null, null, null, null, null],
        ["Miód <b>Testowy</b>", "", "", "", 0.1, null, "extra"],
      ],
      { other: [["Other"], ["not read"]] },
    );
    const result = await readXlsx(file(xlsx));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { columns, rows, truncated } = result.table;
    // Empty and repeated names; the last column has no name but holds a value.
    expect(columns).toEqual(["Name", "Column B", "Name (2)", "__proto__", "Price", "Added", "Column G"]);
    expect(truncated).toBe(false);
    // The empty row is skipped.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      Name: "Herbata Przykładowa",
      "Column B": "x",
      "Name (2)": "Zielona",
      ["__proto__"]: "proto value",
      Price: "19.99",
      Added: "2026-01-31",
    });
    expect(rows[1]?.Added).toBe("1999-12-01");
    expect(rows[1]?.Price).toBe("7");
    expect(rows[2]?.Name).toBe("Miód <b>Testowy</b>");
    expect(rows[2]?.["Column G"]).toBe("extra");

    // "__proto__" is an own key holding text, and no prototype was touched.
    const first = rows[0] as Record<string, string>;
    expect(Object.hasOwn(first, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
  });

  it("names empty headers through the given function (the app passes the translated word)", async () => {
    const result = await readXlsx(file(makeXlsx([["", "B"], ["1", "2"]])), { emptyName: (letter) => `Kolumna ${letter}` });
    expect(result.ok && result.table.columns).toEqual(["Kolumna A", "B"]);
  });

  it("hands read-excel-file stored parts, so fflate never starts a worker", async () => {
    let input: ArrayBuffer | undefined;
    const load = async (): Promise<SheetReader> => ({
      readSheet: async (buffer) => {
        input = buffer;
        return [["A"], ["1"]];
      },
    });
    const result = await readXlsx(file(makeXlsx([["A"], ["1"]], { level: 6 })), { load });
    expect(result.ok).toBe(true);
    // Every local file header (PK\x03\x04) names compression method 0, "stored".
    const bytes = new Uint8Array(input as ArrayBuffer);
    const view = new DataView(bytes.buffer);
    let headers = 0;
    for (let i = 0; i + 10 <= bytes.length; i++) {
      if (view.getUint32(i, true) === 0x04034b50) {
        headers++;
        expect(view.getUint16(i + 8, true)).toBe(0);
      }
    }
    expect(headers).toBeGreaterThan(0);
  });

  it("words a reader that could not be loaded (offline), apart from a bad file", async () => {
    const load = async (): Promise<SheetReader> => {
      throw new TypeError("Failed to fetch dynamically imported module");
    };
    expect(await readXlsx(file(makeXlsx([["A"], ["1"]])), { load })).toEqual({ ok: false, error: "load-failed" });
  });

  it("does not read a file over 10 MB", async () => {
    let loaded = false;
    const load = async (): Promise<SheetReader> => {
      loaded = true;
      return { readSheet: async () => [] };
    };
    expect(await readXlsx(new Blob([new Uint8Array(MAX_BYTES + 1)]), { load })).toEqual({ ok: false, error: "too-large" });
    expect(loaded).toBe(false);
  });

  it("counts the bytes it inflates, not the sizes the zip headers claim (a zip bomb)", async () => {
    const { zipSync } = await import("fflate");
    const bomb = makeXlsx([["A"], ["1"]]);
    const zeros = zipSync({ "xl/worksheets/sheet2.xml": new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
    // Every header of the big part claims 100 bytes unpacked.
    const view = new DataView(zeros.buffer, zeros.byteOffset, zeros.byteLength);
    for (let i = 0; i + 4 <= zeros.length; i++) {
      const signature = view.getUint32(i, true);
      if (signature === 0x04034b50) view.setUint32(i + 22, 100, true);
      if (signature === 0x02014b50) view.setUint32(i + 24, 100, true);
    }
    expect(await readXlsx(file(zeros), { maxUnpacked: 1024 * 1024 })).toEqual({ ok: false, error: "too-large" });
    // The same limit lets an ordinary small file through.
    expect((await readXlsx(file(bomb), { maxUnpacked: 1024 * 1024 })).ok).toBe(true);
  });

  it("reports a file that is not an xlsx (a text file, a password-protected file, a zip of something else)", async () => {
    expect(await readXlsx(new Blob(["Name;Price\nx;1\n"]))).toEqual({ ok: false, error: "not-xlsx" });
    // Password-protected xlsx files are OLE compound files, not zips.
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(await readXlsx(file(ole))).toEqual({ ok: false, error: "not-xlsx" });
    const { zipSync, strToU8 } = await import("fflate");
    expect(await readXlsx(file(zipSync({ "notes.xml": strToU8("<notes/>") })))).toEqual({ ok: false, error: "not-xlsx" });
  });

  it("reports a first sheet with no rows", async () => {
    expect(await readXlsx(file(makeXlsx([])))).toEqual({ ok: false, error: "no-rows" });
    expect(await readXlsx(file(makeXlsx([["Name", "Price"]])))).toEqual({ ok: false, error: "no-rows" });
  });
});

describe("tableFromSheet", () => {
  it("keeps the first 10,000 rows and says so", () => {
    const sheet = [["N"], ...Array.from({ length: MAX_ROWS + 5 }, (_, i) => [i])];
    const result = tableFromSheet(sheet);
    expect(result.ok && result.table.rows.length).toBe(MAX_ROWS);
    expect(result.ok && result.table.truncated).toBe(true);
    expect(result.ok && result.table.rows[MAX_ROWS - 1]).toEqual({ N: String(MAX_ROWS - 1) });
  });

  it("numbers repeated names past the ones already taken", () => {
    const result = tableFromSheet([["A", "A (2)", "A", " "], ["1", "2", "3", "4"]]);
    expect(result.ok && result.table.columns).toEqual(["A", "A (2)", "A (3)", "Column D"]);
  });
});

describe("cellText", () => {
  it("writes numbers with String(), dates as YYYY-MM-DD in UTC, and empty cells as an empty string", () => {
    expect(cellText(42)).toBe("42");
    expect(cellText(0.1 + 0.2)).toBe(String(0.1 + 0.2));
    expect(cellText(true)).toBe("true");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    // Late in the day UTC: a local-time getter east of UTC would give the next day.
    expect(cellText(new Date(Date.UTC(2026, 9, 14, 23, 30)))).toBe("2026-10-14");
    expect(cellText(new Date(Number.NaN))).toBe("");
  });
});
