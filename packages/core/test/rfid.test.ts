import { describe, expect, it } from "vitest";
import { parseRfid, type RfidInfo } from "../src/index.js";
import { u16 } from "../src/protocol/packet.js";

/** Build a `GET_RFID` reply body from made-up field values. `uid` is 8 bytes. */
function tagReply(info: RfidInfo, uidBytes: number[]): Uint8Array {
  const enc = new TextEncoder();
  const barcode = enc.encode(info.barcode);
  const serial = enc.encode(info.serial);
  return Uint8Array.from([
    ...uidBytes,
    barcode.length,
    ...barcode,
    serial.length,
    ...serial,
    ...u16(info.total),
    ...u16(info.used),
    info.type,
  ]);
}

describe("parseRfid", () => {
  it("reads the UID, barcode, serial, counts and type", () => {
    const uid = [0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77];
    const expected: RfidInfo = {
      uid: "0411223344556677",
      barcode: "1234567890123",
      serial: "TEST-RFID-0001",
      total: 160,
      used: 37,
      type: 1,
    };
    expect(parseRfid(tagReply(expected, uid))).toEqual(expected);
  });

  it("accepts an empty barcode and serial", () => {
    const uid = [1, 2, 3, 4, 5, 6, 7, 8];
    const expected: RfidInfo = { uid: "0102030405060708", barcode: "", serial: "", total: 0, used: 0, type: 0 };
    expect(parseRfid(tagReply(expected, uid))).toEqual(expected);
  });

  it("derives what is left from total minus used", () => {
    const uid = [4, 0, 0, 0, 0, 0, 0, 1];
    const info = parseRfid(tagReply({ uid: "", barcode: "L", serial: "S", total: 300, used: 123, type: 5 }, uid));
    expect(info && info.total - info.used).toBe(177);
  });

  it("returns null when no tag is loaded (a one-byte reply)", () => {
    expect(parseRfid(Uint8Array.of(0))).toBeNull();
    expect(parseRfid(new Uint8Array(0))).toBeNull();
  });

  it("returns null for a no-tag reply padded with zeros, rather than an all-zero tag", () => {
    expect(parseRfid(new Uint8Array(20))).toBeNull();
  });

  it("returns null for a reply too short to hold the fixed fields", () => {
    expect(parseRfid(Uint8Array.of(4, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0))).toBeNull();
  });

  it("returns null when a length prefix runs past the end of the reply", () => {
    const uid = [1, 2, 3, 4, 5, 6, 7, 8];
    // barcode length claims 200 bytes that are not there
    expect(parseRfid(Uint8Array.from([...uid, 200, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("returns null when the trailer does not fit after the serial", () => {
    const uid = [1, 2, 3, 4, 5, 6, 7, 8];
    // empty barcode, serial claims 2 bytes, then only 4 trailer bytes instead of 5
    expect(parseRfid(Uint8Array.from([...uid, 0, 2, 0x41, 0x42, 0, 0, 0, 0]))).toBeNull();
  });
});
