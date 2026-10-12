# Execution plan: labels-core Printer over a Transport (Phase 2)

Source doc: .ai/specs/2026-10-12-labels-core-protocol-and-ble.md (Phase 2, Steps 7-9)

## Goal
Add the `Transport` interface and a `Printer` class (`info()`, `print()`) on top of the merged Phase 1 codec, fully tested without hardware through an in-repo fake transport.

## Scope
- `src/transport.ts`: `Transport` interface.
- `src/printer.ts`: `Printer` with a lazy CONNECT handshake, `info()`, `print()`, busy lock, abort, timeouts, progress.
- `test/fake-transport.ts`: scripted fake (not exported from the package entry).
- Extend the prototype-vector generator with the full print sequence and regenerate fixtures.
- Export `Transport`, `Printer` and their option/result types from the entry point.

## Non-goals
- `WebBluetoothTransport`, `Printer.connect()`, package README, any claim of B1 support or hardware evidence (Phase 3).
- Sending `PrintEnd` after failures other than an abort (the prototype does not; revisit with hardware).

## Design decisions
- A reply is the next non-`0xD3` packet after a request, as in the prototype; reply codes are not cross-checked because only some are known.
- The handshake (`CONNECT`) runs once per `Printer`, lazily, inside the first locked operation; a missing reply does not fail it (prototype behavior).
- Time uses `setTimeout` and `Date.now()`, so tests use fake timers.
- `onProgress`: `sending` percent is the share of row packets written; `printing` percent is `min(data[2], data[3])` of the `0xA3` reply.

## Risks
- Unverified on hardware: the meaning of `0xA3` data bytes beyond the prototype's done condition (`[0, 1, 100, 100]`), the done condition when `copies > 1`, the `firmware` value encoding (returned as the raw decimal string), and printer behavior after an abort. All are listed in the spec's hardware checks and in the PR.

## Implementation Plan
**Phase 2: printer logic**
1. `Transport` interface and `FakeTransport` test helper.
2. `Printer.info()` and the handshake.
3. `Printer.print()`: sequence, validation, timeouts, polling, progress, busy lock, abort; full test suite.

## Progress

PR: #3

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 2: printer logic

- [x] 2.1 Transport interface and fake transport — 55d920b
- [x] 2.2 Printer info and handshake — 55d920b
- [x] 2.3 Printer print flow — 55d920b
