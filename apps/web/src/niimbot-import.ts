import {
  extractTemplates,
  importTemplates,
  MAX_FILE_BYTES,
  type ExtractResult,
  type ExtractWarning,
  type ImportedTemplate,
  type ImportFailure,
} from "@spokospace/labels-niimbot";
import type { FontRegistry, RenderEnvironment } from "@spokospace/labels-render";
import { renderData } from "./data/mapping.js";
import { panelDialog, showDialog } from "./dialog.js";
import { el, filePicker, statusLine } from "./dom.js";
import { applyTranslations, extractWarningText, importFailureText, importWarningText, t } from "./i18n/index.js";
import { buildPreview, drawImage } from "./preview.js";
import { sampleInput, templateSizeText } from "./templates/app-template.js";
import { newStoredTemplate, sampleRowsFor, type StoredTemplate } from "./templates/imported.js";

// The import from the NIIMBOT desktop app: the user picks its database file, the page reads it
// (`extractTemplates`, then `importTemplates`, both on the page; nothing is uploaded), and a list shows each
// template found with a thumbnail and its notes in plain words. The user ticks the ones to keep. Names from the
// file are shown as text, never as HTML.

/** Where the NIIMBOT desktop app keeps its database on Windows (see packages/niimbot/README.md). */
export const NIIMBOT_DB_PATH = String.raw`%APPDATA%\niimbot.com\NIIMBOT\Niimbot\niimbot_db.isar`;

const MB = MAX_FILE_BYTES / (1024 * 1024);

export interface ImportPanelOptions {
  environment: RenderEnvironment;
  /** The fonts for the thumbnails: null while none are in (no thumbnails), the base set while the NIIMBOT set loads (redrawn when it is in). */
  fonts: () => FontRegistry | null;
  /** Called with the ticked templates, each with a fresh id and today's date; the caller stores and selects them. */
  onAdd: (templates: StoredTemplate[]) => void;
  /** For tests: the extractor. */
  extract?: (bytes: Uint8Array) => ExtractResult;
}

export interface ImportPanel {
  open(): void;
  close(): void;
  /** Reads a picked file: the size check, the extraction, then `review()`. */
  readFile(file: Blob): Promise<void>;
  /** Shows what a file held: `importTemplates()` on the extracted templates, and the list to tick. */
  review(extracted: ExtractResult): void;
  /** Redraws every text (after a language switch). */
  refresh(): void;
  readonly element: HTMLDialogElement;
}

interface Candidate {
  imported: ImportedTemplate;
  checked: boolean;
}

/** What a file held, after `importTemplates()`. */
interface Found {
  candidates: Candidate[];
  failures: ImportFailure[];
  fileNotes: ExtractWarning[];
}

type Status = { kind: "idle" } | { kind: "reading" } | { kind: "error"; text: string };

const NOTHING: Found = { candidates: [], failures: [], fileNotes: [] };

export function mountImportPanel(parent: HTMLElement, options: ImportPanelOptions): ImportPanel {
  let status: Status = { kind: "idle" };
  let found = NOTHING;

  const { dialog, body, translate } = panelDialog("import-panel", "importTitle");
  parent.append(dialog);

  const where = el("p", { className: "hint" });
  where.append(el("span", {}, "importWhere"), " ", el("code", { textContent: NIIMBOT_DB_PATH }));
  const fileButton = el("button", { type: "button", className: "button primary" }, "importChooseFile");
  const fileInput = el("input", { type: "file", accept: ".isar", hidden: true });
  const sources = el("div", { className: "sources" });
  sources.append(fileButton, fileInput);
  const statusEl = statusLine();

  const results = el("div", { className: "import-results", hidden: true });
  // Announced when a file's result is in; the status line is empty then.
  const summary = el("p");
  summary.setAttribute("role", "status");
  const notesHeading = el("h3", {}, "importFileNotes");
  const notesList = el("ul", { className: "warnings" });
  const pick = el("fieldset", { className: "templates" });
  pick.append(el("legend", { className: "visually-hidden" }, "importPick"));
  const list = el("ul", { className: "import-list" });
  pick.append(list);
  const failuresHeading = el("h3", {}, "importFailuresHeading");
  const failuresList = el("ul", { className: "warnings" });
  const addButton = el("button", { type: "button", className: "button primary" });
  const cancelButton = el("button", { type: "button", className: "button" }, "cancel");
  const buttons = el("div", { className: "sources import-buttons" });
  buttons.append(addButton, cancelButton);
  results.append(summary, notesHeading, notesList, pick, failuresHeading, failuresList, buttons);

  body.append(el("p", {}, "importIntro"), where, el("p", { className: "hint" }, "importCloseApp"), sources, statusEl, results);

  // --- drawing -------------------------------------------------------------------------------------------

  const nameOf = (imported: ImportedTemplate): string => imported.template.name ?? imported.source.name ?? t("importNoName");

  /** A small rendering of the template with its sample row; nothing while the fonts load or the template fails. */
  function thumbnail(imported: ImportedTemplate): HTMLElement {
    const box = el("div", { className: "import-thumb" });
    const fonts = options.fonts();
    if (!fonts) return box;
    const { template } = imported;
    const model = buildPreview(template, renderData(sampleInput({ template, sampleRows: sampleRowsFor(template) })), options.environment, fonts);
    if (!model.ok) return box;
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("importPreview", { name: nameOf(imported) }));
    drawImage(canvas, model.image);
    box.append(canvas);
    return box;
  }

  function candidateItem(candidate: Candidate, n: number): HTMLLIElement {
    const { imported } = candidate;
    const li = el("li", { className: "import-item" });
    const name = el("strong", { id: `import-name-${n}`, textContent: nameOf(imported) });
    // The checkbox is named by the template's name alone; the thumbnail and the notes are its siblings.
    const input = el("input", { type: "checkbox", checked: candidate.checked });
    input.setAttribute("aria-labelledby", name.id);
    input.addEventListener("change", () => {
      candidate.checked = input.checked;
      drawAddButton();
    });
    const text = el("span");
    text.append(name, el("small", { textContent: templateSizeText(imported.template) }));
    // One line per distinct note: the same approximation on several elements reads once.
    const notes = [...new Set(imported.warnings.map((w) => importWarningText(w)))];
    if (notes.length > 0) {
      const notesList = el("ul", { className: "import-notes" });
      notesList.append(...notes.map((note) => el("li", { textContent: note })));
      text.append(notesList);
    }
    li.append(input, thumbnail(imported), text);
    return li;
  }

  function drawAddButton(): void {
    const n = found.candidates.filter((c) => c.checked).length;
    addButton.textContent = t("importAdd", { n });
    addButton.disabled = n === 0;
  }

  function draw(): void {
    statusEl.classList.toggle("loading", status.kind === "reading");
    statusEl.classList.toggle("error", status.kind === "error");
    fileButton.disabled = status.kind === "reading";
    statusEl.textContent = status.kind === "reading" ? t("importReading") : status.kind === "error" ? status.text : "";

    const { candidates, failures, fileNotes } = found;
    results.hidden = candidates.length === 0 && failures.length === 0;
    summary.textContent = t("importSummary", { found: candidates.length + failures.length, ok: candidates.length, failed: failures.length });
    notesHeading.hidden = notesList.hidden = fileNotes.length === 0;
    notesList.replaceChildren(...fileNotes.map((w) => el("li", { textContent: extractWarningText(w.code) })));
    pick.hidden = candidates.length === 0;
    list.replaceChildren(...candidates.map(candidateItem));
    failuresHeading.hidden = failuresList.hidden = failures.length === 0;
    failuresList.replaceChildren(
      ...failures.map((f) => el("li", { textContent: `${f.source.name ?? t("importNoName")}: ${importFailureText(f.code)}` })),
    );
    drawAddButton();
  }

  /** Sets the status and what was found (nothing, unless given), and redraws. */
  function show(next: Status, result: Found = NOTHING): void {
    status = next;
    found = result;
    draw();
  }

  // --- the flow ------------------------------------------------------------------------------------------

  function review(extracted: ExtractResult): void {
    if (extracted.templates.length === 0) return show({ kind: "error", text: t("importNothingFound") });
    const result = importTemplates(extracted.templates, { fontCatalog: extracted.fontCatalog });
    show(
      { kind: "idle" },
      { candidates: result.templates.map((imported) => ({ imported, checked: true })), failures: result.failures, fileNotes: extracted.warnings },
    );
  }

  async function readFile(file: Blob): Promise<void> {
    if (file.size > MAX_FILE_BYTES) return show({ kind: "error", text: t("importTooLarge", { limit: MB }) });
    show({ kind: "reading" });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return show({ kind: "error", text: t("importReadFailed") });
    }
    // Closed while reading: nothing is drawn into the closed dialog.
    if (!dialog.open) return;
    let extracted: ExtractResult;
    try {
      extracted = (options.extract ?? extractTemplates)(bytes);
    } catch {
      return show({ kind: "error", text: t("importReadFailed") });
    }
    review(extracted);
  }

  function add(): void {
    const stored = found.candidates.filter((c) => c.checked).map((c) => newStoredTemplate(nameOf(c.imported), c.imported.template));
    if (stored.length === 0) return;
    dialog.close();
    options.onAdd(stored);
  }

  // --- events --------------------------------------------------------------------------------------------

  filePicker(fileButton, fileInput, (file) => void readFile(file));
  addButton.addEventListener("click", add);
  cancelButton.addEventListener("click", () => dialog.close());
  // A closed dialog keeps nothing: the next open starts from the file button.
  dialog.addEventListener("close", () => show({ kind: "idle" }));

  draw();
  return {
    element: dialog,
    open(): void {
      showDialog(dialog);
      fileButton.focus();
    },
    close: () => dialog.close(),
    readFile,
    review,
    refresh(): void {
      translate();
      applyTranslations(body);
      draw();
    },
  };
}
