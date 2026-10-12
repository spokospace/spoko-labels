import { InvalidArgumentError } from "../errors.js";
import { CMD } from "./commands.js";

const HEADER = 0x55;
const TAIL = 0xaa;
/** Header (2) + command (1) + length (1). */
const FRAME_HEAD = 4;
/** Checksum (1) + tail (2). */
const FRAME_FOOT = 3;

export interface Packet {
  readonly cmd: number;
  readonly data: Uint8Array;
}

/** Result of feeding bytes to the parser: a complete packet, or a frame that failed validation. */
export type ParsedFrame =
  | { readonly kind: "packet"; readonly packet: Packet }
  | { readonly kind: "malformed" };

/** `XOR(CMD, LEN, DATA...)`. */
function checksum(cmd: number, data: ArrayLike<number>): number {
  let chk = cmd ^ data.length;
  for (let i = 0; i < data.length; i++) chk ^= data[i] as number;
  return chk;
}

const isByte = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;

/** Big-endian 16-bit value as two bytes. */
export function u16(n: number): [number, number] {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
    throw new InvalidArgumentError(`Value ${n} does not fit in 16 bits`);
  }
  return [(n >> 8) & 0xff, n & 0xff];
}

/** `55 55 CMD LEN DATA... CHK AA AA`, with `CHK = XOR(CMD, LEN, DATA...)`. */
export function encodePacket(cmd: number, data: ArrayLike<number> = [1]): Uint8Array {
  if (!isByte(cmd)) throw new InvalidArgumentError(`Command ${cmd} is not a byte`);
  if (data.length > 0xff) throw new InvalidArgumentError(`Packet data is ${data.length} bytes, the maximum is 255`);
  const out = new Uint8Array(FRAME_HEAD + data.length + FRAME_FOOT);
  out[0] = HEADER;
  out[1] = HEADER;
  out[2] = cmd;
  out[3] = data.length;
  for (let i = 0; i < data.length; i++) {
    const b = data[i] as number;
    if (!isByte(b)) throw new InvalidArgumentError(`Data byte ${i} (${b}) is not a byte`);
    out[FRAME_HEAD + i] = b;
  }
  out[FRAME_HEAD + data.length] = checksum(cmd, data);
  out.fill(TAIL, FRAME_HEAD + data.length + 1);
  return out;
}

/**
 * Streaming decoder for the printer's notification stream. Notifications may split a
 * packet or carry several; feed every chunk to `push` in order.
 *
 * - Bytes before a `55 55` header are discarded silently.
 * - A frame with a bad checksum or tail is reported as `malformed` and the parser
 *   resynchronizes on the next header.
 * - Unsolicited `0xD3` line-check packets are dropped: they are progress noise, never a reply.
 */
export class PacketParser {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): ParsedFrame[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf);
    joined.set(chunk, this.buf.length);
    this.buf = joined;

    const frames: ParsedFrame[] = [];
    for (;;) {
      const start = this.findHeader();
      if (start < 0) {
        // Keep a trailing lone 0x55: it may be the first half of a header.
        this.buf = this.buf[this.buf.length - 1] === HEADER ? this.buf.slice(-1) : new Uint8Array(0);
        break;
      }
      if (start > 0) this.buf = this.buf.slice(start);
      if (this.buf.length < FRAME_HEAD) break;

      const len = this.buf[3] as number;
      const end = FRAME_HEAD + len + FRAME_FOOT;
      if (this.buf.length < end) break;

      const cmd = this.buf[2] as number;
      const data = this.buf.slice(FRAME_HEAD, FRAME_HEAD + len);
      const valid =
        checksum(cmd, data) === this.buf[end - 3] && this.buf[end - 2] === TAIL && this.buf[end - 1] === TAIL;

      if (!valid) {
        frames.push({ kind: "malformed" });
        this.buf = this.buf.slice(1);
        continue;
      }
      this.buf = this.buf.slice(end);
      if (cmd !== CMD.PRINTER_CHECK_LINE) frames.push({ kind: "packet", packet: { cmd, data } });
    }
    return frames;
  }

  /** Index of the next `55 55` header, preferring the last 0x55 of a run (a stray extra 0x55 is noise). */
  private findHeader(): number {
    for (let i = 0; i + 1 < this.buf.length; i++) {
      if (this.buf[i] === HEADER && this.buf[i + 1] === HEADER) {
        let s = i;
        while (this.buf[s + 2] === HEADER) s++;
        return s;
      }
    }
    return -1;
  }
}
