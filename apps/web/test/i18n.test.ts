// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTranslations,
  CODES,
  detectLang,
  errorText,
  getLang,
  importWarningText,
  initLang,
  LANGS,
  MESSAGES,
  onLangChange,
  setLang,
  t,
} from "../src/i18n/index.js";
import { STORAGE_KEYS } from "../src/storage.js";

// The package codes, listed so a new code fails here as well as in the type check until it has wording.
const ERROR_CODES = [
  "bluetooth-unsupported", "chooser-cancelled", "device-unreachable", "disconnected", "no-response", "refused",
  "print-timeout", "busy", "aborted", "invalid-argument", "protocol", "template", "render", "internal",
];
const ISSUE_CODES = [
  "invalid-type", "required", "out-of-range", "unsupported-version", "unknown-element", "unknown-property",
  "outside-label", "outside-safe-area", "outside-printable-area", "missing-column", "value-truncated",
  "missing-font", "missing-glyphs", "text-overflow", "qr-empty", "qr-too-long", "qr-too-small",
];
const IMPORT_WARNING_CODES = [
  "unsupported-element", "rotated-element", "unsupported-style", "unknown-font", "unrecognized-binding",
  "value-clamped", "invalid-element",
];

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("dictionaries", () => {
  it("have the same message keys, each with text, in both languages", () => {
    expect(Object.keys(MESSAGES.pl).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(MESSAGES[lang])) expect(text.trim(), `${lang} ${key}`).not.toBe("");
    }
  });

  it("word every package code in both languages", () => {
    for (const lang of LANGS) {
      const codes = CODES[lang];
      expect(Object.keys(codes.errors).sort(), lang).toEqual([...ERROR_CODES].sort());
      expect(Object.keys(codes.issues).sort(), lang).toEqual([...ISSUE_CODES].sort());
      expect(Object.keys(codes.importWarnings).sort(), lang).toEqual([...IMPORT_WARNING_CODES].sort());
      expect(Object.keys(codes.importFailures).sort(), lang).toEqual(["invalid-input", "invalid-template", "unknown-size"]);
      expect(Object.keys(codes.extractWarnings).sort(), lang).toEqual(["duplicate-template", "no-templates-found", "scan-incomplete"]);
      for (const group of Object.values(codes)) {
        for (const [code, text] of Object.entries(group as Record<string, string>)) expect(text.trim(), `${lang} ${code}`).not.toBe("");
      }
      expect(Object.keys(codes.styleFeatures).sort()).toEqual(Object.keys(CODES.en.styleFeatures).sort());
    }
  });

  it("keeps the HarmonyOS Sans notice word for word", () => {
    for (const lang of LANGS) expect(MESSAGES[lang].footerFont).toBe("Font: HarmonyOS Sans © Huawei Device Co., Ltd.");
  });
});

describe("t and the code texts", () => {
  it("fills placeholders and leaves unknown ones as written", () => {
    expect(t("templateSize", { width: 50, height: 30 }, "en")).toBe("50 × 30 mm");
    expect(t("bannerBrave", undefined, "en")).toContain("{flag}");
  });

  it("falls back to a generic error for an unknown code, including prototype names", () => {
    expect(errorText("made-up", "en")).toBe(CODES.en.errors.internal);
    expect(errorText("constructor", "en")).toBe(CODES.en.errors.internal);
    expect(errorText(undefined, "pl")).toBe(CODES.pl.errors.internal);
    expect(errorText("device-unreachable", "pl")).toContain("NIIMBOT");
  });

  it("words known style features and shows unknown ones raw", () => {
    expect(importWarningText({ code: "unsupported-style", feature: "underline" }, "en")).toBe("Approximated: underlined text.");
    expect(importWarningText({ code: "unsupported-style", feature: "sparkle" }, "pl")).toBe("W przybliżeniu: sparkle.");
    expect(importWarningText({ code: "unknown-font" }, "en")).toBe(CODES.en.importWarnings["unknown-font"]);
  });
});

describe("language", () => {
  it("prefers the remembered choice, then Polish for a Polish browser, else English", () => {
    expect(detectLang("en", "pl-PL")).toBe("en");
    expect(detectLang("pl", "en-US")).toBe("pl");
    expect(detectLang(null, "pl-PL")).toBe("pl");
    expect(detectLang(null, "PL")).toBe("pl");
    expect(detectLang(null, "de-DE")).toBe("en");
    expect(detectLang("klingon", undefined)).toBe("en");
  });

  it("starts from storage and the browser, and sets <html lang>", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("pl-PL");
    expect(initLang()).toBe("pl");
    expect(document.documentElement.lang).toBe("pl");
    localStorage.setItem(STORAGE_KEYS.lang, "en");
    expect(initLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches: remembers, sets <html lang> and tells the listeners", () => {
    localStorage.setItem(STORAGE_KEYS.lang, "en");
    initLang();
    const heard: string[] = [];
    const stop = onLangChange((lang) => heard.push(lang));
    setLang("pl");
    expect(getLang()).toBe("pl");
    expect(document.documentElement.lang).toBe("pl");
    expect(localStorage.getItem(STORAGE_KEYS.lang)).toBe("pl");
    setLang("pl");
    stop();
    setLang("en");
    expect(heard).toEqual(["pl"]);
  });

  it("still switches when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => initLang()).not.toThrow();
    setLang("pl");
    expect(getLang()).toBe("pl");
    setLang("en");
  });

  it("writes the static texts of the page as text", () => {
    document.body.replaceChildren();
    const heading = document.createElement("h2");
    heading.dataset.i18n = "previewHeading";
    const group = document.createElement("div");
    group.dataset.i18nLabel = "language";
    const unknown = document.createElement("p");
    unknown.dataset.i18n = "no-such-key";
    unknown.textContent = "kept";
    document.body.append(heading, group, unknown);
    applyTranslations(document, "pl");
    expect(heading.textContent).toBe("Podgląd");
    expect(group.getAttribute("aria-label")).toBe("Język");
    expect(unknown.textContent).toBe("kept");
    applyTranslations(document, "en");
    expect(heading.textContent).toBe("Preview");
  });
});
