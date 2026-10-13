import { CMD, encodePacket, PacketParser, type Packet, type Transport } from "../src/index.js";

export type Responder = (packet: Packet, fake: FakeTransport) => void;

/** In-memory transport: records written packets and lets a responder script the printer's replies. */
export class FakeTransport implements Transport {
  connected = true;
  /** Every packet written, decoded, in order. */
  readonly written: Packet[] = [];
  private readonly parser = new PacketParser();
  private readonly dataListeners = new Set<(bytes: Uint8Array) => void>();
  private readonly disconnectListeners = new Set<() => void>();

  constructor(public responder: Responder = autoReply()) {}

  write(packet: Uint8Array): Promise<void> {
    if (!this.connected) return Promise.reject(new Error("fake link is down"));
    for (const frame of this.parser.push(packet)) {
      if (frame.kind === "packet") {
        this.written.push(frame.packet);
        this.responder(frame.packet, this);
      }
    }
    return Promise.resolve();
  }

  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  close(): Promise<void> {
    this.drop();
    return Promise.resolve();
  }

  /** Deliver raw notification bytes to the printer. */
  emit(bytes: Uint8Array): void {
    for (const listener of this.dataListeners) listener(bytes);
  }

  emitPacket(cmd: number, data: number[] = [1]): void {
    this.emit(encodePacket(cmd, data));
  }

  /** Lose the link. */
  drop(): void {
    if (!this.connected) return;
    this.connected = false;
    for (const listener of this.disconnectListeners) listener();
  }

  get cmds(): number[] {
    return this.written.map((p) => p.cmd);
  }
}

/** Reply code the printer uses for each request code. */
const REPLY: Readonly<Record<number, number>> = {
  [CMD.CONNECT]: 0xc2,
  [CMD.SET_DENSITY]: 0x31,
  [CMD.SET_LABEL_TYPE]: 0x33,
  [CMD.PRINT_START]: 0x02,
  [CMD.PAGE_START]: 0x04,
  [CMD.SET_PAGE_SIZE]: 0x14,
  [CMD.PAGE_END]: 0xe4,
  [CMD.PRINT_STATUS]: 0xb3,
  [CMD.PRINT_END]: 0xf4,
  [CMD.GET_INFO]: 0x4a,
  [CMD.GET_RFID]: 0x1b,
};

/** Status of a finished job: page 1 (16-bit), both progress counters at 100. */
const DONE: number[] = [0, 1, 100, 100];

export interface AutoReplyOptions {
  /** Commands that get no reply at all. */
  silent?: readonly number[];
  /** Commands answered with a refusal (data byte 0). */
  refuse?: readonly number[];
  /** Status replies in order; the last one repeats. Default: done immediately. */
  status?: readonly number[][];
  /** Reply data per `GET_INFO` selector; selectors not listed get no reply. */
  info?: Readonly<Record<number, number[]>>;
  /** Reply data for `GET_RFID`. Default: a single `0` (no tag loaded). */
  rfid?: number[];
  /** Emit an unsolicited 0xD3 packet after every row packet and right before the `PageEnd` reply. */
  lineChecks?: boolean;
  /** Called for every written packet before the reply logic runs. */
  onWrite?: (packet: Packet, fake: FakeTransport) => void;
}

/** A printer that acknowledges everything, with switches for the failure modes the tests need. */
export function autoReply(options: AutoReplyOptions = {}): Responder {
  let statusCalls = 0;
  return (packet, fake) => {
    options.onWrite?.(packet, fake);
    const { cmd } = packet;
    if (cmd === CMD.PRINT_EMPTY_ROW || cmd === CMD.PRINT_BITMAP_ROW) {
      if (options.lineChecks) fake.emitPacket(CMD.PRINTER_CHECK_LINE, [0, 1, 0, 0]);
      return;
    }
    if (options.silent?.includes(cmd)) return;
    if (cmd === CMD.PAGE_END && options.lineChecks) fake.emitPacket(CMD.PRINTER_CHECK_LINE, [0, 2, 0, 0]);
    const reply = REPLY[cmd];
    if (reply === undefined) return;
    if (options.refuse?.includes(cmd)) return fake.emitPacket(reply, [0]);
    if (cmd === CMD.PRINT_STATUS) {
      const sequence = options.status ?? [DONE];
      const data = sequence[Math.min(statusCalls++, sequence.length - 1)] ?? DONE;
      return fake.emitPacket(reply, data);
    }
    if (cmd === CMD.GET_INFO) {
      const data = options.info?.[packet.data[0] as number];
      if (data) fake.emitPacket(reply, data);
      return;
    }
    if (cmd === CMD.GET_RFID) {
      return fake.emitPacket(reply, options.rfid ?? [0]);
    }
    fake.emitPacket(reply, [1]);
  };
}
