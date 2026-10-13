import { describe, expect, it } from "vitest";
import { resolveContent } from "../src/binding.js";
import { LIMITS } from "../src/index.js";

// Made-up row.
const row = { Name: "Blue crate", Code: "BX-0012", Qty: 3, Empty: null, Missing: undefined, Zero: 0, Flag: false };
const columns = ["Code", "Name", "Qty"];
const ok = (value: string) => ({ value, missing: false, truncated: false });
const missing = { value: "", missing: true, truncated: false };

describe("resolveContent", () => {
  it("returns static text as is, without data", () => {
    expect(resolveContent({ text: "Shelf A" }, {}, "text")).toEqual(ok("Shelf A"));
    expect(resolveContent({ text: "" }, {}, "text")).toEqual(ok(""));
  });

  it("binds by column name", () => {
    expect(resolveContent({ bind: "Name" }, { row }, "text")).toEqual(ok("Blue crate"));
  });

  it("converts cells with String(), null and undefined to an empty string", () => {
    expect(resolveContent({ bind: "Qty" }, { row }, "text")).toEqual(ok("3"));
    expect(resolveContent({ bind: "Zero" }, { row }, "text")).toEqual(ok("0"));
    expect(resolveContent({ bind: "Flag" }, { row }, "text")).toEqual(ok("false"));
    expect(resolveContent({ bind: "Empty" }, { row }, "text")).toEqual(ok(""));
    expect(resolveContent({ bind: "Missing" }, { row }, "text")).toEqual(ok(""));
  });

  it("binds by position through columns", () => {
    expect(resolveContent({ bindIndex: 0 }, { row, columns }, "qr")).toEqual(ok("BX-0012"));
    expect(resolveContent({ bindIndex: 2 }, { row, columns }, "text")).toEqual(ok("3"));
  });

  it("falls back to bindIndex only when the name is absent", () => {
    expect(resolveContent({ bind: "Name", bindIndex: 0 }, { row, columns }, "text")).toEqual(ok("Blue crate"));
    expect(resolveContent({ bind: "Title", bindIndex: 1 }, { row, columns }, "text")).toEqual(ok("Blue crate"));
    // A present null cell counts as found: no fallback, no missing-column.
    expect(resolveContent({ bind: "Empty", bindIndex: 1 }, { row, columns }, "text")).toEqual(ok(""));
  });

  it("reports unresolved content as missing", () => {
    expect(resolveContent({ bind: "Title" }, { row }, "text")).toEqual(missing);
    expect(resolveContent({ bind: "Name" }, {}, "text")).toEqual(missing);
    expect(resolveContent({ bindIndex: 0 }, { row }, "text")).toEqual(missing);
    expect(resolveContent({ bindIndex: 3 }, { row, columns }, "text")).toEqual(missing);
    expect(resolveContent({ bindIndex: 0 }, { row, columns: ["Gone"] }, "text")).toEqual(missing);
  });

  it("never reads the prototype of the row", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(resolveContent({ bind: name }, { row }, "text")).toEqual(missing);
      expect(resolveContent({ bindIndex: 0 }, { row, columns: [name] }, "text")).toEqual(missing);
    }
    expect(resolveContent({ bind: "toString" }, { row: { toString: "own" } }, "text")).toEqual(ok("own"));
  });

  it("works with a row that has no prototype", () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { Name: "Crate" });
    expect(resolveContent({ bind: "Name" }, { row: bare }, "text")).toEqual(ok("Crate"));
  });

  it("cuts text over the limit by code points and reports it", () => {
    const long = "😀".repeat(LIMITS.maxTextLength + 5);
    const result = resolveContent({ bind: "Long" }, { row: { Long: long } }, "text");
    expect(result.truncated).toBe(true);
    expect(Array.from(result.value)).toHaveLength(LIMITS.maxTextLength);
    expect(result.value).toBe("😀".repeat(LIMITS.maxTextLength));
  });

  it("keeps text at the limit, even when it is longer in UTF-16 units", () => {
    const atLimit = "😀".repeat(LIMITS.maxTextLength);
    expect(resolveContent({ text: atLimit }, {}, "text")).toEqual(ok(atLimit));
    const plain = "a".repeat(LIMITS.maxTextLength);
    expect(resolveContent({ text: plain }, {}, "text")).toEqual(ok(plain));
  });

  it("never cuts QR content", () => {
    const long = "x".repeat(LIMITS.maxTextLength * 2);
    expect(resolveContent({ text: long }, {}, "qr")).toEqual(ok(long));
  });
});
