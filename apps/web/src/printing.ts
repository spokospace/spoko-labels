import type { ErrorCode } from "@spokospace/labels-core";
import { printLabels, type PrintOutcome, type PrintRequest, type SessionState } from "@spokospace/labels-embed";
import type { Offset } from "./calibration.js";
import type { MappedInput } from "./data/mapping.js";
import { MAX_SELECTED, type DataPanel } from "./data-panel.js";
import { el } from "./dom.js";
import { ERROR_HELP, helpButton, type HelpSection } from "./help.js";
import { errorText, getLang, t, type EmbedCode, type Lang, type MessageKey } from "./i18n/index.js";
import type { BuiltinTemplate } from "./templates/builtin.js";

// Printing through labels-embed (A2): the Print button, the request it builds, and the banner that links a
// printer failure to the help. The chip and the dialog (embed's shadow DOM) cannot hold the app's links, so the
// app shows what they report in a banner of its own: session state changes and the outcome of a print. A browser
// without Web Bluetooth gets browser.ts's banner instead, which words Brave apart.

/** The parts of embed's `PrinterSession` the app uses; tests pass a fake. */
export type SessionLike = Pick<EventTarget, "addEventListener" | "removeEventListener"> & { readonly state: SessionState };

/** What the printer banner says. */
export type PrinterNotice = { kind: "error"; code: ErrorCode | EmbedCode; row?: number } | { kind: "busy-elsewhere" };

/**
 * The banner for a session state, or null. A failed connect or a lost connection (`disconnected` with an
 * error) gets one; closing the chooser does not, as in the chip.
 */
export function noticeForState(state: SessionState): PrinterNotice | null {
  if (state.kind === "busy-elsewhere") return { kind: "busy-elsewhere" };
  if (state.kind === "disconnected" && state.error !== undefined && state.error !== "chooser-cancelled") return { kind: "error", code: state.error };
  return null;
}

/** The banner after a print: only a failure has one (a cancel is the user's own). */
export function noticeForOutcome(outcome: PrintOutcome): PrinterNotice | null {
  return outcome.error ? { kind: "error", code: outcome.error.code, row: outcome.error.row } : null;
}

export function noticeHelp(notice: PrinterNotice): HelpSection | null {
  return notice.kind === "error" ? ERROR_HELP[notice.code] : "phone";
}

function noticeText(notice: PrinterNotice): string {
  if (notice.kind === "busy-elsewhere") return t("noticeBusyElsewhere");
  const error = errorText(notice.code);
  return notice.row === undefined ? error : t("noticePrintFailed", { n: notice.row + 1, error });
}

/** The request for `printLabels`: the mapped rows, the template, its column order and the calibration. */
export function buildPrintRequest(template: BuiltinTemplate, input: MappedInput, offsetMm: Offset, lang: Lang = getLang()): PrintRequest {
  return { template: template.template, rows: input.rows, ...(input.columns && { columns: input.columns }), offsetMm, lang };
}

/**
 * Puts a `<spoko-printer-status>` into `slot`. A language switch sets its `lang` attribute, which the chip
 * observes; replacing it would send the session a refresh on every switch.
 */
export function mountChip(slot: HTMLElement, lang: Lang = getLang()): HTMLElement {
  const chip = document.createElement("spoko-printer-status");
  chip.setAttribute("lang", lang);
  slot.replaceChildren(chip);
  return chip;
}

export interface PrintControlsOptions {
  /** The Print button and the line under it that says why it is disabled. */
  button: HTMLButtonElement;
  hint: HTMLElement;
  /** Where the printer banner goes. */
  banner: HTMLElement;
  data: Pick<DataPanel, "printInput" | "hasPrintableRow" | "state">;
  template: () => BuiltinTemplate;
  offset: () => Offset;
  openHelp: (section: HelpSection) => void;
  session: SessionLike;
  /** embed's printLabels; tests stub it. */
  print?: (request: PrintRequest) => Promise<PrintOutcome>;
}

export interface PrintControls {
  /** Redraws the button (after a selection or data change). */
  refresh(): void;
  /** Redraws the button and the banner (after a language switch). */
  translate(): void;
  /** Prints what the button says; resolves when the dialog closes. */
  print(): Promise<void>;
  /** The banner shown now, if any. */
  readonly notice: PrinterNotice | null;
  /** Stops listening to the session. */
  dispose(): void;
}

export function mountPrintControls(options: PrintControlsOptions): PrintControls {
  const { button, hint, banner, data, session } = options;
  const print = options.print ?? ((request: PrintRequest) => printLabels(request));
  let notice: PrinterNotice | null = null;
  let noticeFrom: "session" | "print" = "session";
  let printing = false;

  function drawNotice(): void {
    banner.hidden = notice === null;
    if (!notice) return banner.replaceChildren();
    const parts: (string | Node)[] = [el("span", { textContent: noticeText(notice) })];
    const section = noticeHelp(notice);
    if (section) parts.push(" ", helpButton(section, options.openHelp));
    const dismiss = el("button", { type: "button", className: "link-button dismiss", textContent: t("dismiss") });
    dismiss.addEventListener("click", () => setNotice(null, "print"));
    banner.replaceChildren(...parts, " ", dismiss);
  }

  function setNotice(next: PrinterNotice | null, from: "session" | "print"): void {
    notice = next;
    noticeFrom = from;
    drawNotice();
  }

  /** Why the button is disabled, or null when it can print. */
  function blocked(): MessageKey | null {
    if (session.state.kind === "unsupported") return "printUnsupported";
    if (data.state.selected.size > MAX_SELECTED) return "printOverLimit";
    if (!data.hasPrintableRow()) return "printNoRow";
    return null;
  }

  function refresh(): void {
    const n = data.state.selected.size;
    button.textContent = n > 0 ? t("printSelected", { n }) : t("printPreviewed");
    const reason = blocked();
    button.disabled = printing || reason !== null;
    hint.textContent = reason ? t(reason, { max: MAX_SELECTED }) : "";
    hint.hidden = reason === null;
  }

  const onState = (): void => {
    const state = session.state;
    const next = noticeForState(state);
    // A fresh connect, or a state with nothing to say after one that had, clears the banner.
    if (next) setNotice(next, "session");
    else if (state.kind === "connecting" || state.kind === "connected" || (noticeFrom === "session" && notice)) setNotice(null, "session");
    refresh();
  };
  session.addEventListener("statechange", onState);

  async function printNow(): Promise<void> {
    if (blocked()) return;
    const input = data.printInput();
    if (!input) return;
    printing = true;
    refresh();
    try {
      const outcome = await print(buildPrintRequest(options.template(), input, options.offset()));
      setNotice(noticeForOutcome(outcome), "print");
    } catch {
      // A rejected printLabels is a bug in the request or a dialog already open: say so, plainly.
      setNotice({ kind: "error", code: "internal" }, "print");
    } finally {
      printing = false;
      refresh();
    }
  }

  button.addEventListener("click", () => void printNow());
  refresh();
  drawNotice();
  return {
    refresh,
    translate(): void {
      refresh();
      drawNotice();
    },
    print: printNow,
    get notice() {
      return notice;
    },
    dispose: () => session.removeEventListener("statechange", onState),
  };
}
