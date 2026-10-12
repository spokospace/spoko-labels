import { describe, expect, it } from "vitest";
import { CMD, encodeRows, InvalidArgumentError, PacketParser } from "../src/index.js";
import { fromHex, toHex } from "./helpers.js";
import { rowVectors } from "./fixtures/prototype-vectors.js";

const row = (fill: number): Uint8Array => new Uint8Array(48).fill(fill);

function decode(packet: Uint8Array) {
  const [frame] = new PacketParser().push(packet);
  if (frame?.kind !== "packet") throw new Error("not a packet");
  return frame.packet;
}

describe("encodeRows", () => {
  it.each(rowVectors)("matches the prototype packets: $name", ({ rows, packets }) => {
    expect(encodeRows(rows.map(fromHex), 48).map(toHex)).toEqual(packets);
  });

  it("sends an empty row as 0x84 with its index and repeat count", () => {
    const [packet] = encodeRows([row(0), row(0), row(0)], 48);
    const { cmd, data } = decode(packet as Uint8Array);
    expect(cmd).toBe(CMD.PRINT_EMPTY_ROW);
    expect([...data]).toEqual([0, 0, 3]);
  });

  it("sends a bitmap row as 0x85: index, three black counts, repeat, 48 data bytes", () => {
    const [first, second_] = encodeRows([row(0), row(0x0f)], 48).map(decode);
    const second = second_ as ReturnType<typeof decode>;
    expect(first?.cmd).toBe(CMD.PRINT_EMPTY_ROW);
    expect(second.cmd).toBe(CMD.PRINT_BITMAP_ROW);
    expect([...second.data.slice(0, 7)]).toEqual([0, 1, 64, 64, 64, 1, 0x0f]);
    expect(second.data).toHaveLength(2 + 3 + 1 + 48);
  });

  it("counts black dots per third of the row", () => {
    const r = new Uint8Array(48);
    r.fill(0xff, 0, 16);
    r.fill(0x01, 16, 32);
    const { data } = decode(encodeRows([r], 48)[0] as Uint8Array);
    expect([...data.slice(2, 5)]).toEqual([128, 16, 0]);
  });

  it("caps a black count at 255", () => {
    // Rows wider than the head: a third of 96 bytes is 32 bytes = 256 dots.
    const wide = new Uint8Array(96).fill(0xff);
    const { data } = decode(encodeRows([wide], 96)[0] as Uint8Array);
    expect([...data.slice(2, 5)]).toEqual([255, 255, 255]);
  });

  it("splits runs longer than 255 rows into several packets", () => {
    const packets = encodeRows(Array.from({ length: 300 }, () => row(0)), 48).map(decode);
    expect(packets.map((p) => [...p.data])).toEqual([
      [0, 0, 255],
      [0, 255, 45],
    ]);
  });

  it("does not merge different rows", () => {
    const packets = encodeRows([row(0xaa), row(0x55), row(0xaa)], 48).map(decode);
    expect(packets.map((p) => p.data[1])).toEqual([0, 1, 2]);
    expect(packets.map((p) => p.data[5])).toEqual([1, 1, 1]);
  });

  it("rejects no rows, a row of the wrong length and too many rows", () => {
    expect(() => encodeRows([], 48)).toThrow(InvalidArgumentError);
    expect(() => encodeRows([new Uint8Array(47)], 48)).toThrow(InvalidArgumentError);
    expect(() => encodeRows([row(0), new Uint8Array(49)], 48)).toThrow(/Row 1/);
    expect(() => encodeRows(new Array(65536).fill(row(0)), 48)).toThrow(InvalidArgumentError);
  });
});
