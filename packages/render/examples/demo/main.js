// labels-render demo. Needs the package builds (the "example" script builds them; see ../serve.mjs).
import { B1, imageToRows, Printer, WebBluetoothTransport } from "@spokospace/labels-core";
import { browserEnvironment, bundledFonts, loadFonts, render, TemplateError, validateTemplate } from "@spokospace/labels-render";
import { TEMPLATES } from "./templates.js";

const $ = (id) => document.getElementById(id);
const DOTS_PER_MM = B1.dotsPerMm;
const HEAD_MM = B1.headDots / B1.dotsPerMm;

// Warnings in plain words; the package only gives codes (callers translate them).
const MESSAGES = {
  "invalid-type": "a value has the wrong type",
  required: "a required value is missing",
  "out-of-range": "a value is out of range",
  "unsupported-version": "unsupported template version",
  "unknown-element": "unknown element type, skipped",
  "unknown-property": "unknown property, ignored",
  "outside-label": "element reaches past the label",
  "outside-safe-area": "content outside the safe area (corners or margin)",
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

// Rendering state.
const environment = browserEnvironment();
let fonts = null;
let current = TEMPLATES[0];
let template = null; // parsed JSON being shown
let row = {};
let image = null; // last rendered image, or null when the template cannot render
let label = null; // the validated template of that image (defaults filled in), for the overlay

// Printer state.
let printer = null;
let printing = false;

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

// ---- template and data ----

function boundColumns(t) {
  const names = [];
  for (const e of Array.isArray(t?.elements) ? t.elements : []) {
    const name = e?.content?.bind;
    if (typeof name === "string" && name && !names.includes(name)) names.push(name);
  }
  return names;
}

function buildFields() {
  const columns = boundColumns(template);
  for (const name of Object.keys(row)) if (!columns.includes(name)) delete row[name];
  const fields = $("fields");
  fields.replaceChildren(
    ...columns.map((name) => {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      caption.textContent = name;
      const input = document.createElement("input");
      input.value = row[name] ?? "";
      input.addEventListener("input", () => {
        row[name] = input.value;
        scheduleDraw();
      });
      label.append(caption, input);
      return label;
    }),
  );
  $("nofields").hidden = columns.length > 0;
}

function selectTemplate(id) {
  current = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
  template = structuredClone(current.template);
  row = { ...current.row };
  $("json").value = JSON.stringify(template, null, 2);
  $("jsonerror").textContent = "";
  buildFields();
  draw();
}

let jsonTimer = 0;
function onJsonInput() {
  clearTimeout(jsonTimer);
  jsonTimer = setTimeout(() => {
    try {
      template = JSON.parse($("json").value);
      $("jsonerror").textContent = "";
    } catch (error) {
      $("jsonerror").textContent = `Not valid JSON: ${error.message}`;
      return;
    }
    buildFields();
    draw();
  }, 250);
}

// ---- preview ----

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

function draw() {
  if (!fonts) return;
  const list = $("warnings");
  list.replaceChildren();
  const addWarning = (c, path) => list.append(item(code(c), ` ${MESSAGES[c] ?? ""} `, code(path || "(template)")));
  try {
    const result = render(template, { row }, { environment, fonts, printableWidth: HEAD_MM });
    image = result.image;
    label = validateTemplate(template).template;
    for (const w of result.warnings) addWarning(w.code, w.path);
    if (result.warnings.length === 0) list.append(item("None."));
  } catch (error) {
    image = null;
    label = null;
    if (error instanceof TemplateError) {
      for (const i of error.issues.filter((x) => x.severity === "error")) addWarning(i.code, i.path);
    } else {
      list.append(item(String(error)));
    }
  }
  paintImage();
  updateButtons();
}

function paintImage() {
  const canvas = $("image");
  if (!image) {
    canvas.width = canvas.height = 1;
    $("size").textContent = "The template cannot be rendered; see the warnings.";
  } else {
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    $("size").textContent = `${image.width} x ${image.height} dots = ${image.width / DOTS_PER_MM} x ${image.height / DOTS_PER_MM} mm.`;
  }
  paintOverlay();
}

/** Zoom and the overlay: no re-render, no re-upload of the image. */
function paintOverlay() {
  const canvas = $("image");
  const overlay = $("overlay");
  const zoom = Number($("zoom").value);
  if (!image || !label) {
    overlay.width = overlay.height = 1;
    return;
  }
  canvas.style.width = `${image.width * zoom}px`;
  canvas.style.height = `${image.height * zoom}px`;
  overlay.width = image.width * zoom;
  overlay.height = image.height * zoom;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!$("showoverlay").checked) return;
  const s = DOTS_PER_MM * zoom; // canvas pixels per mm
  const w = image.width / DOTS_PER_MM;
  const h = image.height / DOTS_PER_MM;

  // Outside the label shape (even-odd: the canvas minus the shape).
  const { shape, safeMargin: margin } = label;
  ctx.save();
  ctx.fillStyle = "#7777";
  ctx.beginPath();
  ctx.rect(0, 0, overlay.width, overlay.height);
  shapePath(ctx, shape, 0, 0, w, h, s);
  ctx.fill("evenodd");
  ctx.restore();

  // Safe area, inset the way labels-render checks it.
  if (margin > 0) {
    ctx.save();
    ctx.strokeStyle = "#1e88e5";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const inset = shape.kind === "rounded" ? { ...shape, radius: Math.max(shape.radius - margin, 0) } : shape;
    shapePath(ctx, inset, margin, margin, w - 2 * margin, h - 2 * margin, s);
    ctx.stroke();
    ctx.restore();
  }

  // The strips the 48 mm head does not cover (imageToRows crops the image to the head, centered).
  if (w > HEAD_MM) {
    const side = ((w - HEAD_MM) / 2) * s;
    ctx.fillStyle = "#e5393566";
    ctx.fillRect(0, 0, side, overlay.height);
    ctx.fillRect(overlay.width - side, 0, side, overlay.height);
  }
}

function shapePath(ctx, shape, x, y, w, h, s) {
  const [px, py, pw, ph] = [x * s, y * s, w * s, h * s];
  if (shape.kind === "circle") {
    ctx.moveTo(px + pw, py + ph / 2);
    ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
  } else if (shape.kind === "rounded") {
    ctx.roundRect(px, py, pw, ph, Math.min(shape.radius * s, pw / 2, ph / 2));
  } else {
    ctx.rect(px, py, pw, ph);
  }
}

// ---- printing ----

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
    const p = await Printer.connect(B1);
    printer = p;
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
    const rows = imageToRows(image, B1);
    setStatus(`Printing ${copies} label${copies === 1 ? "" : "s"}…`);
    await printer.print(rows, {
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
    if (!printer?.connected) {
      printer = null;
    }
    updateButtons();
  }
});

// ---- start ----

for (let d = B1.densityRange.min; d <= B1.densityRange.max; d++) {
  $("density").append(new Option(d === B1.defaultDensity ? `${d} (default)` : String(d), String(d), false, d === B1.defaultDensity));
}
for (const t of TEMPLATES) $("template").append(new Option(t.name, t.id));
$("template").addEventListener("change", () => selectTemplate($("template").value));
$("reset").addEventListener("click", () => selectTemplate(current.id));
$("json").addEventListener("input", onJsonInput);
$("zoom").addEventListener("change", paintOverlay);
$("showoverlay").addEventListener("change", paintOverlay);
$("unsupported").hidden = WebBluetoothTransport.isSupported();

setStatus("Loading fonts…");
try {
  fonts = await loadFonts(environment, bundledFonts);
  setStatus("Not connected");
} catch (error) {
  setStatus(`Fonts did not load: ${error.message}`);
}
selectTemplate(TEMPLATES[0].id);
