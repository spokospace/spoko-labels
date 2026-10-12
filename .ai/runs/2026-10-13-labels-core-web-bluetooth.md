# Execution plan: labels-core Web Bluetooth transport (Phase 3)

Source doc: .ai/specs/2026-10-12-labels-core-protocol-and-ble.md (Phase 3, Steps 10-12; Step 13 is the maintainer's hardware check)

## Goal
Add `WebBluetoothTransport`, `Printer.connect()` and the package README on top of the merged codec and `Printer`, tested with a hand-written fake `navigator.bluetooth`.

## Scope
- `src/web-bluetooth.ts`: `WebBluetoothTransport` (`isSupported`, `request`, `reconnect`), minimal structural Web Bluetooth types (they are not part of `lib.dom`), error mapping.
- `Printer.connect(model?)`.
- Entry point exports and `packages/core/README.md`.
- Tests with a fake `navigator.bluetooth`.

## Non-goals
- The hardware check on a real B1 (spec Step 13). It is done by the maintainer and tracked as a checklist in the PR description, not in Progress. No hardware result is claimed anywhere.
- New protocol behavior; any model other than the B1; publishing.

## Design decisions
- `request()` is `async` but reaches `requestDevice()` before any `await`, so it works straight from a click handler.
- Web Bluetooth errors map as follows: `NotFoundError` from the chooser means cancelled; `NotAllowedError` / `SecurityError` mean Web Bluetooth is blocked for this page (no user gesture, insecure context, policy) and map to `bluetooth-unsupported` with the original error as `cause`; anything from GATT connect, service or characteristic discovery, or a 10 s connect timeout is `device-unreachable`.
- A write is retried only as a whole: first the whole packet, then 20-byte chunks from byte 0; a second failure is `disconnected`.
- `reconnect()` never throws: any failure resolves `null` (prototype behavior), documented as experimental.

## Risks
- The fake `navigator.bluetooth` encodes my reading of the Web Bluetooth API; only the Chrome run on a real printer proves it. All of that is in the PR's hardware checklist.

## Implementation Plan
**Phase 3: Web Bluetooth and docs**
1. `WebBluetoothTransport` and its tests.
2. `Printer.connect()` and entry point exports.
3. Package README.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 3: Web Bluetooth and docs

- [ ] 3.1 WebBluetoothTransport with fake navigator.bluetooth tests
- [ ] 3.2 Printer.connect and exports
- [ ] 3.3 Package README
