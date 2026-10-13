// Test doubles for the session: a link, a printer and the Web Locks API. labels-core's FakeTransport lives in
// its own tests and is not exported, so these stand in at the level the session uses.
import { B1, PrinterBusyError, type ImageLike } from "@spokospace/labels-core";
import type { Link, LocksLike, PrinterLike, SessionDeps } from "../src/session.js";

export class FakeLink implements Link {
  connected = true;
  closed = false;
  private readonly listeners = new Set<() => void>();
  constructor(readonly deviceName = "B1-TEST") {}
  write(): Promise<void> {
    return Promise.resolve();
  }
  onData(): () => void {
    return () => undefined;
  }
  onDisconnect(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): Promise<void> {
    this.closed = true;
    this.connected = false;
    return Promise.resolve();
  }
  /** Lose the link, as when the printer is turned off. */
  drop(): void {
    this.connected = false;
    for (const listener of this.listeners) listener();
  }
}

/** A printer that, like labels-core's, rejects a command while another one runs. */
export class FakePrinter implements PrinterLike {
  running = false;
  readonly calls: { kind: "info" | "print"; options?: unknown }[] = [];
  infoDelay = 0;
  battery: number | undefined = 3;
  /** Called before each print; throw from it to fail that print. */
  onPrint: (index: number) => void | Promise<void> = () => undefined;
  constructor(private readonly link: FakeLink) {}
  get connected(): boolean {
    return this.link.connected;
  }
  private async command<T>(task: () => Promise<T>): Promise<T> {
    if (this.running) throw new PrinterBusyError();
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }
  info(): Promise<{ battery?: number }> {
    this.calls.push({ kind: "info" });
    return this.command(async () => {
      await delay(this.infoDelay);
      return this.battery === undefined ? {} : { battery: this.battery };
    });
  }
  print(_rows: Uint8Array[], options: unknown): Promise<void> {
    const index = this.calls.filter((c) => c.kind === "print").length;
    this.calls.push({ kind: "print", options });
    return this.command(async () => {
      await delay(1);
      await this.onPrint(index);
    });
  }
  disconnect(): Promise<void> {
    return this.link.close();
  }
}

/** Exclusive locks shared by several "tabs" (sessions) of one test. */
export class FakeLocks implements LocksLike {
  private readonly held = new Map<string, Promise<void>>();
  async request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown> {
    while (this.held.has(name)) {
      if (options.ifAvailable) return callback(null);
      await this.held.get(name);
    }
    let release!: () => void;
    this.held.set(name, new Promise<void>((resolve) => (release = resolve)));
    try {
      return await callback({ name });
    } finally {
      this.held.delete(name);
      release();
    }
  }
  query(): Promise<{ held: { name: string }[] }> {
    return Promise.resolve({ held: [...this.held.keys()].map((name) => ({ name })) });
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Harness {
  deps: SessionDeps;
  links: FakeLink[];
  printers: FakePrinter[];
}

/** Deps for one session ("tab"): every request returns a new fake link and printer. */
export function harness(locks: LocksLike | undefined = new FakeLocks(), overrides: Partial<SessionDeps> = {}): Harness {
  const links: FakeLink[] = [];
  const printers: FakePrinter[] = [];
  const deps: SessionDeps = {
    model: B1,
    isSupported: () => true,
    isSecure: () => true,
    request: () => {
      const link = new FakeLink();
      links.push(link);
      return Promise.resolve(link);
    },
    reconnect: () => Promise.resolve(null),
    printer: (link) => {
      const printer = new FakePrinter(link as FakeLink);
      printers.push(printer);
      return printer;
    },
    locks,
    window: undefined,
    ...overrides,
  };
  return { deps, links, printers };
}

/** A blank 384 x 8 image: one label's worth of rows for imageToRows. */
export const blank = (): ImageLike => ({ width: 384, height: 8, data: new Uint8ClampedArray(384 * 8 * 4).fill(255) });
