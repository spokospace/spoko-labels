// labels-niimbot import example. Needs the package builds (the "example" script builds them; see ../serve.mjs).
import { B1, imageToRows, Printer, WebBluetoothTransport } from "@spokospace/labels-core";
import { extractTemplates, importTemplates, niimbotFonts } from "@spokospace/labels-niimbot";
import { browserEnvironment, bundledFonts, loadFonts, render } from "@spokospace/labels-render";

const $ = (id) => document.getElementById(id);
const DOTS_PER_MM = B1.dotsPerMm;
const HEAD_MM = B1.headDots / B1.dotsPerMm;

// Codes in plain words; the packages only give codes (callers translate them).
const EXTRACT_MESSAGES = {
  "no-templates-found": "No NIIMBOT templates found in this file.",
  "duplicate-template": "Older copies of edited templates were found; the newest was kept. Copies dropped:",
  "scan-incomplete": "The scan stopped early; templates after that point may be missing.",
};
const FAILURE_MESSAGES = {
  "invalid-input": "not a readable template",
  "unknown-size": "no label size (no roll name like T50*30)",
  "invalid-template": "the converted template is not valid",
};
const IMPORT_MESSAGES = {
  "unsupported-element": "skipped: not supported (barcode, image, NIIMBOT live code, vertical text)",
  "rotated-element": "skipped: rotated elements are not supported",
  "unsupported-style": "approximated:",
  "unknown-font": "unknown font; another one is used",
  "unrecognized-binding": "bound, but not to a column; printed as its text",
  "value-clamped": "value out of range; clamped",
  "invalid-element": "malformed; skipped:",
};
const RENDER_MESSAGES = {
  "outside-label": "element reaches past the label",
  "outside-printable-area": "content outside the 48 mm print head: it will not print",
  "missing-column": "no such data column; printed empty",
  "value-truncated": "value too long, cut to 2000 characters",
  "missing-font": "font not available, another one is used",
  "missing-glyphs": "no font has every character of this text",
  "text-overflow": "text does not fit its box, even at the smallest size",
  "qr-empty": "QR content is empty, nothing drawn",
  "qr-too-long": "too much data for a QR code, nothing drawn",
  "qr-too-small": "QR box too small for whole dots per module",
};

const environment = browserEnvironment();
let fonts = null;
let imported = []; // ImportedTemplate[] of the file
let selected = null; // the ImportedTemplate shown
let columns = [];
let row = {};
let image = null; // last rendered image, as printed (turned by the template's printRotation), or null
let rotation = 0; // that turn, in degrees clockwise; the preview turns the image back to the design

let printer = null;
let printing = false;
let readCount = 0; // the latest file pick wins over a slower earlier one

// ---- helpers ----

function item(...parts) {
  const li = document.createElement("li");
  li.append(...parts);
  return li;
}

function code(text) {
  const c = document.createElement("code");
  c.textContent = text;
  return c;
}

/** Whether the head crosses the label's width (no turn, or a half turn) rather than its height. */
const headAcrossWidth = () => rotation % 180 === 0;

/** Column letters as Niimbot writes them: 0 → A, 25 → Z, 26 → AA. */
function letters(index) {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function fill(list, entries, empty = "None.") {
  list.replaceChildren(...(entries.length > 0 ? entries : [item(empty)]));
}

// ---- reading the file ----

async function readFile(file) {
  const read = ++readCount;
  $("filestatus").className = "";
  $("filestatus").textContent = "Reading…";
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    if (read === readCount) showFileError("Could not read the file; close the NIIMBOT app and try again.");
    return;
  }
  if (read !== readCount) return;
  let extracted;
  try {
    extracted = extractTemplates(bytes);
  } catch (error) {
    showFileError(error instanceof RangeError ? "This file is too large to be a NIIMBOT database." : String(error));
    return;
  }
  if (extracted.templates.length === 0) {
    showFileError(EXTRACT_MESSAGES["no-templates-found"]);
    return;
  }
  const result = importTemplates(extracted.templates, { fontCatalog: extracted.fontCatalog });
  imported = result.templates;
  $("filestatus").textContent =
    `${extracted.templates.length} template${extracted.templates.length === 1 ? "" : "s"} found, ` +
    `${imported.length} imported, ${result.failures.length} not imported.`;
  $("results").hidden = false;
  $("templates").replaceChildren(
    ...imported.map((t, i) => {
      const tr = document.createElement("tr");
      const { width, height } = t.template.size;
      const families = [...new Set(t.template.elements.map((e) => e.font?.family).filter(Boolean))].join(", ");
      const turn = t.printRotation === 0 ? "" : `, printed turned ${t.printRotation}°`;
      for (const text of [t.template.name ?? "(no name)", `${width} x ${height}${turn}`, families, String(t.template.elements.length), String(t.warnings.length)]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      tr.addEventListener("click", () => select(i));
      return tr;
    }),
  );
  fill(
    $("failures"),
    result.failures.map((f) => item(f.source.name ?? "(no name)", " ", code(f.code), ` ${FAILURE_MESSAGES[f.code] ?? ""}`)),
  );
  $("failuresbox").hidden = result.failures.length === 0;
  const notes = extracted.warnings.filter((w) => w.code !== "no-templates-found");
  fill($("extractwarnings"), notes.map((w) => item(code(w.code), ` ${EXTRACT_MESSAGES[w.code] ?? ""} ${w.count ?? ""}`)));
  $("extractbox").hidden = notes.length === 0;
  if (imported.length > 0) select(0);
  else hideSelection();
}

function showFileError(text) {
  $("filestatus").className = "error";
  $("filestatus").textContent = text;
  $("results").hidden = true;
  hideSelection();
}

function showSelection(shown) {
  $("selected").hidden = !shown;
  $("printing").hidden = !shown;
}

function hideSelection() {
  selected = null;
  image = null;
  showSelection(false);
  updateButtons();
}

// ---- one template ----

function select(index) {
  selected = imported[index];
  for (const [i, tr] of [...$("templates").children].entries()) tr.setAttribute("aria-selected", String(i === index));
  showSelection(true);
  $("selectedname").textContent = selected.template.name ?? "(no name)";

  // Every bound column gets a made-up value ("Column C"); the others stay empty.
  const bound = [...new Set(selected.template.elements.map((e) => e.content?.bindIndex).filter((i) => Number.isInteger(i)))].sort((a, b) => a - b);
  columns = Array.from({ length: bound.length > 0 ? Math.max(...bound) + 1 : 0 }, (_, i) => `Column ${letters(i)}`);
  row = Object.fromEntries(bound.map((i) => [columns[i], columns[i]]));
  $("fields").replaceChildren(
    ...bound.map((i) => {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      caption.textContent = columns[i];
      const input = document.createElement("input");
      input.value = row[columns[i]];
      input.addEventListener("input", () => {
        row[columns[i]] = input.value;
        scheduleDraw();
      });
      label.append(caption, input);
      return label;
    }),
  );
  $("nofields").hidden = bound.length > 0;

  fill(
    $("importwarnings"),
    selected.warnings.map((w) =>
      item(code(w.code), ` ${IMPORT_MESSAGES[w.code] ?? ""} ${w.feature ?? w.issue ?? ""} `, code(w.path)),
    ),
  );
  $("json").value = JSON.stringify(selected.template, null, 2);
  $("copystatus").textContent = "";
  draw();
}

// Typing re-renders at most once per frame.
let drawPending = false;
function scheduleDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    draw();
  });
}

function draw() {
  if (!selected) return;
  const list = $("renderwarnings");
  if (!fonts) {
    fill(list, [item(fontError ?? "Fonts are still loading…")]);
    return;
  }
  try {
    const result = render(selected.template, { row, columns }, { environment, fonts, printableWidth: HEAD_MM });
    image = result.image;
    rotation = result.printRotation;
    fill(list, result.warnings.map((w) => item(code(w.code), ` ${RENDER_MESSAGES[w.code] ?? ""} `, code(w.path || "(template)"))));
  } catch (error) {
    image = null;
    fill(list, [item(String(error))]);
  }
  paint();
  updateButtons();
}

function paint() {
  const canvas = $("image");
  const overlay = $("overlay");
  if (!image) {
    canvas.width = canvas.height = overlay.width = overlay.height = 1;
    canvas.style.width = canvas.style.height = "";
    $("size").textContent = "The template cannot be rendered; see the warnings.";
    return;
  }
  // The preview shows the design upright: the printed image turned back by the template's printRotation.
  const printed = document.createElement("canvas");
  printed.width = image.width;
  printed.height = image.height;
  printed.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  const across = headAcrossWidth();
  canvas.width = across ? image.width : image.height;
  canvas.height = across ? image.height : image.width;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((-rotation * Math.PI) / 180);
  ctx.drawImage(printed, -image.width / 2, -image.height / 2);
  const turned = rotation === 0 ? "" : ` Printed turned ${rotation}° clockwise (${image.width} x ${image.height} dots).`;
  $("size").textContent = `${canvas.width} x ${canvas.height} dots = ${canvas.width / DOTS_PER_MM} x ${canvas.height / DOTS_PER_MM} mm.${turned}`;
  paintOverlay();
}

/** Zoom and the print-head strips: no re-render. Imported templates are rectangles without a safe margin. */
function paintOverlay() {
  if (!image) return;
  const canvas = $("image");
  const overlay = $("overlay");
  const zoom = Number($("zoom").value);
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
  overlay.width = canvas.width * zoom;
  overlay.height = canvas.height * zoom;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  // The strips the 48 mm head does not cover (imageToRows crops the image to the head, centered).
  const across = headAcrossWidth();
  const extent = (across ? canvas.width : canvas.height) / DOTS_PER_MM;
  if ($("showoverlay").checked && extent > HEAD_MM) {
    const side = ((extent - HEAD_MM) / 2) * DOTS_PER_MM * zoom;
    ctx.fillStyle = "#e5393566";
    if (across) {
      ctx.fillRect(0, 0, side, overlay.height);
      ctx.fillRect(overlay.width - side, 0, side, overlay.height);
    } else {
      ctx.fillRect(0, 0, overlay.width, side);
      ctx.fillRect(0, overlay.height - side, overlay.width, side);
    }
  }
}

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("json").value);
    $("copystatus").textContent = "Copied.";
  } catch {
    $("json").select();
    $("copystatus").textContent = "Select and copy the text by hand.";
  }
});

// ---- printing ----

function setStatus(text) {
  $("status").textContent = text;
}

function updateButtons() {
  const connected = Boolean(printer?.connected);
  // A second connect would replace the printer without closing the first link.
  $("connect").disabled = printing || connected;
  $("disconnect").disabled = !connected || printing;
  $("print").disabled = !connected || printing || !image;
}

function errorText(error) {
  switch (error?.code) {
    case "chooser-cancelled":
      return "No printer picked.";
    case "device-unreachable":
      return "The printer could not be reached. It may be connected to another device (close the NIIMBOT app).";
    case "bluetooth-unsupported":
      return `Bluetooth is not available: check that it is switched on and the page may use it (${error.cause?.message ?? error.message}).`;
    case "disconnected":
      return "The printer disconnected.";
    case "busy":
      return "The printer is busy.";
    default:
      return `Error: ${error?.code ?? ""} ${error?.message ?? error}`;
  }
}

$("connect").addEventListener("click", async () => {
  try {
    // Nothing may be awaited before this call: the chooser needs the click's user gesture.
    printer = await Printer.connect(B1);
    setStatus("Connected");
  } catch (error) {
    setStatus(errorText(error));
  }
  updateButtons();
});

$("disconnect").addEventListener("click", async () => {
  try {
    await printer?.disconnect();
  } finally {
    printer = null;
    setStatus("Not connected");
    updateButtons();
  }
});

$("print").addEventListener("click", async () => {
  if (!printer || !image) return;
  const copies = Number($("copies").value);
  if (!Number.isInteger(copies) || copies < 1 || copies > 255) {
    setStatus("Copies must be a whole number from 1 to 255.");
    return;
  }
  printing = true;
  updateButtons();
  const progress = $("progress");
  progress.hidden = false;
  progress.value = 0;
  try {
    setStatus(`Printing ${copies} label${copies === 1 ? "" : "s"}…`);
    await printer.print(imageToRows(image, B1), {
      density: Number($("density").value),
      copies,
      onProgress: (p) => {
        progress.value = p.percent;
      },
    });
    setStatus("Printed");
  } catch (error) {
    setStatus(errorText(error));
  } finally {
    printing = false;
    progress.hidden = true;
    if (!printer?.connected) printer = null;
    updateButtons();
  }
});

// ---- start ----

for (let d = B1.densityRange.min; d <= B1.densityRange.max; d++) {
  $("density").append(new Option(d === B1.defaultDensity ? `${d} (default)` : String(d), String(d), false, d === B1.defaultDensity));
}
$("zoom").addEventListener("change", paintOverlay);
$("showoverlay").addEventListener("change", paintOverlay);
$("unsupported").hidden = WebBluetoothTransport.isSupported();
$("file").addEventListener("change", () => {
  const file = $("file").files?.[0];
  // Cleared, so picking the same file again (after closing the app, or after editing in it) reads it again.
  $("file").value = "";
  if (file) void readFile(file);
});

let fontError = null;
const LOADING = "Loading fonts…";
$("filestatus").textContent = LOADING;
try {
  fonts = await loadFonts(environment, [...bundledFonts, ...niimbotFonts]);
  // A file picked meanwhile has written its own status.
  if ($("filestatus").textContent === LOADING) $("filestatus").textContent = "";
  draw(); // a file picked while the fonts were loading
} catch (error) {
  fontError = `Fonts did not load: ${error.message}`;
  $("filestatus").className = "error";
  $("filestatus").textContent = fontError;
  draw();
}
