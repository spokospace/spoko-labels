import {
  AbortedError,
  DisconnectedError,
  InvalidArgumentError,
  NoResponseError,
  PrinterBusyError,
  PrintTimeoutError,
  ProtocolError,
  RefusedError,
} from "./errors.js";
import { B1, type PrinterModel } from "./model.js";
import { CMD, INFO_KEY } from "./protocol/commands.js";
import { encodePacket, PacketParser, u16, type Packet } from "./protocol/packet.js";
import { encodeRows } from "./protocol/rows.js";
import type { Transport } from "./transport.js";
import { WebBluetoothTransport } from "./web-bluetooth.js";

/** How long a command waits for its reply. */
const STEP_TIMEOUT_MS = 2000;
const STATUS_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 300;
/** Status poll budget: `BASE + PER_EXTRA_COPY * (copies - 1)`. */
const POLL_BUDGET_BASE_MS = 30_000;
const POLL_BUDGET_PER_EXTRA_COPY_MS = 5000;
const ABORT_PRINT_END_TIMEOUT_MS = 1000;
const MAX_COPIES = 0xffff;
/** Gap labels; the only label type supported for the B1. */
const LABEL_TYPE_GAP = 1;
const PERCENT_DONE = 100;

export interface PrinterInfo {
  /** Battery level as reported by the printer. */
  battery?: number;
  serial?: string;
  /**
   * Firmware version as "major.minor", for example "5.26". The printer reports two bytes (major, minor),
   * which read together are the integer 1306. Matches what the official NIIMBOT app shows for a B1;
   * not documented by the vendor.
   */
  firmware?: string;
  /** The integer the printer reported for the firmware version, unformatted. */
  firmwareRaw?: number;
}

export interface PrintProgress {
  stage: "sending" | "printing";
  /** 0..100 */
  percent: number;
}

export interface PrintOptions {
  /** Print density, an integer inside the model's `densityRange`. */
  density?: number;
  /** Copies of the page, 1..65535. */
  copies?: number;
  onProgress?: (progress: PrintProgress) => void;
  /**
   * Abort the print. Before the page ends the printer is told to finish (best effort);
   * after `PageEnd` the page is already in the printer and may still print.
   */
  signal?: AbortSignal;
}

interface Pending {
  resolve(packet: Packet): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One printer on one transport. Commands run one at a time; a second call fails with `PrinterBusyError`. */
export class Printer {
  private readonly parser = new PacketParser();
  private pending: Pending | null = null;
  private busy = false;
  private handshaken = false;

  constructor(
    private readonly transport: Transport,
    private readonly model: PrinterModel = B1,
  ) {
    transport.onData((bytes) => this.handleData(bytes));
    transport.onDisconnect(() => this.settle((p) => p.reject(new DisconnectedError())));
  }

  /**
   * Open the browser's device chooser and connect to a printer over Web Bluetooth.
   * Must be called straight from a click handler, with nothing awaited before it.
   */
  static async connect(model: PrinterModel = B1): Promise<Printer> {
    return new Printer(await WebBluetoothTransport.request(model), model);
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async info(): Promise<PrinterInfo> {
    return this.locked(async () => {
      await this.ensureHandshake();
      const info: PrinterInfo = {};
      const battery = await this.query(INFO_KEY.BATTERY);
      if (battery) info.battery = bytesToNumber(battery.data);
      const serial = await this.query(INFO_KEY.SERIAL);
      if (serial) info.serial = new TextDecoder().decode(serial.data);
      const firmware = await this.query(INFO_KEY.FIRMWARE);
      if (firmware) {
        info.firmwareRaw = bytesToNumber(firmware.data);
        info.firmware = formatFirmware(info.firmwareRaw);
      }
      return info;
    });
  }

  /** Print one page. `rows` are 1-bit rows of `headDots / 8` bytes (1 = black), see `imageToRows`. */
  async print(rows: readonly Uint8Array[], options: PrintOptions = {}): Promise<void> {
    const { density = this.model.defaultDensity, copies = 1, onProgress, signal } = options;
    const { min, max } = this.model.densityRange;
    if (!Number.isInteger(density) || density < min || density > max) {
      throw new InvalidArgumentError(`Density must be an integer from ${min} to ${max}, got ${density}`);
    }
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
      throw new InvalidArgumentError(`Copies must be an integer from 1 to ${MAX_COPIES}, got ${copies}`);
    }
    // Validates every row and builds all packets before anything is written.
    const packets = encodeRows(rows, this.model.headDots / 8);
    if (signal?.aborted) throw new AbortedError();

    return this.locked(async () => {
      const onAbort = (): void => this.settle((p) => p.reject(new AbortedError()));
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await this.ensureHandshake();
        this.guard(signal);
        await this.sendPage(packets, rows.length, density, copies, onProgress, signal);
      } catch (error) {
        if (error instanceof AbortedError) await this.finishAfterAbort();
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    });
  }

  private async sendPage(
    packets: readonly Uint8Array[],
    rowCount: number,
    density: number,
    copies: number,
    onProgress: PrintOptions["onProgress"],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const step = async (label: string, cmd: number, data: number[] = [1]): Promise<void> => {
      this.guard(signal);
      await this.expect(label, cmd, data);
    };
    await step("density", CMD.SET_DENSITY, [density]);
    await step("label type", CMD.SET_LABEL_TYPE, [LABEL_TYPE_GAP]);
    await step("print start", CMD.PRINT_START, [...u16(1), 0, 0, 0, 0, 0]);
    await step("page start", CMD.PAGE_START);
    await step("page size", CMD.SET_PAGE_SIZE, [...u16(rowCount), ...u16(this.model.headDots), ...u16(copies)]);

    for (const [i, packet] of packets.entries()) {
      this.guard(signal);
      await this.transport.write(packet);
      onProgress?.({ stage: "sending", percent: Math.floor((100 * (i + 1)) / packets.length) });
      await sleep(this.model.rowGapMs);
    }
    await step("page end", CMD.PAGE_END);
    await this.waitUntilPrinted(copies, onProgress, signal);
    await this.request("print end", CMD.PRINT_END).catch(ignoreNoReply);
  }

  private async waitUntilPrinted(
    copies: number,
    onProgress: PrintOptions["onProgress"],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const deadline = Date.now() + POLL_BUDGET_BASE_MS + POLL_BUDGET_PER_EXTRA_COPY_MS * (copies - 1);
    while (Date.now() < deadline) {
      this.guard(signal);
      const status = await this.request("print status", CMD.PRINT_STATUS, [1], STATUS_TIMEOUT_MS).catch(ignoreNoReply);
      const [state, page, progress, feed] = status?.data ?? [];
      if (progress !== undefined && feed !== undefined) {
        onProgress?.({ stage: "printing", percent: Math.min(progress, feed, PERCENT_DONE) });
      }
      // Done condition of the prototype: no error, page 1, both progress counters at 100.
      if (state === 0 && page === 1 && progress === PERCENT_DONE && feed === PERCENT_DONE) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new PrintTimeoutError();
  }

  /** Best effort: tell the printer to finish its job after an abort. Failures are swallowed. */
  private async finishAfterAbort(): Promise<void> {
    await this.request("print end", CMD.PRINT_END, [1], ABORT_PRINT_END_TIMEOUT_MS).catch(() => undefined);
  }

  /** Checked between steps: the caller may have aborted, or the link may have dropped. */
  private guard(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new AbortedError();
    this.throwIfDisconnected();
  }

  private throwIfDisconnected(): void {
    if (!this.transport.connected) throw new DisconnectedError();
  }

  /** The prototype sends CONNECT on link-up and ignores its reply. */
  private async ensureHandshake(): Promise<void> {
    if (this.handshaken) return;
    await this.request("connect", CMD.CONNECT).catch(ignoreNoReply);
    this.handshaken = true;
  }

  /** Ask for one info value; `undefined` when the printer does not answer. */
  private query(key: number): Promise<Packet | undefined> {
    return this.request("info", CMD.GET_INFO, [key]).catch(ignoreNoReply);
  }

  private async locked<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy) throw new PrinterBusyError();
    this.throwIfDisconnected();
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }

  /** Send a command and require a non-refusing reply. */
  private async expect(label: string, cmd: number, data: number[]): Promise<Packet> {
    const reply = await this.request(label, cmd, data);
    if (reply.data[0] === 0) throw new RefusedError(label);
    return reply;
  }

  /** Send a command and resolve with the next reply packet (unsolicited `0xD3` packets never count). */
  private request(label: string, cmd: number, data: number[] = [1], timeoutMs = STEP_TIMEOUT_MS): Promise<Packet> {
    return new Promise<Packet>((resolve, reject) => {
      const timer = setTimeout(() => this.settle((p) => p.reject(new NoResponseError(label))), timeoutMs);
      this.pending = { resolve, reject, timer };
      this.transport.write(encodePacket(cmd, data)).catch((error: unknown) => {
        this.settle((p) => p.reject(error instanceof Error ? error : new DisconnectedError(undefined, { cause: error })));
      });
    });
  }

  /** Complete the waiting request, if any, exactly once. */
  private settle(complete: (pending: Pending) => void): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    complete(pending);
  }

  private handleData(bytes: Uint8Array): void {
    for (const frame of this.parser.push(bytes)) {
      if (frame.kind === "malformed") this.settle((p) => p.reject(new ProtocolError()));
      else this.settle((p) => p.resolve(frame.packet));
    }
  }
}

/** The high byte is the major version, the low byte the minor: 0x051a (1306) -> "5.26", 5 -> "0.05". */
const formatFirmware = (raw: number): string => `${raw >> 8}.${String(raw & 0xff).padStart(2, "0")}`;

const bytesToNumber = (bytes: Uint8Array): number => bytes.reduce((acc, b) => acc * 256 + b, 0);

/** A missing or garbled reply is tolerated where the prototype tolerated it. */
function ignoreNoReply(error: unknown): undefined {
  if (error instanceof NoResponseError || error instanceof ProtocolError) return undefined;
  throw error;
}
