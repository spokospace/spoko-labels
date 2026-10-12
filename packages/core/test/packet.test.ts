import { describe, expect, it } from "vitest";
import { CMD, encodePacket, InvalidArgumentError, PacketParser, u16, type ParsedFrame } from "../src/index.js";
import { fromHex, toHex } from "./helpers.js";
import { packetVectors } from "./fixtures/prototype-vectors.js";

const packets = (frames: ParsedFrame[]) =>
  frames.flatMap((f) => (f.kind === "packet" ? [{ cmd: f.packet.cmd, data: [...f.packet.data] }] : []));

describe("encodePacket", () => {
  it.each(packetVectors)("matches the prototype bytes: $name", ({ cmd, data, hex }) => {
    const actual = data ? encodePacket(cmd, data) : encodePacket(cmd);
    expect(toHex(actual)).toBe(hex);
  });

  it("frames a packet as 55 55 CMD LEN DATA CHK AA AA", () => {
    // checksum = 0x21 ^ 0x01 ^ 0x03 = 0x23
    expect(toHex(encodePacket(0x21, [3]))).toBe("555521010323aaaa");
  });

  it("defaults the payload to a single 0x01 byte", () => {
    expect(toHex(encodePacket(CMD.CONNECT))).toBe(toHex(encodePacket(CMD.CONNECT, [1])));
  });

  it("rejects values that are not bytes and payloads over 255 bytes", () => {
    expect(() => encodePacket(256)).toThrow(InvalidArgumentError);
    expect(() => encodePacket(-1)).toThrow(InvalidArgumentError);
    expect(() => encodePacket(1, [256])).toThrow(InvalidArgumentError);
    expect(() => encodePacket(1, [1.5])).toThrow(InvalidArgumentError);
    expect(() => encodePacket(1, new Array(256).fill(0))).toThrow(InvalidArgumentError);
  });
});

describe("u16", () => {
  it("encodes big-endian and rejects out-of-range values", () => {
    expect(u16(0x012c)).toEqual([0x01, 0x2c]);
    expect(u16(0)).toEqual([0, 0]);
    expect(u16(0xffff)).toEqual([0xff, 0xff]);
    expect(() => u16(0x10000)).toThrow(InvalidArgumentError);
    expect(() => u16(-1)).toThrow(InvalidArgumentError);
  });
});

describe("PacketParser", () => {
  const reply = (cmd: number, data: number[]) => encodePacket(cmd, data);

  it("decodes a single packet", () => {
    const parser = new PacketParser();
    expect(packets(parser.push(reply(0x02, [1])))).toEqual([{ cmd: 0x02, data: [1] }]);
  });

  it("decodes packets split across notifications at every byte boundary", () => {
    const bytes = reply(0xb3, [0, 1, 100, 100]);
    for (let cut = 1; cut < bytes.length; cut++) {
      const parser = new PacketParser();
      const first = parser.push(bytes.slice(0, cut));
      const second = parser.push(bytes.slice(cut));
      expect(packets([...first, ...second])).toEqual([{ cmd: 0xb3, data: [0, 1, 100, 100] }]);
    }
  });

  it("decodes several packets delivered in one notification, in order", () => {
    const joined = new Uint8Array([...reply(0x02, [1]), ...reply(0x31, [1]), ...reply(0xe4, [1])]);
    expect(packets(new PacketParser().push(joined)).map((p) => p.cmd)).toEqual([0x02, 0x31, 0xe4]);
  });

  it("drops unsolicited 0xD3 line-check packets so they are never taken for a reply", () => {
    const parser = new PacketParser();
    const frames = parser.push(
      new Uint8Array([...reply(CMD.PRINTER_CHECK_LINE, [0, 12, 0, 0]), ...reply(0xe4, [1]), ...reply(CMD.PRINTER_CHECK_LINE, [0, 13, 0, 0])]),
    );
    expect(packets(frames)).toEqual([{ cmd: 0xe4, data: [1] }]);
  });

  it("drops a 0xD3 packet that arrives split across notifications", () => {
    const parser = new PacketParser();
    const d3 = reply(CMD.PRINTER_CHECK_LINE, [0, 1, 0, 0]);
    const frames = [...parser.push(d3.slice(0, 5)), ...parser.push(d3.slice(5)), ...parser.push(reply(0xe4, [1]))];
    expect(packets(frames)).toEqual([{ cmd: 0xe4, data: [1] }]);
  });

  it("discards noise before a header without reporting it", () => {
    const parser = new PacketParser();
    const frames = parser.push(new Uint8Array([0x00, 0x13, 0x77, ...reply(0x02, [1])]));
    expect(frames.map((f) => f.kind)).toEqual(["packet"]);
  });

  it("tolerates a stray extra 0x55 before a header", () => {
    const parser = new PacketParser();
    const frames = parser.push(new Uint8Array([0x55, ...reply(0x02, [1])]));
    expect(packets(frames)).toEqual([{ cmd: 0x02, data: [1] }]);
  });

  it("keeps a trailing 0x55 that may start the next header", () => {
    const parser = new PacketParser();
    const bytes = reply(0x02, [1]);
    expect(parser.push(new Uint8Array([0x00, 0x55])).length).toBe(0);
    expect(packets(parser.push(bytes.slice(1)))).toEqual([{ cmd: 0x02, data: [1] }]);
  });

  it("reports a bad checksum as malformed and recovers on the next packet", () => {
    const parser = new PacketParser();
    const bad = reply(0x02, [1]);
    bad[bad.length - 3] = (bad[bad.length - 3] as number) ^ 0xff;
    const frames = parser.push(new Uint8Array([...bad, ...reply(0x31, [1])]));
    expect(frames.some((f) => f.kind === "malformed")).toBe(true);
    expect(packets(frames)).toEqual([{ cmd: 0x31, data: [1] }]);
  });

  it("reports a missing tail as malformed", () => {
    const parser = new PacketParser();
    const bad = reply(0x02, [1]);
    bad[bad.length - 1] = 0x00;
    const frames = parser.push(new Uint8Array([...bad, ...reply(0x31, [1])]));
    expect(frames.some((f) => f.kind === "malformed")).toBe(true);
    expect(packets(frames)).toEqual([{ cmd: 0x31, data: [1] }]);
  });

  it("round-trips every vector from the prototype", () => {
    for (const { hex, cmd } of packetVectors) {
      const frames = new PacketParser().push(fromHex(hex));
      expect(frames).toHaveLength(1);
      const [frame] = frames;
      if (cmd === CMD.PRINTER_CHECK_LINE) continue;
      expect(frame?.kind === "packet" && frame.packet.cmd).toBe(cmd);
    }
  });
});
