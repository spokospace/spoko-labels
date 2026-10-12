import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AbortedError,
  B1,
  CMD,
  DisconnectedError,
  INFO_KEY,
  InvalidArgumentError,
  NoResponseError,
  Printer,
  PrinterBusyError,
  PrintTimeoutError,
  ProtocolError,
  RefusedError,
  type PrintProgress,
} from "../src/index.js";
import { autoReply, FakeTransport, type AutoReplyOptions } from "./fake-transport.js";
import { sequenceVectors } from "./fixtures/prototype-vectors.js";
import { fromHex, toHex } from "./helpers.js";
import { encodePacket } from "../src/index.js";

const row = (fill: number): Uint8Array => new Uint8Array(48).fill(fill);
const ROWS = [row(0), row(0), row(0xaa), row(0xaa), row(0xff)];

function setup(options?: AutoReplyOptions) {
  const fake = new FakeTransport(autoReply(options));
  return { fake, printer: new Printer(fake) };
}

/** Drive fake timers until the promise settles, then return or rethrow its outcome. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await outcome;
  if ("error" in result) throw result.error;
  return result.value;
}

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await settled(promise);
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Printer connection state", () => {
  it("mirrors the transport and closes it on disconnect", async () => {
    const { fake, printer } = setup();
    expect(printer.connected).toBe(true);
    await printer.disconnect();
    expect(fake.connected).toBe(false);
    expect(printer.connected).toBe(false);
  });
});

describe("Printer.info", () => {
  it("returns battery, serial and firmware", async () => {
    const { printer } = setup({
      info: {
        [INFO_KEY.BATTERY]: [3],
        [INFO_KEY.SERIAL]: [...new TextEncoder().encode("TEST-0001")],
        [INFO_KEY.FIRMWARE]: [0x05, 0x1a],
      },
    });
    expect(await settled(printer.info())).toEqual({
      battery: 3,
      serial: "TEST-0001",
      firmware: "5.26",
      firmwareRaw: 1306,
    });
  });

  it.each([
    [[0x05, 0x1a], "5.26", 1306], // B1 firmware shown as 5.26 by the official app
    [[0x05, 0x0a], "5.10", 1290],
    [[0x00, 0x05], "0.05", 5],
    [[0x0d, 0xff], "13.255", 3583],
  ])("formats the firmware value %j as %s", async (bytes, formatted, raw) => {
    const { printer } = setup({ info: { [INFO_KEY.FIRMWARE]: bytes } });
    expect(await settled(printer.info())).toEqual({ firmware: formatted, firmwareRaw: raw });
  });

  it("leaves out values the printer does not answer", async () => {
    const { printer } = setup({ info: { [INFO_KEY.BATTERY]: [2] } });
    expect(await settled(printer.info())).toEqual({ battery: 2 });
  });

  it("sends the CONNECT handshake once per printer", async () => {
    const { fake, printer } = setup();
    await settled(printer.info());
    await settled(printer.info());
    expect(fake.cmds.filter((c) => c === CMD.CONNECT)).toHaveLength(1);
    expect(fake.cmds[0]).toBe(CMD.CONNECT);
  });

  it("does not fail when the printer ignores the handshake", async () => {
    const { printer } = setup({ silent: [CMD.CONNECT], info: { [INFO_KEY.BATTERY]: [1] } });
    expect(await settled(printer.info())).toEqual({ battery: 1 });
  });

  it("rejects when the link is down", async () => {
    const { fake, printer } = setup();
    fake.drop();
    expect(await rejection(printer.info())).toBeInstanceOf(DisconnectedError);
    expect(fake.written).toHaveLength(0);
  });
});

describe("Printer.print: sequence", () => {
  it.each(sequenceVectors)("writes the prototype packet sequence: $name", async ({ density, copies, rows, packets }) => {
    const { fake, printer } = setup();
    await settled(printer.print(rows.map(fromHex), { density, copies }));
    const written = fake.written.map((p) => toHex(encodePacket(p.cmd, p.data)));
    expect(written[0]).toBe(toHex(encodePacket(CMD.CONNECT)));
    expect(written.slice(1)).toEqual(packets);
  });

  it("defaults to the model density and one copy", async () => {
    const { fake, printer } = setup();
    await settled(printer.print(ROWS));
    const density = fake.written.find((p) => p.cmd === CMD.SET_DENSITY);
    const pageSize = fake.written.find((p) => p.cmd === CMD.SET_PAGE_SIZE);
    expect([...(density?.data ?? [])]).toEqual([B1.defaultDensity]);
    expect([...(pageSize?.data ?? [])]).toEqual([0, ROWS.length, 0x01, 0x80, 0, 1]);
  });

  it("is not confused by unsolicited 0xD3 packets, including right before the PageEnd reply", async () => {
    const { fake, printer } = setup({ lineChecks: true });
    await settled(printer.print(ROWS));
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
    expect(fake.cmds).toContain(CMD.PAGE_END);
  });

  it("reports sending progress up to 100 and printing progress from the status replies", async () => {
    const { printer } = setup({ status: [[0, 1, 0, 0], [0, 1, 50, 60], [0, 1, 100, 100]] });
    const events: PrintProgress[] = [];
    await settled(printer.print(ROWS, { onProgress: (p) => events.push(p) }));
    const sending = events.filter((e) => e.stage === "sending").map((e) => e.percent);
    expect(sending.at(-1)).toBe(100);
    expect(sending).toEqual([...sending].sort((a, b) => a - b));
    expect(events.filter((e) => e.stage === "printing").map((e) => e.percent)).toEqual([0, 50, 100]);
  });

  it("allows another print after a successful one", async () => {
    const { fake, printer } = setup();
    await settled(printer.print(ROWS));
    await settled(printer.print(ROWS));
    expect(fake.cmds.filter((c) => c === CMD.PRINT_START)).toHaveLength(2);
  });
});

describe("Printer.print: failures per step", () => {
  const steps = [
    ["density", CMD.SET_DENSITY],
    ["label type", CMD.SET_LABEL_TYPE],
    ["print start", CMD.PRINT_START],
    ["page start", CMD.PAGE_START],
    ["page size", CMD.SET_PAGE_SIZE],
    ["page end", CMD.PAGE_END],
  ] as const;

  it.each(steps)("a refusal at %s is a RefusedError naming the step", async (label, cmd) => {
    const { printer } = setup({ refuse: [cmd] });
    const error = await rejection(printer.print(ROWS));
    expect(error).toBeInstanceOf(RefusedError);
    expect((error as RefusedError).step).toBe(label);
  });

  it.each(steps)("silence at %s is a NoResponseError naming the step after 2 s", async (label, cmd) => {
    const { printer } = setup({ silent: [cmd] });
    const start = Date.now();
    const error = await rejection(printer.print(ROWS));
    expect(error).toBeInstanceOf(NoResponseError);
    expect((error as NoResponseError).step).toBe(label);
    expect(Date.now() - start).toBeGreaterThanOrEqual(2000);
  });

  it("a malformed reply while waiting is a ProtocolError", async () => {
    const { printer } = setup({
      onWrite: (packet, fake) => {
        if (packet.cmd === CMD.SET_DENSITY) {
          const bad = encodePacket(0x31, [1]);
          bad[bad.length - 3] = (bad[bad.length - 3] as number) ^ 0xff;
          fake.emit(bad);
        }
      },
      silent: [CMD.SET_DENSITY],
    });
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(ProtocolError);
  });

  it("propagates a transport write failure", async () => {
    const { fake, printer } = setup();
    const failure = new Error("write failed");
    fake.write = () => Promise.reject(failure);
    expect(await rejection(printer.print(ROWS))).toBe(failure);
  });
});

describe("Printer.print: status polling", () => {
  it("keeps polling until the page is done", async () => {
    const { fake, printer } = setup({ status: [[0, 0, 0, 0], [0, 1, 10, 10], [0, 1, 100, 100]] });
    await settled(printer.print(ROWS));
    expect(fake.cmds.filter((c) => c === CMD.PRINT_STATUS)).toHaveLength(3);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
  });

  it("tolerates missing status replies and still finishes", async () => {
    let calls = 0;
    const { printer } = setup({
      onWrite: (packet, fake) => {
        if (packet.cmd === CMD.PRINT_STATUS && ++calls === 3) fake.emitPacket(0xb3, [0, 1, 100, 100]);
      },
      silent: [CMD.PRINT_STATUS],
    });
    await settled(printer.print(ROWS));
    expect(calls).toBe(3);
  });

  it("with copies > 1 waits for the last copy, not just page 1 (page 1 of 2 once cut the job short on a B1)", async () => {
    const { fake, printer } = setup({ status: [[0, 1, 100, 100], [0, 2, 50, 50], [0, 2, 100, 100]] });
    await settled(printer.print(ROWS, { copies: 2 }));
    expect(fake.cmds.filter((c) => c === CMD.PRINT_STATUS)).toHaveLength(3);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
  });

  it("does not finish a one-copy job on a status for another page", async () => {
    const { fake, printer } = setup({ status: [[0, 0, 100, 100], [0, 1, 100, 100]] });
    await settled(printer.print(ROWS));
    expect(fake.cmds.filter((c) => c === CMD.PRINT_STATUS)).toHaveLength(2);
  });

  it("times out after 30 s for one copy", async () => {
    const { printer } = setup({ status: [[0, 1, 10, 10]] });
    const start = Date.now();
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(PrintTimeoutError);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(30_000);
    expect(elapsed).toBeLessThan(33_000);
  });

  it("allows 5 s more per extra copy", async () => {
    const { printer } = setup({ status: [[0, 1, 10, 10]] });
    const start = Date.now();
    expect(await rejection(printer.print(ROWS, { copies: 3 }))).toBeInstanceOf(PrintTimeoutError);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40_000);
    expect(elapsed).toBeLessThan(43_000);
  });

  it("times out when the printer never answers the status poll", async () => {
    const { printer } = setup({ silent: [CMD.PRINT_STATUS] });
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(PrintTimeoutError);
  });
});

describe("Printer.print: argument validation", () => {
  const bad: [string, Parameters<Printer["print"]>][] = [
    ["density below the range", [ROWS, { density: B1.densityRange.min - 1 }]],
    ["density above the range", [ROWS, { density: B1.densityRange.max + 1 }]],
    ["fractional density", [ROWS, { density: 2.5 }]],
    ["zero copies", [ROWS, { copies: 0 }]],
    ["too many copies", [ROWS, { copies: 65536 }]],
    ["fractional copies", [ROWS, { copies: 1.5 }]],
    ["no rows", [[]]],
    ["a row of the wrong length", [[row(0), new Uint8Array(47)]]],
  ];

  it.each(bad)("rejects %s without writing anything", async (_name, args) => {
    const { fake, printer } = setup();
    expect(await rejection(printer.print(...args))).toBeInstanceOf(InvalidArgumentError);
    expect(fake.written).toHaveLength(0);
  });

  it("accepts the range limits and the maximum copies", async () => {
    const { fake, printer } = setup();
    await settled(printer.print(ROWS, { density: B1.densityRange.min }));
    await settled(printer.print(ROWS, { density: B1.densityRange.max, copies: 65535 }));
    expect(fake.cmds.filter((c) => c === CMD.PRINT_START)).toHaveLength(2);
  });

  it("rejects when the link is down, without writing", async () => {
    const { fake, printer } = setup();
    fake.drop();
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(DisconnectedError);
    expect(fake.written).toHaveLength(0);
  });
});

describe("Printer: busy lock", () => {
  it("rejects a second command while one is running", async () => {
    const { printer } = setup();
    const first = printer.print(ROWS);
    const second = Promise.allSettled([printer.print(ROWS), printer.info()]);
    await settled(first);
    const results = await second;
    for (const result of results) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(PrinterBusyError);
    }
  });

  it("is released after success", async () => {
    const { printer } = setup();
    await settled(printer.print(ROWS));
    await settled(printer.info());
  });

  it("is released after a refusal", async () => {
    const { fake, printer } = setup({ refuse: [CMD.SET_DENSITY] });
    await rejection(printer.print(ROWS));
    fake.responder = autoReply();
    await settled(printer.print(ROWS));
  });

  it("is released after a timeout", async () => {
    const { fake, printer } = setup({ status: [[0, 1, 1, 1]] });
    await rejection(printer.print(ROWS));
    fake.responder = autoReply();
    await settled(printer.print(ROWS));
  });

  it("is released after an abort", async () => {
    const { fake, printer } = setup();
    const controller = new AbortController();
    const first = printer.print(ROWS, { signal: controller.signal, onProgress: () => controller.abort() });
    expect(await rejection(first)).toBeInstanceOf(AbortedError);
    fake.responder = autoReply();
    await settled(printer.print(ROWS));
  });

  it("is released after a disconnect", async () => {
    const { fake, printer } = setup({ onWrite: (p, f) => p.cmd === CMD.PRINT_START && f.drop() });
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(DisconnectedError);
    fake.connected = true;
    fake.responder = autoReply();
    await settled(printer.print(ROWS));
  });
});

describe("Printer.print: disconnect", () => {
  it("fails with DisconnectedError when the link drops while waiting for a reply", async () => {
    const { printer } = setup({ onWrite: (p, f) => p.cmd === CMD.PRINT_START && f.drop(), silent: [CMD.PRINT_START] });
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(DisconnectedError);
  });

  it("stops sending rows when the link drops between packets", async () => {
    let rows = 0;
    const { fake, printer } = setup({
      onWrite: (p, f) => {
        if ((p.cmd === CMD.PRINT_EMPTY_ROW || p.cmd === CMD.PRINT_BITMAP_ROW) && ++rows === 1) f.drop();
      },
    });
    expect(await rejection(printer.print(ROWS))).toBeInstanceOf(DisconnectedError);
    expect(fake.cmds).not.toContain(CMD.PAGE_END);
  });
});

describe("Printer.print: abort", () => {
  it("rejects immediately and writes nothing when already aborted", async () => {
    const { fake, printer } = setup();
    expect(await rejection(printer.print(ROWS, { signal: AbortSignal.abort() }))).toBeInstanceOf(AbortedError);
    expect(fake.written).toHaveLength(0);
  });

  it("stops sending rows, then sends a best-effort PrintEnd", async () => {
    const { fake, printer } = setup();
    const controller = new AbortController();
    const print = printer.print(ROWS, { signal: controller.signal, onProgress: () => controller.abort() });
    expect(await rejection(print)).toBeInstanceOf(AbortedError);
    expect(fake.cmds).not.toContain(CMD.PAGE_END);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
    // only the first row packet went out
    expect(fake.cmds.filter((c) => c === CMD.PRINT_EMPTY_ROW || c === CMD.PRINT_BITMAP_ROW)).toHaveLength(1);
  });

  it("interrupts a wait for a reply with AbortedError, not NoResponseError", async () => {
    const { fake, printer } = setup({ silent: [CMD.PAGE_START] });
    const controller = new AbortController();
    const outcome = printer.print(ROWS, { signal: controller.signal }).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await outcome).toBeInstanceOf(AbortedError);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
  });

  it("during polling: stops polling, sends PrintEnd and rejects (the label may still print)", async () => {
    const { fake, printer } = setup({ status: [[0, 1, 10, 10]] });
    const controller = new AbortController();
    const print = printer.print(ROWS, {
      signal: controller.signal,
      onProgress: (p) => p.stage === "printing" && controller.abort(),
    });
    expect(await rejection(print)).toBeInstanceOf(AbortedError);
    expect(fake.cmds).toContain(CMD.PAGE_END);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
    expect(fake.cmds.filter((c) => c === CMD.PRINT_STATUS)).toHaveLength(1);
  });

  it("still rejects with AbortedError when the best-effort PrintEnd gets no reply", async () => {
    const { fake, printer } = setup({ silent: [CMD.PRINT_END] });
    const controller = new AbortController();
    const print = printer.print(ROWS, { signal: controller.signal, onProgress: () => controller.abort() });
    expect(await rejection(print)).toBeInstanceOf(AbortedError);
    expect(fake.cmds.at(-1)).toBe(CMD.PRINT_END);
  });

  it("still rejects with AbortedError when writing the best-effort PrintEnd fails", async () => {
    const { fake, printer } = setup();
    const controller = new AbortController();
    const print = printer.print(ROWS, {
      signal: controller.signal,
      onProgress: () => {
        controller.abort();
        fake.write = () => Promise.reject(new Error("link is gone"));
      },
    });
    expect(await rejection(print)).toBeInstanceOf(AbortedError);
  });
});
