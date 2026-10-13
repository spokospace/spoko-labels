# @spokospace/labels-niimbot: import templates from the NIIMBOT desktop app

> Status: approved design (#27). The maintainer answered Q1 to Q11 on #10 ("a" for all; for Q6, bundle the free fonts instead of only mapping them, and skip the Chinese ones). Phase 1 (conversion) and Phase 2 (fonts) are implemented; Phases 3 and 4 are not yet. Phase 2 note: the `BalooPaaji-Gurmukhi` folder of `EkType/Baloo` holds only design sources, so the compiled v1 font comes from the project's GitHub release `1.443` (see `packages/niimbot/fonts/README.md`).

## 📝 TLDR
People who designed labels in the NIIMBOT desktop app cannot use them with spoko-labels. Today the only importer is the prototype: a Python script scrapes the app's local database into ad-hoc JSON, and a browser renderer interprets Niimbot's quirks directly.

Proposed (future behavior): a `@spokospace/labels-niimbot` package with three parts:
- `extractTemplates()` reads the app's database file in the browser or in Node.
- `importTemplates()` turns the extracted Niimbot templates into `labels-render` v1 templates. It reports warnings for each template and a failure entry for each template it cannot convert.
- `niimbotFonts` ships the free (OFL) fonts that Niimbot templates use, beyond the two that `labels-render` already bundles.

Everything Niimbot-specific lives in this package: the 1.65× letter-spacing correction, font codes, `C0` bindings and misspelled keys. The render format never learns about any of it.

## 📝 Resolved decisions
| # | Decision | Rationale |
|---|---|---|
| Q1 | The converter takes plain Niimbot template objects (`NiimbotTemplate`, below) and is a pure function. | The converter does not care where the data came from, and tests can build inputs by hand. |
| Q2 | `extractTemplates(bytes: Uint8Array)` in this package: a defensive scanner of the app's Isar database. It runs anywhere: the user picks the file in a browser, and nothing leaves the browser. | The app has no export and no JSON files; the database is the only source. |
| Q3 | The package lives in `packages/niimbot` as `@spokospace/labels-niimbot`. `AGENTS.md` and `BACKWARD_COMPATIBILITY.md` are updated (they say `packages/niimbot-import`). | The name follows the issue and the other packages. |
| Q4 | A bound element becomes `{ bindIndex: n }` only (`C0` → `2`). No `bind` name is emitted. | It is the smallest output. Column names can be added later as an option without changing existing output. |
| Q5 | The prototype's override, which put the "QR Code" column on every QR, is not ported. A QR gets the column it is bound to in Niimbot. | The override is a hack for one private data set. |
| Q6 | Font codes map to fixed family names. The free fonts used by real templates are bundled in this package as `niimbotFonts` (see Fonts). Unmapped codes fall back with an `unknown-font` warning. An option adds or overrides mappings. | Imported labels look like they do in the app wherever the font's license allows bundling. |
| Q7 | Rotated elements, barcodes, images and NIIMBOT "live" codes are skipped with a warning. Smaller features (underline, `adaptive`, `auto-height`, dashed lines and so on) are approximated with a warning. | Every non-rotated text, QR and line element still imports. |
| Q8 | Size comes from explicit width and height, then from the roll name `T<w>*<h>…`. Failing both, the template fails with `unknown-size` unless the caller passes `defaultSize`. There is no silent 50×30. Shape stays rectangle. | A wrong size moves every element. Roll detection belongs to #7. |
| Q9 | `importTemplates(input, options) → { templates, failures }` with stable codes. Every emitted template passes `validateTemplate()` without errors (enforced in code, not only in tests). | The import output is already a protected surface in `BACKWARD_COMPATIBILITY.md`. |
| Q10 | One spec and one package, delivered in four PRs (Phasing). | Extraction is useless without conversion, and conversion has no other source today. |
| Q11 | An example page at `packages/niimbot/examples/import/`: pick the `.isar` file, see the templates with warnings and failures, preview them, and print on a B1. Hardware check on 50×30 labels only. | It is the only way to compare imported labels with the app before the web app (#12) exists. |

## 📝 Problem Statement
- The NIIMBOT app is where users already design labels. Re-creating dozens of templates by hand is the main barrier to switching.
- The prototype's knowledge of the format is scattered:
  - The extractor (`niimbot_template.py`) uses regexes and falls back to 50×30.
  - The renderer (`web/js/render.js`) reads `textAlignHorizonral`, `colorReverse`, `lineBreakMode`, `textStyle: ["minimized"]`, `fontCode` and `C0` directly, and applies the 1.65× letter-spacing scale at render time.
  - Only two font codes are known.
- `labels-render` v1 deliberately contains none of this (render spec, Q2). Without an importer, existing designs cannot reach it.
- The format is unofficial, undocumented and changes with app updates.

## 📝 Observed source format (read on 2026-10-13, keys and shapes only)
Recorded so that implementers do not need the maintainer's data. No values from real templates appear here or in the repository.

**The database.** `%APPDATA%\niimbot.com\NIIMBOT\Niimbot\niimbot_db.isar`, about 5 MB, written by the Flutter app through Isar (a binary store; old copies of records can stay in the file). A template record contains, in this order:
1. The elements as a JSON array of objects.
2. The roll's `labelNames`: a JSON array of `{ languageCode, languageName, name }`, where `name` is the roll name such as `T50*30-230WHITE`.
3. A run of numbers, printer codes, and `[0,0,0,0]` followed by the template name as a length-prefixed string.
4. The `labelNames` again, and further metadata.

Before the elements there are URLs, ids and a `YYYY-MM-DD HH:MM:SS` timestamp. Local data had 36 element arrays for 30 distinct names, so duplicates exist.

**The font catalogue.** The same file holds the app's font catalogue: about 680 objects `{ id, lpId, code: "ZT…", name, path, fileName, classifyName, isVip, … }`. Here `fileName` is the real family name (`ZT021` → `"Inconsolata"`), and `name` is a marketing name ("Lemon tree").

**Elements.** Every element has `type`, `x`, `y`, `width`, `height` (mm, top-left origin) and `rotate` (degrees), plus 20 to 50 keys that matter only to the app (mirror, region, sync, VIP and color-channel flags).

| Type | Keys used | Values seen |
|---|---|---|
| `text` | `value`, `dataBind`, `fontCode`, `fontSize` (em in mm), `fontStyle`, `letterSpacing`, `wordSpacing`, `lineSpacing`, `textAlignHorizonral` (sic), `textAlignVertical`, `lineBreakMode`, `textStyle`, `boxStyle`, `colorReverse`, `typesettingMode` | `fontStyle` `[]`, `["bold"]`, `["bold","underline"]`; `textStyle` `["minimized"]`, `["norm"]`, `["adaptive"]`; `textAlignHorizonral` 0, 1, 2; `textAlignVertical` 0 to 3; `lineBreakMode` 0, 1; `boxStyle` `"fixed-width-height"`, `"auto-height"`; `wordSpacing` always equal to `letterSpacing` (0, 0.2, 0.3); `lineSpacing` −5 to 1.5; `rotate` 0, 270; `typesettingMode` 1 |
| `qrcode` | `value`, `dataBind`, `correctLevel` (0 to 3), `codeType` (31), `isLive`, `isForm`, `colorReverse` | `correctLevel` 0 |
| `line` | `lineWidth`, `lineType` (1), `dashwidth`, `colorReverse` | |
| `barcode` | `codeType` (20), `value`, `textPosition`, `fontSize` | skipped |
| `image` | `imageUrl`, `localUrl`, `imageData`, … | skipped; `rotate` 0, 90, 270 |

**Bindings.** A bound element has `dataBind: [dataSourceId, sheetName]` and `value` in the form `<column letters><digits>`, for example `C0`. The letters are the column of the data source (A = 0); the digits are ignored. A static element has `dataBind: []` and its text in `value`.

## 📝 Proposed Solution
A small package with no runtime dependency other than `@spokospace/labels-render`, which provides the types and `validateTemplate()`. It has three modules.

**`extract/`: Isar bytes → `{ templates: NiimbotTemplate[], fontCatalog, warnings }`.** The scanner works on the bytes; it never parses the whole file as text:
- An element array is accepted only when all three hold:
  - its JSON parses within 256 kB;
  - it is an array of objects that each have a string `type` and numeric `x`, `y`, `width`, `height`;
  - the metadata window after it (below) contains the record marker `[0,0,0,0]`. This NIIMBOT-specific signal keeps generic JSON in foreign files from being read as templates.

  A missing `labelNames` array does not reject a recognized record. Such a record comes out without `rollNames` and reaches the `unknown-size` path.
- Candidates are found in one linear pass. A JSON-aware bracket matcher (it tracks strings and escapes) finds each candidate's end, giving up past 256 kB. Only then is the slice parsed. After an accepted array, scanning resumes past its end, so the whole file is scanned in O(n) plus the parse of accepted arrays.
- The template's metadata is read from a bounded window around the array:
  - before it: the last timestamp within 2 kB;
  - after it, up to the next element array or 4 kB: the first `labelNames` array, and the name after the first `[0,0,0,0]`.
  - The name is read like the prototype does, without assuming a prefix format: skip at most 8 bytes outside printable UTF-8, then take the next run of 2 to 200 bytes of valid, printable UTF-8. The width and encoding of Isar's length prefix are not documented, and the scanner does not depend on them.
- Font catalogue objects are recognized by `"code":"ZT` followed by a parseable object with string `code` and `fileName`.
- Duplicates (records with the same name, elements and roll) collapse silently. Same name with different content: the newest timestamp wins, with a `duplicate-template` warning, because Isar can leave stale copies. On equal or missing timestamps, the first in file order wins. Unnamed records collapse only when their content is identical.
- **Order.** Templates come out in the file order of the kept copy. For the font catalogue, the first occurrence of a code wins.
- **Element whitelist.** Elements are returned with only the keys the converter reads (the Data Model tables). Image keys (`imageUrl`, `localUrl`, `imageData`, …) and every other app key are dropped. A non-empty `dataBind` keeps its length, but its strings are blanked (`["", ""]`), so data-source ids and sheet names never leave the scanner. Retained values are scalars only:
  - A `value` that is an object or an array is replaced by `{}`. The converter still reports `unsupported-style` `value` for it, but none of its content leaves the scanner.
  - Any other retained key whose value has the wrong JSON type (an object where a number or string is read) is dropped.
- Only the fields in `NiimbotTemplate` are returned: no URLs, thumbnails or cloud ids.

**`convert/`: `NiimbotTemplate[]` → v1 templates.** Each template is converted inside its own `try`, so a malformed record becomes one failure and never aborts the batch. After conversion the result goes through `validateTemplate()`:
- An element the validator rejects is dropped with `invalid-element`, which carries the validator's code.
- A template-level error becomes an `invalid-template` failure.

So an emitted template is always valid.

Rules for that last step:
- **What is emitted.** The converted object is emitted, without the elements the validator dropped. The validator's normalized copy, with every default filled in, is used only for checking. So `shape`, `safeMargin` and `minSize` stay omitted, and `fit` is always present.
- **Paths.** The converter keeps an index map from each converted element to its Niimbot element. A validator path `/elements/<k>/…` becomes `/elements/<i>`, where `i` is the Niimbot element's index. The v1 sub-path is dropped because it names v1 fields, not input keys; `issue` carries the validator's code. So every `ImportWarning.path` points into the input. One warning per dropped element: the validator's first error for it.
- **Validator warnings** (`outside-label`, `outside-safe-area`, `unknown-property`) are not copied into import warnings. `render()` reports them for the actual printer and data, and copying them would duplicate them.

**`fonts/`: `niimbotFonts`, the code → family table, and the bundled font files.**

Alternatives rejected:
- **A real Isar/MDBX parser.** It is a large, versioned binary format for a single read, and the defensive scan already recovers every template the prototype found.
- **A Node CLI as the only extractor.** Data would leave the browser flow, and users would need Node.
- **Putting the extra fonts into `labels-render`.** That would add about 1 MB to every user of the renderer for fonts that only imported templates need.

## 📝 Architecture
All components are new.
- **Consumers:** the example page now; `apps/web` (#12) later.
- **Dependencies:** `@spokospace/labels-render` (runtime: types, `validateTemplate`, `FontSource`); `@spokospace/labels-core` (dev only, for the example page).

```
.isar bytes ─extractTemplates─▶ { templates: NiimbotTemplate[], fontCatalog, warnings }
                                         │
                                         ▼
                    importTemplates(templates, { fontCatalog, fonts?, defaultSize? })
                                         │  per template: size → elements → validateTemplate()
                                         ▼
                     { templates: [{ source, template (v1), warnings }], failures }
                                         │
host: loadFonts(env, [...bundledFonts, ...niimbotFonts]) ─▶ render(template, { row, columns }) ─▶ imageToRows ─▶ print
```

The host decides whether to keep the warnings, show them, or store the v1 JSON. The package never renders and never stores anything.

Files in `packages/niimbot/src`:
- `types.ts`: `NiimbotTemplate` and the result and warning types.
- `extract/scan.ts`: element arrays, metadata windows, font catalogue, de-duplication.
- `convert/size.ts`: explicit size, roll-name parsing, `defaultSize`.
- `convert/binding.ts`: `C0` → `bindIndex`.
- `convert/text.ts`, `convert/qr.ts`, `convert/line.ts`: one function per element type, each `(raw, ctx) → Element | null` plus warnings.
- `convert/import.ts`: `importTemplates()`, the per-template `try` and the final `validateTemplate()`.
- `fonts/codes.ts`: the code → family table.
- `fonts/bundled.ts`: `niimbotFonts`, with the files and licenses in `packages/niimbot/fonts/`.
- `index.ts`.

## 📝 Data Model
### Input: `NiimbotTemplate`
The exchange shape between extraction and conversion. Hosts may also build it from other sources, such as a future cloud export.

```ts
interface NiimbotTemplate {
  name?: string;
  width?: number;  height?: number;   // mm, when the source has them
  rollNames?: string[];               // labelNames[].name, e.g. "T50*30-230WHITE"
  updatedAt?: string;                 // as found, used only for de-duplication
  elements: unknown[];                // Niimbot elements, read defensively (extraction keeps only the keys the converter reads)
}
```

### Mapping to template v1
**Template:**
- `version: 1`.
- `name`: the trimmed `name`; omitted when empty or not a string.
- `size`: (1) `width`/`height` when both are finite numbers in `(0, 300]`; (2) otherwise the first roll name matching `^T(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)` whose values are in `(0, 300]` (width, height in mm); (3) otherwise `defaultSize`; (4) otherwise the failure `unknown-size`.
- `shape`, `safeMargin`: omitted, so the defaults apply.
- `elements`: in input order (the prototype's order, which matches the app's thumbnails). `zIndex` is ignored.

**Every element:**
- Niimbot `qrcode` becomes v1 `type: "qr"`; `text` and `line` keep their names.
- Checked in this order, and the first that applies decides:
  1. A non-object gets `invalid-element` (issue `invalid-type`).
  2. A `type` other than `text`, `qrcode` or `line` gets `unsupported-element` and is skipped, whatever else is wrong with it.
  3. A `rotate` that is present and not a finite multiple of 360 gets `rotated-element`, and the element is skipped. An unreadable rotation is skipped rather than printed in a possibly wrong orientation.
  4. A missing `x`, `y`, `width` or `height` gets `invalid-element` (issue `required`), and a non-finite one gets `invalid-element` (issue `invalid-type`).
- `null` counts as absent for every key.
- Optional numbers (`letterSpacing`, `wordSpacing`, `lineSpacing`, `lineWidth`) that are not finite count as absent, with no warning. `fontSize` is required: a value that is not a finite number is passed on, so the validator rejects the element (`invalid-element`).

**Numbers.** Every emitted number (geometry, font size, spacing) is rounded to 0.001 after any arithmetic. This removes float noise such as `12.299999` or `0.2 × 1.65 = 0.33000000000000002` and makes the output deterministic.

**Content of `text` and `qrcode`:**
- `dataBind` is a non-empty array and `value` matches `^([A-Z]{1,2})\d+$`: `{ bindIndex }`, where A = 0, Z = 25, AA = 26 (the prototype's `column_index`).
- `dataBind` is non-empty but `value` does not match: `{ text: value }` with `unrecognized-binding`.
- Otherwise: `{ text }`. A string is used as is, a number or boolean goes through `String()`, and `null` or a missing `value` gives `""`. Anything else (an object, an array, a function) gives `""` with `unsupported-style` `value`.

**`text`:**

| v1 field | From | Notes |
|---|---|---|
| `font.family` | `fontCode` | `options.fonts` → the table in Fonts → `fontCatalog[code]` with `unknown-font` → `"HarmonyOS Sans"` with `unknown-font`. A missing or empty `fontCode` is `ZT001` (the app's default), with no warning; a non-string code is unknown (`unknown-font`, HarmonyOS Sans) |
| `font.fallback` | | `["HarmonyOS Sans"]` for every family except HarmonyOS Sans itself, fixed from Phase 1. Without it, render's family choice would try registered families in registration order, and Viga (first in `bundledFonts`) covers ł and ń but not ą, ę or ś |
| `font.size` | `fontSize` | above 50 → 50 with `value-clamped` |
| `font.bold` | `fontStyle` includes `"bold"` | `underline` and `italic` → `unsupported-style` (feature named) |
| `letterSpacing` | `letterSpacing × 1.65` | the correction lives only here; clamped to −5..5 with `value-clamped`. A `wordSpacing` different from `letterSpacing` → `unsupported-style` `word-spacing` |
| `lineSpacing` | `lineSpacing` | clamped to −5..10 with `value-clamped` |
| `align` | `textAlignHorizonral`, else `textAlignHorizontal` | 0 left, 1 center, 2 right; anything else → left with `unsupported-style` `align` |
| `verticalAlign` | `textAlignVertical` | 0 top, 1 middle, 2 and 3 bottom (the prototype's reading); anything else → top with `unsupported-style` |
| `wrap` | `lineBreakMode === 1` | |
| `fit` | `textStyle` (an array; precedence `minimized`, then `adaptive`, then `norm`) | includes `"minimized"` → `"shrink"`; `"adaptive"` → `"shrink"` with `unsupported-style` `adaptive`; `"norm"` or missing → `"none"`. Always written out, because the v1 default is `shrink` |
| `reverse` | `colorReverse === 1` | |
| (box) | `boxStyle: "auto-height"` | the stored box is kept; `unsupported-style` `auto-height` |
| (skip) | `typesettingMode` other than 1 | vertical typesetting → `unsupported-element` |

`minSize` is not emitted. The v1 default, 0.75 mm, is the prototype's 6-dot floor.

**`qrcode`:**
- `isLive` or `isForm` true → `unsupported-element`. These are NIIMBOT cloud codes whose content is a service URL.
- `codeType` other than 31 → `unsupported-element`.
- `level` from `correctLevel`: 0 L, 1 M, 2 Q, 3 H; anything else → L with `unsupported-style`.
- `colorReverse` → `unsupported-style` `reverse`; not reversed.

**`line`:**
- Thickness `t = max(lineWidth, 0.1)` mm. When `lineWidth` is missing or not positive, the box's short side is used instead: `height` for a horizontal line, `width` for a vertical one. The prototype always used `height`, which turned a vertical line without `lineWidth` into a square.
- When `width >= height` it is horizontal: box `(x, y, width, t)`. Otherwise it is vertical: box `(x, y, t, height)`. This is the prototype's placement at the top or left edge of the stored box.
- `lineType` other than 1 → solid, with `unsupported-style` `dashed`.
- `colorReverse` → `unsupported-style`.

**Never emitted:** `id`, `dataBind` ids, sheet names, URLs or any other app key. The output carries only v1 fields.

### Output and codes
```ts
interface ImportResult {
  templates: ImportedTemplate[];
  failures: ImportFailure[];
}
interface ImportSource { index: number; name?: string }   // position in the input array
interface ImportedTemplate { source: ImportSource; template: Template; warnings: ImportWarning[] }
interface ImportWarning {
  code: ImportWarningCode;
  path: string;                       // JSON pointer into the Niimbot input element, e.g. "/elements/4/fontStyle"
  feature?: string;                   // for unsupported-style: "underline", "adaptive", ...
  issue?: IssueCode;                  // for invalid-element: the validator's code
}
interface ImportFailure { source: ImportSource; code: ImportFailureCode; issues?: TemplateIssue[] }
```

| Code | Kind | When |
|---|---|---|
| `unsupported-element` | warning | barcode, image, live or form QR, vertical text, unknown `type`; skipped |
| `rotated-element` | warning | `rotate` present and not a finite multiple of 360 (a string or `NaN` included); skipped |
| `unsupported-style` | warning | a feature approximated (`feature` names it) |
| `unknown-font` | warning | the font code is in neither the table nor `options.fonts` |
| `unrecognized-binding` | warning | bound, but `value` is not a column reference; imported as static text |
| `value-clamped` | warning | a number outside the v1 range was clamped |
| `invalid-element` | warning | the converted element failed validation and was dropped (`issue` says why) |
| `invalid-input` | failure | the template is not an object or `elements` is not an array |
| `unknown-size` | failure | no usable size and no `defaultSize` |
| `invalid-template` | failure | template-level validation error (`issues` attached) |

Extraction warnings (`ExtractWarning { code, count? }`):

| Code | When |
|---|---|
| `no-templates-found` | no element arrays found: not a NIIMBOT database, or the app changed its format |
| `duplicate-template` | same name, different content; the newest copy was kept (`count` = copies dropped) |

## 📝 API Contracts
```ts
function extractTemplates(bytes: Uint8Array): ExtractResult;
interface ExtractResult {
  templates: NiimbotTemplate[];
  fontCatalog: Readonly<Record<string, string>>;   // "ZT021" → "Inconsolata", as found in the file
  warnings: ExtractWarning[];
}

function importTemplates(input: readonly unknown[], options?: ImportOptions): ImportResult;
interface ImportOptions {
  fonts?: Readonly<Record<string, string>>;        // extra or overriding font code → family
  fontCatalog?: Readonly<Record<string, string>>;  // usually ExtractResult.fontCatalog
  defaultSize?: { width: number; height: number }; // mm, each in (0, 300]; used only when nothing else gives a size
}

const niimbotFonts: readonly FontSource[];         // FontSource from @spokospace/labels-render
const NIIMBOT_FONT_FAMILIES: Readonly<Record<string, string>>;   // the built-in code → family table
const LETTER_SPACING_SCALE: 1.65;
```

**Errors:**
- Neither function throws on data.
- `extractTemplates` throws `TypeError` when given anything other than a `Uint8Array`, and returns no templates with `no-templates-found` for bytes it does not recognize.
- `importTemplates` throws `TypeError` when `input` is not an array, or when `defaultSize` is given but invalid (a host bug, not data).
- Input larger than 64 MB is rejected by `extractTemplates` with `RangeError`. The real file is about 5 MB, and the cap bounds the work.

**Determinism.** The same input and options always give the same JSON: fixed property order, rounded numbers, templates and failures in input order, warnings in element order. This is the contract `BACKWARD_COMPATIBILITY.md` protects for "Niimbot import output".

## 📝 Fonts
The family names below become part of imported templates, so this spec fixes them.

| Code | Family (v1 `font.family`) | Source | License |
|---|---|---|---|
| `ZT001` | `"HarmonyOS Sans"` | bundled by `labels-render` | HarmonyOS Sans Fonts License |
| `ZT347` | `"Viga"` | bundled by `labels-render` | OFL 1.1 |
| `ZT021` | `"Inconsolata"` | `google/fonts` `ofl/inconsolata/static/Inconsolata-Regular.ttf` and `-Bold.ttf` | OFL 1.1 |
| `ZT348` | `"Baloo Paaji"` | `EkType/Baloo` `BalooPaaji-Gurmukhi` (v1; the app uses v1, and `google/fonts` now carries only Baloo Paaji 2) | OFL 1.1 |
| `ZT063` | `"Markazi Text"` | `google/fonts` `ofl/markazitext/MarkaziText[wght].ttf` (variable, used at its default instance) | OFL 1.1 |
| `ZT015` | `"Cookie"` | `google/fonts` `ofl/cookie/Cookie-Regular.ttf` | OFL 1.1 |

- The files come from the upstream repositories at pinned commits: `google/fonts` at `66928797f271fed5ee428544e7229685e2d90127`; the `EkType/Baloo` commit is pinned when the files are added. They are never taken from NIIMBOT's CDN.
- Each file has its `OFL-<Family>.txt` next to it in `packages/niimbot/fonts/`. `fonts/README.md` lists the source URL, commit, license and SHA-256 for each file, and a test asserts the hashes, as in `labels-render`.
- Metrics (`hhea` ascent and descent per em) and `unicodeRanges` are measured with `fontTools` when the files are added. Fonts that lack Polish letters are fine: every imported family other than HarmonyOS Sans carries `fallback: ["HarmonyOS Sans"]`, so render's family choice switches to it with no warning.
- Bold faces ship only where upstream has a static bold (Inconsolata). Elsewhere `bold: true` renders the regular face with render's `missing-font` at `/font/bold`, the same rule as Viga.
- Total is about 0.9 MB, loaded only when a host passes `niimbotFonts` to `loadFonts()`.
- **Not bundled (maintainer's decision):** `ZT636`, `ZT681` and `ZT453`, three Chinese display fonts found in real templates. Their licenses cannot be verified, and they are several MB each. They import with the catalogue's family name, `fallback: ["HarmonyOS Sans"]` and `unknown-font`. The catalogue's `fileName` is used as is, trimmed, at most 100 characters. It is not always a clean family name: for `ZT063` it reads "Markazi Text Bold". A host that holds a license can register a font under that family name.
- Any other code from the roughly 680 in the catalogue behaves the same. Adding one to the table later changes the import output for templates that use it, so it gets a changelog entry under the import-output rules.

## 📝 UI/UX (example page only)
`packages/niimbot/examples/import/` is a dependency-free HTML and JS page, like the render demo, with an import map and English strings. It is a developer and hardware-check page, not the web app.
1. A file input (`accept=".isar"`) with the hint "Close the NIIMBOT app, then pick `%APPDATA%\niimbot.com\NIIMBOT\Niimbot\niimbot_db.isar`; the file is read in this browser only."
2. A list of imported templates showing the name, size and warning count, followed by the failures with their codes and the extraction warnings.
3. A selected template shows:
   - a preview at exact dots, with the same overlays as the render demo;
   - an editable sample row, where each bound column index gets a made-up value such as "Column C";
   - the import warnings and the render warnings;
   - its v1 JSON, with a copy button.
4. Printing goes through `labels-core` with density and copies, as in the render demo, with the notice "Uses HarmonyOS Sans (Huawei)".

States:
- No file yet: hint only.
- `no-templates-found`: "No NIIMBOT templates found in this file."
- Read error: "Could not read the file; close the NIIMBOT app and try again."
- No Web Bluetooth: same message as the render demo.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| Not a NIIMBOT file, or an empty file | `no-templates-found`; nothing else. |
| App update changes the record layout | Fewer or no templates found, or `unknown-size` failures. Never an exception. The README states which app layout was checked. |
| File locked while the app runs | The browser read fails; the page shows the read-error message. The package itself never sees a partial file. |
| Stale copies of a record | Identical copies collapse; differing copies keep the newest timestamp, with `duplicate-template`. |
| Template with only images and barcodes | Imported with zero elements and one warning per skipped element. An empty template is valid v1. |
| `fontSize` 0, negative or `NaN` | `invalid-element` (issue `out-of-range` or `invalid-type`); the rest of the label imports. |
| `fontSize` 71.8 (the app allows it) | 50 with `value-clamped`. Shrink usually fits it anyway. |
| `C0` binding with no data source loaded in the host | Render resolves `bindIndex` against the host's columns; `missing-column` at render time is the host's to show. |
| Column `AA` or beyond | `bindIndex` 26 and up. Render handles any index. |
| `value` with a 10,000-character static text | Imported as is. Render cuts it at 2000 with `value-truncated`. |
| Hostile JSON in the file (deep nesting, huge arrays) | Parse windows are capped at 256 kB per candidate and the file at 64 MB. More than 200 converted elements in one template → `invalid-template` (render's limit, counted after skips, as the validator counts it). |
| Prototype JSON (`templates/niimbot/*.json`, `width_mm`) | Not accepted as such. Re-extract from the database. The prototype format is not a contract. |
| Personal data in the file | Extraction runs locally. The output contains only the template text the user designed. Cloud ids, URLs and thumbnails are dropped. |

## 📝 Risks & Impact Review
- **Unstable source.** The Isar layout and the element keys are NIIMBOT's private format. The scanner is heuristic. Mitigation: it fails soft, warns per template, and is tested against a synthetic byte layout recorded from the observed shape. A layout change in the app is a bug fix in this package, not a breaking change for hosts.
- **Protected output.** From the first release, the same Niimbot input must give the same v1 JSON (`BACKWARD_COMPATIBILITY.md`, "Niimbot import output"). This covers mapping changes too: the font table, the 1.65× factor, alignment readings and clamping. Snapshot tests on made-up fixtures pin it; any snapshot change needs a changelog entry.
- **Fidelity.** The 1.65× factor, the line placement and the vertical align 3 → bottom reading were measured against app thumbnails, not specified by NIIMBOT. The hardware check compares printed labels with the app's own prints on 50×30 only.
- **Fonts.** Four OFL families, about 0.9 MB, ship only with this package. The HarmonyOS Sans license (revocable) is handled by `labels-render`.
- **Privacy.** No real template, roll id, data-source id or URL appears in fixtures, tests or docs. Fixtures are built by a script from made-up values.
- **Dependencies.** No new third-party runtime dependency. The font files are assets, not packages.

## 📝 Research (from memory, not re-verified in this session)
- **niimblue** (open-source NIIMBOT web app) defines its own label format and does not import the desktop app's templates. Our importer fills that gap; nothing there to reuse.
- **Brother P-touch Editor / Zebra Designer** import templates from their own formats only. Vendor template import is usually one-way and lossy, so reporting each loss, as this spec does, is what users get from the better tools.
- **The NIIMBOT cloud** keeps the same templates for logged-in users. Reading it would need the user's credentials and the app's private API, so it is out of scope. `NiimbotTemplate` is the seam a future cloud or export source would plug into.

## 📋 Phasing
One package, four PRs merged in order, each referencing this spec:
1. **Conversion**: scaffold, `NiimbotTemplate`, `importTemplates()`, the font code table (names only), `README`, `AGENTS.md` and `BACKWARD_COMPATIBILITY.md` updates.
2. **Fonts**: `niimbotFonts` with the four OFL families, licenses and hash test.
3. **Extraction**: `extractTemplates()` with a synthetic Isar-like fixture.
4. **Example page** and the hardware check by the maintainer.

## 📋 Implementation Plan
**Phase 1: conversion**
1. Scaffold `packages/niimbot` like `packages/render`: `@spokospace/labels-niimbot`, ESM, `exports`, `build` and `typecheck` scripts, and `@spokospace/labels-render` as `workspace:*`. Gate green with an empty export.
2. `types.ts` and `convert/size.ts`. Tests:
   - explicit size;
   - roll names `T50*30-230WHITE`, `T40*12.5-…` and malformed ones;
   - the first matching roll name wins;
   - `defaultSize`;
   - `unknown-size`.
3. `convert/binding.ts`. Tests:
   - A → 0, C → 2, Z → 25, AA → 26;
   - the digits are ignored;
   - `unrecognized-binding`;
   - empty `dataBind` is static.
4. `convert/text.ts`, `convert/qr.ts` and `convert/line.ts` against hand-built made-up elements. Tests:
   - every row of the mapping tables;
   - every warning code with its path and `feature`;
   - clamping;
   - rounding to 0.001 mm;
   - the 1.65× factor;
   - both spellings of horizontal alignment.
5. `fonts/codes.ts` (the table) and font selection: `options.fonts` → table → `fontCatalog` → HarmonyOS Sans; `fallback: ["HarmonyOS Sans"]` on every other family. Tests: a host override of `ZT001`, a catalogue-only code, a missing `fontCode`.
6. `convert/import.ts`. Tests:
   - per-template isolation: one throwing template among valid ones;
   - `invalid-input`;
   - `invalid-element` carrying the validator's code;
   - `invalid-template`;
   - more than 200 elements;
   - every emitted template passes `validateTemplate()` with no errors;
   - determinism: snapshot of the JSON for a made-up fixture set (`test/fixtures/templates.ts`, built from made-up values only).
7. README covering:
   - usage with `labels-render` (`importTemplates` → `render` with `{ row, columns }`);
   - the supported subset and the skipped or approximated features (the warning table);
   - the font table;
   - privacy notes.

   Also update `AGENTS.md` (path `packages/niimbot`, no longer planned) and `BACKWARD_COMPATIBILITY.md` (import output: exports, codes, family names, the 1.65× factor).

**Phase 2: fonts**

8. Add the Inconsolata (Regular and Bold), Markazi Text and Cookie files from `google/fonts` at the pinned commit, and Baloo Paaji v1 from `EkType/Baloo` at a pinned commit, each with its `OFL-*.txt`. `fonts/README.md` records source, commit, license and SHA-256. A test asserts the hashes.
9. Measure the metrics and coverage with `fontTools` and record them in `fonts/bundled.ts`. `niimbotFonts` uses `new URL("../../fonts/<file>", import.meta.url)`, as in render's `bundled.ts`; the URL is relative to `src/fonts/` and to `dist/fonts/`. Tests: every `data` URL points at an existing file, and `loadFonts` with a fake environment accepts them.

**Phase 3: extraction**

10. `test/fixtures/isar.ts`: a builder that lays out made-up records in the observed shape:
    - binary noise;
    - URLs on `example.invalid`;
    - a timestamp, the elements JSON, `labelNames`;
    - the number run, `[0,0,0,0]` plus a length-prefixed name;
    - a font catalogue fragment.
11. `extract/scan.ts`. Tests:
    - two records;
    - a stale identical copy (collapsed);
    - a differing copy (newest kept, `duplicate-template`);
    - a record without `labelNames` (no `rollNames`, so `unknown-size` later);
    - the font catalogue;
    - random bytes → `no-templates-found`;
    - a foreign file holding a generic JSON element array without the record marker → `no-templates-found`;
    - a recognized record without `labelNames` → extracted without `rollNames`, then `unknown-size` in `importTemplates`;
    - a `value` object is replaced by `{}`;
    - a truncated JSON array;
    - a 256 kB window cap;
    - `RangeError` above 64 MB;
    - `TypeError` for non-`Uint8Array`;
    - a 5 MB synthetic file scanned in under 1 s in Node;
    - the element whitelist: image URLs and `dataBind` ids are absent from the result.
12. README: extraction usage, the file location on Windows (and macOS when known), and the app layout it was checked against.

**Phase 4: example page**

13. `packages/niimbot/examples/import/` with an `example` script: static server, import map for `labels-niimbot`, `labels-render`, `labels-core` and `qrcode-generator`, and the UI/UX flow above.
14. Manual check by the maintainer on a real database and a B1 with 50×30 labels, with numbered steps in the PR (Hardware checks). PR evidence (screenshots, photos, JSON) uses made-up templates or is redacted: no real template names, texts or data.

## 🧪 Hardware checks (Phase 4, maintainer)
- All templates the prototype imported from the same database are listed. Duplicates and skips are explained by warnings.
- For three templates, one using each of HarmonyOS Sans, Viga and a bundled OFL font, the preview and the printed label match the app's own print: position, line breaks, letter spacing, reversed boxes, QR scannable.
- A template with a rotated element or an image shows the warning and prints the rest.
