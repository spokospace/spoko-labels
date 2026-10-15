import "./styles.css";
import { defineElements, printerSession } from "@spokospace/labels-embed";
import { browserEnvironment, loadFonts, type FontRegistry } from "@spokospace/labels-render";
import { browserIssues, showBanners } from "./browser.js";
import { mountDataPanel } from "./data-panel.js";
import { el } from "./dom.js";
import { ALL_FONTS, BASE_FONTS } from "./fonts.js";
import { mountHelpPanel, type HelpSection } from "./help.js";
import { applyTranslations, getLang, initLang, LANGS, onLangChange, setLang, t, type Lang } from "./i18n/index.js";
import { mountImportPanel } from "./niimbot-import.js";
import { buildPreview, showPreview, type PreviewElements } from "./preview.js";
import { mountChip, mountPrintControls, type PrintControls } from "./printing.js";
import { mountSettingsPanel } from "./settings-panel.js";
import { templateName, templateSizeText, type AppTemplate } from "./templates/app-template.js";
import { BUILTIN_TEMPLATES, builtinTemplate, DEFAULT_TEMPLATE_ID } from "./templates/builtin.js";
import { templateStore, type BrokenTemplate, type StoredTemplate } from "./templates/imported.js";

// Start-up and wiring: the language, the browser banners, the templates (built-in and imported from the
// NIIMBOT app), the preview, the data, and the printer (embed's chip and print dialog, the settings and the help).

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el as T;
}

const environment = browserEnvironment();
let fonts: FontRegistry | null = null;
let fontsFailed = false;
const imported = templateStore();
let current: AppTemplate = builtinTemplate(DEFAULT_TEMPLATE_ID) ?? (BUILTIN_TEMPLATES[0] as AppTemplate);

const preview: PreviewElements = {
  stage: byId("stage"),
  image: byId("image"),
  overlay: byId("overlay"),
  texts: byId("preview-texts"),
  warnings: byId("warnings"),
  size: byId("preview-size"),
  turned: byId("preview-turned"),
};

/** A built-in template, or an imported one by its stored id. */
const findTemplate = (id: string): AppTemplate | undefined => builtinTemplate(id) ?? imported.find(id);

function removeButton(entry: StoredTemplate | BrokenTemplate): HTMLButtonElement {
  const button = el("button", { type: "button", className: "button small remove" }, "removeTemplate");
  button.setAttribute("aria-label", t("removeTemplateLabel", { name: entry.name }));
  button.addEventListener("click", () => removeImported(entry.id));
  return button;
}

/** One radio in the list; an imported template gets its import date and Remove (outside the label, so the radio's name stays the template's). */
function templateOption(template: AppTemplate, stored?: StoredTemplate): HTMLElement {
  const option = el("div", { className: "template-option" });
  const label = el("label");
  const input = el("input", { type: "radio", name: "template", value: template.id, checked: template.id === current.id });
  input.addEventListener("change", () => selectTemplate(template.id));
  const text = el("span");
  text.append(el("strong", { textContent: templateName(template) }), el("small", { textContent: templateSizeText(template.template) }));
  if (stored) text.append(el("small", { textContent: t("importedOn", { date: stored.importedAt }) }));
  label.append(input, text);
  option.append(label);
  if (stored) option.append(removeButton(stored));
  return option;
}

/** A stored template that no longer validates: its name, what is wrong, and Remove. */
function brokenRow(entry: BrokenTemplate): HTMLElement {
  const row = el("div", { className: "template-broken" });
  const text = el("span");
  text.append(el("strong", { textContent: entry.name }), el("small", { textContent: t("templateBroken") }));
  row.append(text, removeButton(entry));
  return row;
}

function renderTemplateList(): void {
  const nodes: HTMLElement[] = BUILTIN_TEMPLATES.map((b) => templateOption(b));
  if (imported.templates.length > 0 || imported.broken.length > 0) {
    nodes.push(el("h3", { className: "template-group" }, "importedHeading"));
    nodes.push(...imported.templates.flatMap((s) => {
      const app = imported.find(s.id);
      return app ? [templateOption(app, s)] : [];
    }));
    nodes.push(...imported.broken.map(brokenRow));
  }
  byId("template-list").replaceChildren(...nodes);
  const notice = byId("templates-notice");
  notice.hidden = imported.saved;
  notice.textContent = imported.saved ? "" : t("templatesNotSaved");
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
  current = findTemplate(id) ?? current;
  // Redraws the preview through onChange.
  dataPanel.setTemplate(current);
}

function addImported(stored: StoredTemplate[]): void {
  imported.add(stored);
  loadAllFonts();
  const first = stored[0];
  if (first) current = imported.find(first.id) ?? current;
  renderTemplateList();
  dataPanel.setTemplate(current);
}

function removeImported(id: string): void {
  imported.remove(id);
  const was = current;
  if (current.id === id) current = builtinTemplate(DEFAULT_TEMPLATE_ID) ?? current;
  renderTemplateList();
  // The Remove button is gone with the list; the data (picks, selection) stays unless the template changed.
  byId("import-button").focus();
  if (current !== was) dataPanel.setTemplate(current);
}

const openHelp = (section?: HelpSection): void => help.open(section);
const help = mountHelpPanel(document.body, { openSettings: () => settings.open() });
const settings = mountSettingsPanel(document.body, { openHelp });
const importPanel = mountImportPanel(document.body, { environment, fonts: () => fonts, onAdd: addImported });
byId("help-button").addEventListener("click", () => help.open());
byId("settings-button").addEventListener("click", () => settings.open());
byId("import-button").addEventListener("click", () => {
  loadAllFonts();
  importPanel.open();
});
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
  importPanel.refresh();
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

// --- fonts ---------------------------------------------------------------------------------------------------

/** A registry is in: the preview and the import list draw with it. */
function fontsLoaded(registry: FontRegistry): void {
  fonts = registry;
  fontsFailed = false;
  showFontStatus();
  draw();
  importPanel.refresh();
}

/** A load failed: "fonts failed" only while no registry is in at all. */
function fontsNotLoaded(): void {
  fontsFailed = fonts === null;
  showFontStatus();
  draw();
}

let allFonts: Promise<void> | null = null;

/**
 * Loads the NIIMBOT fonts too, once, the first time an imported template can be shown (the import dialog, or
 * imported templates in the list). The base fonts are cached by the browser, so this load fetches only the new
 * files. A failed load is forgotten, so the next call tries again; meanwhile imported templates draw with the
 * base fonts and a `missing-font` note.
 */
function loadAllFonts(): void {
  allFonts ??= loadFonts(environment, ALL_FONTS).then(fontsLoaded, () => {
    allFonts = null;
    fontsNotLoaded();
  });
}

// The page is usable while the fonts load; the preview appears when they are in. With imported templates
// stored, the full set is loaded at once: one load, so the base set can never replace the full one.
if (imported.templates.length > 0) loadAllFonts();
else loadFonts(environment, BASE_FONTS).then((registry) => fonts ?? fontsLoaded(registry), fontsNotLoaded);
