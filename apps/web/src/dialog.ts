import { el } from "./dom.js";
import { t, type MessageKey } from "./i18n/index.js";

// The app's panels (help, printer settings): native modal `<dialog>` elements with a heading and Close.

/** Shows a `<dialog>` as a modal; happy-dom and old browsers get the `open` attribute instead. */
export function showDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.open = true;
}

export interface PanelDialog {
  dialog: HTMLDialogElement;
  /** Where the panel's content goes. */
  body: HTMLElement;
  /** Redraws the heading and Close in the current language. */
  translate(): void;
}

/** A `<dialog>` with a heading and a Close button; a click on the backdrop closes it too. */
export function panelDialog(id: string, titleKey: MessageKey): PanelDialog {
  const dialog = el("dialog", { id, className: "panel-dialog" });
  const title = el("h2", { id: `${id}-title` });
  dialog.setAttribute("aria-labelledby", title.id);
  const closeButton = el("button", { type: "button", className: "button small" });
  closeButton.addEventListener("click", () => dialog.close());
  const head = el("div", { className: "panel-head" });
  head.append(title, closeButton);
  const body = el("div", { className: "panel-body" });
  dialog.append(head, body);
  // The backdrop is the dialog element itself, outside its content.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  const translate = (): void => {
    title.textContent = t(titleKey);
    closeButton.textContent = t("close");
  };
  translate();
  return { dialog, body, translate };
}
