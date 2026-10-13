import {
  B1,
  imageToRows,
  LabelsCoreError,
  Printer,
  WebBluetoothTransport,
  type ErrorCode,
  type ImageLike,
  type PrinterModel,
  type Transport,
} from "@spokospace/labels-core";

export type SessionState =
  | { kind: "unsupported"; reason: "no-bluetooth" | "insecure-context" }
  | { kind: "disconnected"; error?: ErrorCode | "internal" }
  | { kind: "busy-elsewhere" }
  | { kind: "connecting" }
  | { kind: "connected"; name: string; battery?: number }
  | { kind: "printing"; name: string; done: number; total: number };

/** A link to one printer: a labels-core transport that knows the device's name. */
export type Link = Transport & { readonly deviceName: string };

/** The part of labels-core's `Printer` the session uses. */
export interface PrinterLike {
  readonly connected: boolean;
  info(): Promise<{ battery?: number }>;
  print(rows: Uint8Array[], options: { density?: number; copies?: number; offsetMm?: { x: number; y: number }; signal?: AbortSignal }): Promise<void>;
  disconnect(): Promise<void>;
}

/** The subset of the Web Locks API the session uses. */
export interface LocksLike {
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
}

/** Everything the session needs from the browser and labels-core; tests replace it. */
export interface SessionDeps {
  model: PrinterModel;
  isSupported(): boolean;
  isSecure(): boolean;
  request(model: PrinterModel): Promise<Link>;
  reconnect(model: PrinterModel): Promise<Link | null>;
  printer(link: Link, model: PrinterModel): PrinterLike;
  locks: LocksLike | undefined;
  /** Where `livewire:navigate` and `beforeunload` are guarded while printing. */
  window: (Pick<Window, "addEventListener" | "removeEventListener"> & { document?: Pick<Document, "addEventListener" | "removeEventListener"> }) | undefined;
}

export interface BatchRequest {
  /** How many different labels (rows). */
  count: number;
  /** Copies of each label. */
  copies: number;
  density?: number;
  offsetMm?: { x: number; y: number };
  /** The printed image of label `index` (already turned by its print rotation). */
  image(index: number): ImageLike | Promise<ImageLike>;
  signal?: AbortSignal;
}

export interface BatchResult {
  /** Labels printed, copies included. */
  printed: number;
  cancelled: boolean;
  /** The label (0-based row) that failed, and why. */
  error?: { code: ErrorCode | "render" | "internal"; row: number };
}

/** The lock name shared by every tab of a host that uses this package. */
export const LOCK_NAME = "spoko-labels-printer";

const defaultDeps = (): SessionDeps => ({
  model: B1,
  isSupported: () => WebBluetoothTransport.isSupported(),
  isSecure: () => globalThis.isSecureContext !== false,
  request: (model) => WebBluetoothTransport.request(model),
  reconnect: (model) => WebBluetoothTransport.reconnect(model),
  printer: (link, model) => new Printer(link, model),
  locks: (globalThis.navigator as { locks?: LocksLike } | undefined)?.locks,
  window: globalThis.window,
});

const codeOf = (error: unknown): ErrorCode | "internal" => (error instanceof LabelsCoreError ? error.code : "internal");

/**
 * One printer connection for a page, shared by everything on it. It holds an exclusive Web Lock while
 * connected, so only one tab of the host talks to the printer, and it sends one printer command at a time.
 * Batches run here, not in the dialog, so they survive the dialog being removed.
 */
export class PrinterSession extends EventTarget {
  private current: SessionState;
  private printer: PrinterLike | null = null;
  private name = "";
  private battery: number | undefined;
  private releaseLock: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private watchingLock = false;

  constructor(private readonly deps: SessionDeps = defaultDeps()) {
    super();
    this.current = !deps.isSecure()
      ? { kind: "unsupported", reason: "insecure-context" }
      : !deps.isSupported()
        ? { kind: "unsupported", reason: "no-bluetooth" }
        : { kind: "disconnected" };
  }

  /** The printer model this session connects to (B1 by default). */
  get model(): PrinterModel {
    return this.deps.model;
  }

  get state(): SessionState {
    return this.current;
  }

  private setState(state: SessionState): void {
    this.current = state;
    this.dispatchEvent(new Event("statechange"));
  }

  /** Runs printer commands one after another: labels-core rejects a second command while one runs. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  /**
   * Opens the browser's device chooser and connects. Call it straight from a click handler: the chooser is
   * the first thing awaited, so the user gesture is kept. Errors become the `disconnected` state's `error`.
   */
  async connect(): Promise<void> {
    // Another tab holds the printer: no chooser (the state changes back when that tab lets go).
    if (this.current.kind !== "disconnected") return;
    let link: Link;
    try {
      // Nothing may be awaited before this call.
      const pending = this.deps.request(this.deps.model);
      this.setState({ kind: "connecting" });
      link = await pending;
    } catch (error) {
      this.setState({ kind: "disconnected", error: codeOf(error) });
      return;
    }
    await this.attach(link);
  }

  /**
   * Reconnects to a printer picked earlier, without the chooser, where the browser allows it. Never throws.
   * The state stays `disconnected` meanwhile, so a click can still connect; whichever link comes first wins.
   */
  async tryReconnect(): Promise<boolean> {
    if (this.current.kind !== "disconnected") return false;
    const link = await this.deps.reconnect(this.deps.model).catch(() => null);
    if (!link) return false;
    return this.attach(link);
  }

  async disconnect(): Promise<void> {
    const printer = this.printer;
    if (!printer) return;
    // The lock is let go only once the printer is closed, so no other tab starts talking to it mid-print.
    const releaseLock = this.releaseLock;
    this.releaseLock = null;
    this.detach();
    await this.run(() => printer.disconnect()).catch(() => undefined);
    releaseLock?.();
    this.setState({ kind: "disconnected" });
  }

  /** Checks whether another tab holds the printer; shows `busy-elsewhere` until it lets go. */
  async refresh(): Promise<void> {
    const locks = this.deps.locks;
    if (!locks || this.current.kind !== "disconnected" || this.releaseLock) return;
    const held = await locks.query().catch(() => ({ held: [] }));
    if (held.held?.some((lock) => lock.name === LOCK_NAME)) this.watchLock();
  }

  /** Shows `busy-elsewhere` and waits for the other tab's lock to go, then lets go of it and offers to connect. */
  private watchLock(): void {
    if (!this.deps.locks) return;
    if (this.current.kind === "disconnected") this.setState({ kind: "busy-elsewhere" });
    if (this.watchingLock) return;
    this.watchingLock = true;
    void this.deps.locks
      .request(LOCK_NAME, {}, async () => undefined)
      .catch(() => undefined)
      .then(() => {
        this.watchingLock = false;
        if (this.current.kind === "busy-elsewhere") this.setState({ kind: "disconnected" });
      });
  }

  /** Holds the lock until `releaseLock()`; false when another tab has it. */
  private acquireLock(): Promise<boolean> {
    const locks = this.deps.locks;
    if (!locks) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      locks
        .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return Promise.resolve();
          }
          resolve(true);
          return new Promise<void>((release) => {
            this.releaseLock = release;
          });
        })
        .catch(() => resolve(true));
    });
  }

  private async attach(link: Link): Promise<boolean> {
    // A silent reconnect and a click can both bring a link; the first one attached wins.
    if (this.printer) {
      await link.close().catch(() => undefined);
      return false;
    }
    if (!(await this.acquireLock())) {
      await link.close().catch(() => undefined);
      this.setState({ kind: "disconnected" });
      this.watchLock();
      return false;
    }
    this.printer = this.deps.printer(link, this.deps.model);
    this.name = link.deviceName;
    this.battery = undefined;
    this.unsubscribe = link.onDisconnect(() => this.dropped());
    this.setState(this.connectedState());
    void this.refreshBattery();
    return true;
  }

  private detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.printer = null;
    this.releaseLock?.();
    this.releaseLock = null;
  }

  private dropped(): void {
    if (!this.printer) return;
    const printing = this.current.kind === "printing";
    this.detach();
    // A batch that was printing reports the failure itself and sets the final state.
    if (!printing) this.setState({ kind: "disconnected", error: "disconnected" });
  }

  private connectedState(): SessionState {
    return { kind: "connected", name: this.name, ...(this.battery !== undefined && { battery: this.battery }) };
  }

  private async refreshBattery(): Promise<void> {
    const printer = this.printer;
    if (!printer) return;
    try {
      const info = await this.run(() => printer.info());
      this.battery = info.battery;
    } catch {
      return;
    }
    if (this.current.kind === "connected" && this.printer === printer) {
      this.setState(this.connectedState());
    }
  }

  /**
   * Prints `count` labels, each `copies` times, one print job per label so a cancel or a failure leaves an
   * exact count. Navigation (Livewire `wire:navigate`) is refused and a reload asks first while it runs.
   */
  async printBatch(request: BatchRequest): Promise<BatchResult> {
    const printer = this.printer;
    if (!printer || this.current.kind !== "connected") {
      return { printed: 0, cancelled: false, error: { code: "disconnected", row: 0 } };
    }
    const total = request.count * request.copies;
    let printed = 0;
    let cancelled = false;
    let error: BatchResult["error"];
    const guard = this.guardNavigation();
    this.setState({ kind: "printing", name: this.name, done: 0, total });
    try {
      labels: for (let row = 0; row < request.count; row++) {
        let rows: Uint8Array[];
        try {
          rows = imageToRows(await request.image(row), this.deps.model);
        } catch {
          error = { code: "render", row };
          break;
        }
        for (let copy = 0; copy < request.copies; copy++) {
          if (request.signal?.aborted) {
            cancelled = true;
            break labels;
          }
          try {
            await this.printOne(printer, rows, request);
          } catch (failure) {
            const code = codeOf(failure);
            if (code === "aborted") cancelled = true;
            else error = { code, row };
            break labels;
          }
          printed++;
          this.setState({ kind: "printing", name: this.name, done: printed, total });
        }
      }
    } finally {
      guard();
      if (this.printer === printer && printer.connected) {
        this.setState(this.connectedState());
        void this.refreshBattery();
      } else {
        if (this.printer) this.detach();
        this.setState({ kind: "disconnected", error: "disconnected" });
      }
    }
    return { printed, cancelled, ...(error && { error }) };
  }

  /** One copy of one label, through the command queue. */
  private printOne(printer: PrinterLike, rows: Uint8Array[], request: BatchRequest): Promise<void> {
    return this.run(() =>
      printer.print(rows, {
        copies: 1,
        ...(request.density !== undefined && { density: request.density }),
        ...(request.offsetMm !== undefined && { offsetMm: request.offsetMm }),
        ...(request.signal !== undefined && { signal: request.signal }),
      }),
    );
  }

  /** Refuses `livewire:navigate` and asks before a reload while printing; returns the undo. */
  private guardNavigation(): () => void {
    const win = this.deps.window;
    if (!win) return () => undefined;
    const navigate = (event: Event) => {
      // Back and forward have already changed the URL; let those through (the batch goes on in the session).
      if ((event as CustomEvent<{ history?: boolean } | null>).detail?.history) return;
      event.preventDefault();
      this.dispatchEvent(new Event("navigationblocked"));
    };
    const unload = (event: Event) => {
      event.preventDefault();
      (event as { returnValue?: unknown }).returnValue = "";
    };
    win.document?.addEventListener("livewire:navigate", navigate);
    win.addEventListener("beforeunload", unload);
    return () => {
      win.document?.removeEventListener("livewire:navigate", navigate);
      win.removeEventListener("beforeunload", unload);
    };
  }
}
