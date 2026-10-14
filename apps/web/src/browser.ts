import { t, type MessageKey } from "./i18n/index.js";

// What the page can tell about the browser on load, before anyone clicks Connect.

/** Where Brave keeps its Web Bluetooth switch (checked on Brave 1.97). */
export const BRAVE_BLUETOOTH_FLAG = "brave://flags/#brave-web-bluetooth-api";

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

/** One banner: the message as text, with the Brave flag as a `<code>` element. */
function banner(issue: BrowserIssue): HTMLElement {
  const el = document.createElement("p");
  el.className = "banner";
  el.dataset.issue = issue;
  const [before, after] = t(BANNER_TEXT[issue]).split("{flag}");
  el.append(before ?? "");
  if (after !== undefined) {
    const code = document.createElement("code");
    code.textContent = BRAVE_BLUETOOTH_FLAG;
    el.append(code, after);
  }
  return el;
}

export function showBanners(container: HTMLElement, issues: readonly BrowserIssue[]): void {
  container.replaceChildren(...issues.map(banner));
  container.hidden = issues.length === 0;
}
