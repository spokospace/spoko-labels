# Execution plan: expose the roll's nominal label count in `RfidInfo`

Refs #7. Evidence: https://github.com/spokospace/spoko-labels/issues/7#issuecomment-6289566484

## Goal

`parseRfid` returns the roll's nominal label count (the number in the roll name, such as 95 in `T50*80-95white`), and the `labels-core` docs say what the RFID counters mean according to the hardware evidence.

## Evidence (NIIMBOT B1, firmware 5.26, genuine rolls, October 2026)

The `GET_RFID` reply trailer, after the length-prefixed barcode and serial: `u16 total | u16 used | u8 type | u16 nominal | 8 more bytes`.

| Roll | `total` | `used` | `type` | nominal |
|---|---|---|---|---|
| `T50*30-230WHITE` | 276 | 5 | 1 | 230 (`00 e6`) |
| `T50*80-95white` | 114 | 4, then 5 after one print | 1 | 95 (`00 5f`) |

`total` is 1.2 × the nominal count on both rolls, and `used` counts printed labels.

## Scope

- `packages/core/src/protocol/rfid.ts`: a new optional `RfidInfo.nominalLabels`, read when the reply holds it. A shorter reply still parses without it.
- `packages/core/test/rfid.test.ts`: tests with made-up bytes.
- `packages/core/README.md`: the RFID section and the API row.
- `packages/core/examples/hardware-check/main.js`: log the new field.
- `BACKWARD_COMPATIBILITY.md`: only if it lists `RfidInfo` fields (it lists the type name only, so no change is expected).

## Non-goals

- A roll catalogue (code → size) or roll-size detection (#7 follow-up).
- Decoding the 8 trailing bytes.
- Any change to `total`/`used` values or to what `parseRfid` accepts.

## Risks

- The layout comes from two rolls on one printer. The field is optional and documented as observed, so a roll without it still parses.

## Implementation Plan

### Phase 1: parser and tests

1.1 Read the nominal count in `parseRfid` and document the counters in `RfidInfo`.
1.2 Unit tests: a reply with the field (50x80 layout, made-up identifiers) and the old layout without it.

### Phase 2: docs and hardware-check page

2.1 Correct the core README's RFID section and API row.
2.2 Show the new field in the hardware-check page's `readRfid()` log line.

## Progress

PR: #52

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: parser and tests

- [x] 1.1 Read the nominal count in `parseRfid` and document the counters in `RfidInfo` — 1b7c5b7
- [x] 1.2 Unit tests for replies with and without the nominal count — 1b7c5b7

### Phase 2: docs and hardware-check page

- [x] 2.1 Correct the core README's RFID section and API row — ee00861
- [x] 2.2 Show the new field in the hardware-check page's log line — 2dda36b
