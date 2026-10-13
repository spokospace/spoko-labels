import { InvalidArgumentError } from "../errors.js";
import { CMD } from "./commands.js";
import { encodePacket, u16 } from "./packet.js";

/** The page size command carries 16-bit row counts and `PRINT_*_ROW` carries a 16-bit row index. */
export const MAX_ROWS = 0xffff;
const MAX_BYTE = 0xff;
const MAX_REPEAT = MAX_BYTE;
/** The packet reports black dots for three equal slices of the row. */
const BLACK_COUNT_SLICES = 3;

const popcount = (byte: number): number => {
  let n = 0;
  for (let b = byte; b; b >>= 1) n += b & 1;
  return n;
};

/** Black-dot counts of the three equal slices of a row, each capped at 255. */
function blackCounts(row: Uint8Array): [number, number, number] {
  const third = Math.floor(row.length / BLACK_COUNT_SLICES);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < BLACK_COUNT_SLICES; i++) {
    let n = 0;
    for (let j = i * third; j < (i + 1) * third; j++) n += popcount(row[j] as number);
    out[i] = Math.min(n, MAX_BYTE);
  }
  return out;
}

const sameRow = (a: Uint8Array, b: Uint8Array): boolean => a.every((v, i) => v === b[i]);

/**
 * Turn 1-bit rows (1 = black, most significant bit leftmost) into the image packets of one page:
 * `0x85` for rows with black dots, `0x84` for empty rows, collapsing identical neighbours into a
 * repeat count (at most 255 per packet).
 */
export function encodeRows(rows: readonly Uint8Array[], rowBytes: number): Uint8Array[] {
  if (rows.length === 0) throw new InvalidArgumentError("A page needs at least one row");
  if (rows.length > MAX_ROWS) throw new InvalidArgumentError(`A page has at most ${MAX_ROWS} rows, got ${rows.length}`);
  rows.forEach((row, y) => {
    if (row.length !== rowBytes) {
      throw new InvalidArgumentError(`Row ${y} is ${row.length} bytes, expected ${rowBytes}`);
    }
  });

  const packets: Uint8Array[] = [];
  for (let y = 0; y < rows.length; ) {
    const row = rows[y] as Uint8Array;
    let repeat = 1;
    while (y + repeat < rows.length && repeat < MAX_REPEAT && sameRow(rows[y + repeat] as Uint8Array, row)) repeat++;
    if (row.every((b) => b === 0)) {
      packets.push(encodePacket(CMD.PRINT_EMPTY_ROW, [...u16(y), repeat]));
    } else {
      packets.push(encodePacket(CMD.PRINT_BITMAP_ROW, [...u16(y), ...blackCounts(row), repeat, ...row]));
    }
    y += repeat;
  }
  return packets;
}

/**
 * Move every row sideways by `dots` (positive is right, negative is left). Dots that leave the row are
 * dropped and the vacated side is white.
 */
export function shiftRows(rows: readonly Uint8Array[], dots: number): Uint8Array[] {
  if (dots === 0) return [...rows];
  return rows.map((row) => {
    const out = new Uint8Array(row.length);
    const width = row.length * 8;
    for (let i = Math.max(0, dots); i < Math.min(width, width + dots); i++) {
      const from = i - dots;
      if ((row[from >> 3] as number) & (0x80 >> (from & 7))) out[i >> 3] = (out[i >> 3] as number) | (0x80 >> (i & 7));
    }
    return out;
  });
}
