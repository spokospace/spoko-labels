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

/** A line that screen readers announce when its text changes (a load, an error). */
export function statusLine(): HTMLParagraphElement {
  const line = el("p", { className: "status" });
  line.setAttribute("role", "status");
  line.setAttribute("aria-live", "polite");
  return line;
}

/**
 * Wires a button to a hidden file input: a click opens the chooser, and the picked file goes to `onFile`. The
 * input is cleared after each pick, so the same file can be picked again (after it changed on disk).
 */
export function filePicker(button: HTMLButtonElement, input: HTMLInputElement, onFile: (file: File) => void): void {
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) onFile(file);
  });
}
