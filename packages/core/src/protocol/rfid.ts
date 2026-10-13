/**
 * The RFID tag on a NIIMBOT roll, as the printer reports it over `GET_RFID`. The printer reads the
 * tag itself; this is the same data the official app reads to show which roll is loaded and how many
 * labels are left. There are no label dimensions here: the official app looks them up from a server by
 * `serial`/`barcode`, and whether the B1 reports them at all is not known yet.
 */
export interface RfidInfo {
  /** Tag UID as lowercase hex, 8 bytes as the printer reports them (an NTAG213 has a 7-byte UID plus a check byte). */
  uid: string;
  /** Barcode printed on the roll, ASCII. May be empty. */
  barcode: string;
  /** Roll serial, ASCII. May be empty. */
  serial: string;
  /** Labels on a full roll, as recorded on the tag. */
  total: number;
  /** Labels already used, as the printer has counted on the tag. `total - used` is what is left. */
  used: number;
  /** Label category code reported by the tag; model-specific, not the same enumeration as `SET_LABEL_TYPE`. */
  type: number;
}

/** 8-byte UID, then two length-prefixed ASCII strings, then `total` (u16 BE), `used` (u16 BE) and `type` (u8). */
const UID_BYTES = 8;
/** `total` (2) + `used` (2) + `type` (1), after the two strings. */
const TRAILER_BYTES = 5;

const decoder = new TextDecoder();
const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Parse a `GET_RFID` reply. Returns `null` when no tag is present or the printer does not report one
 * (the reply then starts with a `0` byte, where a tag UID starts with its non-zero manufacturer code),
 * and parses defensively: a reply too short for the fixed fields, or a length prefix that runs past
 * the end of the reply, yields `null` rather than throwing.
 *
 * The layout is taken from community reverse engineering of NIIMBOT printers, not from the vendor, and
 * has not yet been verified against a real B1.
 */
export function parseRfid(data: Uint8Array): RfidInfo | null {
  if (data.length < UID_BYTES || data[0] === 0) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const uid = toHex(data.subarray(0, UID_BYTES));

  let idx = UID_BYTES;
  const readLenPrefixed = (): string | null => {
    if (idx >= data.length) return null;
    const len = view.getUint8(idx++);
    if (idx + len > data.length) return null;
    const text = decoder.decode(data.subarray(idx, idx + len));
    idx += len;
    return text;
  };

  const barcode = readLenPrefixed();
  if (barcode === null) return null;
  const serial = readLenPrefixed();
  if (serial === null) return null;

  if (idx + TRAILER_BYTES > data.length) return null;
  return {
    uid,
    barcode,
    serial,
    total: view.getUint16(idx),
    used: view.getUint16(idx + 2),
    type: view.getUint8(idx + 4),
  };
}
