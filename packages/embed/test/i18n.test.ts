import { describe, expect, it } from "vitest";
import { ERRORS, errorText, ISSUES, langOf, t } from "../src/i18n.js";

// The codes of labels-core's ErrorCode and labels-render's IssueCode, listed so a new code fails this test
// until it has wording.
const ERROR_CODES = [
  "bluetooth-unsupported", "chooser-cancelled", "device-unreachable", "disconnected", "no-response", "refused",
  "print-timeout", "busy", "aborted", "invalid-argument", "protocol",
];
const ISSUE_CODES = [
  "invalid-type", "required", "out-of-range", "unsupported-version", "unknown-element", "unknown-property",
  "outside-label", "outside-safe-area", "outside-printable-area", "missing-column", "value-truncated",
  "missing-font", "missing-glyphs", "text-overflow", "qr-empty", "qr-too-long", "qr-too-small",
];

describe("i18n", () => {
  it("words every error and issue code in Polish and English", () => {
    for (const lang of ["pl", "en"] as const) {
      for (const code of ERROR_CODES) expect(ERRORS[lang][code as keyof (typeof ERRORS)["en"]], `${lang} ${code}`).toBeTruthy();
      expect(Object.keys(ISSUES[lang]).sort()).toEqual([...ISSUE_CODES].sort());
    }
  });

  it("falls back to a generic message for an unknown code", () => {
    expect(errorText("en", "made-up")).toBe(ERRORS.en.internal);
    expect(errorText("pl", undefined)).toBe(ERRORS.pl.internal);
    expect(errorText("pl", "device-unreachable")).toContain("NIIMBOT");
  });

  it("picks the language from the option, then <html lang>, else English", () => {
    expect(langOf("pl")).toBe("pl");
    expect(langOf("PL-pl")).toBe("pl");
    expect(langOf("de")).toBe("en");
    expect(langOf(undefined)).toBe("en");
  });

  it("fills placeholders", () => {
    expect(t("en", "label", { n: 2, total: 5 })).toBe("Label 2 of 5");
    expect(t("pl", "printingProgress", { done: 1, total: 3 })).toBe("Drukuje 1/3…");
  });
});
