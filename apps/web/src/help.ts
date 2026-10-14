import type { ErrorCode } from "@spokospace/labels-core";
import { DEFAULT_OFFSET } from "./calibration.js";
import { panelDialog, showDialog } from "./dialog.js";
import { el } from "./dom.js";
import { formatNumber, t, type EmbedCode, type MessageKey } from "./i18n/index.js";

// The help panel ("Printer help"): browser support, Brave's flags, the phone app, calibration and density.
// It opens from the help button next to the printer chip, from the banners and from print errors, each time
// at the section that answers them. Built from text nodes; the flags are `<code>` elements.

export const HELP_SECTIONS = ["browser", "brave", "phone", "calibration", "density"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

/** Where Brave keeps its Web Bluetooth switch (checked on Brave 1.97). */
export const BRAVE_BLUETOOTH_FLAG = "brave://flags/#brave-web-bluetooth-api";
/** Optional, in Brave, Chrome and Edge: the page reconnects to the printer after a reload without asking. */
export const PERMISSIONS_BACKEND_FLAG = "#enable-web-bluetooth-new-permissions-backend";

/**
 * The help section for each code the chip and the dialog report. A `Record`, so a new code fails
 * `pnpm typecheck` until it has an entry. Most failures after connecting have the same first answer as a
 * printer that cannot be reached (the phone app, then turning the printer off and on), which the phone section
 * covers. The embed's template and app codes have no printer help.
 */
export const ERROR_HELP: Record<ErrorCode | EmbedCode, HelpSection | null> = {
  "bluetooth-unsupported": "browser",
  "chooser-cancelled": "phone",
  "device-unreachable": "phone",
  disconnected: "phone",
  "no-response": "phone",
  refused: "phone",
  "print-timeout": "phone",
  busy: "phone",
  aborted: "phone",
  "invalid-argument": "calibration",
  protocol: "phone",
  template: null,
  render: null,
  internal: null,
};

export const HELP_HEADINGS: Record<HelpSection, MessageKey> = {
  browser: "helpBrowserHeading",
  brave: "helpBraveHeading",
  phone: "helpPhoneHeading",
  calibration: "helpCalibrationHeading",
  density: "helpDensityHeading",
};

const HELP_TEXT: Record<HelpSection, readonly MessageKey[]> = {
  browser: ["helpBrowser1", "helpBrowser2", "helpBrowser3"],
  brave: ["helpBrave1", "helpBrave2"],
  phone: ["helpPhone1", "helpPhone2", "helpPhone3"],
  calibration: ["helpCalibration1", "helpCalibration2"],
  density: ["helpDensity1", "helpDensity2"],
};

/** The `{name}` placeholders the help fills with `<code>` elements. */
const CODES: Readonly<Record<string, string>> = {
  flag: BRAVE_BLUETOOTH_FLAG,
  braveFlag: `brave://flags/${PERMISSIONS_BACKEND_FLAG}`,
  chromeFlag: `chrome://flags/${PERMISSIONS_BACKEND_FLAG}`,
  edgeFlag: `edge://flags/${PERMISSIONS_BACKEND_FLAG}`,
};

/** Text with `{name}` placeholders, as nodes: each name in `codes` becomes a `<code>` element. */
export function withCode(text: string, codes: Readonly<Record<string, string>> = CODES): (string | HTMLElement)[] {
  return text.split(/(\{\w+\})/).map((part) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    const code = name !== undefined && Object.hasOwn(codes, name) ? codes[name] : undefined;
    return code === undefined ? part : el("code", { textContent: code });
  });
}

/** A button that opens the help at `section`, named after it ("Help: Brave"). */
export function helpButton(section: HelpSection, onHelp: (section: HelpSection) => void): HTMLButtonElement {
  const button = el("button", { type: "button", className: "link-button", textContent: t("helpLink", { section: t(HELP_HEADINGS[section]) }) });
  button.dataset.help = section;
  button.addEventListener("click", () => onHelp(section));
  return button;
}

export interface HelpPanel {
  /** Opens the panel, scrolled to `section` when given. */
  open(section?: HelpSection): void;
  close(): void;
  /** Redraws the text (after a language switch). */
  refresh(): void;
  readonly element: HTMLDialogElement;
}

export interface HelpPanelOptions {
  /** Opens the printer settings, from the calibration section. */
  openSettings: () => void;
}

export function mountHelpPanel(parent: HTMLElement, options: HelpPanelOptions): HelpPanel {
  const { dialog, body, translate } = panelDialog("help-panel", "helpTitle");
  parent.append(dialog);

  function section(name: HelpSection): HTMLElement {
    const heading = el("h3", { id: `help-${name}-heading`, tabIndex: -1, textContent: t(HELP_HEADINGS[name]) });
    const box = el("section", { id: `help-${name}`, className: "help-section" });
    box.setAttribute("aria-labelledby", heading.id);
    box.append(heading);
    const defaults = { x: formatNumber(DEFAULT_OFFSET.x), y: formatNumber(DEFAULT_OFFSET.y) };
    for (const key of HELP_TEXT[name]) {
      const p = el("p");
      p.append(...withCode(t(key, defaults)));
      box.append(p);
    }
    if (name === "calibration") {
      const button = el("button", { type: "button", className: "button small", textContent: t("openSettings") });
      button.addEventListener("click", () => {
        dialog.close();
        options.openSettings();
      });
      box.append(button);
    }
    return box;
  }

  const draw = (): void => body.replaceChildren(...HELP_SECTIONS.map(section));
  draw();
  return {
    element: dialog,
    open(name) {
      showDialog(dialog);
      const heading = name ? dialog.querySelector<HTMLElement>(`#help-${name}-heading`) : null;
      if (heading) {
        heading.focus();
        heading.scrollIntoView?.({ block: "start" });
      }
    },
    close: () => dialog.close(),
    refresh(): void {
      translate();
      draw();
    },
  };
}
