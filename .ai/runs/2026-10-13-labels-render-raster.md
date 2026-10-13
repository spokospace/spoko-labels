# Execution plan: labels-render layout, raster, QR, fonts (Phase 2)

Source doc: .ai/specs/2026-10-13-labels-render-template-engine.md (Phase 2, Steps 7-14)

## Goal
`render(template, data, options)` turns a validated template and a row into a pure black/white `ImageData`-shaped image that `imageToRows()` prints, with fonts loaded through a `RenderEnvironment`, bundled Viga and HarmonyOS Sans, QR codes with whole-dot modules, and golden-image tests in Node.

## Scope
- Dependencies: `qrcode-generator` (runtime, MIT), `@napi-rs/canvas` (dev, MIT), both pinned exactly.
- `layout/units.ts`, `layout/text.ts`, `layout/qr.ts`; `fonts/registry.ts`, `fonts/bundled.ts` with the font files and licenses; `draw.ts`, `threshold.ts`, `render.ts`, `errors.ts`; `environment/browser.ts`.
- Node test environment helper, golden images with a manifest, the hostile-template time budget test.
- README (render usage, fonts, HarmonyOS Sans notice) and `BACKWARD_COMPATIBILITY.md` entries.

## Non-goals
- Demo page and hardware check (Phase 3). Rotation, barcodes, images.

## Risks
- Golden images can differ across platforms; the manifest-based policy from the spec applies.
- Text measurement differs slightly between Skia (tests) and browsers (demo).

## Implementation Plan
**Phase 2: layout, raster, QR, fonts**
1. Dependencies and the Node test environment.
2. Text layout.
3. QR layout.
4. Fonts: files, licenses, registry, bundled list.
5. Draw, threshold, render, errors.
6. Golden images.
7. Browser environment.
8. README and compatibility doc.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 2: layout, raster, QR, fonts

- [ ] 2.1 Dependencies and the Node test environment
- [ ] 2.2 Text layout
- [ ] 2.3 QR layout
- [ ] 2.4 Fonts: files, licenses, registry, bundled list
- [ ] 2.5 Draw, threshold, render, errors
- [ ] 2.6 Golden images
- [ ] 2.7 Browser environment
- [ ] 2.8 README and compatibility doc
