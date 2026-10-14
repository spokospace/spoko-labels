// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANNER_HELP, showBanners } from "../src/browser.js";
import { ERROR_HELP, HELP_SECTIONS, mountHelpPanel, PERMISSIONS_BACKEND_FLAG } from "../src/help.js";
import { setLang } from "../src/i18n/index.js";

// Every labels-core ErrorCode, listed so a new code fails here as well as in the type check.
const CORE_CODES = [
  "bluetooth-unsupported", "chooser-cancelled", "device-unreachable", "disconnected", "no-response", "refused",
  "print-timeout", "busy", "aborted", "invalid-argument", "protocol",
] as const;

beforeEach(() => {
  setLang("en");
  document.body.replaceChildren();
});

describe("the help sections", () => {
  it("cover every labels-core error code, each pointing at a section the panel has", () => {
    expect(Object.keys(ERROR_HELP).sort()).toEqual([...CORE_CODES, "internal", "render", "template"].sort());
    const panel = mountHelpPanel(document.body, { openSettings: vi.fn() });
    for (const code of CORE_CODES) {
      const section = ERROR_HELP[code];
      expect(HELP_SECTIONS).toContain(section);
      expect(panel.element.querySelector(`#help-${section}-heading`)?.textContent).not.toBe("");
    }
    expect(ERROR_HELP["device-unreachable"]).toBe("phone");
    expect(ERROR_HELP["bluetooth-unsupported"]).toBe("browser");
    expect(ERROR_HELP["invalid-argument"]).toBe("calibration");
  });

  it("has no printer help for the embed's template and app codes", () => {
    expect(ERROR_HELP.template).toBeNull();
    expect(ERROR_HELP.render).toBeNull();
    expect(ERROR_HELP.internal).toBeNull();
  });

  it("names Brave's flag and the optional permissions flag for Brave, Chrome and Edge, as code", () => {
    const panel = mountHelpPanel(document.body, { openSettings: vi.fn() });
    const codes = [...panel.element.querySelectorAll("#help-brave code")].map((c) => c.textContent);
    expect(codes).toEqual([
      "brave://flags/#brave-web-bluetooth-api",
      `brave://flags/${PERMISSIONS_BACKEND_FLAG}`,
      `chrome://flags/${PERMISSIONS_BACKEND_FLAG}`,
      `edge://flags/${PERMISSIONS_BACKEND_FLAG}`,
    ]);
    expect(panel.element.querySelector("#help-brave")?.textContent).toContain("Brave 1.97");
    // The calibration default with the language's decimal separator.
    expect(panel.element.querySelector("#help-calibration")?.textContent).toContain("0.5 mm down");
    setLang("pl");
    panel.refresh();
    expect(panel.element.querySelector("#help-calibration")?.textContent).toContain("0,5 mm w pionie");
  });

  it("opens at the asked section, redraws in the new language, and opens the settings from calibration", () => {
    const openSettings = vi.fn();
    const panel = mountHelpPanel(document.body, { openSettings });
    panel.open("phone");
    expect(panel.element.open).toBe(true);
    expect(document.activeElement?.id).toBe("help-phone-heading");
    setLang("pl");
    panel.refresh();
    expect(panel.element.querySelector("#help-phone-heading")?.textContent).toBe("Aplikacja w telefonie i połączenie");
    expect(panel.element.querySelector("h2")?.textContent).toBe("Pomoc drukarki");
    setLang("en");
    panel.refresh();
    const button = [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Open printer settings") as HTMLButtonElement;
    button.click();
    expect(openSettings).toHaveBeenCalled();
    expect(panel.element.open).toBe(false);
  });
});

describe("the browser banners", () => {
  it("link to the matching help section", () => {
    const container = document.createElement("div");
    const onHelp = vi.fn();
    showBanners(container, ["brave-bluetooth"], onHelp);
    const link = container.querySelector<HTMLButtonElement>("button[data-help]") as HTMLButtonElement;
    expect(link.textContent).toBe("Help: Brave");
    link.click();
    expect(onHelp).toHaveBeenCalledWith("brave");
    expect(BANNER_HELP["no-bluetooth"]).toBe("browser");
    expect(BANNER_HELP.insecure).toBe("browser");
  });
});
