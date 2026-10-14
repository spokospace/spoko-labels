import { MAX_LABELS } from "@spokospace/labels-embed";
import type { RenderData } from "@spokospace/labels-render";
import { loadApi, TIMEOUT_MS, urlToStore, type ApiError, type ApiErrorCode, type ApiResult } from "./data/api.js";
import { autoMapping, fieldKey, mapInput, templateFields, type Field, type Mapping } from "./data/mapping.js";
import { search, searchIndex } from "./data/search.js";
import { cell, columnLetter, makeRow, makeTable, MAX_BYTES, MAX_COLUMNS, MAX_ROWS, unionColumns, type DataTable, type Row } from "./data/table.js";
import { readXlsx, type XlsxErrorCode, type XlsxResult } from "./data/xlsx.js";
import { getLang, t, type Lang, type MessageKey } from "./i18n/index.js";
import { readStored, STORAGE_KEYS, writeStored } from "./storage.js";
import type { BuiltinTemplate } from "./templates/builtin.js";

// The Data panel: the sources (sample rows, an xlsx file, a JSON API), the column pickers, the search and
// the row table with its selection. Data lives in memory only; nothing the user loads is stored (A7).
// Everything loaded is shown as text: textContent and built nodes, never innerHTML.

/** At most this many rows print at once: embed's limit (A10). */
export const MAX_SELECTED = MAX_LABELS;
/** Rows drawn into the table at a time; "Show more" draws the next ones. Keeps a phone responsive. */
export const PAGE_SIZE = 200;

const XLSX_ERRORS: Record<XlsxErrorCode, MessageKey> = {
  "too-large": "xlsxTooLarge",
  "not-xlsx": "xlsxNotXlsx",
  "no-rows": "xlsxNoRows",
  "load-failed": "xlsxLoadFailed",
};

const API_ERRORS: Record<ApiErrorCode, MessageKey> = {
  "invalid-url": "apiInvalidUrl",
  "insecure-url": "apiInsecureUrl",
  cors: "apiCors",
  network: "apiNetwork",
  "http-status": "apiHttpStatus",
  "too-large": "apiTooLarge",
  timeout: "apiTimeout",
  cancelled: "apiCancelled",
  "not-json": "apiNotJson",
  "no-array": "apiNoArray",
  "no-rows": "apiNoRows",
};

const MB = MAX_BYTES / (1024 * 1024);

export function apiErrorText(error: ApiError, path: string): string {
  if (error.code === "no-array") {
    const keys = error.keys?.length ? error.keys.slice(0, 20).join(", ") : t("noKeys");
    return path.trim() ? t("apiNoArray", { path: path.trim(), keys }) : t("apiNoArrayTop", { keys });
  }
  return t(API_ERRORS[error.code], { status: error.status ?? "", limit: MB, seconds: TIMEOUT_MS / 1000 });
}

export function xlsxErrorText(code: XlsxErrorCode): string {
  return t(XLSX_ERRORS[code], { limit: MB });
}

export type Source =
  | { kind: "sample"; table: DataTable; lang: Lang }
  | { kind: "xlsx"; table: DataTable; name: string }
  | { kind: "api"; table: DataTable; url: string; path: string };

type Status = { kind: "idle" } | { kind: "loading"; message: MessageKey; cancellable: boolean } | { kind: "error"; text: string };

export interface DataPanelOptions {
  template: BuiltinTemplate;
  /** Called whenever the previewed row or the picks change. */
  onChange: () => void;
  /** Accept http://localhost API URLs (vite dev). */
  dev?: boolean;
  readFile?: (file: Blob) => Promise<XlsxResult>;
  loadUrl?: typeof loadApi;
}

export interface DataPanel {
  /** The data the preview renders: the previewed row mapped onto the template, or a sample row without data. */
  previewData(): RenderData;
  /** Which row the preview shows, in words. */
  previewText(): string;
  setTemplate(template: BuiltinTemplate): void;
  /** Redraws every text (after a language switch); sample data switches to the new language. */
  refresh(): void;
  /** For tests and Phase 3: the current state. */
  readonly state: {
    readonly source: Source | null;
    readonly selected: ReadonlySet<number>;
    readonly shown: readonly number[];
    readonly previewIndex: number;
    readonly mapping: Mapping;
  };
  useSample(): void;
  openFile(file: Blob & { name?: string }): Promise<void>;
  loadUrl(url: string, path: string): Promise<void>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, i18n?: MessageKey): HTMLElementTagNameMap[K] {
  const node: HTMLElement = Object.assign(document.createElement(tag), props);
  if (i18n) {
    node.dataset.i18n = i18n;
    node.textContent = t(i18n);
  }
  return node as HTMLElementTagNameMap[K];
}

/** The template's sample rows, in the app's language. */
function sampleSource(template: BuiltinTemplate): Source {
  const lang = getLang();
  const rows = template.sampleRows[lang];
  return { kind: "sample", table: makeTable(unionColumns(rows), rows, cell), lang };
}

/** The app's xlsx reader: empty headers are named in the current language. */
const readFile = (file: Blob): Promise<XlsxResult> => readXlsx(file, { emptyName: (letter) => t("xlsxColumn", { letter }) });

/** Builds the Data panel's controls into `container` and wires them. */
export function mountDataPanel(container: HTMLElement, options: DataPanelOptions): DataPanel {
  let template = options.template;
  let fields: Field[] = templateFields(template.template);
  let source: Source | null = null;
  let mapping: Map<string, string | null> = new Map();
  let index: string[] = [];
  let shown: number[] = [];
  let pageEnd = PAGE_SIZE;
  let previewIndex = 0;
  let selected = new Set<number>();
  let status: Status = { kind: "idle" };
  let pending: AbortController | null = null;
  let loadToken = 0;

  // The controls. Static labels carry data-i18n, so applyTranslations() redraws them on a language switch.
  const sampleButton = el("button", { type: "button", className: "button" }, "useSample");
  const fileButton = el("button", { type: "button", className: "button" }, "openXlsx");
  const fileInput = el("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hidden: true });
  const urlButton = el("button", { type: "button", className: "button" }, "loadFromUrl");
  urlButton.setAttribute("aria-expanded", "false");
  const sources = el("div", { className: "sources" });
  sources.append(sampleButton, fileButton, fileInput, urlButton);

  const urlInput = el("input", { type: "url", id: "api-url", autocomplete: "off", spellcheck: false, placeholder: "https://" });
  urlInput.setAttribute("inputmode", "url");
  const pathInput = el("input", { type: "text", id: "api-path", autocomplete: "off", spellcheck: false, placeholder: "data.items" });
  const urlLabel = el("label", { htmlFor: "api-url" }, "apiUrl");
  const urlNote = el("p", { className: "hint", id: "api-url-note" }, "apiUrlNote");
  urlInput.setAttribute("aria-describedby", "api-url-note");
  const pathLabel = el("label", { htmlFor: "api-path" }, "apiPath");
  const pathNote = el("p", { className: "hint", id: "api-path-note" }, "apiPathHint");
  pathInput.setAttribute("aria-describedby", "api-path-note");
  const loadButton = el("button", { type: "submit", className: "button primary" }, "apiLoad");
  const cancelButton = el("button", { type: "button", className: "button", hidden: true }, "cancel");
  const form = el("form", { className: "api-form", hidden: true, noValidate: true });
  form.id = "api-form";
  urlButton.setAttribute("aria-controls", form.id);
  const formButtons = el("div", { className: "sources" });
  formButtons.append(loadButton, cancelButton);
  form.append(urlLabel, urlInput, urlNote, pathLabel, pathInput, pathNote, formButtons);
  urlInput.value = readStored(STORAGE_KEYS.apiUrl) ?? "";
  pathInput.value = readStored(STORAGE_KEYS.apiPath) ?? "";

  const statusLine = el("p", { className: "status" });
  statusLine.setAttribute("role", "status");
  statusLine.setAttribute("aria-live", "polite");

  const body = el("div", { className: "data-body", hidden: true });
  const sourceLine = el("p", { className: "hint source-line" });
  const reloadButton = el("button", { type: "button", className: "button small", hidden: true }, "apiReload");
  const sourceBar = el("div", { className: "source-bar" });
  sourceBar.append(sourceLine, reloadButton);

  const mappingBox = el("fieldset", { className: "mapping" });
  const mappingLegend = el("legend", {}, "mappingHeading");
  const mappingFields = el("div", { className: "mapping-fields" });
  mappingBox.append(mappingLegend, mappingFields);

  const searchInput = el("input", { type: "search", id: "row-search", autocomplete: "off" });
  const searchLabel = el("label", { htmlFor: "row-search" }, "search");
  const searchField = el("div", { className: "field" });
  searchField.append(searchLabel, searchInput);

  const selectAll = el("input", { type: "checkbox", id: "select-all-shown" });
  const selectAllLabel = el("label", { className: "select-all" });
  selectAllLabel.append(selectAll, el("span", {}, "selectAllShown"));
  const countLine = el("span", { className: "count" });
  countLine.setAttribute("aria-live", "polite");
  const selectionBar = el("div", { className: "selection-bar" });
  selectionBar.append(selectAllLabel, countLine);
  const limitLine = el("p", { className: "banner", hidden: true });
  limitLine.setAttribute("role", "alert");

  const table = el("table", { className: "rows" });
  // A grid: arrows move between rows and space selects one, as a listbox-like table does.
  table.setAttribute("role", "grid");
  table.setAttribute("aria-multiselectable", "true");
  table.setAttribute("aria-labelledby", "rows-caption");
  const caption = el("caption", { className: "visually-hidden", id: "rows-caption" }, "rowsCaption");
  const thead = el("thead");
  const tbody = el("tbody");
  table.append(caption, thead, tbody);
  const tableWrap = el("div", { className: "table-wrap" });
  tableWrap.append(table);
  const moreLine = el("p", { className: "hint more" });
  const moreButton = el("button", { type: "button", className: "button small", hidden: true });

  body.append(sourceBar, mappingBox, searchField, selectionBar, limitLine, tableWrap, moreLine, moreButton);
  container.append(sources, form, statusLine, body);

  // --- drawing -------------------------------------------------------------------------------------------

  function showStatus(): void {
    statusLine.classList.toggle("loading", status.kind === "loading");
    statusLine.classList.toggle("error", status.kind === "error");
    cancelButton.hidden = !(status.kind === "loading" && status.cancellable);
    loadButton.disabled = status.kind === "loading";
    if (status.kind === "loading") statusLine.textContent = t(status.message);
    else if (status.kind === "error") statusLine.textContent = status.text;
    else statusLine.textContent = source ? "" : t("noData");
  }

  function sourceText(s: Source): string {
    const n = s.table.rows.length;
    if (s.kind === "sample") return t("sourceSample", { template: t(template.name), n });
    if (s.kind === "xlsx") return t("sourceFile", { name: s.name, n });
    return t("sourceApi", { url: urlToStore(s.url) ?? s.url, n });
  }

  function drawSource(): void {
    body.hidden = source === null;
    reloadButton.hidden = source?.kind !== "api";
    if (!source) return;
    const { truncated, columnsTruncated } = source.table;
    sourceLine.textContent = [
      sourceText(source),
      ...(truncated ? [t("rowsTruncated", { max: MAX_ROWS })] : []),
      ...(columnsTruncated ? [t("columnsTruncated", { max: MAX_COLUMNS })] : []),
    ].join(" ");
  }

  function drawMapping(): void {
    if (!source) return;
    const columns = source.table.columns;
    mappingBox.hidden = fields.length === 0;
    mappingFields.replaceChildren(
      ...fields.map((field, n) => {
        const key = fieldKey(field);
        const id = `pick-${n}`;
        const label = el("label", { htmlFor: id });
        label.textContent = field.kind === "name" ? field.name : t("fieldPosition", { letter: columnLetter(field.index) });
        const select = el("select", { id });
        select.dataset.field = key;
        const picked = mapping.get(key) ?? null;
        select.append(
          el("option", { value: "", textContent: t("mappingNone") }),
          ...columns.map((c, i) => el("option", { value: String(i), textContent: c })),
        );
        select.selectedIndex = picked === null ? 0 : columns.indexOf(picked) + 1;
        select.addEventListener("change", () => {
          const column = select.value === "" ? null : (columns[Number(select.value)] ?? null);
          mapping.set(key, column);
          options.onChange();
        });
        const row = el("div", { className: "pick" });
        row.append(label, select);
        return row;
      }),
    );
  }

  function drawHead(): void {
    const tr = el("tr");
    const check = el("th", { scope: "col", className: "check" });
    check.append(el("span", { className: "visually-hidden" }, "selectColumn"));
    tr.append(check, ...(source?.table.columns ?? []).map((c) => el("th", { scope: "col", textContent: c })));
    thead.replaceChildren(tr);
  }

  function rowElement(i: number): HTMLTableRowElement {
    const row = source?.table.rows[i] as Row;
    const tr = el("tr", { tabIndex: i === previewIndex ? 0 : -1 });
    tr.dataset.index = String(i);
    if (i === previewIndex) tr.setAttribute("aria-current", "true");
    tr.setAttribute("aria-selected", String(selected.has(i)));
    const box = el("input", { type: "checkbox", checked: selected.has(i), tabIndex: -1 });
    box.setAttribute("aria-label", t("selectRow", { n: i + 1 }));
    const check = el("td", { className: "check" });
    check.append(box);
    tr.append(
      check,
      ...(source?.table.columns ?? []).map((c) => {
        const td = el("td", { textContent: cell(row, c) });
        // The column name, for the list layout on a phone (CSS shows it before the value).
        td.dataset.label = c;
        return td;
      }),
    );
    return tr;
  }

  function drawRows(): void {
    if (!source) return;
    if (shown.length === 0) {
      const td = el("td", { colSpan: source.table.columns.length + 1, className: "empty" }, "noMatches");
      const tr = el("tr");
      tr.append(td);
      tbody.replaceChildren(tr);
    } else {
      tbody.replaceChildren(...shown.slice(0, pageEnd).map(rowElement));
      // Keep one row reachable with Tab when the previewed row is not drawn.
      if (!tbody.querySelector('tr[tabindex="0"]')) tbody.querySelector("tr")?.setAttribute("tabindex", "0");
    }
    drawPager();
    drawSelection();
  }

  /** "Show more" and the "Showing … of …" line. */
  function drawPager(): void {
    const rest = Math.max(0, shown.length - pageEnd);
    moreButton.hidden = rest === 0;
    moreButton.textContent = t("showMore", { n: Math.min(rest, PAGE_SIZE) });
    moreLine.textContent = rest > 0 ? t("showingRows", { shown: pageEnd, total: shown.length }) : "";
  }

  function drawSelection(): void {
    const n = selected.size;
    countLine.textContent = n === 0 ? t("selectedNone") : t("selectedCount", { n });
    limitLine.hidden = n <= MAX_SELECTED;
    // An alert speaks when its text changes, so it has text only while it is shown.
    limitLine.textContent = limitLine.hidden ? "" : t("selectionLimit", { max: MAX_SELECTED, n });
    const shownSelected = shown.filter((i) => selected.has(i)).length;
    selectAll.checked = shown.length > 0 && shownSelected === shown.length;
    selectAll.indeterminate = shownSelected > 0 && shownSelected < shown.length;
    selectAll.disabled = shown.length === 0;
  }

  function drawAll(): void {
    showStatus();
    drawSource();
    drawMapping();
    drawHead();
    drawRows();
  }

  // --- state changes -------------------------------------------------------------------------------------

  /** Shows a new source; any load still running is stopped and its result ignored. */
  function setSource(next: Source): void {
    pending?.abort();
    pending = null;
    loadToken++;
    status = { kind: "idle" };
    source = next;
    mapping = autoMapping(fields, next.table.columns);
    index = searchIndex(next.table);
    searchInput.value = "";
    shown = search(index, "");
    selected = new Set();
    previewIndex = 0;
    pageEnd = PAGE_SIZE;
    drawAll();
    options.onChange();
  }

  function setPreview(i: number, focus: boolean): void {
    if (i === previewIndex) {
      if (focus) tbody.querySelector<HTMLTableRowElement>(`tr[data-index="${i}"]`)?.focus();
      return;
    }
    previewIndex = i;
    for (const tr of tbody.querySelectorAll<HTMLTableRowElement>("tr[data-index]")) {
      const current = tr.dataset.index === String(i);
      tr.tabIndex = current ? 0 : -1;
      if (current) tr.setAttribute("aria-current", "true");
      else tr.removeAttribute("aria-current");
      if (current && focus) tr.focus();
    }
    options.onChange();
  }

  function toggle(i: number, on = !selected.has(i)): void {
    if (on) selected.add(i);
    else selected.delete(i);
    const tr = tbody.querySelector<HTMLTableRowElement>(`tr[data-index="${i}"]`);
    if (tr) showSelected(tr, on);
    drawSelection();
  }

  /** The row's checkbox and its aria-selected, kept in step. */
  function showSelected(tr: HTMLTableRowElement, on: boolean): void {
    tr.setAttribute("aria-selected", String(on));
    const box = tr.querySelector("input");
    if (box) box.checked = on;
  }

  /** Starts a load, stopping any other; a result whose token is no longer current is ignored. */
  function begin(message: MessageKey, cancellable: boolean): { token: number; signal: AbortSignal } {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    status = { kind: "loading", message, cancellable };
    showStatus();
    return { token: ++loadToken, signal: controller.signal };
  }

  function fail(text: string): void {
    // The previous data stays.
    status = { kind: "error", text };
    showStatus();
  }

  async function openFile(file: Blob & { name?: string }): Promise<void> {
    const { token } = begin("loadingFile", false);
    const result = await (options.readFile ?? readFile)(file);
    if (token !== loadToken) return;
    if (!result.ok) return fail(xlsxErrorText(result.error));
    setSource({ kind: "xlsx", table: result.table, name: file.name ?? "" });
  }

  async function loadUrl(url: string, path: string): Promise<void> {
    const { token, signal } = begin("loadingUrl", true);
    const result: ApiResult = await (options.loadUrl ?? loadApi)(url, { path, signal, dev: options.dev ?? false });
    if (token !== loadToken) return;
    if (!result.ok) return fail(apiErrorText(result.error, path));
    // Only the address without its query, fragment and credentials is remembered (A7).
    const stored = urlToStore(url);
    if (stored !== null) writeStored(STORAGE_KEYS.apiUrl, stored);
    writeStored(STORAGE_KEYS.apiPath, path.trim());
    setSource({ kind: "api", table: result.table, url, path });
  }

  function useSample(): void {
    setSource(sampleSource(template));
  }

  // --- events --------------------------------------------------------------------------------------------

  sampleButton.addEventListener("click", useSample);
  fileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void openFile(file);
  });
  urlButton.addEventListener("click", () => {
    form.hidden = !form.hidden;
    urlButton.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) urlInput.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadUrl(urlInput.value, pathInput.value);
  });
  cancelButton.addEventListener("click", () => pending?.abort());
  reloadButton.addEventListener("click", () => {
    if (source?.kind === "api") void loadUrl(source.url, source.path);
  });

  searchInput.addEventListener("input", () => {
    shown = search(index, searchInput.value);
    pageEnd = PAGE_SIZE;
    // The preview stays on a row the search still shows; otherwise it moves to the first match, or to none.
    if (!shown.includes(previewIndex)) setPreview(shown[0] ?? -1, false);
    drawRows();
  });
  selectAll.addEventListener("change", () => {
    for (const i of shown) {
      if (selectAll.checked) selected.add(i);
      else selected.delete(i);
    }
    for (const tr of tbody.querySelectorAll<HTMLTableRowElement>("tr[data-index]")) showSelected(tr, selectAll.checked);
    drawSelection();
  });
  moreButton.addEventListener("click", () => {
    const from = pageEnd;
    pageEnd += PAGE_SIZE;
    tbody.append(...shown.slice(from, pageEnd).map(rowElement));
    drawPager();
  });

  const rowOf = (target: EventTarget | null): HTMLTableRowElement | null =>
    target instanceof Element ? target.closest<HTMLTableRowElement>("tr[data-index]") : null;

  tbody.addEventListener("click", (event) => {
    const tr = rowOf(event.target);
    if (!tr) return;
    const i = Number(tr.dataset.index);
    if (event.target instanceof HTMLInputElement) toggle(i, event.target.checked);
    else setPreview(i, true);
  });
  tbody.addEventListener("keydown", (event) => {
    const tr = rowOf(event.target);
    if (!tr) return;
    const rows = [...tbody.querySelectorAll<HTMLTableRowElement>("tr[data-index]")];
    const at = rows.indexOf(tr);
    const go = (to: number) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (next) setPreview(Number(next.dataset.index), true);
    };
    switch (event.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(rows.length - 1);
        break;
      case " ":
        toggle(Number(tr.dataset.index));
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  drawAll();

  return {
    previewData(): RenderData {
      if (!source) return { row: template.sampleRows[getLang()][0] ?? {} };
      // No row when the search matches none: the template with its fields empty.
      const row = source.table.rows[previewIndex] ?? makeRow([]);
      const input = mapInput(fields, mapping, source.table.columns, [row]);
      return { row: input.rows[0] ?? {}, ...(input.columns && { columns: input.columns }) };
    },
    previewText(): string {
      if (!source) return t("previewSampleRow");
      return previewIndex < 0 ? t("previewNoRow") : t("previewRowOf", { n: previewIndex + 1, total: source.table.rows.length });
    },
    setTemplate(next: BuiltinTemplate): void {
      template = next;
      fields = templateFields(next.template);
      // Sample data belongs to its template, so it follows the template; other sources stay.
      if (source?.kind === "sample") return setSource(sampleSource(next));
      if (source) mapping = autoMapping(fields, source.table.columns);
      drawSource();
      drawMapping();
      options.onChange();
    },
    refresh(): void {
      // Sample data is written in the app's language, so a language switch swaps it (the selection starts over).
      if (source?.kind === "sample" && source.lang !== getLang()) return useSample();
      drawAll();
    },
    get state() {
      return { source, selected, shown, previewIndex, mapping };
    },
    useSample,
    openFile,
    loadUrl,
  };
}
