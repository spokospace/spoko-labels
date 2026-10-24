import { describe, expect, it } from "vitest";
import { matchRoll, printedSize, rollCandidates } from "../src/index.js";

describe("rollCandidates", () => {
  it("maps a count sold in one size to that size", () => {
    expect(rollCandidates(95)).toEqual([{ widthMm: 50, heightMm: 80 }]);
  });

  it("lists every size that shares a count", () => {
    expect(rollCandidates(230)).toEqual([
      { widthMm: 50, heightMm: 30 },
      { widthMm: 30, heightMm: 30 },
    ]);
  });

  it("is empty for a missing or unknown count", () => {
    expect(rollCandidates(undefined)).toEqual([]);
    expect(rollCandidates(0)).toEqual([]);
    expect(rollCandidates(231)).toEqual([]);
  });
});

describe("printedSize", () => {
  it("keeps the design size without a turn or with a half turn", () => {
    expect(printedSize({ width: 50, height: 30 })).toEqual({ widthMm: 50, heightMm: 30 });
    expect(printedSize({ width: 50, height: 30 }, 180)).toEqual({ widthMm: 50, heightMm: 30 });
  });

  it("swaps the sides for a quarter turn", () => {
    expect(printedSize({ width: 30, height: 50 }, 270)).toEqual({ widthMm: 50, heightMm: 30 });
    expect(printedSize({ width: 30, height: 50 }, 90)).toEqual({ widthMm: 50, heightMm: 30 });
  });
});

describe("matchRoll", () => {
  const label5030 = { widthMm: 50, heightMm: 30 };

  it("is unknown without candidates", () => {
    expect(matchRoll(label5030, []).verdict).toBe("unknown");
  });

  it("matches when the only candidate fits", () => {
    expect(matchRoll({ widthMm: 50, heightMm: 80 }, rollCandidates(95)).verdict).toBe("match");
  });

  it("flags a 50x30 label on a 50x80 roll as a mismatch", () => {
    const result = matchRoll(label5030, rollCandidates(95));
    expect(result).toEqual({ verdict: "mismatch", candidates: [{ widthMm: 50, heightMm: 80 }] });
  });

  it("is ambiguous when only some candidates fit", () => {
    expect(matchRoll(label5030, rollCandidates(230)).verdict).toBe("ambiguous");
  });

  it("is a mismatch when no shared-count candidate fits", () => {
    expect(matchRoll({ widthMm: 50, heightMm: 80 }, rollCandidates(230)).verdict).toBe("mismatch");
  });

  it("matches when every candidate fits", () => {
    const twins = [
      { widthMm: 50, heightMm: 30 },
      { widthMm: 50.4, heightMm: 29.8 },
    ];
    expect(matchRoll(label5030, twins).verdict).toBe("match");
  });

  it("allows 1 mm on each side by default and takes another tolerance", () => {
    expect(matchRoll({ widthMm: 49, heightMm: 31 }, [label5030]).verdict).toBe("match");
    expect(matchRoll({ widthMm: 48.9, heightMm: 30 }, [label5030]).verdict).toBe("mismatch");
    expect(matchRoll({ widthMm: 48, heightMm: 30 }, [label5030], 2).verdict).toBe("match");
  });

  it("matches an upright 30x50 design printed turned on a 50x30 roll", () => {
    expect(matchRoll(printedSize({ width: 30, height: 50 }, 270), [label5030]).verdict).toBe("match");
  });
});
