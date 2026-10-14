import type { ErrorCode } from "@spokospace/labels-core";
import type { ExtractWarningCode, ImportFailureCode, ImportWarning } from "@spokospace/labels-niimbot";
import type { IssueCode } from "@spokospace/labels-render";
import { readStored, STORAGE_KEYS, writeStored } from "../storage.js";
import * as en from "./en.js";
import type { MessageKey } from "./en.js";
import * as pl from "./pl.js";
import { LANGS, type CodeDictionary, type EmbedCode, type Lang, type StyleFeature } from "./types.js";

export type { EmbedCode, Lang, MessageKey, StyleFeature };
export { LANGS };

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en: en.messages, pl: pl.messages };
export const CODES: Record<Lang, CodeDictionary> = { en: en.codes, pl: pl.codes };

/**
 * The language to start in: the one the user picked before, else Polish when the browser's language is
 * Polish, else English (A12).
 */
export function detectLang(stored: string | null, browserLanguage: string | undefined): Lang {
  if (stored === "pl" || stored === "en") return stored;
  return browserLanguage?.toLowerCase().startsWith("pl") ? "pl" : "en";
}

let current: Lang = "en";
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return current;
}

/** Picks the start-up language and writes it to `<html lang>`, without remembering it. */
export function initLang(): Lang {
  current = detectLang(readStored(STORAGE_KEYS.lang), globalThis.navigator?.language);
  if (typeof document !== "undefined") document.documentElement.lang = current;
  return current;
}

/**
 * Switches the language: remembers it, sets `<html lang>` (the embed chip and dialog read it) and tells the
 * listeners, which redraw their text.
 */
export function setLang(lang: Lang): void {
  writeStored(STORAGE_KEYS.lang, lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  if (lang === current) return;
  current = lang;
  for (const listener of listeners) listener(lang);
}

/**
 * Calls `listener` after every language switch; returns the unsubscribe function. The embed status chip reads
 * its language only when it is attached, so Phase 3 remounts it from such a listener.
 */
export function onLangChange(listener: (lang: Lang) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Params = Readonly<Record<string, string | number>>;

/** Fills `{name}` placeholders; a placeholder without a value stays as written. */
function fill(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

export function t(key: MessageKey, params?: Params, lang: Lang = current): string {
  return fill(MESSAGES[lang][key], params);
}

/** A labels-core error code or an embed outcome code in words; anything unknown is "something went wrong". */
export function errorText(code: string | undefined, lang: Lang = current): string {
  const errors = CODES[lang].errors;
  return code !== undefined && Object.hasOwn(errors, code) ? errors[code as ErrorCode | EmbedCode] : errors.internal;
}

export function issueText(code: IssueCode, lang: Lang = current): string {
  return CODES[lang].issues[code];
}

export function importWarningText(warning: Pick<ImportWarning, "code" | "feature">, lang: Lang = current): string {
  const { importWarnings, styleFeatures } = CODES[lang];
  const feature = warning.feature ?? "";
  // A feature name this app does not know yet is shown as the package reports it.
  const worded = Object.hasOwn(styleFeatures, feature) ? styleFeatures[feature as StyleFeature] : feature;
  return fill(importWarnings[warning.code], { feature: worded });
}

export function importFailureText(code: ImportFailureCode, lang: Lang = current): string {
  return CODES[lang].importFailures[code];
}

export function extractWarningText(code: ExtractWarningCode, lang: Lang = current): string {
  return CODES[lang].extractWarnings[code];
}

/**
 * Sets the text of every element under `root` that names a message: `data-i18n` for its text and
 * `data-i18n-label` for its `aria-label`. Static parts of the page are written this way, so a language switch
 * is one call.
 */
export function applyTranslations(root: ParentNode, lang: Lang = current): void {
  const known = (key: string | undefined): key is MessageKey => key !== undefined && Object.hasOwn(MESSAGES[lang], key);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    if (known(el.dataset.i18n)) el.textContent = t(el.dataset.i18n, undefined, lang);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-label]")) {
    if (known(el.dataset.i18nLabel)) el.setAttribute("aria-label", t(el.dataset.i18nLabel, undefined, lang));
  }
}
