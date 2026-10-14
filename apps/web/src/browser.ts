import { helpButton, withCode, type HelpSection } from "./help.js";
import { t, type MessageKey } from "./i18n/index.js";

// What the page can tell about the browser on load, before anyone clicks Connect.

export type BrowserIssue = "insecure" | "brave-bluetooth" | "no-bluetooth";

/** The parts of `navigator` the checks read. */
export interface NavigatorLike {
  bluetooth?: unknown;
  /** Present in Brave only. */
  brave?: unknown;
}

/**
 * The banners to show. An insecure page has no `navigator.bluetooth` either (the API needs a secure context),
 * so it gets only the HTTPS banner: switching browsers would not help there.
 */
export function browserIssues(nav: object | undefined, secureContext: boolean): BrowserIssue[] {
  if (!secureContext) return ["insecure"];
  const { bluetooth, brave } = (nav ?? {}) as NavigatorLike;
  if (bluetooth) return [];
  return [brave ? "brave-bluetooth" : "no-bluetooth"];
}

const BANNER_TEXT: Record<BrowserIssue, MessageKey> = {
  insecure: "bannerInsecure",
  "brave-bluetooth": "bannerBrave",
  "no-bluetooth": "bannerNoBluetooth",
};

/** The help section each banner links to. */
export const BANNER_HELP: Record<BrowserIssue, HelpSection> = {
  insecure: "browser",
  "brave-bluetooth": "brave",
  "no-bluetooth": "browser",
};

/** One banner: the message as text, with the Brave flag as a `<code>` element, and a link to the help. */
function banner(issue: BrowserIssue, onHelp: ((section: HelpSection) => void) | undefined): HTMLElement {
  const el = document.createElement("p");
  el.className = "banner";
  el.dataset.issue = issue;
  el.append(...withCode(t(BANNER_TEXT[issue])));
  if (onHelp) el.append(" ", helpButton(BANNER_HELP[issue], onHelp));
  return el;
}

export function showBanners(container: HTMLElement, issues: readonly BrowserIssue[], onHelp?: (section: HelpSection) => void): void {
  container.replaceChildren(...issues.map((issue) => banner(issue, onHelp)));
  container.hidden = issues.length === 0;
}
