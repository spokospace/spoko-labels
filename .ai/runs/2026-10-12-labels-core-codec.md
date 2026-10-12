# Execution plan: labels-core protocol codec (Phase 1)

Source doc: .ai/specs/2026-10-12-labels-core-protocol-and-ble.md (design PR #1, branch `feature/labels-core-spec`; not on main yet)

## Goal
Create `packages/core` (`@spokospace/labels-core`) with the pure, hardware-free protocol layer: command constants, typed errors, the B1 model descriptor, packet encoder, streaming packet parser, row encoder and the ImageData-to-rows helper.

## Scope
- Phase 1 of the spec only (Steps 1-6).
- Expected bytes in tests come from the prototype's `packet` / `imagePackets` / `canvasToRows` logic run on synthetic inputs (prototype: `D:\Projects\niimbot-b1-bt\web\js\niimbot.js`). They prove equivalence with the prototype, not hardware behavior.

## Non-goals
- `Transport`, `Printer`, `WebBluetoothTransport` (Phases 2 and 3), README support claims for the B1, publishing.
- Any printer serial, MAC or private data in code or fixtures.

## Risks
- Fixture hex is derived from the prototype, so a prototype bug would be copied. Mitigation: end-to-end hardware check in the Phase 3 PR.
- `densityRange` 1..5 is provisional (marked in JSDoc) until the hardware check.

## Implementation Plan
**Phase 1: protocol codec**
1. Package scaffold, green gate with a smoke test.
2. `commands.ts`, `errors.ts`, `model.ts` with tests.
3. `encodePacket` with fixture tests.
4. `PacketParser` with split/concatenated/noise/bad checksum/`0xD3` tests.
5. `encodeRows` with fixture tests (empty rows, repeats, repeat over 255, black counts).
6. `imageToRows` with tests (crop, pad, threshold, alpha, bit order).

## Progress

PR: #2

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: protocol codec

- [x] 1.1 Package scaffold and smoke test — 55d73a1
- [x] 1.2 Commands, errors and B1 model descriptor — 55d73a1
- [x] 1.3 Packet encoder — 55d73a1
- [x] 1.4 Streaming packet parser — 55d73a1
- [x] 1.5 Row encoder — 55d73a1
- [x] 1.6 Image to rows helper — 55d73a1
