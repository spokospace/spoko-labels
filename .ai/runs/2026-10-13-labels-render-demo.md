# Execution plan: labels-render demo page (Phase 3)

Source doc: .ai/specs/2026-10-13-labels-render-template-engine.md (Phase 3, Steps 15-18)

## Goal
A dependency-free demo page in `packages/render/examples/demo/` that renders made-up 50x30 templates with editable data, shows an exact-dot preview with the label shape, the safe area and the print head width, lists warnings, and prints through `@spokospace/labels-core`; plus a manual hardware check on the B1 by the maintainer.

## Scope
- `examples/serve.mjs` (static server rooted at the package) and an `example` script; `@spokospace/labels-core` as a workspace dev dependency; an import map for the render, core and `qrcode-generator` builds.
- `examples/demo/templates.js`: six or more made-up templates with made-up rows; a test that each validates and renders without unexpected warnings.
- `examples/demo/index.html` and `main.js`: template picker, editable template JSON, row form, preview with overlays and zoom, warnings, connect and print (density, copies), HarmonyOS Sans notice.
- README section for the demo.

## Non-goals
- The web app (#12): no xlsx, no API data, no i18n dictionary (the demo, like the core hardware-check page, is an English developer example).
- Abort, calibration inputs and raw packet logging (covered by the core hardware-check page).

## Risks
- Browser text measurement differs from the Node goldens; the preview is what prints, so the check compares preview and paper, not goldens.

## Implementation Plan
**Phase 3: demo page**
1. Server, example script and import map.
2. Made-up templates with a validation and render test.
3. Demo page: editor, row form, preview with overlays, warnings.
4. Printing through labels-core and the HarmonyOS Sans notice.
5. README section and hardware-check steps.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 3: demo page

- [ ] 3.1 Server, example script and import map
- [ ] 3.2 Made-up templates with a validation and render test
- [ ] 3.3 Demo page: editor, row form, preview with overlays, warnings
- [ ] 3.4 Printing through labels-core and the HarmonyOS Sans notice
- [ ] 3.5 README section and hardware-check steps
