import "./styles.css";
import { defineElements, printerSession } from "@spokospace/labels-embed";
import { browserEnvironment, bundledFonts, loadFonts, type FontRegistry } from "@spokospace/labels-render";
import { browserIssues, showBanners } from "./browser.js";
import { mountDataPanel } from "./data-panel.js";
import { mountHelpPanel, type HelpSection } from "./help.js";
import { applyTranslations, getLang, initLang, LANGS, onLangChange, setLang, t, type Lang } from "./i18n/index.js";
import { buildPreview, showPreview, type PreviewElements } from "./preview.js";
import { mountChip, mountPrintControls, type PrintControls } from "./printing.js";
import { mountSettingsPanel } from "./settings-panel.js";
import { BUILTIN_TEMPLATES, builtinTemplate, DEFAULT_TEMPLATE_ID, type BuiltinTemplate } from "./templates/builtin.js";

// Start-up and wiring: the language, the browser banners, the built-in templates, the preview, the data, and the
// printer (embed's chip and print dialog, the settings and the help).

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el as T;
}

const environment = browserEnvironment();
let fonts: FontRegistry | null = null;
let fontsFailed = false;
let current: BuiltinTemplate = builtinTemplate(DEFAULT_TEMPLATE_ID) ?? (BUILTIN_TEMPLATES[0] as BuiltinTemplate);

const preview: PreviewElements = {
  stage: byId("stage"),
  image: byId("image"),
  overlay: byId("overlay"),
  texts: byId("preview-texts"),
  warnings: byId("warnings"),
  size: byId("preview-size"),
  turned: byId("preview-turned"),
};

function renderTemplateList(): void {
  const list = byId("template-list");
  list.replaceChildren(
    ...BUILTIN_TEMPLATES.map((b) => {
      const option = document.createElement("label");
      option.className = "template-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "template";
      input.value = b.id;
      input.checked = b.id === current.id;
      input.addEventListener("change", () => selectTemplate(b.id));
      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = t(b.name);
      const size = document.createElement("small");
      const { width, height } = b.template.size;
      size.textContent = t(b.template.printRotation ? "templateSizeTurned" : "templateSize", { width, height });
      text.append(name, size);
      option.append(input, text);
      return option;
    }),
  );
}

/** Renders the current template and row; the only place the preview is built. */
function draw(): void {
  const data = dataPanel.previewData();
  byId("preview-row").textContent = dataPanel.previewText();
  showPreview(preview, fonts ? buildPreview(current.template, data, environment, fonts) : null, data);
}

function showFontStatus(): void {
  byId("font-status").textContent = fontsFailed ? t("fontsFailed") : fonts ? "" : t("loadingFonts");
}

function selectTemplate(id: string): void {
  current = builtinTemplate(id) ?? current;
  // Redraws the preview through onChange.
  dataPanel.setTemplate(current);
}

const openHelp = (section?: HelpSection): void => help.open(section);
const help = mountHelpPanel(document.body, { openSettings: () => settings.open() });
const settings = mountSettingsPanel(document.body, { openHelp });
byId("help-button").addEventListener("click", () => help.open());
byId("settings-button").addEventListener("click", () => settings.open());
// Created after the data panel, which it reads; the data panel's callback refreshes it.
let printControls: PrintControls | null = null;

function showLang(lang: Lang): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
  applyTranslations(document);
  document.title = t("appTitle");
  showBanners(byId("banners"), browserIssues(navigator, globalThis.isSecureContext !== false), openHelp);
  renderTemplateList();
  dataPanel.refresh();
  help.refresh();
  settings.refresh();
  printControls?.translate();
  showFontStatus();
  draw();
}

initLang();
// The embed elements, once (A2). The app imports the package entry, never the bundle.
defineElements();
const chip = mountChip(byId("printer-slot"));
const dataPanel = mountDataPanel(byId("data"), {
  template: current,
  onChange: (change) => {
    if (change === "preview") draw();
    printControls?.refresh();
  },
  dev: import.meta.env.DEV,
});
printControls = mountPrintControls({
  button: byId("print-button"),
  hint: byId("print-hint"),
  banner: byId("printer-banner"),
  data: dataPanel,
  template: () => current,
  offset: () => settings.offset(),
  openHelp,
  session: printerSession,
});
showLang(getLang());
onLangChange((lang) => {
  // The chip observes its lang attribute and redraws; the session is not touched.
  chip.setAttribute("lang", lang);
  showLang(lang);
});
// A printer picked before reconnects without the chooser where the browser allows it; otherwise the chip offers Connect.
void printerSession.tryReconnect();
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
  button.addEventListener("click", () => {
    const lang = LANGS.find((l) => l === button.dataset.lang);
    if (lang) setLang(lang);
  });
}

// The page is usable while the fonts load; the preview appears when they are in.
loadFonts(environment, bundledFonts).then(
  (registry) => {
    fonts = registry;
  },
  () => {
    fontsFailed = true;
  },
).finally(() => {
  showFontStatus();
  draw();
});
