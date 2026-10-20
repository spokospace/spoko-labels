# Execution plan: roll size detection, Phase 1 (offline matcher and dialog warning)

Source doc: .ai/specs/2026-10-20-roll-size-detection.md

Refs #7.

## Goal

Before printing, the embed print dialog reads the loaded roll and warns when its nominal label count rules out the template's printed size.

## Scope

- `packages/core/src/roll.ts`: `RollSize`, the nominal-count table, `rollCandidates`, `matchRoll`, exported.
- `packages/embed/src/session.ts`: `PrinterLike.readRfid()`, `PrinterSession.readRoll()` through the queue.
- `packages/embed/src/dialog.ts` + `i18n.ts`: read the roll on open and after Connect; a `role="status"` paragraph with the mismatch warning (PL + EN).
- Docs: core README, embed README, `BACKWARD_COMPATIBILITY.md`.

## Non-goals

- The NIIMBOT cloud lookup, `PrintRequest.rollLookup`, and the web app toggle (Phases 2–3, deferred by the maintainer).
- Blocking the print on a mismatch.
- Polling the roll while the dialog is open.

## Risks

- One extra `GET_RFID` command when the dialog opens. It runs through the session queue, so it cannot collide with a batch. A failure is silent.
- The table is a heuristic built from roll names, so the warning stays non-blocking.

## Implementation Plan

### Phase 1: matcher, session and dialog

1.1 `roll.ts` in labels-core with unit tests.
1.2 `readRoll()` in the embed session with tests.
1.3 The dialog verdict paragraph with PL + EN strings and tests.
1.4 Docs.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: matcher, session and dialog

- [ ] 1.1 roll.ts in labels-core with unit tests
- [ ] 1.2 readRoll() in the embed session with tests
- [ ] 1.3 Dialog verdict paragraph with PL + EN strings and tests
- [ ] 1.4 Docs
