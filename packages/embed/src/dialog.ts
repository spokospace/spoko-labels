import {
  browserEnvironment,
  render,
  validateTemplate,
  type FontRegistry,
  type NormalizedTemplate,
  type RenderEnvironment,
  type RenderResult,
} from "@spokospace/labels-render";
import { el } from "./dom.js";
import { fontsFor } from "./fonts.js";
import { errorText, ISSUES, langOf, t, type Lang, type MessageKey } from "./i18n.js";
import { printerSession } from "./instance.js";
import type { BatchResult, PrinterSession } from "./session.js";
import { savedDensity, saveDensity } from "./settings.js";
import { statusText } from "./status.js";
import { adoptStyles, THEME } from "./styles.js";

export interface PrintRequest {
  /** Template v1 JSON. A template-level error is shown in the dialog. */
  template: unknown;
  /** One label per row. */
  rows: Record<string, unknown>[];
  /** Column names in order, for templates that bind by position (`bindIndex`, Niimbot imports). */
  columns?: string[];
  /** The dialog's title, for example the record's name. */
  title?: string;
  /** Initial copies of each label, 1 to 99. Default 1. */
  copies?: number;
  /** Initial density; default the one used last in this browser, else the printer's default. */
  density?: number;
  /** Calibration passed to every print; default the printer model's. */
  offsetMm?: { x: number; y: number };
  lang?: "pl" | "en";
}

export interface PrintOutcome {
  /** Labels printed, copies included. */
  printed: number;
  cancelled: boolean;
  /** The label that failed (0-based row) and why. */
  error?: BatchResult["error"] | { code: "template"; row: number };
}

/** Most labels (rows) one call may print. */
export const MAX_LABELS = 200;
const MAX_COPIES = 99;
const ZOOM = 2;

const clampCopies = (value: number): number => Math.min(Math.max(Math.trunc(value) || 1, 1), MAX_COPIES);

const CSS = `${THEME}
  dialog { border: 0; border-radius: var(--_radius); padding: 1rem 1.25rem; background: var(--_bg); color: var(--_fg);
    width: min(36rem, calc(100vw - 2rem)); box-sizing: border-box; }
  dialog::backdrop { background: rgb(0 0 0 / .45); }
  @media (max-width: 600px) { dialog { width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; border-radius: 0; } }
  h2 { font-size: 1.1rem; margin: 0 0 .75rem; }
  .stage { background: #fff; border: 1px solid color-mix(in srgb, var(--_fg) 30%, transparent); display: inline-block; max-width: 100%; }
  canvas { display: block; image-rendering: pixelated; max-width: 100%; height: auto; }
  .row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .6rem 0; }
  .pager[hidden] { display: none; }
  button { padding: .35rem .8rem; border-radius: var(--_radius); border: 1px solid color-mix(in srgb, var(--_fg) 30%, transparent);
    background: var(--_bg); color: var(--_fg); cursor: pointer; }
  button.primary { background: var(--_accent); border-color: var(--_accent); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
  input[type=number] { width: 4.5rem; }
  ul { margin: .25rem 0; padding-left: 1.2rem; font-size: .9rem; }
  .status { font-weight: 600; min-height: 1.4em; }
  .hint, .notice { font-size: .8rem; opacity: .75; }
  .error { color: #dc2626; }
`;

let environment: RenderEnvironment | null = null;
const environmentOf = (): RenderEnvironment => (environment ??= browserEnvironment());

/** The modal currently open, if any: one at a time. */
let openDialog: SpokoPrintDialog | null = null;

function validateRequest(request: PrintRequest): void {
  if (typeof request !== "object" || request === null) throw new TypeError("printLabels: request must be an object");
  if (!Array.isArray(request.rows)) throw new TypeError("printLabels: rows must be an array of objects");
  if (request.rows.length === 0 || request.rows.length > MAX_LABELS) {
    throw new RangeError(`printLabels: rows must hold 1 to ${MAX_LABELS} labels, got ${request.rows.length}`);
  }
  if (request.rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
    throw new TypeError("printLabels: every row must be an object");
  }
  if (request.columns !== undefined && (!Array.isArray(request.columns) || request.columns.some((c) => typeof c !== "string"))) {
    throw new TypeError("printLabels: columns must be an array of strings");
  }
}

/**
 * Opens the print dialog for `rows` (one label each) with `template`. Resolves when the dialog closes, with
 * what was printed. Rejects only on a host bug: a bad request (`TypeError`, `RangeError`) or a dialog that is
 * already open (`TypeError`). Printing needs no user gesture; connecting does, and the dialog's Connect button
 * provides it.
 */
export function printLabels(request: PrintRequest, session: PrinterSession = printerSession): Promise<PrintOutcome> {
  try {
    validateRequest(request);
  } catch (error) {
    return Promise.reject(error);
  }
  if (openDialog) return Promise.reject(new TypeError("printLabels: a print dialog is already open"));
  const dialog = document.createElement("spoko-print-dialog") as unknown as SpokoPrintDialog;
  dialog.session = session;
  const release = () => {
    if (openDialog === dialog) openDialog = null;
    dialog.remove();
  };
  openDialog = dialog;
  document.body.append(dialog);
  try {
    return dialog.show(request).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}

/** `<spoko-print-dialog>`: the modal behind `printLabels()`. Create it through `printLabels()`. */
export class SpokoPrintDialog extends HTMLElement {
  session: PrinterSession = printerSession;
  private readonly root: ShadowRoot;
  private request!: PrintRequest;
  private uiLang: Lang = "en";
  private index = 0;
  private fonts: FontRegistry | null = null;
  /** The validated template, or null when it has a template-level error. */
  private template: NormalizedTemplate | null = null;
  private outcome: PrintOutcome = { printed: 0, cancelled: false };
  private batch: Promise<BatchResult> | null = null;
  private abort: AbortController | null = null;
  private resolveShown: ((outcome: PrintOutcome) => void) | null = null;
  private opener: Element | null = null;
  private readonly onState = () => this.updateState();
  private readonly onBlocked = () => this.say(t(this.uiLang, "navigationBlocked"));

  // Built in build(), before anything reads them.
  private dialog!: HTMLDialogElement;
  private canvas!: HTMLCanvasElement;
  private counter!: HTMLSpanElement;
  private warnings!: HTMLUListElement;
  private copiesInput!: HTMLInputElement;
  private densitySelect!: HTMLSelectElement;
  private status!: HTMLParagraphElement;
  private hint!: HTMLParagraphElement;
  private message!: HTMLParagraphElement;
  private connectButton!: HTMLButtonElement;
  private printButton!: HTMLButtonElement;
  private cancelButton!: HTMLButtonElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    adoptStyles(this.root, CSS);
  }

  /** Builds the dialog for `request`, opens it modally and resolves on close. */
  show(request: PrintRequest): Promise<PrintOutcome> {
    this.request = request;
    this.uiLang = langOf(request.lang);
    this.opener = document.activeElement;
    this.build();
    this.session.addEventListener("statechange", this.onState);
    this.session.addEventListener("navigationblocked", this.onBlocked);
    this.dialog.showModal();
    this.updateState();
    void this.prepare();
    return new Promise((resolve) => {
      this.resolveShown = resolve;
    });
  }

  disconnectedCallback(): void {
    // Removed from the page (a Livewire body swap, or closed): a running batch keeps going in the session,
    // and the promise resolves when it ends.
    if (this.batch) void this.batch.then(() => this.finish());
    else this.finish();
  }

  private build(): void {
    const doc = this.root.ownerDocument;
    const L = (key: MessageKey) => t(this.uiLang, key);
    const model = this.session.model;

    this.canvas = el(doc, "canvas");
    this.canvas.setAttribute("role", "img");
    this.densitySelect = el(doc, "select");
    for (let d = model.densityRange.min; d <= model.densityRange.max; d++) {
      this.densitySelect.append(el<HTMLOptionElement>(doc, "option", { value: String(d), textContent: String(d) }));
    }
    this.densitySelect.value = String(this.request.density ?? savedDensity() ?? model.defaultDensity);
    this.copiesInput = el(doc, "input", { type: "number", min: "1", max: String(MAX_COPIES), value: String(clampCopies(this.request.copies ?? 1)) });
    const prev = el<HTMLButtonElement>(doc, "button", { type: "button", textContent: "‹" });
    prev.setAttribute("aria-label", L("previous"));
    const next = el<HTMLButtonElement>(doc, "button", { type: "button", textContent: "›" });
    next.setAttribute("aria-label", L("next"));
    this.counter = el(doc, "span");
    const pager = el<HTMLDivElement>(doc, "div", { className: "row pager", hidden: this.request.rows.length < 2 }, prev, this.counter, next);
    this.warnings = el(doc, "ul");
    this.status = el(doc, "p", { className: "status" });
    this.status.setAttribute("aria-live", "polite");
    this.connectButton = el(doc, "button", { type: "button", className: "primary", textContent: L("connect") });
    this.printButton = el(doc, "button", { type: "button", className: "primary", textContent: L("print") });
    this.cancelButton = el(doc, "button", { type: "button", textContent: L("close") });
    this.hint = el(doc, "p", { className: "hint", textContent: L("chooserHint") });
    this.message = el(doc, "p");
    this.message.setAttribute("aria-live", "polite");

    this.dialog = el(
      doc,
      "dialog",
      { partName: "dialog" },
      el(doc, "h2", { textContent: this.request.title ?? L("print") }),
      pager,
      el(doc, "div", { className: "stage" }, this.canvas),
      el(doc, "p", { className: "hint", textContent: L("warnings") }),
      this.warnings,
      el(doc, "div", { className: "row" }, el(doc, "label", {}, `${L("copies")} `, this.copiesInput), el(doc, "label", {}, `${L("density")} `, this.densitySelect)),
      this.status,
      this.hint,
      this.message,
      el(doc, "div", { className: "row" }, this.connectButton, this.printButton, this.cancelButton),
      el(doc, "p", { className: "notice", textContent: L("harmonyNotice") }),
    );
    this.root.append(this.dialog);

    prev.addEventListener("click", () => this.go(-1));
    next.addEventListener("click", () => this.go(1));
    // Straight from the click: the chooser needs the user gesture.
    this.connectButton.addEventListener("click", () => void this.session.connect());
    this.printButton.addEventListener("click", () => void this.print());
    this.cancelButton.addEventListener("click", () => this.cancelOrClose());
    this.densitySelect.addEventListener("change", () => saveDensity(Number(this.densitySelect.value)));
    // Escape: close, but never while printing.
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!this.batch) this.close();
    });
  }

  private async prepare(): Promise<void> {
    const { template, issues } = validateTemplate(this.request.template);
    this.template = template;
    if (!template) {
      const listed = issues.filter((i) => i.severity === "error").map((i) => `${i.path || "/"} ${ISSUES[this.uiLang][i.code]}`);
      this.say(t(this.uiLang, "templateError", { issues: listed.join("; ") }), true);
      this.outcome = { printed: 0, cancelled: false, error: { code: "template", row: 0 } };
      this.updateState();
      return;
    }
    this.say(t(this.uiLang, "loadingFonts"));
    try {
      this.fonts = await fontsFor(environmentOf(), template);
      this.say("");
    } catch {
      this.say(errorText(this.uiLang, "render"), true);
    }
    this.draw();
    this.updateState();
  }

  private renderRow(index: number): RenderResult {
    const fonts = this.fonts;
    if (!fonts) throw new Error("fonts not loaded");
    const model = this.session.model;
    return render(
      this.request.template,
      { row: this.request.rows[index] ?? {}, ...(this.request.columns && { columns: this.request.columns }) },
      { environment: environmentOf(), fonts, printableWidth: model.headDots / model.dotsPerMm },
    );
  }

  private go(step: number): void {
    const count = this.request.rows.length;
    this.index = (this.index + step + count) % count;
    this.draw();
  }

  /** The current row's preview and its warnings. */
  private draw(): void {
    const doc = this.root.ownerDocument;
    this.counter.textContent = t(this.uiLang, "label", { n: this.index + 1, total: this.request.rows.length });
    if (!this.fonts || !this.template) return;
    let result: RenderResult;
    try {
      result = this.renderRow(this.index);
    } catch {
      this.warnings.replaceChildren(el(doc, "li", { textContent: errorText(this.uiLang, "render") }));
      return;
    }
    this.paint(result);
    this.warnings.replaceChildren(
      ...(result.warnings.length === 0
        ? [el(doc, "li", { textContent: t(this.uiLang, "noWarnings") })]
        : result.warnings.map((w) => el(doc, "li", { textContent: ISSUES[this.uiLang][w.code] }))),
    );
  }

  /** Draws the printed image upright: turned back by its print rotation, at twice the dot size where it fits. */
  private paint({ image, printRotation }: RenderResult): void {
    const { canvas } = this;
    const quarter = printRotation % 180 !== 0;
    canvas.width = quarter ? image.height : image.width;
    canvas.height = quarter ? image.width : image.height;
    canvas.style.width = `${canvas.width * ZOOM}px`;
    const model = this.session.model;
    canvas.setAttribute("aria-label", t(this.uiLang, "preview", { width: canvas.width / model.dotsPerMm, height: canvas.height / model.dotsPerMm }));
    const ctx = canvas.getContext("2d");
    const printed = this.root.ownerDocument.createElement("canvas");
    printed.width = image.width;
    printed.height = image.height;
    const printedCtx = printed.getContext("2d");
    if (!ctx || !printedCtx) return;
    printedCtx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-printRotation * Math.PI) / 180);
    ctx.drawImage(printed, -image.width / 2, -image.height / 2);
  }

  private async print(): Promise<void> {
    if (this.batch || !this.fonts || !this.template) return;
    const copies = clampCopies(Number(this.copiesInput.value));
    this.copiesInput.value = String(copies);
    const density = Number(this.densitySelect.value);
    saveDensity(density);
    this.abort = new AbortController();
    this.say("");
    this.batch = this.session.printBatch({
      count: this.request.rows.length,
      copies,
      density,
      ...(this.request.offsetMm && { offsetMm: this.request.offsetMm }),
      image: (row) => this.renderRow(row).image,
      signal: this.abort.signal,
    });
    this.updateState();
    const result = await this.batch;
    this.batch = null;
    this.abort = null;
    this.outcome = { printed: this.outcome.printed + result.printed, cancelled: result.cancelled, ...(result.error && { error: result.error }) };
    const total = this.request.rows.length * copies;
    if (result.error) {
      const reason = errorText(this.uiLang, result.error.code);
      this.say(t(this.uiLang, "printedPartly", { printed: result.printed, total, row: result.error.row + 1, reason }), true);
    } else {
      this.say(t(this.uiLang, result.cancelled ? "cancelled" : "printed", { printed: result.printed }));
    }
    this.updateState();
  }

  private cancelOrClose(): void {
    if (this.abort) this.abort.abort();
    else this.close();
  }

  private say(text: string, error = false): void {
    this.message.textContent = text;
    this.message.className = error ? "error" : "";
  }

  private updateState(): void {
    const state = this.session.state;
    const printing = this.batch !== null;
    const connected = state.kind === "connected" || state.kind === "printing";
    this.status.textContent =
      state.kind === "printing" ? t(this.uiLang, "progress", { done: state.done, total: state.total }) : statusText(state, this.uiLang);
    this.connectButton.hidden = connected;
    this.connectButton.disabled = !(state.kind === "disconnected" || state.kind === "busy-elsewhere");
    this.hint.hidden = connected || state.kind === "unsupported";
    this.printButton.hidden = !connected;
    this.printButton.disabled = printing || state.kind !== "connected" || !this.fonts || !this.template;
    this.cancelButton.textContent = t(this.uiLang, printing ? "cancel" : "close");
    if (state.kind === "disconnected" && state.error && state.error !== "chooser-cancelled" && !printing) {
      this.say(errorText(this.uiLang, state.error), true);
    }
  }

  private close(): void {
    if (this.dialog.open) this.dialog.close();
    this.finish();
  }

  /** Stops listening and resolves `show()` once. */
  private finish(): void {
    const resolve = this.resolveShown;
    if (!resolve) return;
    this.resolveShown = null;
    this.session.removeEventListener("statechange", this.onState);
    this.session.removeEventListener("navigationblocked", this.onBlocked);
    if (this.opener instanceof HTMLElement && this.opener.isConnected) this.opener.focus();
    resolve(this.outcome.printed === 0 && !this.outcome.error ? { printed: 0, cancelled: true } : this.outcome);
  }
}
