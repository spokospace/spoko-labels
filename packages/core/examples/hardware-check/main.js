// Manual hardware check for @spokospace/labels-core. Needs `pnpm build` first (imports ../../dist).
import { B1, CMD, imageToRows, Printer, WebBluetoothTransport } from "../../dist/index.js";
import { HEIGHT, LABELS, WIDTH } from "./labels.js";

const $ = (id) => document.getElementById(id);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

let printer = null;
let running = false;

// ---------- log ----------

function log(message) {
  const time = new Date().toISOString().slice(11, 23);
  $("log").value += `${time}  ${message}\n`;
  $("log").scrollTop = $("log").scrollHeight;
}

function describe(error) {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.name];
  if ("code" in error) parts.push(`code=${error.code}`);
  if ("step" in error) parts.push(`step="${error.step}"`);
  parts.push(error.message);
  if (error.cause) parts.push(`(cause: ${error.cause.name ?? ""} ${error.cause.message ?? error.cause})`);
  return parts.join(" ");
}

/** Wraps a transport so every non-row packet and every notification is logged as hex. */
function loggingTransport(inner) {
  let rowPackets = 0;
  const flushRows = () => {
    if (rowPackets) log(`   ... ${rowPackets} row packet(s) written`);
    rowPackets = 0;
  };
  return {
    get connected() {
      return inner.connected;
    },
    write(packet) {
      if (packet[2] === CMD.PRINT_EMPTY_ROW || packet[2] === CMD.PRINT_BITMAP_ROW) {
        rowPackets++;
      } else {
        flushRows();
        log(`-> ${hex(packet)}`);
      }
      return inner.write(packet);
    },
    onData: (listener) =>
      inner.onData((bytes) => {
        flushRows();
        log(`<- ${hex(bytes)}`);
        listener(bytes);
      }),
    onDisconnect: (listener) => inner.onDisconnect(listener),
    close: () => inner.close(),
  };
}

// ---------- UI state ----------

function refresh() {
  const connected = printer?.connected === true;
  $("status").textContent = !WebBluetoothTransport.isSupported()
    ? "Web Bluetooth is not available in this browser"
    : !window.isSecureContext
      ? "Not a secure context: open this page via http://localhost or https"
      : connected
        ? "Connected"
        : "Not connected";
  for (const id of ["disconnect", "info", "print", "sweep", "abortAfterRows", "abortWhilePolling"]) {
    $(id).disabled = !connected || (running && id !== "disconnect");
  }
  $("connect").disabled = running;
  $("reconnect").disabled = running;
  $("abort").disabled = !running;
}

function setRunning(value) {
  running = value;
  refresh();
}

setInterval(refresh, 1000);

// ---------- preview ----------

function currentRows(caption) {
  const canvas = LABELS[$("label").value](caption);
  return imageToRows(canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT), B1);
}

/** Draw the 1-bit rows back onto the preview: exactly what will be printed. */
function showRows(rows) {
  const preview = $("preview");
  const ctx = preview.getContext("2d");
  const image = ctx.createImageData(WIDTH, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < WIDTH; x++) {
      const black = (row[x >> 3] & (0x80 >> (x & 7))) !== 0;
      const i = (y * WIDTH + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = black ? 0 : 255;
      image.data[i + 3] = 255;
    }
  });
  preview.height = rows.length;
  ctx.putImageData(image, 0, 0);
}

function updatePreview() {
  showRows(currentRows());
}

// ---------- connection ----------

/** Called synchronously from a click: the first await is the chooser, so the user gesture survives. */
async function connectFromClick(raw) {
  log("Opening the device chooser...");
  try {
    if (raw) {
      const transport = await WebBluetoothTransport.request();
      printer = new Printer(loggingTransport(transport));
      log(`Connected to "${transport.deviceName}" (raw packet logging on)`);
    } else {
      printer = await Printer.connect();
      log("Connected with Printer.connect()");
    }
  } catch (error) {
    log(`connect failed: ${describe(error)}`);
  }
  refresh();
}

$("connect").addEventListener("click", () => {
  void connectFromClick($("rawlog").checked);
});

$("reconnect").addEventListener("click", async () => {
  const raw = $("rawlog").checked;
  log("reconnect()...");
  const transport = await WebBluetoothTransport.reconnect();
  if (!transport) {
    log("reconnect() resolved null (flag off, no remembered printer, or printer not reachable)");
  } else {
    printer = new Printer(raw ? loggingTransport(transport) : transport);
    log(`reconnect() connected to "${transport.deviceName}"`);
  }
  refresh();
});

$("disconnect").addEventListener("click", async () => {
  await printer?.disconnect();
  log("Disconnected");
  refresh();
});

$("info").addEventListener("click", async () => {
  setRunning(true);
  try {
    log(`info(): ${JSON.stringify(await printer.info())}`);
  } catch (error) {
    log(`info() failed: ${describe(error)}`);
  }
  setRunning(false);
});

// ---------- printing ----------

let controller = null;

function options(extra = {}) {
  const density = Number($("density").value);
  const copies = Number($("copies").value);
  return {
    density,
    copies,
    signal: controller?.signal,
    onProgress: ({ stage, percent }) => {
      $("progress").value = percent;
      $("stage").textContent = `${stage} ${percent}%`;
      extra.onProgress?.(stage);
    },
  };
}

async function runPrint(name, rows, extra) {
  setRunning(true);
  controller = new AbortController();
  $("progress").value = 0;
  const opts = options(extra);
  log(`${name}: print(density=${opts.density}, copies=${opts.copies}) ...`);
  const start = performance.now();
  try {
    await printer.print(rows, opts);
    log(`${name}: done in ${Math.round(performance.now() - start)} ms`);
  } catch (error) {
    log(`${name}: failed after ${Math.round(performance.now() - start)} ms: ${describe(error)}`);
  }
  controller = null;
  setRunning(false);
}

$("print").addEventListener("click", () => runPrint("print", currentRows()));

$("abort").addEventListener("click", () => {
  log("Abort pressed");
  controller?.abort();
});

$("abortAfterRows").addEventListener("click", () => {
  let aborted = false;
  void runPrint("print+abort(rows)", currentRows(), {
    onProgress: (stage) => {
      if (stage === "sending" && !aborted) {
        aborted = true;
        log("aborting now (first row packet written)");
        controller.abort();
      }
    },
  });
});

$("abortWhilePolling").addEventListener("click", () => {
  let aborted = false;
  void runPrint("print+abort(polling)", currentRows(), {
    onProgress: (stage) => {
      if (stage === "printing" && !aborted) {
        aborted = true;
        log("aborting now (first status poll)");
        controller.abort();
      }
    },
  });
});

$("sweep").addEventListener("click", async () => {
  const { min, max } = B1.densityRange;
  for (const density of [min, B1.defaultDensity, max]) {
    $("density").value = density;
    const rows = currentRows(`density ${density}`);
    showRows(rows);
    await runPrint(`sweep density ${density}`, rows);
    if (printer?.connected !== true) break;
  }
});

// ---------- log buttons ----------

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("log").value);
    log("Log copied to the clipboard");
  } catch {
    $("log").select();
    log("Clipboard not available: the log is selected, copy it with Ctrl+C");
  }
});

$("clear").addEventListener("click", () => {
  $("log").value = "";
});

// ---------- init ----------

for (const name of Object.keys(LABELS)) $("label").append(new Option(name, name));
$("label").addEventListener("change", updatePreview);
$("density").min = String(B1.densityRange.min);
$("density").max = String(B1.densityRange.max);
$("density").value = String(B1.defaultDensity);
updatePreview();
refresh();
log(`Page loaded. B1 density range in the library: ${B1.densityRange.min}..${B1.densityRange.max} (provisional).`);
