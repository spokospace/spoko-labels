// labels-render demo. Needs the package builds (the "example" script builds them; see ../serve.mjs).
import { B1, imageToRows, Printer, WebBluetoothTransport } from "@spokospace/labels-core";
import { browserEnvironment, bundledFonts, loadFonts, render, TemplateError } from "@spokospace/labels-render";
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

// Printer state.
let printer = null;
let printing = false;

function setStatus(text) {
  $("status").textContent = text;
}

function updateButtons() {
  const connected = Boolean(printer?.connected);
  $("connect").disabled = printing;
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
        draw();
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

function draw() {
  if (!fonts) return;
  const list = $("warnings");
  list.replaceChildren();
  const addWarning = (code, path) => {
    const li = document.createElement("li");
    const c = document.createElement("code");
    c.textContent = code;
    li.append(c, ` ${MESSAGES[code] ?? ""} `);
    const p = document.createElement("code");
    p.textContent = path || "(template)";
    li.append(p);
    list.append(li);
  };
  try {
    const result = render(template, { row }, { environment, fonts, printableWidth: HEAD_MM });
    image = result.image;
    for (const w of result.warnings) addWarning(w.code, w.path);
    if (result.warnings.length === 0) list.append(Object.assign(document.createElement("li"), { textContent: "None." }));
  } catch (error) {
    image = null;
    if (error instanceof TemplateError) {
      for (const i of error.issues.filter((x) => x.severity === "error")) addWarning(i.code, i.path);
    } else {
      list.append(Object.assign(document.createElement("li"), { textContent: String(error) }));
    }
  }
  paint();
  updateButtons();
}

function paint() {
  const canvas = $("image");
  const overlay = $("overlay");
  const zoom = Number($("zoom").value);
  if (!image) {
    canvas.width = overlay.width = 1;
    canvas.height = overlay.height = 1;
    $("size").textContent = "The template cannot be rendered; see the warnings.";
    return;
  }
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  canvas.style.width = `${image.width * zoom}px`;
  canvas.style.height = `${image.height * zoom}px`;
  $("size").textContent = `${image.width} x ${image.height} dots = ${image.width / DOTS_PER_MM} x ${image.height / DOTS_PER_MM} mm.`;

  overlay.width = image.width * zoom;
  overlay.height = image.height * zoom;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!$("showoverlay").checked) return;
  const s = DOTS_PER_MM * zoom; // canvas pixels per mm
  const w = image.width / DOTS_PER_MM;
  const h = image.height / DOTS_PER_MM;

  // Outside the label shape.
  const shape = template?.shape ?? { kind: "rectangle" };
  ctx.save();
  ctx.fillStyle = "#7777";
  ctx.beginPath();
  ctx.rect(0, 0, overlay.width, overlay.height);
  shapePath(ctx, shape, 0, 0, w, h, s, true);
  ctx.fill("evenodd");
  ctx.restore();

  // Safe area.
  const margin = typeof template?.safeMargin === "number" ? template.safeMargin : 0;
  if (margin > 0) {
    ctx.save();
    ctx.strokeStyle = "#1e88e5";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const inset = shape.kind === "rounded" ? { ...shape, radius: Math.max(shape.radius - margin, 0) } : shape;
    shapePath(ctx, inset, margin, margin, w - 2 * margin, h - 2 * margin, s, false);
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

function shapePath(ctx, shape, x, y, w, h, s, reverse) {
  const [px, py, pw, ph] = [x * s, y * s, w * s, h * s];
  if (shape.kind === "circle") {
    ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2, reverse);
  } else if (shape.kind === "rounded") {
    const r = Math.min(shape.radius * s, pw / 2, ph / 2);
    if (reverse) {
      ctx.moveTo(px + r, py);
      ctx.arcTo(px, py, px, py + r, r);
      ctx.arcTo(px, py + ph, px + r, py + ph, r);
      ctx.arcTo(px + pw, py + ph, px + pw, py + ph - r, r);
      ctx.arcTo(px + pw, py, px + pw - r, py, r);
      ctx.closePath();
    } else {
      ctx.roundRect(px, py, pw, ph, r);
    }
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
      return "Bluetooth is not available: check that it is switched on.";
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
  await printer?.disconnect();
  printer = null;
  setStatus("Not connected");
  updateButtons();
});

$("print").addEventListener("click", async () => {
  if (!printer || !image) return;
  printing = true;
  updateButtons();
  const progress = $("progress");
  progress.hidden = false;
  progress.value = 0;
  try {
    const rows = imageToRows(image, B1);
    const copies = Number($("copies").value);
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
$("zoom").addEventListener("change", paint);
$("showoverlay").addEventListener("change", paint);
$("unsupported").hidden = WebBluetoothTransport.isSupported();

setStatus("Loading fonts…");
try {
  fonts = await loadFonts(environment, bundledFonts);
  setStatus("Not connected");
} catch (error) {
  setStatus(`Fonts did not load: ${error.message}`);
}
selectTemplate(TEMPLATES[0].id);
