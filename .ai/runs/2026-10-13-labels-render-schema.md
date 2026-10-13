# Execution plan: labels-render schema and validation (Phase 1)

Source doc: .ai/specs/2026-10-13-labels-render-template-engine.md (Phase 1, Steps 1-6; spec PR #23)

## Goal
Create `@spokospace/labels-render` with the template format v1 types, `validateTemplate()` with typed issues, the safe-area / printable-area geometry checks and content binding, all pure TypeScript with no canvas and no runtime dependencies.

## Scope
- `packages/render` scaffold mirroring `packages/core` (ESM, `exports`, `build`/`typecheck`, tsconfigs).
- `src/schema/types.ts`: v1 types, defaults, limits.
- `src/schema/validate.ts`: `validateTemplate(input, { printableWidth? })` → `{ template, issues }`.
- `src/layout/safe-area.ts`: `outside-label`, `outside-safe-area`, `outside-printable-area` for any rectangle.
- `src/binding.ts`: content resolution from `{ row, columns }`, the 2000-code-point text cap.
- Package README (format reference, issue code table, pre-release note).

## Non-goals
- Rendering, fonts, QR, canvas, `qrcode-generator`, `@napi-rs/canvas` (Phase 2).
- `BACKWARD_COMPATIBILITY.md` entries (Phase 2, per the spec).
- Demo page (Phase 3).

## Design decisions
- `binding.ts` is exported for Phase 2's renderer as an internal module; the public entry exports only the types, defaults, `validateTemplate`, the issue types, and (for hosts that want to preview data) `resolveContent`.
- Element ids in issue paths are JSON pointers into the input (`/elements/3/font/size`).
- An unknown element type is a warning (`unknown-element`) and the element is removed; an element with any error is removed and its issues keep severity `error`.

## Risks
- The issue code strings and format defaults become contracts later; review names carefully now.

## Implementation Plan
**Phase 1: schema and validation**
1. Scaffold `packages/render`.
2. Schema types, defaults and limits.
3. `validateTemplate()` with tests.
4. Safe-area and printable-area checks with tests.
5. Content binding with tests.
6. Package README.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: schema and validation

- [ ] 1.1 Scaffold packages/render
- [ ] 1.2 Schema types, defaults and limits
- [ ] 1.3 validateTemplate with tests
- [ ] 1.4 Safe-area and printable-area checks with tests
- [ ] 1.5 Content binding with tests
- [ ] 1.6 Package README
