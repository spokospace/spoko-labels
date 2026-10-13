// Manual hardware check for @spokospace/labels-core. Needs `pnpm build` first (imports ../../dist).
import { B1, CMD, encodePacket, imageToRows, INFO_KEY, Printer, WebBluetoothTransport } from "../../dist/index.js";
import { HEIGHT, LABELS, WIDTH } from "./labels.js";

const $ = (id) => document.getElementById(id);
const RFID_REPLY = 0x1b;
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

let printer = null;
/** Set when connected with raw packet logging on: the Probe button needs direct access to the link. */
let probeTransport = null;
let running = false;

/** Keep printer identifiers out of the log, which is meant to be pasted into a public pull request. */
const maskName = (name) => String(name).replace(/^([^-\s]+-).+$/, "$1***");

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

/**
 * The RFID reply (0x1b) identifies the label roll: tag UID, then two length-prefixed ASCII strings, then counters.
 * Mask the identifiers (and any repeat of the UID) so the log can be pasted publicly; counters stay visible.
 */
function redactRfid(bytes) {
  const out = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  const end = bytes.length - 3; // checksum and tail
  const mask = (from, to) => {
    for (let i = from; i < to && i < end; i++) out[i] = "xx";
  };
  const uid = bytes.slice(4, 12);
  mask(4, 12);
  let at = 12;
  for (let field = 0; field < 2 && at < end; field++) {
    mask(at + 1, at + 1 + bytes[at]);
    at += 1 + bytes[at];
  }
  for (let i = at; i + uid.length <= end; i++) {
    if (uid.every((b, j) => bytes[i + j] === b)) mask(i, i + uid.length);
  }
  return out.join(" ");
}

/** Wraps a transport so every non-row packet and every notification is logged as hex. */
function loggingTransport(inner) {
  let rowPackets = 0;
  let serialRequested = false;
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
        serialRequested = packet[2] === CMD.GET_INFO && packet[4] === INFO_KEY.SERIAL;
        log(`-> ${hex(packet)}`);
      }
      return inner.write(packet);
    },
    onData: (listener) =>
      inner.onData((bytes) => {
        flushRows();
        // the reply to the serial number request contains the serial as ASCII
        if (serialRequested) log(`<- (serial number reply, ${bytes.length} bytes, not logged)`);
        else if (bytes[2] === RFID_REPLY) log(`<- ${redactRfid(bytes)}`);
        else log(`<- ${hex(bytes)}`);
        serialRequested = false;
        listener(bytes);
      }),
    onDisconnect: (listener) => inner.onDisconnect(listener),
    close: () => inner.close(),
  };
}

// ---------- UI state ----------

/** Web Bluetooth cannot switch the adapter on, but it can tell that it is off: show how to turn it on. */
async function updateBluetoothNotice() {
  // when the answer cannot be read, assume Bluetooth is fine rather than nag
  const available = await Promise.resolve(navigator.bluetooth?.getAvailability?.()).then(
    (value) => value !== false,
    () => true,
  );
  $("btnotice").hidden = available || !WebBluetoothTransport.isSupported();
  $("btsettings").hidden = !/Windows/.test(navigator.userAgent);
}

navigator.bluetooth?.addEventListener?.("availabilitychanged", () => void updateBluetoothNotice());

function refresh() {
  const connected = printer?.connected === true;
  $("status").textContent = !WebBluetoothTransport.isSupported()
    ? "Web Bluetooth is not available in this browser"
    : !window.isSecureContext
      ? "Not a secure context: open this page via http://localhost or https"
      : connected
        ? "Connected"
        : "Not connected";
  for (const id of ["disconnect", "info", "rfid", "print", "sweep", "abortAfterRows", "abortWhilePolling"]) {
    $(id).disabled = !connected || (running && id !== "disconnect");
  }
  $("probe").disabled = !connected || running || !probeTransport;
  $("connect").disabled = running;
  $("reconnect").disabled = running;
  $("abort").disabled = !running;
}

function setRunning(value) {
  running = value;
  refresh();
}

setInterval(() => {
  refresh();
  void updateBluetoothNotice();
}, 1000);

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
      probeTransport = loggingTransport(transport);
      printer = new Printer(probeTransport);
      log(`Connected to "${maskName(transport.deviceName)}" (raw packet logging on)`);
    } else {
      probeTransport = null;
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
    probeTransport = raw ? loggingTransport(transport) : null;
    printer = new Printer(probeTransport ?? transport);
    log(`reconnect() connected to "${maskName(transport.deviceName)}"`);
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
    const { serial, ...rest } = await printer.info();
    log(`info(): ${JSON.stringify(serial === undefined ? rest : { ...rest, serial: "(received, not logged)" })}`);
  } catch (error) {
    log(`info() failed: ${describe(error)}`);
  }
  setRunning(false);
});

$("rfid").addEventListener("click", async () => {
  setRunning(true);
  try {
    const roll = await printer.readRfid();
    if (!roll) {
      log("readRfid(): null (no tag, or the printer did not report one)");
    } else {
      // identifiers stay out of the log: only their lengths are shown
      const { uid, barcode, serial, total, used, type } = roll;
      const masked = { uid: `(${uid.length / 2} bytes)`, barcode: `(${barcode.length} chars)`, serial: `(${serial.length} chars)` };
      log(`readRfid(): ${JSON.stringify({ ...masked, total, used, left: total - used, type })}`);
    }
  } catch (error) {
    log(`readRfid() failed: ${describe(error)}`);
  }
  setRunning(false);
});

// ---------- probe ----------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send read-only queries and let the raw log show the replies: what does the printer report about itself and the label? */
$("probe").addEventListener("click", async () => {
  setRunning(true);
  log("Probe: sending read-only queries; replies appear as '<-' lines. Run it once per label roll.");
  const queries = [
    ["CONNECT", CMD.CONNECT, [1]],
    ["HEARTBEAT", CMD.HEARTBEAT, [1]],
    ["RFID / label info (0x1A)", CMD.GET_RFID, [1]],
    ...[1, 2, 3, 6, 7, 8, 9, 10, 12].map((key) => [`GET_INFO ${key}`, CMD.GET_INFO, [key]]),
  ];
  try {
    for (const [name, cmd, data] of queries) {
      log(`probe ${name}`);
      await probeTransport.write(encodePacket(cmd, data));
      await wait(600);
    }
    log("Probe finished. No reply after a query means the printer ignores it.");
  } catch (error) {
    log(`Probe failed: ${describe(error)}`);
  }
  setRunning(false);
});

// ---------- printing ----------

let controller = null;

function options(extra = {}) {
  const density = Number($("density").value);
  const copies = Number($("copies").value);
  const offsetMm = { x: Number($("offsetx").value), y: Number($("offsety").value) };
  return {
    density,
    copies,
    offsetMm,
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
  log(`${name}: print(density=${opts.density}, copies=${opts.copies}, offsetMm=${JSON.stringify(opts.offsetMm)}) ...`);
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
$("offsetx").value = String(B1.offsetMm.x);
$("offsety").value = String(B1.offsetMm.y);
updatePreview();
refresh();
void updateBluetoothNotice();
log(`Page loaded. B1 density range in the library: ${B1.densityRange.min}..${B1.densityRange.max}.`);
