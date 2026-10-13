# @spokospace/labels-core: NIIMBOT protocol and Web Bluetooth transport

> **Status: implemented** in #2 (codec), #3 (`Printer`) and #4 (Web Bluetooth, hardware check on a B1), with a follow-up in #21 (Bluetooth switched off). The sections below are the design as approved; where the implementation differs, [What changed during implementation](#-what-changed-during-implementation) wins and `packages/core/README.md` documents the shipped behavior.

## 📝 TLDR
Web apps that want to print on a NIIMBOT B1 have no reusable library today: the only working code is a prototype that mixes the BLE transport, the packet codec, the print sequence and localized messages in one class. Proposed (future behavior): `packages/core` ports it to strict, dependency-free TypeScript as a pure codec, a transport interface with a Web Bluetooth implementation, a `Printer` class and an image-to-rows helper. Render, embed and the web app build on it.

## 📝 Problem Statement
- The prototype cannot be tested without a printer, and its UI strings are baked into errors.
- Unsolicited `0xD3` ("line check") packets once aborted a real print because one was taken for the `PageEnd` reply. This must be covered by a test, not by memory.
- Other web apps (the embed dialog, third-party hosts) need a stable, typed API rather than a copy of the prototype.

## 📝 Resolved decisions
| # | Decision | Rationale |
|---|---|---|
| Q1 | Only the B1 is supported and verified (the maintainer tests it on hardware). Model-specific parts live in one `PrinterModel` descriptor. Other prefixes (B21, B18, B3S, D11, D110) are not shipped. | `BACKWARD_COMPATIBILITY.md` requires hardware evidence per model. Adding a model later is additive. |
| Q2 | One package entry point exporting everything. | The codec has no runtime DOM dependency, so Node tests work without subpaths. Subpaths can be added later without breaking anything; removing them could not. |
| Q3 | The image helper takes an `ImageData`-shaped structural type: `{ width, height, data: Uint8ClampedArray }`. | A caller with a canvas does `ctx.getImageData(...)` in one line. It works with `OffscreenCanvas`, workers and Node tests, and the core package stays free of canvas types. |
| Q4 | `print()` takes `density` and `copies`. Label type stays fixed (gap labels). | Cheap, and the protocol carries both. |
| Q5 | Optional `onProgress` callback (added because it is nearly free). | The `0xA3` poll already returns page and percent; we just forward it. |
| Q6 | A second `print()` or `info()` while one is running rejects with `PrinterBusyError`. | The printer has one command stream: two interleaved calls would mix packets and corrupt a print. Failing fast is safer than a hidden queue; callers that print several labels `await` each call or use `copies`. |
| Q7 | ESM only, `tsc` emit with `.d.ts`. Publishing itself is out of scope. | Targets are browsers and bundlers, and CJS would add a second build for no known consumer. |

## 📝 Proposed Solution
Port the reference as four layers in `packages/core/src`, with the protocol logic pure and all I/O behind an interface. Alternatives rejected: keeping the class monolithic (untestable); a dependency on an existing NIIMBOT library (adds a runtime dependency and the protocol behavior stops being ours to verify on the B1).

## 📝 Architecture
All components are new; nothing consumes them yet. Future consumers: `labels-render` (rows source via `ImageData`), `labels-embed` and `apps/web` (call `Printer`).

```
ImageData ──imageToRows──▶ rows (Uint8Array[48]) ──▶ Printer.print ──▶ Transport ──▶ BLE
                                         protocol codec (pure) ◀── PacketParser ◀── notifications
```
Takeaway: only `WebBluetoothTransport` touches `navigator.bluetooth`; everything else is testable with a fake transport.

Files:
- `protocol/commands.ts`: command and reply codes, info keys.
- `protocol/packet.ts`: `encodePacket(cmd, data)`, `PacketParser` (stream buffer; resync on `55 55`; drops `0xD3`; verifies checksum and the `AA AA` tail).
- `protocol/image.ts`: `encodeRows(rows)` producing `0x85` bitmap and `0x84` empty-row packets with repeat count (max 255) and the three black-count bytes (three equal slices of the row, each capped at 255).
- `model.ts`: `PrinterModel` (`namePrefixes`, `headDots`, `densityRange`, `defaultDensity`, `rowGapMs`) and the exported `B1` descriptor.
- `transport.ts`: `Transport` interface.
- `web-bluetooth.ts`: `WebBluetoothTransport`.
- `printer.ts`: `Printer`.
- `image.ts`: `imageToRows`.
- `errors.ts`: typed errors.

## 📝 API Contracts
```ts
interface Transport {
  readonly connected: boolean;
  write(packet: Uint8Array): Promise<void>;        // one whole packet; the transport may chunk
  onData(cb: (bytes: Uint8Array) => void): () => void;
  onDisconnect(cb: () => void): () => void;
  close(): Promise<void>;
}

class WebBluetoothTransport implements Transport {
  static isSupported(): boolean;
  // The first await inside is navigator.bluetooth.requestDevice(): call it straight from a click handler.
  static request(model?: PrinterModel): Promise<WebBluetoothTransport>;
  // Optional: resolves null when getDevices() is unavailable, no device is remembered or it is not heard in time.
  static reconnect(model?: PrinterModel, opts?: { timeoutMs?: number }): Promise<WebBluetoothTransport | null>;
  readonly deviceName: string;
}

class Printer {
  constructor(transport: Transport, model?: PrinterModel);   // model defaults to B1
  static connect(model?: PrinterModel): Promise<Printer>;    // = WebBluetoothTransport.request + handshake
  info(): Promise<PrinterInfo>;                              // { battery?, serial?, firmware? }
  print(rows: readonly Uint8Array[], opts?: PrintOptions): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
}
interface PrintOptions { density?: number; copies?: number; onProgress?: (p: PrintProgress) => void; signal?: AbortSignal }

function imageToRows(image: ImageLike, model?: PrinterModel): Uint8Array[];
```
Validation: `density` must be an integer inside `model.densityRange` and `copies` an integer in 1..65535, otherwise `InvalidArgumentError`. Each row must be `headDots / 8` bytes long. At least one row, at most 65535.

`imageToRows`: centered crop for wider images, centered padding for narrower ones, gray `(299R + 587G + 114B) / 1000 < 128` and alpha `> 0` means black (bit 0x80 is the leftmost dot).

Supporting types:
```ts
interface PrinterInfo { battery?: number; serial?: string; firmware?: string }
interface PrintProgress { stage: "sending" | "printing"; percent: number }   // 0..100
interface ImageLike { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
```

Errors: all extend `LabelsCoreError` (`code: string`, optional `cause`; no human text is part of the contract). Class to code mapping:
`BluetoothUnsupportedError` `bluetooth-unsupported`, `ChooserCancelledError` `chooser-cancelled`, `DeviceUnreachableError` `device-unreachable` (also the phone-app-connected case; JSDoc tells callers to word it as "the printer may be connected to another device"), `DisconnectedError` `disconnected`, `NoResponseError` `no-response` (with `step`), `RefusedError` `refused` (with `step`), `PrintTimeoutError` `print-timeout`, `PrinterBusyError` `busy`, `AbortedError` `aborted`, `InvalidArgumentError` `invalid-argument`, `ProtocolError` `protocol`.

Compatibility: a new package, so no existing surface breaks. From the first release its exports are protected (`BACKWARD_COMPATIBILITY.md`, 0.x rules apply). The `Printer` print sequence is the "Printer protocol behavior" surface.

## 📝 Print sequence (port of the reference, B1)
`SetDensity 0x21` → `SetLabelType 0x23 [1]` → `PrintStart 0x01 [u16 pages=1, 0×5]` → `PageStart 0x03 [1]` → `SetPageSize 0x13 [u16 rows, u16 headDots, u16 copies]` → row packets (10 ms gap) → `PageEnd 0xE3` → poll `PrintStatus 0xA3` (up to 100 times, 300 ms apart, done at page 1 and 100/100) → `PrintEnd 0xF3`. Each acknowledged step: no reply within 2 s is `no-response`; reply data byte 0 is `refused`. Connection handshake sends `Connect 0xC1`.

Timing: each acknowledged step waits 2 s. The status poll budget is `30 s + 5 s × (copies − 1)` (300 ms apart), then `print-timeout`.

`signal` abort semantics (the printer's behavior after an abort is verified on hardware, see Hardware checks):
- Already aborted at call time: reject with `aborted` immediately, nothing is written.
- Before `PrintStart` is acknowledged or while rows are being sent: stop sending, best-effort `PrintEnd`, reject with `aborted`.
- After `PageEnd` (during polling): the page is already in the printer, so abort stops polling, sends a best-effort `PrintEnd` and rejects with `aborted`; the label may still print.
- If the best-effort `PrintEnd` fails or gets no reply, the error is swallowed and `aborted` is still thrown.

Busy lock: `print()` and `info()` hold it in a `try/finally`, so it is released on success, error, timeout, abort and disconnect.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| `0xD3` between rows, or right before the `PageEnd` reply | Skipped by the parser; `PageEnd` still resolves. Regression test. |
| Packet split across notifications, or two packets in one | Parser buffers and yields complete frames in order. |
| Noise before `55 55`; bad checksum or missing `AA AA` | Resync to the next `55 55`; a bad frame is dropped. If it was the awaited reply, the wait ends in `no-response` (never a hang). |
| No reply / reply with data[0] = 0 | `no-response` / `refused`, each with the step name. |
| Disconnect mid-print | Pending waits reject with `disconnected`; the `Printer` becomes unusable until reconnected. |
| Write fails (small MTU) | Only a failure of a whole-packet write is retried, as 20-byte chunks from byte 0 (a rejected GATT write sent nothing; this is the reference behavior and is confirmed on the B1). If the chunked write also fails: `disconnected` with `cause`. |
| Malformed frame (bad checksum, missing tail) while a reply is awaited | The frame is dropped and the wait ends as `protocol` (not `no-response`), so callers can tell a noisy link from a silent printer. Outside a wait it is dropped silently. |
| GATT connect or service discovery fails or hangs | 10 s connect timeout, then `device-unreachable`; a missing service or characteristic is `device-unreachable` with `cause`. The chooser itself has no timeout (it is user-driven). |
| Printer connected to the phone app | Not advertising, so it never shows in the chooser or `connect` fails: `device-unreachable`. |
| Chooser cancelled | `chooser-cancelled`, not a generic error. |
| No Web Bluetooth (iOS, Firefox, Brave without flag) | `bluetooth-unsupported`; `isSupported()` lets callers check first. |
| `getDevices()` missing | `reconnect` resolves `null`; the caller falls back to `request`. |
| Concurrent calls | `busy`. |
| Image of 0 height, a row of wrong length, more than 65535 rows | `invalid-argument`. |
| Row repeat run over 255 | Split into several packets. |

## 📝 Risks & Impact Review
- Hard to reverse: the exported API names (protected from the first release) and the error `code` strings that callers will translate. Review them carefully in the PR.
- Hardware risk: a protocol regression is only visible on a real printer. The maintainer verifies on the B1 and the PR states the result; this is not something an agent can do.
- Dependencies: none at runtime. Dev: vitest, typescript (already in the workspace).
- Privacy: the reference README contains a real printer serial and MACs. None of them enter code, fixtures or docs; fixtures are generated from synthetic rows.

## 📝 Research
From memory, not re-verified in this session: open-source NIIMBOT libraries (for example `niimbluelib`) cover many models and both BLE and serial transports. This spec skips that breadth on purpose: one model verified on hardware, BLE only, no runtime dependencies. What they get right and we adopt: a transport abstraction, a streaming parser, and model descriptors. Their complexity we skip: per-model quirks tables, firmware-version branching, serial transport.

## 📋 Phasing
One package, three PRs (one per phase), merged in order. Only the Phase 3 PR carries the hardware gate; Phases 1 and 2 are described as "reference-equivalent, not hardware-verified", and nothing in the README claims B1 support until Phase 3 merges.
1. Phase 1 (pure, no hardware): codec, image helper, errors, model descriptor. Shippable alone as a tested library of functions.
2. Phase 2: `Printer` over the `Transport` interface, with a fake transport. The print flow is fully tested without a printer.
3. Phase 3: `WebBluetoothTransport`, README, hardware check on the B1.

Fixture provenance: expected bytes are produced by running the prototype's `packet`, `imagePackets` and `canvasToRows` logic on synthetic inputs. Each fixtures file starts with a header naming the prototype file, its state at generation time (no commit exists, so the file's line count and date) and the exact inputs, so a reviewer can regenerate them. They prove equivalence with the prototype, which was verified on a B1; the end-to-end proof is Step 13.

## 📋 Implementation Plan
**Phase 1: protocol codec**
1. Create `packages/core` (`package.json` with the name `@spokospace/labels-core`, ESM, `exports`, scripts `build` and `typecheck`; `tsconfig.json` extending `tsconfig.base.json`; `src/index.ts`). `pnpm typecheck`, `lint`, `test`, `build` stay green with an empty export.
2. `commands.ts`, `errors.ts`, `model.ts` (B1). Test: error `code` values and the B1 descriptor values.
3. `encodePacket` with tests against fixture byte sequences. Fixtures come from running the reference `packet()` function in Node on synthetic inputs (script kept outside the repo; hex strings committed).
4. `PacketParser` with tests: split frames, concatenated frames, noise, bad checksum, `0xD3` skipping.
5. `encodeRows` with tests against reference output: empty rows, repeats, repeat over 255, black counts, and a row that is all `0xFF`.
6. `imageToRows` with tests: wider (cropped), narrower (centered), threshold at 127/128, transparent pixels, bit order.

**Phase 2: printer logic**
7. `Transport` interface and an in-repo `FakeTransport` (scripted replies, records written packets, can inject `0xD3`, delays, disconnects). Test helper, not exported from the package entry.
8. `Printer.info()` and the handshake, tested on the fake.
9. `Printer.print()`: full sequence test comparing written packets with the recorded reference sequence; the `0xD3`-before-`PageEnd` regression; refused and no-response per step; status polling and timeout; `onProgress`; `busy`; argument validation; abort.

**Phase 3: Web Bluetooth and docs**
10. `WebBluetoothTransport` with a hand-written fake `navigator.bluetooth` in tests: filters and `optionalServices` passed to `requestDevice`, `requestDevice` called synchronously within `request()` (asserted before the first microtask yield), connect timeout, notification wiring, 20-byte fallback, disconnect event, `reconnect` returning `null` without `getDevices`, and error mapping.
11. `Printer.connect()` and `WebBluetoothTransport.isSupported()`.
12. Package README: usage, the click-handler rule, the error code table, browser support notes, the experimental status of reconnect.
13. Hardware check (maintainer): print a test label on the B1 with each of `density` min, default and max, `copies` 2, abort mid-print; `info()` values; reconnect with and without the Chrome flag. Results go into the PR description.

## 📝 What changed during implementation
Found while building it or on the B1 hardware check (#4):
- **One print job per copy.** The B1 ignored the copy count in the `SetPageSize` packet (`copies: 2` printed one label). `print()` now sends one complete job (`PrintStart` to `PrintEnd`) per copy, with `copies = 1` in the page size, and the poll budget is applied to each job.
- **`copies` is 1..255**, not 1..65535: every copy is a separate job, so the count is kept to a practical size.
- **Calibration offset.** The B1 starts printing slightly before the label, so the first 4 rows (0.5 mm) landed on the gap. `PrinterModel` gained `dotsPerMm` and a default `offsetMm` (`{ x: 0, y: 0.5 }` for the B1), and `PrintOptions` gained `offsetMm: { x?, y? }` in millimetres (like the official app's Calibration screen; `y` 0..10 down, `x` within ±8). Rows are shifted by `shiftRows`; dots that leave the head are dropped.
- **Firmware format.** The reply is two bytes (major, minor), so firmware is reported as `"5.26"` (what the official app shows), with the raw integer in a new `PrinterInfo.firmwareRaw`.
- **No per-copy poll budget.** The `30 s + 5 s × (copies − 1)` budget was dropped: with one job per copy, each job gets the same 30 s budget.
- **Abort cancels the label.** On the B1, aborting while rows were sent and aborting during status polling both left nothing printed, and the next print worked; the spec had said the label may still print after `PageEnd`.
- **Bluetooth switched off.** Chrome reports it with the same `NotFoundError` as a cancelled chooser; only a "cancel" message maps to `chooser-cancelled`, anything else is `bluetooth-unsupported` with the browser's message as `cause` (#4, #21).
- **Density range 1..5 confirmed** (default 3), matching the official app's device catalogue; the effect is subtle.

## 🧪 Hardware checks (resolved)
The two open items of the approved design, answered by the hardware check on a B1 in #4:

- **The valid `density` range of the B1.** The prototype only used 3, and the descriptor shipped 1..5 as provisional. Confirmed: 1..5 with default 3; all three tested values printed, with a subtle effect.
- **The printer's behavior after an aborted print.** Aborting while rows were sent, and aborting during status polling, both printed nothing, and the next print worked without a reset (the best-effort `PrintEnd` is enough).

Paths still covered only by unit tests (phone-app connection, closing the chooser, `reconnect()` with the Chrome flag) are tracked in #16.
