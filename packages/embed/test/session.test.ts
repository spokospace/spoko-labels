import { AbortedError, ChooserCancelledError, DisconnectedError } from "@spokospace/labels-core";
import { describe, expect, it, vi } from "vitest";
import { LOCK_NAME, PrinterSession, type SessionState } from "../src/session.js";
import { blank, delay, FakeLink, FakeLocks, FakePrinter, harness } from "./fakes.js";

const kinds = (session: PrinterSession) => {
  const seen: SessionState["kind"][] = [];
  session.addEventListener("statechange", () => seen.push(session.state.kind));
  return seen;
};
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await delay(1);
};

describe("PrinterSession: states", () => {
  it("is unsupported without Web Bluetooth or a secure context", () => {
    expect(new PrinterSession(harness(undefined, { isSupported: () => false }).deps).state).toEqual({ kind: "unsupported", reason: "no-bluetooth" });
    expect(new PrinterSession(harness(undefined, { isSecure: () => false }).deps).state).toEqual({ kind: "unsupported", reason: "insecure-context" });
    expect(new PrinterSession(harness().deps).state).toEqual({ kind: "disconnected" });
  });

  it("opens the chooser before awaiting anything, then reports the printer's name and battery", async () => {
    const h = harness();
    const request = vi.spyOn(h.deps, "request");
    const session = new PrinterSession(h.deps);
    const seen = kinds(session);
    const done = session.connect();
    // Still synchronous: the user gesture is intact when the chooser opens.
    expect(request).toHaveBeenCalledTimes(1);
    await done;
    await until(() => session.state.kind === "connected" && "battery" in session.state);
    expect(session.state).toEqual({ kind: "connected", name: "B1-TEST", battery: 3 });
    expect(seen).toEqual(["connecting", "connected", "connected"]);
  });

  it("turns a failed connect into the disconnected state's error", async () => {
    const session = new PrinterSession(harness(undefined, { request: () => Promise.reject(new ChooserCancelledError()) }).deps);
    await session.connect();
    expect(session.state).toEqual({ kind: "disconnected", error: "chooser-cancelled" });
  });

  it("goes back to disconnected when the printer drops, and lets another tab take it", async () => {
    const locks = new FakeLocks();
    const a = harness(locks);
    const session = new PrinterSession(a.deps);
    await session.connect();
    a.links[0]?.drop();
    expect(session.state).toEqual({ kind: "disconnected", error: "disconnected" });
    const other = new PrinterSession(harness(locks).deps);
    await other.connect();
    expect(other.state.kind).toBe("connected");
  });

  it("disconnects on request and releases the lock", async () => {
    const locks = new FakeLocks();
    const a = harness(locks);
    const session = new PrinterSession(a.deps);
    await session.connect();
    await session.disconnect();
    expect(session.state).toEqual({ kind: "disconnected" });
    expect(a.links[0]?.closed).toBe(true);
    expect((await locks.query()).held).toEqual([]);
  });
});

describe("PrinterSession: one tab holds the printer", () => {
  it("refuses a second tab while the first is connected, and offers it once the first lets go", async () => {
    const locks = new FakeLocks();
    const first = new PrinterSession(harness(locks).deps);
    await first.connect();
    const b = harness(locks);
    const second = new PrinterSession(b.deps);
    await second.connect();
    expect(second.state).toEqual({ kind: "busy-elsewhere" });
    expect(b.links[0]?.closed).toBe(true);
    await first.disconnect();
    await until(() => second.state.kind === "disconnected");
    expect(second.state).toEqual({ kind: "disconnected" });
  });

  it("shows busy-elsewhere on refresh when another tab holds the lock", async () => {
    const locks = new FakeLocks();
    const first = new PrinterSession(harness(locks).deps);
    await first.connect();
    expect((await locks.query()).held).toEqual([{ name: LOCK_NAME }]);
    const second = new PrinterSession(harness(locks).deps);
    await second.refresh();
    expect(second.state).toEqual({ kind: "busy-elsewhere" });
  });

  it("stays busy-elsewhere after a refused attempt, and opens no chooser while another tab holds the printer", async () => {
    const locks = new FakeLocks();
    const first = new PrinterSession(harness(locks).deps);
    await first.connect();
    // Ordering 1: the tab connects without knowing; the lock is refused.
    const b = harness(locks);
    const request = vi.spyOn(b.deps, "request");
    const second = new PrinterSession(b.deps);
    await second.connect();
    expect(second.state).toEqual({ kind: "busy-elsewhere" });
    await second.connect();
    expect(request).toHaveBeenCalledTimes(1);
    // Ordering 2: the tab learns first (refresh), then the user clicks.
    const c = harness(locks);
    const third = new PrinterSession(c.deps);
    await third.refresh();
    await third.connect();
    expect(c.links).toHaveLength(0);
    expect(third.state).toEqual({ kind: "busy-elsewhere" });
  });

  it("lets go of the lock only after the printer is closed", async () => {
    const locks = new FakeLocks();
    const a = harness(locks);
    const session = new PrinterSession(a.deps);
    await session.connect();
    let heldWhileClosing = false;
    const close = a.links[0]!.close.bind(a.links[0]);
    a.links[0]!.close = async () => {
      heldWhileClosing = (await locks.query()).held.length === 1;
      return close();
    };
    await session.disconnect();
    expect(heldWhileClosing).toBe(true);
    expect((await locks.query()).held).toEqual([]);
  });

  it("connects without a lock where the Web Locks API is missing", async () => {
    const session = new PrinterSession(harness(undefined).deps);
    await session.connect();
    expect(session.state.kind).toBe("connected");
  });
});

describe("PrinterSession: tryReconnect", () => {
  it("returns false and stays disconnected when no printer comes back", async () => {
    const session = new PrinterSession(harness().deps);
    expect(await session.tryReconnect()).toBe(false);
    expect(session.state).toEqual({ kind: "disconnected" });
  });

  it("keeps the chip usable while it tries, and lets a click win the race", async () => {
    let comeBack!: (link: FakeLink) => void;
    const late = new FakeLink("B1-LATE");
    const h = harness(undefined, { reconnect: () => new Promise((resolve) => (comeBack = resolve)) });
    const session = new PrinterSession(h.deps);
    const trying = session.tryReconnect();
    expect(session.state).toEqual({ kind: "disconnected" });
    await session.connect();
    expect(session.state).toMatchObject({ kind: "connected", name: "B1-TEST" });
    comeBack(late);
    expect(await trying).toBe(false);
    expect(late.closed).toBe(true);
    expect(session.state).toMatchObject({ kind: "connected", name: "B1-TEST" });
  });

  it("connects to a printer picked earlier without the chooser", async () => {
    const link = new FakeLink("B1-EARLIER");
    const session = new PrinterSession(harness(undefined, { reconnect: () => Promise.resolve(link) }).deps);
    expect(await session.tryReconnect()).toBe(true);
    expect(session.state).toMatchObject({ kind: "connected", name: "B1-EARLIER" });
  });
});

describe("PrinterSession: printBatch", () => {
  it("waits for the battery read after connecting instead of failing as busy", async () => {
    const h = harness();
    const makePrinter = h.deps.printer;
    h.deps.printer = (link, model) => {
      const printer = makePrinter(link, model) as FakePrinter;
      printer.infoDelay = 20;
      return printer;
    };
    const session = new PrinterSession(h.deps);
    await session.connect();
    // The battery read is still running when Print is clicked.
    expect(h.printers[0]?.running).toBe(true);
    const result = await session.printBatch({ count: 1, copies: 1, image: blank });
    expect(result).toEqual({ printed: 1, cancelled: false });
  });

  it("prints each row the given number of copies, one job each, and reports progress", async () => {
    const h = harness();
    const session = new PrinterSession(h.deps);
    await session.connect();
    const progress: number[] = [];
    session.addEventListener("statechange", () => {
      if (session.state.kind === "printing") progress.push(session.state.done);
    });
    const images: number[] = [];
    const result = await session.printBatch({ count: 3, copies: 2, density: 4, image: (row) => (images.push(row), blank()) });
    expect(result).toEqual({ printed: 6, cancelled: false });
    expect(images).toEqual([0, 1, 2]);
    const prints = h.printers[0]?.calls.filter((c) => c.kind === "print") ?? [];
    expect(prints).toHaveLength(6);
    expect(prints.every((c) => (c.options as { copies: number; density: number }).copies === 1 && (c.options as { density: number }).density === 4)).toBe(true);
    expect(progress).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await until(() => (h.printers[0]?.calls.at(-1)?.kind ?? "") === "info");
    expect(h.printers[0]?.calls.at(-1)?.kind).toBe("info");
    expect(session.state.kind).toBe("connected");
  });

  it("stops on cancel with the exact count", async () => {
    const h = harness();
    const session = new PrinterSession(h.deps);
    await session.connect();
    const abort = new AbortController();
    h.printers[0]!.onPrint = (index) => {
      if (index === 2) abort.abort();
      if (abort.signal.aborted) throw new AbortedError();
    };
    const result = await session.printBatch({ count: 5, copies: 1, image: blank, signal: abort.signal });
    expect(result).toEqual({ printed: 2, cancelled: true });
  });

  it("stops at a failure and says which row failed", async () => {
    const h = harness();
    const session = new PrinterSession(h.deps);
    await session.connect();
    h.printers[0]!.onPrint = (index) => {
      if (index === 3) throw new DisconnectedError();
    };
    const result = await session.printBatch({ count: 3, copies: 2, image: blank });
    expect(result).toEqual({ printed: 3, cancelled: false, error: { code: "disconnected", row: 1 } });
  });

  it("reports a label that cannot be rendered", async () => {
    const session = new PrinterSession(harness().deps);
    await session.connect();
    const result = await session.printBatch({
      count: 2,
      copies: 1,
      image: (row) => {
        if (row === 1) throw new Error("render failed");
        return blank();
      },
    });
    expect(result).toEqual({ printed: 1, cancelled: false, error: { code: "render", row: 1 } });
  });

  it("ends disconnected when the printer drops during a batch", async () => {
    const h = harness();
    const session = new PrinterSession(h.deps);
    await session.connect();
    h.printers[0]!.onPrint = (index) => {
      if (index === 1) {
        h.links[0]?.drop();
        throw new DisconnectedError();
      }
    };
    const result = await session.printBatch({ count: 3, copies: 1, image: blank });
    expect(result).toEqual({ printed: 1, cancelled: false, error: { code: "disconnected", row: 1 } });
    expect(session.state).toEqual({ kind: "disconnected", error: "disconnected" });
  });

  it("refuses Livewire navigation and guards reloads only while printing", async () => {
    const win = new EventTarget() as EventTarget & { document: EventTarget };
    win.document = new EventTarget();
    const h = harness(undefined, { window: win as never });
    const session = new PrinterSession(h.deps);
    await session.connect();
    let blocked = 0;
    session.addEventListener("navigationblocked", () => blocked++);
    const navigate = () => {
      const event = new Event("livewire:navigate", { cancelable: true });
      win.document.dispatchEvent(event);
      return event.defaultPrevented;
    };
    h.printers[0]!.onPrint = () => {
      expect(navigate()).toBe(true);
      const unload = new Event("beforeunload", { cancelable: true });
      win.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
    };
    await session.printBatch({ count: 1, copies: 1, image: blank });
    expect(blocked).toBe(1);
    expect(navigate()).toBe(false);
  });

  it("lets back and forward through while printing (the URL has already changed)", async () => {
    const win = new EventTarget() as EventTarget & { document: EventTarget };
    win.document = new EventTarget();
    const h = harness(undefined, { window: win as never });
    const session = new PrinterSession(h.deps);
    await session.connect();
    h.printers[0]!.onPrint = () => {
      const event = new CustomEvent("livewire:navigate", { cancelable: true, detail: { history: true } });
      win.document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    };
    expect(await session.printBatch({ count: 1, copies: 1, image: blank })).toEqual({ printed: 1, cancelled: false });
  });

  it("says the printer is not connected when there is nothing to print on", async () => {
    const session = new PrinterSession(harness().deps);
    expect(await session.printBatch({ count: 1, copies: 1, image: blank })).toEqual({
      printed: 0,
      cancelled: false,
      error: { code: "disconnected", row: 0 },
    });
  });
});
