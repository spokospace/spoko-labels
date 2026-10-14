import { el } from "./dom.js";
import { errorText, langOf, t, type Lang } from "./i18n.js";
import { printerSession } from "./instance.js";
import type { PrinterSession, SessionState } from "./session.js";
import { adoptStyles, THEME } from "./styles.js";

const CSS = `${THEME}
  :host { display: inline-block; position: relative; }
  button { display: inline-flex; align-items: center; gap: .4em; padding: .3em .7em; border-radius: var(--_radius);
    border: 1px solid color-mix(in srgb, var(--_fg) 25%, transparent); background: var(--_bg); color: var(--_fg); cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
  .icon { width: 1.1em; height: 1.1em; flex: none; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 18em; }
  /* Icon and dot only, on narrow screens (phones) or when the host asks; the text stays for screen readers and in the tooltip.
     A viewport query, not a container query: size containment would stop the chip sizing to its content. */
  :host([compact="always"]) .label { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); }
  @media (max-width: 40em) {
    :host(:not([compact="never"])) .label { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); }
  }
  .dot { width: .6em; height: .6em; border-radius: 50%; background: color-mix(in srgb, var(--_fg) 40%, transparent); }
  :host([data-state="connected"]) .dot, :host([data-state="printing"]) .dot { background: #16a34a; }
  :host([data-state="unsupported"]) .dot, :host([data-state="busy-elsewhere"]) .dot { background: #d97706; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; padding: .25em; border-radius: var(--_radius);
    background: var(--_bg); border: 1px solid color-mix(in srgb, var(--_fg) 25%, transparent); }
  .menu[hidden] { display: none; }
  .menu button { border: 0; width: 100%; white-space: nowrap; }
  .error { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; max-width: 22em; padding: .4em .6em; border-radius: var(--_radius);
    background: var(--_bg); color: var(--_fg); border: 1px solid #dc2626; font-size: .85em; }
  .error[hidden] { display: none; }
  @media (prefers-reduced-motion: no-preference) { :host([data-state="printing"]) .dot { animation: pulse 1s infinite alternate; } }
  @keyframes pulse { to { opacity: .3; } }
`;

/** A plain printer outline, drawn for this package. */
const PRINTER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>';

/** NIIMBOT printers report charge as a level 0–4 (quarters); anything above 4 is read as a percentage already. */
export function batteryPercent(level: number): number {
  return level <= 4 ? Math.max(0, level) * 25 : Math.min(level, 100);
}

/** The words the chip shows for a state. */
export function statusText(state: SessionState, lang: Lang): string {
  switch (state.kind) {
    case "unsupported":
      return t(lang, state.reason === "insecure-context" ? "insecure" : "noBluetooth");
    case "disconnected":
      return t(lang, "connect");
    case "busy-elsewhere":
      return t(lang, "busyElsewhere");
    case "connecting":
      return t(lang, "connecting");
    case "connected": {
      const name = t(lang, "connected", { name: state.name });
      return state.battery === undefined ? name : `${name} · ${t(lang, "battery", { percent: batteryPercent(state.battery) })}`;
    }
    case "printing":
      return t(lang, "printingProgress", { done: state.done, total: state.total });
  }
}

/**
 * `<spoko-printer-status>`: the printer's state for a toolbar. A click connects; when connected it offers
 * Disconnect. Its own markup lives in a shadow root, so a Livewire morph of the host component cannot wipe it.
 */
export class SpokoPrinterStatus extends HTMLElement {
  session: PrinterSession = printerSession;
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private readonly menu: HTMLDivElement;
  private readonly disconnectButton: HTMLButtonElement;
  private readonly error: HTMLDivElement;
  private readonly onState = () => this.update();

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    adoptStyles(root, CSS);
    const doc = root.ownerDocument;
    const dot = el(doc, "span", { className: "dot" });
    dot.setAttribute("aria-hidden", "true");
    const icon = el(doc, "span", { className: "icon", innerHTML: PRINTER_ICON });
    icon.setAttribute("aria-hidden", "true");
    this.label = el(doc, "span", { className: "label", partName: "label" });
    this.label.setAttribute("aria-live", "polite");
    this.button = el(doc, "button", { type: "button", partName: "button" }, icon, dot, this.label);
    this.disconnectButton = el(doc, "button", { type: "button" });
    this.menu = el(doc, "div", { className: "menu", hidden: true }, this.disconnectButton);
    this.error = el(doc, "div", { className: "error", hidden: true });
    this.error.setAttribute("role", "status");
    root.append(this.button, this.menu, this.error);

    this.button.addEventListener("click", () => this.clicked());
    this.disconnectButton.addEventListener("click", () => {
      this.menu.hidden = true;
      void this.session.disconnect();
    });
  }

  connectedCallback(): void {
    this.session.addEventListener("statechange", this.onState);
    this.update();
    void this.session.refresh();
  }

  disconnectedCallback(): void {
    this.session.removeEventListener("statechange", this.onState);
  }

  private clicked(): void {
    const kind = this.session.state.kind;
    if (kind === "disconnected") {
      // Straight from the click: the chooser needs the user gesture.
      void this.session.connect();
    } else if (kind === "connected") {
      this.menu.hidden = !this.menu.hidden;
      this.button.setAttribute("aria-expanded", String(!this.menu.hidden));
    }
  }

  private update(): void {
    const lang = langOf(this.getAttribute("lang") || undefined);
    const state = this.session.state;
    this.dataset["state"] = state.kind;
    const text = statusText(state, lang);
    this.label.textContent = text;
    this.button.title = text;
    this.button.disabled = state.kind !== "disconnected" && state.kind !== "connected";
    this.disconnectButton.textContent = t(lang, "disconnect");
    if (state.kind !== "connected") {
      this.menu.hidden = true;
      this.button.removeAttribute("aria-expanded");
    }
    const failure = state.kind === "disconnected" && state.error !== undefined && state.error !== "chooser-cancelled";
    this.error.hidden = !failure;
    this.error.textContent = failure ? errorText(lang, state.error) : "";
  }
}
