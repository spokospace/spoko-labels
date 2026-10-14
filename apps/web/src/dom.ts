import { t, type MessageKey } from "./i18n/index.js";

/**
 * A new element with `props` assigned. With `i18n`, its text is that message and it carries `data-i18n`, so
 * `applyTranslations()` redraws it on a language switch. Text only: nothing is parsed as HTML.
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, i18n?: MessageKey): HTMLElementTagNameMap[K] {
  const node: HTMLElement = Object.assign(document.createElement(tag), props);
  if (i18n) {
    node.dataset.i18n = i18n;
    node.textContent = t(i18n);
  }
  return node as HTMLElementTagNameMap[K];
}
