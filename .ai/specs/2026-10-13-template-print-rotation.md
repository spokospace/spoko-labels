# Template v1: print rotation (labels designed upright)

> Status: approved design (#35). The maintainer chose A1 (degrees, `printRotation`) and A2 (the turn happens in `render()`) on 2026-10-13; A3 to A6 stand as defaulted. Implemented; the render demo's upright template waits for the maintainer's hardware check.

## 📝 TLDR
A label can be designed upright, for example 30 × 50 mm, for a roll whose labels pass the head 50 mm across and 30 mm along the feed. The image then has to be turned a quarter before printing. Today template v1 cannot say so. `@spokospace/labels-niimbot` reports the turn outside the template (`ImportedTemplate.printRotation`, #32), and each host turns the image itself.

Proposed (future behavior):
- **Template field.** Template v1 gains an optional `printRotation: 0 | 90 | 180 | 270`, in degrees clockwise, default 0.
- **Render.** `render()` returns the image already turned, so `imageToRows()` keeps printing exactly what it gets.
- **Printable-area check.** `outside-printable-area` measures against whichever side of the label the head crosses.
- **Niimbot import.** `labels-niimbot` writes the field into imported templates.

## 📝 Problem Statement
- **The data is real.** In the maintainer's NIIMBOT database, 3 of 35 templates are 30 × 50 mm designs that the app prints turned 270° on 50 × 30 mm rolls. The hardware check of #32 confirmed the turn.
- **The turn is lost when stored.** It lives next to the template (`ImportedTemplate.printRotation`), not in it. A host that stores the v1 JSON, as the web app (#12) and the embed dialog (#11) will, loses it and prints the label sideways.
- **Every host repeats the same code.** Each host must turn the RGBA image itself; the import example page has its own `rotate()`.
- **Warnings are wrong for turned labels.** `outside-printable-area` compares element boxes with the label width. For a turned label the head crosses the label's height, so the warning is wrong either way: missing for content that will be cut, and present for content that prints.

## 📝 Resolved decisions
| # | Decision | Rationale |
|---|---|---|
| A1 | `printRotation`: degrees clockwise, 0/90/180/270 (chosen by the maintainer) | Covers 180 and 270 (NIIMBOT data uses 270); the name #32 already uses. |
| A2 | `render()` turns the image and echoes `RenderResult.printRotation` (chosen by the maintainer) | The rendered image stays exactly what is printed; `imageToRows` stays template-free. |
| A3–A6 | As in Resolved assumptions | Accepted defaults. |

## 📝 Proposed Solution
**Template format (additive, still version 1).**
- **Field:** `printRotation?: 0 | 90 | 180 | 270`, in degrees clockwise.
- **Meaning:** the design (`size`, element boxes, the preview) stays as drawn, and the printed image is the design turned by `printRotation`.
- **Validation:** any other value is an error (`out-of-range`, or `invalid-type` for a non-number or a number that is not whole, as for the other whole-number fields) at `/printRotation`, a template-level error, like an invalid `size`.
- **Normalized template:** it always carries `printRotation`, default 0.

**`render()`.**
- **Image:** `result.image` is the printed image, the design turned clockwise by `printRotation`. A 30 × 50 mm label with 270 renders 400 × 240 dots. The README's promise holds: "The image is exactly what is sent to the printer."
- **Echo:** `RenderResult.printRotation` (0 | 90 | 180 | 270) is new, so a preview that wants the design upright can turn the image back, for example with a CSS transform.
- **Printable area:** `printableWidth` is checked against the label side that the head crosses: `size.width` for 0 and 180, `size.height` for 90 and 270. The strip is centered on that side.
- **Paths:** warning paths still point into the template as written, because nothing in the template moves.

**`validateTemplate()`.**
- The same `outside-printable-area` rule as `render()`.

**`@spokospace/labels-niimbot`.**
- **Template field:** `importTemplates` writes `printRotation` into the emitted template when it is not 0. It is omitted at 0, like the other defaults, so templates that are not turned keep the same JSON.
- **Result field:** `ImportedTemplate.printRotation` stays, mirroring the template field, so hosts written against #32 keep working. It is marked `@deprecated` in favor of `template.printRotation`. Being a field, not a function, it gets no console warning; it is removed at 1.0.
- **Rotation mapping:** unchanged. NIIMBOT's `rotate` is degrees clockwise, a multiple of 90; anything else gives 0 and `unsupported-style` `rotate`.

**`@spokospace/labels-core`.**
- **No change:** `imageToRows(image)` prints what it gets. niimblue turns in its image encoder instead (`printDirection: "left"`). Doing it in render keeps core free of template concepts and lets hosts preview the exact printed image.

**Example pages.**
- **Import page:** the `labels-niimbot` page drops its own `rotate()` and the "Turn before printing" select falls back to template JSON editing, or is removed.
- **Render demo:** gains one made-up upright template.

Alternatives rejected:
- **niimblue's `printDirection: "top" | "left"`.** It cannot express the 180° turn, or a 270° turn as distinct from 90°, and NIIMBOT data uses 270.
- **Turning in `labels-core` (`imageToRows` option).** Every preview would show a different image from the one printed, and core would need template knowledge to pick the turn.
- **Template version 2.** The field is optional with a default that reproduces today's output, so it is additive (see Backward compatibility).

## 📝 Architecture
```
template { size 30×50, printRotation 270, elements }  ─render─▶  image 400×240 dots (turned)  ─imageToRows─▶ printer
                                                     └─▶ RenderResult.printRotation (270), for previews
```
Files:
- `packages/render/src/schema/types.ts`: the field, `PrintRotation`, normalized default.
- `packages/render/src/schema/validate.ts`: the field's validation, and the side used for `outside-printable-area`.
- `packages/render/src/layout/safe-area.ts`: `checkPlacement` takes the crossed side.
- `packages/render/src/render.ts`: turns the thresholded image; `RenderResult.printRotation`.
- `packages/niimbot/src/convert/import.ts`: emits the field.
- Example pages and READMEs.

## 📝 Data Model
```ts
type PrintRotation = 0 | 90 | 180 | 270;   // exported by labels-render; labels-niimbot re-exports its own alias today
interface Template {
  version: 1;
  name?: string;
  size: { width: number; height: number };
  shape?: Shape;
  safeMargin?: number;
  /** Degrees clockwise the printed image is turned from the design. Default 0. */
  printRotation?: PrintRotation;
  elements: Element[];
}
interface RenderResult {
  image: { width: number; height: number; data: Uint8ClampedArray };   // printed orientation
  printRotation: PrintRotation;                                         // new
  warnings: RenderWarning[];
}
```

## 📝 Backward compatibility
- **Template format:** additive. Templates without the field render exactly as today, so the golden images are unchanged. A template with the field, read by an older renderer, gets `unknown-property` at `/printRotation` and prints unturned. That is the behavior of every host today, and it is visible.
- **`RenderResult`:** one new field.
- **`checkPlacement`/`outside-printable-area`:** with `printRotation` 0 nothing changes.
- **Niimbot import output:** templates that are not turned keep identical JSON. Turned templates gain `printRotation`. That is a deliberate snapshot change with a changelog entry under the import-output rules. `ImportedTemplate.printRotation` is kept, deprecated.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| `printRotation` 90 or 270 on a 50 × 30 label | Valid. The image is 240 × 400 dots, and the 48 mm head crosses the 30 mm side, so nothing is out of the printable area. The B1 feeds 50 mm, which spans more than one 30 mm label. That is the host's choice of roll; no warning. |
| `printRotation` 180 | The image is turned upside down; the printable-area check uses the width. |
| `printRotation` "270", 45, -90, null | Error `invalid-type` or `out-of-range` at `/printRotation`, as for `safeMargin`: v1 does not read `null` as absent. |
| Turned label with `shape` rounded or circle | The shape is drawn in design orientation and turned with the image; the safe-area check is unchanged (design orientation). |
| Element boxes reported in warnings | Paths are unchanged, and positions stay in design coordinates. |

## 📝 Risks & Impact Review
- **Direction.** "Clockwise" was confirmed on hardware only for 270 with NIIMBOT data (#32). The render demo's made-up upright template is checked on a B1 in the implementation PR, for 90 and 270.
- **Hosts that already turn.** A host that turns using `ImportedTemplate.printRotation`, as the #32 example page does, would turn twice once render turns too. Only the in-repo page does this today; it is updated in the same PR. The deprecation note on `ImportedTemplate.printRotation` says so.

## 📋 Phasing
One PR, after this spec is approved: render (types, validation, placement, turn), niimbot (emit, deprecate), the example pages, READMEs, `BACKWARD_COMPATIBILITY.md`, a changelog note, and the hardware check of the render demo's upright template.

## 📋 Implementation Plan
1. **render types and validation.** Add the field, `PrintRotation` and the normalized default. Tests:
   - each valid value;
   - `invalid-type` and `out-of-range`;
   - `null` is `invalid-type`;
   - the normalized default is 0.
2. **Placement.** `checkPlacement` takes the crossed side. Tests: `outside-printable-area` for 0/90/180/270 on a 50 × 30 and a 30 × 50 label.
3. **render turns the image.** Tests:
   - dimensions per rotation;
   - a pixel-exact check of a made-up asymmetric label (a corner mark) for each rotation;
   - the golden images unchanged without the field;
   - `RenderResult.printRotation`.
4. **niimbot emits the field.** Tests:
   - a turned template carries `printRotation`;
   - a template that is not turned has no `printRotation`, and its snapshot is unchanged apart from deliberate entries;
   - `ImportedTemplate.printRotation` mirrors the field.
5. **Example pages.**
   - The import page drops `rotate()` and previews the design upright by turning the rendered image back.
   - The render demo gets one upright 30 × 50 template.
6. **Docs.**
   - READMEs: the render template format and `RenderResult`; niimbot's Print rotation section.
   - `BACKWARD_COMPATIBILITY.md`: the template field and the deprecation.

## 🧪 Hardware checks (maintainer)
- **Render demo:** the upright 30 × 50 template with `printRotation` 270 and with 90 prints on a 50 × 30 roll. Each one must have the expected orientation, so that a mark at the top of the design comes out on the side the README describes.
- **Import page:** one upright NIIMBOT template prints as in #32, with no manual turn.

## 📝 Resolved assumptions (autonomous defaults)
| # | Question | Default | Why |
|---|---|---|---|
| A1 | Field shape: degrees (`0/90/180/270`) or niimblue's `printDirection: "top" \| "left"`? | Degrees clockwise, `printRotation` | It covers 180 and 270 (NIIMBOT data uses 270), and it is the name #32 already uses. |
| A2 | Who turns the image: `render()` or `labels-core`? | `render()`; `RenderResult.printRotation` is echoed | `imageToRows` stays template-free, and the rendered image stays "exactly what is printed". |
| A3 | Template version: stay at 1 or bump? | Stay at 1 (additive optional field) | No existing template changes output. |
| A4 | `ImportedTemplate.printRotation`: remove or keep? | Keep as a mirror, `@deprecated`, remove at 1.0 | Hosts written against #32 keep working. |
| A5 | Is the field omitted at 0 in imported templates? | Yes, like other defaults | Templates that are not turned keep byte-identical JSON. |
| A6 | Does `outside-printable-area` follow the crossed side? | Yes | Otherwise turned labels get wrong warnings both ways. |
