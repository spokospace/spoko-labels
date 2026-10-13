# @spokospace/labels-render: label template engine

> Status: approved design (Q1 to Q10 answered "a" by the maintainer on #9), not implemented yet.

## 📝 TLDR
`@spokospace/labels-core` prints rows of 1-bit pixels, but nothing turns data into a label image. The only working renderer is a prototype that mixes a hard-coded product label, a Niimbot-shaped template format with its quirks and browser-only canvas code. Proposed (future behavior): `packages/render` defines a versioned, millimetre-based template format (text, QR code, line; content bound to data columns by name), a validator with typed issues, and a synchronous renderer that turns `{ template, row }` into a pure black/white `ImageData`-shaped image that `imageToRows()` prints as is. The Niimbot import (#10), the embed dialog (#11) and the web app (#12) build on it.

## 📝 Problem Statement
- The prototype's renderer runs only in a browser, so its output cannot be pinned by tests, and its line metrics are copied from another toolchain (Pillow/FreeType).
- Its template format is Niimbot's data as stored by the desktop app: misspelled keys (`textAlignHorizonral`), positional bindings (`C0`), a letter spacing that renders 1.65× wider than the stored value. It is not versioned, so it cannot evolve under `BACKWARD_COMPATIBILITY.md`.
- Hosts (the embed dialog, third-party apps) need to render a label from `{ template, row }` without knowing any of this.
- The only redistributable font the prototype uses (Viga, OFL) has **no Polish letters** (checked: no glyphs for ą ć ę ł ń ś ź ż); the prototype falls back to HarmonyOS Sans, which may not be redistributed.

## 📝 Resolved decisions
| # | Decision | Rationale |
|---|---|---|
| Q1 | The renderer draws through a `RenderEnvironment` (canvas factory + font loader). `browserEnvironment()` uses `OffscreenCanvas` or `<canvas>`; golden-image tests run in Node on a pinned dev-only `@napi-rs/canvas`. | `pnpm test` works locally without a browser. |
| Q2 | Our own versioned schema (`version: 1`, geometry in mm, true letter spacing in mm). `labels-niimbot` converts Niimbot data. | The template format is a protected surface; another vendor's quirks are not frozen into it. |
| Q3 | Content binds to a column by name (`bind`), with an optional positional fallback (`bindIndex`) for the importer. Static text is `text`. | Names survive reordered columns; the importer only knows positions. |
| Q4 | Fonts are registered through `FontSource` descriptors with explicit ascent/descent per em; the package ships Viga with its OFL license; hosts add their own. **Added while finishing the spec:** a second bundled OFL family with Polish coverage (see Fonts), because Viga cannot render Polish text. | Explicit metrics keep line placement identical across browsers and Node. |
| Q5 | `qrcode-generator` (MIT) is the only runtime dependency, pinned to `2.0.4` (ESM build, out since 2025-08). | A correct QR encoder is not worth rewriting. |
| Q6 | 0.x elements: text (wrap, shrink-to-fit, alignment, letter spacing, reversed), QR (error-correction level, whole-dot modules), line. Unknown or unsupported elements are skipped with a warning, never an exception. | Smallest scope that renders every non-rotated prototype template. |
| Q7 | `render()` returns `{ image, warnings }`; `image` is `{ width, height, data: Uint8ClampedArray }` (RGBA, only black and white). No runtime dependency on `labels-core`. | Feeds `imageToRows()` directly; the render package stays printer-agnostic. |
| Q8 | The prototype's built-in product label is not ported. Made-up example templates replace it. | It is wired to a private data set. |
| Q9 | One package, one entry point. | A validator-only subpath can be added later without breaking anything. |
| Q10 | Optional `shape` (`rectangle`, `rounded` with radius, `circle`) for the preview and a safe-area warning; the printed image is always the full rectangle. | Metadata and a warning only; the printer does not know the shape. |

## 📝 Proposed Solution
Port the prototype's Niimbot-template renderer (`web/js/render.js`, `renderTemplate`, 259 lines, read on 2026-10-13) into strict TypeScript with the layout math separated from the canvas, behind a format of our own. Behavior carried over, pinned by golden images: wrapping on spaces and `\n`, shrink-to-fit by stepping the font size down one dot at a time, vertical and horizontal alignment, letter spacing through prefix widths (keeps kerning), reversed text on a filled box, QR centered in its box with whole-dot modules, a line as a filled rectangle, thresholding at gray `< 128`.

Alternatives rejected: rendering SVG and rasterizing it (needs a rasterizer with the same font engine anyway, and text measurement for wrapping still needs a canvas); a full layout engine such as a flexbox port (labels are absolutely positioned boxes, so it adds weight for nothing); a plugin system for element types (pdfme-style; three element types do not need one, and the template format would have to version plugins).

## 📝 Architecture
All components are new. Consumers: the Phase 3 demo now; `labels-niimbot` (#10, produces templates), `labels-embed` (#11) and `apps/web` (#12) later.

```
template JSON ─validateTemplate─▶ Template ─┐
row + columns ─────────────────────────────┼─▶ layout (pure, needs a measure fn) ─▶ draw ops ─▶ canvas (RenderEnvironment) ─▶ threshold ─▶ { image, warnings }
FontSource[] ─loadFonts(env)─▶ FontRegistry ┘                                                                                            │
                                                                                     labels-core: imageToRows(image) ─▶ Printer.print ◀──┘ (caller)
```
Takeaway: only `environment/` touches a canvas or `FontFace`. Layout is pure given a text-measuring function, so most behavior is unit-tested with a fake fixed-width measurer; golden images then pin the real canvas output.

Files in `packages/render/src`:
- `schema/types.ts`: the template types (v1).
- `schema/validate.ts`: `validateTemplate()`, issue codes.
- `binding.ts`: resolves an element's content from `{ row, columns }`.
- `fonts/registry.ts`: `FontSource`, `FontRegistry`, `loadFonts()`, family selection by glyph coverage.
- `fonts/bundled.ts`: `bundledFonts` (Viga + the Polish-capable family), with their metrics and Unicode ranges; font files and license files in `packages/render/fonts/`.
- `layout/units.ts`: mm to dots, box rounding.
- `layout/text.ts`: wrapping, shrink-to-fit, alignment, line placement.
- `layout/qr.ts`: QR matrix (through `qrcode-generator`) to module size and position.
- `layout/safe-area.ts`: shape and safe-area checks.
- `draw.ts`: executes layout results on a 2D context.
- `threshold.ts`: RGBA to pure black/white.
- `environment/browser.ts`: `browserEnvironment()`.
- `render.ts`: `render()`.
- `errors.ts`: `TemplateError`.

## 📝 Data Model: template format v1
Units: all geometry in millimetres (numbers, decimals allowed). The origin is the top-left corner of the label; `y` grows down. Rendering uses 8 dots per mm: an edge at `v` mm lands on dot `round(v × 8)`, and a box's size in dots is `round((x + width) × 8) − round(x × 8)` so adjacent boxes never leave a gap.

```ts
interface Template {
  version: 1;
  name?: string;                      // display only
  size: { width: number; height: number };   // the label, mm; 0 < value <= 300
  shape?:                             // default { kind: "rectangle" }
    | { kind: "rectangle" }
    | { kind: "rounded"; radius: number }    // mm, 0 < radius <= min(width, height) / 2
    | { kind: "circle" };                    // an ellipse inscribed in size
  safeMargin?: number;                // mm, default 0; an extra inset the designer wants kept clear (0 <= value <= 10)
  elements: Element[];                // at most 200; painted in array order (later on top)
}

type Element = TextElement | QrElement | LineElement;

interface BoxBase {
  id?: string;                        // free-form, for editors; not rendered
  x: number; y: number; width: number; height: number;  // mm; width, height > 0
}

type Content =
  | { text: string }                  // static
  | { bind: string; bindIndex?: number }   // column by name; bindIndex is used only when the name is absent
  | { bindIndex: number };            // column by position (0-based integer), as emitted by the Niimbot importer

interface TextElement extends BoxBase {
  type: "text";
  content: Content;
  font: { family: string; size: number; bold?: boolean; fallback?: string[] };  // size: em size in mm, 0 < size <= 50; fallback: at most 8 names
  letterSpacing?: number;             // mm added between characters, -5..5; default 0
  lineSpacing?: number;               // mm added between lines, -5..10; default 0
  align?: "left" | "center" | "right";            // default "left"
  verticalAlign?: "top" | "middle" | "bottom";    // default "top"
  wrap?: boolean;                     // default false: one line per "\n"-separated paragraph
  fit?: "shrink" | "none";            // default "shrink"
  minSize?: number;                   // mm, the smallest size shrink may reach, 0 < minSize <= 50; default 0.75 (6 dots); above font.size it is treated as font.size
  reverse?: boolean;                  // fill the box black and draw the text white; default false
}

interface QrElement extends BoxBase {
  type: "qr";
  content: Content;
  level?: "L" | "M" | "Q" | "H";      // error correction; default "L" (the prototype's default, largest modules)
}

interface LineElement extends BoxBase {
  type: "line";                       // a filled rectangle: a horizontal line is a wide, thin box
}
```

Rules:
- Unknown top-level or element properties are ignored with a `unknown-property` warning (forward compatibility; a newer editor may add fields).
- **Binding.** A name resolves only through an own property of `row` (`Object.hasOwn(row, name)`), so `bind: "constructor"` or `"__proto__"` never reaches the prototype. A position resolves as `columns[bindIndex]` and then by name in the same way; without `columns`, or with an index past its end, it is unresolved. `bind` is tried first, `bindIndex` second; unresolved content is `""` with `missing-column`. A resolved cell is converted with `String()`; `null`/`undefined` become `""`.
- **Length cap, text only.** A text value longer than 2000 code points is cut to 2000 with a `value-truncated` warning (protects the renderer from runaway host data; reported, so not silent). QR content is never cut: a value the encoder cannot hold is `qr-too-long` and nothing is drawn, so a QR never scans to a different value.
- **Numbers are never coerced.** `"12"` where a number is expected is `invalid-type`.
- `version` is required and must be `1`. A future `version: 2` ships with a `migrateTemplate()` from v1 (`BACKWARD_COMPATIBILITY.md`); v1 templates keep rendering.
- The **safe area** is the shape (rounded corners and circles included) inset by `safeMargin`. It is a property of the label, not of a printer.
- The **printable area** is a property of the printer and is not in the template: callers pass `printableWidth` (mm) in the options of `validateTemplate()` and `render()`, for the B1 `headDots / dotsPerMm` = 48. A template is label-sized, not head-sized: a 50x30 template renders a 400x240 image, and `imageToRows()` center-crops it to the 384-dot head, so with `printableWidth: 48` anything outside the centered 48 mm strip gets `outside-printable-area`. Without the option that check is skipped.

## 📝 API Contracts
```ts
// Validation (pure, no canvas)
function validateTemplate(input: unknown, options?: { printableWidth?: number }): ValidationResult;
interface ValidationResult {
  template: Template | null;          // null only on a template-level error; otherwise defaults applied, unknown properties and invalid elements removed
  issues: TemplateIssue[];
}
interface TemplateIssue {
  severity: "error" | "warning";
  code: IssueCode;
  path: string;                       // JSON pointer, e.g. "/elements/3/font/size"
}

// Fonts
interface FontSource {
  family: string;                     // the name templates use
  bold?: boolean;                     // default false
  data: ArrayBuffer | URL;            // loaded by the environment, never by render()
  ascent: number;                     // per em (hhea ascender / unitsPerEm)
  descent: number;                    // per em, positive
  unicodeRanges: readonly (readonly [number, number])[];  // code points the font covers
}
const bundledFonts: readonly FontSource[];
function loadFonts(environment: RenderEnvironment, sources: readonly FontSource[]): Promise<FontRegistry>;
interface FontRegistry { readonly families: readonly string[] }   // opaque otherwise

// Environment
interface RenderEnvironment {
  createCanvas(width: number, height: number): CanvasLike;
  loadFont(source: FontSource, internalName: string): Promise<void>;
}
interface CanvasLike { width: number; height: number; getContext(type: "2d"): Context2DLike | null }
// Context2DLike: the subset used (fillStyle, fillRect, font, textBaseline, fillText, measureText, getImageData).
function browserEnvironment(): RenderEnvironment;

// Rendering (synchronous once fonts are loaded)
function render(template: unknown, data: RenderData, options: RenderOptions): RenderResult;
interface RenderData { row?: Readonly<Record<string, unknown>>; columns?: readonly string[] }
interface RenderOptions { environment: RenderEnvironment; fonts: FontRegistry; printableWidth?: number }
interface RenderResult {
  image: { width: number; height: number; data: Uint8ClampedArray };   // RGBA, every pixel 0,0,0,255 or 255,255,255,255
  warnings: RenderWarning[];
}
interface RenderWarning { code: IssueCode; path: string }   // every validation issue of a renderable template is included with its own code (element errors as warnings)

class TemplateError extends Error { readonly issues: TemplateIssue[] }   // thrown by render() on a template-level error
```

`render()` validates first. A template-level error (`version`, `size`, `shape`, `elements` not an array, more than 200 elements) throws `TemplateError`. An element with an error is removed by the validator (its issue keeps severity `error` in `validateTemplate()`), so the rest of the label renders, and `render()` reports that same issue, with its own code and path, as a warning.

Fonts are registered with the environment under internal names (`spoko-labels-<n>`), and `ctx.font` is only ever built from those names and an integer pixel size (`<px>px "spoko-labels-<n>"`). A family name from a template is only a lookup key into the registry, never part of a CSS string, so a template cannot inject a font shorthand or reach the host page's or the system's fonts.

Issue codes (stable strings, translated by callers; no UI text in the package):

| Code | Severity | Raised by | When |
|---|---|---|---|
| `invalid-type` | error | validate | a value has the wrong JSON type |
| `required` | error | validate | a required field is missing |
| `out-of-range` | error | validate | a number outside its range (size, radius, element count, `bindIndex` < 0) |
| `unsupported-version` | error | validate | `version` is not `1` |
| `unknown-element` | warning | validate | an element `type` other than text, qr, line; skipped |
| `unknown-property` | warning | validate | a property the schema does not know; ignored |
| `outside-label` | warning | validate | an element box reaches past the label size |
| `outside-safe-area` | warning | validate, render | an element box (validate) or what was actually drawn (render: text lines, QR symbol, filled boxes) leaves the safe area |
| `outside-printable-area` | warning | validate, render | the same, against the centered `printableWidth` strip, when the option is given |
| `missing-column` | warning | render | `bind` names no column and there is no usable `bindIndex`; the value is `""` |
| `value-truncated` | warning | render | a value over 2000 characters was cut |
| `missing-font` | warning | render | `font.family` (path `/font/family`), a `fallback` name, or the bold face (path `/font/bold`) is not registered |
| `missing-glyphs` | warning | render | no candidate family covers every character of the text |
| `text-overflow` | warning | render | the text does not fit its box even at `minSize` (or with `fit: "none"`); drawn anyway, clipped only by the label edge |
| `qr-empty` | warning | render | the QR content is empty; nothing drawn |
| `qr-too-long` | warning | render | the content does not fit a QR symbol at this level; nothing drawn |
| `qr-too-small` | warning | render | the box is smaller than one dot per module; drawn at one dot per module, centered, overflowing the box |

## 📝 Rendering rules
- **Canvas**: `round(width × 8)` × `round(height × 8)` dots, filled white; elements drawn in order; then every pixel becomes black when `(299R + 587G + 114B) / 1000 < 128`, else white, alpha 255.
- **Font size**: `px = max(round(size × 8), 1)`; line height `ceil(ascent × px) + ceil(descent × px)`; baseline of the first line at `top + ceil(ascent × px)`.
- **Family choice** (per element, for the whole text so all lines share metrics). Candidates, in order and without duplicates: `font.family`, each name in `font.fallback`, then every registered family in registration order; names that are not registered are left out (and warned as `missing-font`). The chosen family is the first candidate whose `unicodeRanges` cover every non-whitespace code point. When none covers the text, the first candidate is used and `missing-glyphs` is warned. `loadFonts()` rejects an empty list, so there is always a candidate.
- **Bold**: the bold face of the chosen family when registered; otherwise its regular face and `missing-font` at `/font/bold`. No synthetic bold. (Viga ships without a bold face, so `bold: true` with Viga warns; Barlow Semi Condensed has one.)
- **Width of a line**: `measureText(line).width + letterSpacing × 8 × (codePoints − 1)`. With `letterSpacing` 0 the line is drawn with one `fillText`; otherwise one code point at a time at `x + measureText(prefix).width + letterSpacing × 8 × i` (prefix widths keep kerning).
- **Wrap**: paragraphs split on `\n`; break opportunities are single spaces. A word goes onto the current line if the line's width stays ≤ the box width (no tolerance here); the space at a break is dropped, other spaces (leading, trailing, repeated) are kept. A single word wider than the box stays on its own line (shrink, or `text-overflow`).
- **Shrink** (`fit: "shrink"`): the largest integer pixel size between `minSize` and `font.size` at which the block fits, rewrapping at each tried size: block height ≤ box height + 1 dot and the widest line ≤ box width + 1 dot (the prototype's tolerance). Found by binary search, so at most about 9 layouts per element (the prototype stepped down one dot at a time; the result is the same whenever fitting is monotone in size, and golden images pin it). Nothing fits: `minSize` and `text-overflow`.
- **Cost bound**: at most 200 elements × 2000 code points × about 9 layouts, with per-character measuring only when `letterSpacing` ≠ 0.
- **Alignment**: vertical top / middle (`(h − block) / 2`) / bottom; horizontal left / center / right per line.
- **Reverse**: the box is filled black, the text is drawn white.
- **QR**: content (never truncated) encoded as UTF-8 bytes, smallest version that fits; module size `max(floor(min(w, h) / modules), 1)` dots; the symbol is centered in the box with positions rounded to whole dots. No quiet zone is added (the box is the designer's responsibility; the made-up templates keep a margin).
- **Line**: fills its box; a box thinner than one dot still paints one dot.

## 📝 Fonts
Bundled family names (`"Viga"`, `"Barlow Semi Condensed"`) become part of templates, so this spec fixes them.
- `Viga-Regular.ttf` (OFL 1.1) ships in `packages/render/fonts/` with `OFL.txt` next to it. Metrics from its `hhea` table: ascent 1.015, descent 0.329 per em (the same values the prototype measured). Coverage: Basic Latin and Latin-1.
- **One Latin Extended family (regular and bold, OFL 1.1, no Reserved Font Name restrictions) for Polish and other Central European text.** Chosen: **Barlow Semi Condensed** (family name `"Barlow Semi Condensed"`; the Medium file is registered as its regular face, Bold as bold), Medium and Bold (version 1.408, from `google/fonts`, `ofl/barlowsemicondensed`, about 110 kB each): condensed letters fit more text on a 50x30 label. Checked with `fontTools` while writing this spec: every Polish letter (ą ć ę ł ń ó ś ź ż and capitals) has a glyph in both files; `hhea` metrics are ascent 1.0 and descent 0.2 per em; the copyright line ("Copyright 2017 The Barlow Project Authors") names no Reserved Font Name. Phase 2 commits the two files with `OFL.txt` and records the source URL and version in `packages/render/fonts/README.md`.
- `bundledFonts` lists both with `data` as `new URL("../fonts/<file>", import.meta.url)`, so bundlers copy them and nothing is fetched until `loadFonts()` is called.
- HarmonyOS Sans and any other font without a verified redistributable license stays out.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| Missing column, `null`, `undefined` | `""`; `missing-column` only when the content is unresolved (see Binding), not for a present cell that is `null`. |
| `bind: "constructor"`, `"__proto__"` | Unresolved unless `row` has that own key; prototype properties are never read. |
| Hostile sizes (`font.size: 1e6`, huge spacing, long fallback lists) | `out-of-range`; the element is removed, nothing slow runs. |
| Value of only spaces | Rendered as is (blank); not a warning. |
| Very long unbreakable word | Shrinks to `minSize`; then `text-overflow`, drawn and clipped by the label edge only. |
| Polish text with a Latin-1-only family | Falls back to the first registered family that covers it (the bundled Latin Extended family); no warning, because the fallback is designed behavior. |
| Emoji or CJK with no covering family | `missing-glyphs`; drawn with `font.family` (the canvas shows whatever it shows; the warning lets the UI tell the user). |
| Font not loaded | `render()` takes a `FontRegistry`, which only exists after `loadFonts()` resolved, so a not-yet-loaded font cannot be passed. A family missing from the registry is `missing-font`. |
| `loadFonts()` fails (bad URL, corrupt file) | Rejects with the environment's error as `cause`; nothing is half-registered. |
| QR content too long | `qr-too-long`, nothing drawn. |
| QR box smaller than the symbol | `qr-too-small`, one dot per module, centered. |
| Template larger than the print head | Allowed; with `printableWidth`, `outside-printable-area` warns for boxes and for drawn content (overflowing text, an oversized QR) in the strip the head cannot print. |
| Zero or negative sizes, `NaN`, strings for numbers | `out-of-range` / `invalid-type`; template-level → `TemplateError`, element-level → element skipped. |
| Overlapping elements | Allowed; later elements paint over earlier ones. |
| More than 200 elements | `TemplateError` (`out-of-range`). |
| Template JSON from an untrusted source | Only data is read: no expressions, no URLs, no fonts named by the template are fetched. Unknown properties are ignored. |
| Prototype's special "QR Code" column override | Not ported: the importer (#10) binds the QR element to that column explicitly. |

## 📝 Risks & Impact Review
- **Hard to reverse:** the template format v1 (field names, units, defaults such as `fit: "shrink"`, `safeMargin: 0`, `level: "L"`, the bundled family names) and the issue `code` strings become protected surfaces on the first release (`BACKWARD_COMPATIBILITY.md`). They are added to that file in Phase 2, once golden images exist for the defaults; nothing is published to npm before that (#18).
- **Golden images and platforms:** text rasterization can differ between Skia builds and operating systems, even after thresholding. Policy: `test/golden/manifest.json` records the platform and `@napi-rs/canvas` version each golden was generated with. On the same platform every golden must match exactly. On another platform, goldens without text (lines, QR) must still match exactly, and text goldens may differ in at most 0.2% of their pixels; the test prints the count. Layout decisions (line breaks, chosen size, positions) are asserted separately as numbers, so they are exact everywhere.
- **Browser vs Node:** the demo renders with the browser's canvas, the tests with Skia in Node; a label can differ by a few dots between them. Layout decisions (wrap points, shrink size) come from `measureText`, so a width difference at a wrap boundary can change a line break. Accepted for 0.x; the preview shows what the browser renders, and that is what prints.
- **Dependencies:** runtime `qrcode-generator@2.0.4` (MIT). Dev: `@napi-rs/canvas@1.0.11` (MIT; the newest release, accepted by the maintainer although it is younger than a week). Both pinned exactly.
- **Bundle size:** two font families add a few hundred kB of assets, loaded only when `loadFonts()` is called with them.
- **Privacy:** no prototype template, data set or font without a license is copied. Example templates and rows are made up.

## 📝 Research (from memory, not re-verified in this session)
- **pdfme** (JSON templates for PDF): positions in mm and binds fields by name, which this spec adopts; its per-type plugin system is skipped (three element types).
- **NIIMBOT desktop app / niimblue**: Niimbot stores absolute boxes in mm with per-element font, alignment, wrap and "minimized" (shrink) flags; niimblue edits labels on a fabric.js canvas. The v1 element set covers what the prototype renders from Niimbot data; rotation, barcodes and images are later additions.
- **Brother P-touch / Zebra ZPL**: dot-based, printer-specific formats. Keeping geometry in mm and converting at render time keeps templates portable across 203 and 300 dpi heads.

## 📋 Phasing
One package, three PRs merged in order, each referencing this spec:
1. **Schema and validation**: types, `validateTemplate()`, issue codes, `BACKWARD_COMPATIBILITY.md` entries. Pure, no canvas, no dependencies.
2. **Layout, raster, QR, fonts**: `render()`, `loadFonts()`, `browserEnvironment()`, bundled fonts, golden-image tests in Node.
3. **Demo page** (`packages/render/examples/demo/`): several made-up 50x30 templates, exact-dot preview with the safe area and rounded corners, editable row values, warnings, printing through `labels-core`; hardware check by the maintainer. A stepping stone to the web app (#12), not the app itself.

## 📋 Implementation Plan
**Phase 1: schema and validation**
1. Scaffold `packages/render` like `packages/core` (`@spokospace/labels-render`, ESM, `exports`, `build`/`typecheck` scripts, `tsconfig.json`, `tsconfig.build.json`, `src/index.ts`). Gate green with an empty export.
2. `schema/types.ts` with the v1 types and defaults as exported constants.
3. `schema/validate.ts`: walks `unknown` input and returns `{ template, issues }`. Tests: a minimal valid template; every validate-side issue code with its JSON pointer path; defaults applied; unknown properties removed from `template` and warned; template-level errors give `template: null`; an invalid element is removed and its issue kept; numbers given as strings are `invalid-type`; every range bound (font size, spacing, fallback length, `minSize`, integer `bindIndex`); 200/201 elements.
4. `layout/safe-area.ts`: `outside-label`, `outside-safe-area` for rectangle, rounded (a box corner inside the corner radius) and circle (box corners outside the ellipse), and `outside-printable-area` with and without `printableWidth`. Works on any rectangle, so Phase 2 reuses it for drawn extents. Tests per shape.
5. `binding.ts`: `{ text }`, `{ bind }`, `{ bindIndex }`, `bind` with `bindIndex` fallback, `bindIndex` without `columns`, `bind: "constructor"` and `"__proto__"` on a plain object row, `null`, numbers, the 2000-code-point cut for text and no cut for QR.
6. Package README: format reference with an example template and the issue code table, marked pre-release (the format may still change until Phase 2 merges).

**Phase 2: layout, raster, QR, fonts**
7. Add `qrcode-generator@2.0.4` (runtime) and `@napi-rs/canvas@1.0.11` (dev). A Node `RenderEnvironment` test helper (`test/node-environment.ts`, not exported) registers fonts through `GlobalFonts`.
8. `layout/units.ts` and `layout/text.ts` against a fake fixed-width measurer: wrap, `\n`, long word, shrink steps and the +1 dot tolerance, `minSize`, `fit: "none"`, alignments, letter spacing, line spacing, code points (surrogate pairs).
9. `layout/qr.ts`: module size, centering, levels, `qr-empty`, `qr-too-long`, `qr-too-small`.
10. Fonts: commit Viga and Barlow Semi Condensed (re-run the `fontTools` coverage and metrics check on the committed files) with `OFL.txt` and `fonts/README.md` (source, version). `fonts/registry.ts` (`loadFonts`, internal names, family choice by coverage, `missing-font`, `missing-glyphs`) and `fonts/bundled.ts`. Tests with fake sources.
11. `draw.ts`, `threshold.ts`, `render.ts`, `errors.ts`. Tests: every output pixel is pure black or white; size in dots; `TemplateError` on template-level errors; an invalid element skipped with the rest rendered and its original code reported; warnings collected; drawn-extent checks (overflowing text, `qr-too-small`) give `outside-safe-area` / `outside-printable-area`; `ctx.font` only ever receives internal names (asserted on a recording fake context); a hostile template (200 elements of 2000 characters at the largest allowed size) renders within a time budget.
12. Golden images (PNG with `test/golden/manifest.json`, compared per the policy in Risks; `UPDATE_GOLDEN=1 pnpm test` rewrites them and writes `*.actual.png` on mismatch): a text-only label, wrap + shrink, each alignment, reversed text, letter spacing, Polish text with fallback, QR at each level, lines, a combined 50x30 made-up label.
13. `environment/browser.ts`: `OffscreenCanvas` or `<canvas>`, `FontFace` with the internal name, added to `document.fonts` (or `self.fonts` in a worker). Unit-tested with a fake `FontFace`/canvas; real use is exercised by the Phase 3 demo.
14. README: render usage with `labels-core` (`imageToRows(result.image)`, `printableWidth` from the model), fonts, environments, warnings. `BACKWARD_COMPATIBILITY.md`: template format v1, the render exports, the issue codes and the bundled family names as protected surfaces.

**Phase 3: demo page**
15. `packages/render/examples/demo/` (dependency-free HTML + JS, like the core hardware-check page) and an `example` script: a static server rooted at the package, an import map for `@spokospace/labels-render`, `@spokospace/labels-core` (a dev dependency, `workspace:*`) and `qrcode-generator`.
16. Five or more made-up 50x30 templates (for example a storage box, a shelf label with QR, a cable tag, a reversed header, a long Polish name that must shrink) with made-up rows; a form to edit the row values.
17. Preview: the rendered image at exact dots (`image-rendering: pixelated`, zoom), with overlays for the label shape, rounded corners, the safe area and the 48 mm head width; the warning list.
18. Print through `labels-core`: `Printer.connect()` straight from the click, `imageToRows(image)`, density and copies, a status line. Manual hardware check on the B1 by the maintainer, with numbered steps in the PR.

## 🧪 Hardware checks (Phase 3, maintainer)
- A template's preview and the printed label match (position, line breaks, reversed box, QR scannable with a phone).
- Content in the safe area prints fully; the side strips the warning marks are the ones that do not print.
- Polish text prints with the bundled Latin Extended family.
