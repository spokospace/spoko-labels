// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { browserIssues, showBanners } from "../src/browser.js";
import { BRAVE_BLUETOOTH_FLAG } from "../src/help.js";
import { setLang } from "../src/i18n/index.js";

describe("browser detection", () => {
  it("finds nothing in Chrome or Edge on a secure page", () => {
    expect(browserIssues({ bluetooth: {} }, true)).toEqual([]);
    // Brave with its flag on has Web Bluetooth like Chrome.
    expect(browserIssues({ bluetooth: {}, brave: {} }, true)).toEqual([]);
  });

  it("points Brave to its flag when Web Bluetooth is off", () => {
    expect(browserIssues({ brave: {} }, true)).toEqual(["brave-bluetooth"]);
  });

  it("names the supported browsers elsewhere (Firefox, Safari, iOS)", () => {
    expect(browserIssues({}, true)).toEqual(["no-bluetooth"]);
    expect(browserIssues(undefined, true)).toEqual(["no-bluetooth"]);
  });

  it("asks for HTTPS on an insecure page, where Web Bluetooth is hidden anyway", () => {
    expect(browserIssues({}, false)).toEqual(["insecure"]);
    expect(browserIssues({ brave: {} }, false)).toEqual(["insecure"]);
  });
});

describe("banners", () => {
  it("show the Brave flag as text in a code element, in the current language", () => {
    setLang("en");
    const container = document.createElement("div");
    showBanners(container, ["brave-bluetooth"]);
    expect(container.hidden).toBe(false);
    const banner = container.querySelector(".banner");
    expect(banner?.querySelector("code")?.textContent).toBe(BRAVE_BLUETOOTH_FLAG);
    expect(banner?.textContent).toContain("Web Bluetooth API");
    expect(banner?.textContent).not.toContain("{flag}");

    setLang("pl");
    showBanners(container, ["no-bluetooth"]);
    expect(container.textContent).toContain("Chrome lub Edge");
    expect(container.querySelector("code")).toBeNull();
    setLang("en");
  });

  it("hide the container when there is nothing to say", () => {
    const container = document.createElement("div");
    showBanners(container, []);
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
  });
});
