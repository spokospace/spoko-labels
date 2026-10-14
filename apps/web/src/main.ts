import "./styles.css";
import { browserEnvironment, bundledFonts, loadFonts, type FontRegistry } from "@spokospace/labels-render";
import { browserIssues, showBanners } from "./browser.js";
import { applyTranslations, getLang, initLang, LANGS, onLangChange, setLang, t, type Lang } from "./i18n/index.js";
import { buildPreview, showPreview, type PreviewElements } from "./preview.js";
import { BUILTIN_TEMPLATES, builtinTemplate, DEFAULT_TEMPLATE_ID, type BuiltinTemplate } from "./templates/builtin.js";

// Start-up and wiring. Phase 1: the language, the browser banners, the built-in templates and the preview.

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el as T;
}

const environment = browserEnvironment();
let fonts: FontRegistry | null = null;
let fontsFailed = false;
let current: BuiltinTemplate = builtinTemplate(DEFAULT_TEMPLATE_ID) ?? (BUILTIN_TEMPLATES[0] as BuiltinTemplate);
let rowIndex = 0;

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

function renderSampleRows(): void {
  const select = byId<HTMLSelectElement>("sample-row");
  select.replaceChildren(
    ...current.sampleRows.map((row, i) => {
      // The first value of the row says which row it is; set as text by the Option constructor.
      const first = Object.values(row)[0] ?? "";
      return new Option(`${t("sampleRowOption", { n: i + 1 })}: ${first}`, String(i), false, i === rowIndex);
    }),
  );
}

/** Renders the current template and row; the only place the preview is built. */
function draw(): void {
  const data = { row: current.sampleRows[rowIndex] ?? {} };
  showPreview(preview, fonts ? buildPreview(current.template, data, environment, fonts) : null, data);
}

function showFontStatus(): void {
  byId("font-status").textContent = fontsFailed ? t("fontsFailed") : fonts ? "" : t("loadingFonts");
}

function selectTemplate(id: string): void {
  current = builtinTemplate(id) ?? current;
  rowIndex = 0;
  renderSampleRows();
  draw();
}

function showLang(lang: Lang): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
  applyTranslations(document);
  document.title = t("appTitle");
  showBanners(byId("banners"), browserIssues(navigator, globalThis.isSecureContext !== false));
  renderTemplateList();
  renderSampleRows();
  showFontStatus();
  draw();
}

initLang();
showLang(getLang());
onLangChange((lang) => {
  showLang(lang);
  // Phase 3: remount <spoko-printer-status> here; the chip reads <html lang> only when it is attached.
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
  button.addEventListener("click", () => {
    const lang = LANGS.find((l) => l === button.dataset.lang);
    if (lang) setLang(lang);
  });
}
byId<HTMLSelectElement>("sample-row").addEventListener("change", (event) => {
  rowIndex = Number((event.target as HTMLSelectElement).value) || 0;
  draw();
});

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
