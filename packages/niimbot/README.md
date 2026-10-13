# @spokospace/labels-niimbot

Import label templates designed in the NIIMBOT desktop app into the [`@spokospace/labels-render`](../render/README.md) template format, so existing designs print with spoko-labels. Everything Niimbot-specific lives here: font codes, `C0` column bindings, the app's misspelled keys and its letter-spacing scale. The render format knows nothing about Niimbot.

> **Status: pre-release (`0.0.0`).** `extractTemplates()`, `importTemplates()`, their output and `niimbotFonts` are protected contracts (see `BACKWARD_COMPATIBILITY.md`). Not published to npm yet.

The NIIMBOT data format is unofficial and undocumented. The package reads it defensively: one template that cannot be read or converted is reported and skipped, and never stops the rest.

## Quick start

```ts
import { extractTemplates, importTemplates, niimbotFonts } from "@spokospace/labels-niimbot";
import { browserEnvironment, bundledFonts, loadFonts, render } from "@spokospace/labels-render";

// `file` is niimbot_db.isar, picked by the user (see Reading the app's database)
const extracted = extractTemplates(new Uint8Array(await file.arrayBuffer()));
const { templates, failures } = importTemplates(extracted.templates, { fontCatalog: extracted.fontCatalog });
// show `failures` and each template's `warnings` to the user; store `template` (plain JSON) as you like

const environment = browserEnvironment();
const fonts = await loadFonts(environment, [...bundledFonts, ...niimbotFonts]);
const { image } = render(templates[0].template, { row, columns }, { environment, fonts, printableWidth: 48 });
```

Niimbot binds content to columns **by position** ("column C of the data source"), so an imported element reads `columns[2]` of the row you render with: pass `columns` (the header row of your data, in the order the template was designed against) together with `row`.

## Reading the app's database

The NIIMBOT desktop app has no export. It keeps the templates in its local database:

| System | File |
|---|---|
| Windows | `%APPDATA%\niimbot.com\NIIMBOT\Niimbot\niimbot_db.isar` |
| macOS | not known yet; reports welcome |

Close the app before reading the file: while it runs, Windows may refuse to open it. In a browser, let the user pick the file (`<input type="file">`) and pass its bytes; in Node, `readFileSync`. Nothing is uploaded: `extractTemplates` works on the bytes in memory.

```ts
interface ExtractResult {
  templates: NiimbotTemplate[];                    // in file order, ready for importTemplates()
  fontCatalog: Readonly<Record<string, string>>;   // the app's font catalogue: "ZT021" → "Inconsolata"
  warnings: ExtractWarning[];                      // { code, count? }
}
```

| Warning | When |
|---|---|
| `no-templates-found` | no template records: not a NIIMBOT database, an empty file, or the app changed its format |
| `duplicate-template` | the file holds older copies of a template with different content; the newest was kept (`count`: the copies dropped whose content differs from the kept one) |
| `scan-incomplete` | the scan stopped early because the file is full of text that looks like unfinished JSON; templates or font-catalogue entries after that point may be missing. Not seen on a real file |

How it reads the file:
- It scans the bytes for the app's records (an elements JSON array followed by the record marker `[0,0,0,0]` and the name) instead of parsing the Isar format, so it keeps working across small app updates and fails soft on big ones: fewer templates or none, never an exception.
- Isar keeps old copies of edited records. Identical copies collapse silently; for copies with different content, the newest timestamp wins.
- Only what `importTemplates` needs leaves the scanner: the name, the roll names, the timestamp and, for each element, the keys in What is imported. Element ids, image data and URLs, thumbnails, cloud ids and the data source of bound elements (its id and sheet name) are dropped.
- `TypeError` for anything other than a `Uint8Array`; `RangeError` above 64 MB (the real file is about 5 MB). No JSON value larger than 256 kB is read.

Checked against the layout of NIIMBOT for Windows as of October 2026 (the database written by the app in use then).

## Input

```ts
interface NiimbotTemplate {
  name?: string;
  width?: number; height?: number;   // label size in mm, when the source has it
  rollNames?: string[];              // e.g. "T50*30-230WHITE"
  updatedAt?: string;
  elements: unknown[];               // Niimbot elements as the app stores them
}
```

`importTemplates(input, options?)` takes an array of these, usually `extractTemplates(bytes).templates`. Every field is read defensively, so any source works. `null` counts as a missing value everywhere.

`ImportOptions`:

| Option | Meaning |
|---|---|
| `fonts` | font code → family name; overrides and extends the built-in table |
| `fontCatalog` | the app's own font catalogue (code → family name), usually `extractTemplates(bytes).fontCatalog`; used for codes that neither table knows |
| `defaultSize` | `{ width, height }` in mm, each in (0, 300], used when a template has no size of its own |

`importTemplates` throws `TypeError` only for host bugs: `input` that is not an array, or an invalid `defaultSize`. Data never makes it throw.

## Output

```ts
interface ImportResult { templates: ImportedTemplate[]; failures: ImportFailure[] }
interface ImportedTemplate { source: ImportSource; template: Template; warnings: ImportWarning[] }
interface ImportFailure { source: ImportSource; code: ImportFailureCode; issues?: TemplateIssue[] }
interface ImportSource { index: number; name?: string }
interface ImportWarning { code: ImportWarningCode; path: string; feature?: string; issue?: IssueCode }
```

All of these types are exported, together with `NiimbotTemplate`, `ImportWarningCode` and `ImportFailureCode`.

- `template` is a `labels-render` v1 template that passes `validateTemplate()` without errors. Defaults are left out, except `fit`, which is always written.
- `source.index` is the position in the input array. `path` is a JSON pointer into the input template, for example `/elements/4/fontStyle`.
- Templates and failures keep the input order; warnings follow the element order.
- **Deterministic**: the same input and options always give the same JSON. Numbers are rounded to 0.001.
- Nothing from the app beyond the design reaches the output: no element ids, data-source ids, sheet names or URLs.

### Size

The label size comes from the first that works:
1. explicit `width` and `height`;
2. the first roll name shaped `T<width>*<height>…`, for example `T50*30-230WHITE` → 50 × 30 mm;
3. `defaultSize`.

Failing all three, the template fails with `unknown-size`. There is no silent default size.

## What is imported

| Niimbot | Template v1 |
|---|---|
| `text` | `text` element |
| `qrcode` (`codeType` 31) | `qr` element; `correctLevel` 0, 1, 2, 3 → `level` L, M, Q, H |
| `line` | `line` element: a bar `lineWidth` thick (at least 0.1 mm) along the top edge of a wide box, or the left edge of a tall one |
| `value` with a non-empty `dataBind` and a column reference such as `C0` | `{ bindIndex: 2 }` (A = 0, AA = 26; the digits are ignored) |
| other `value` | `{ text }` |

Text attributes:

| Niimbot | Template v1 |
|---|---|
| `fontCode` | `font.family` (see Fonts); a missing or empty code is `ZT001`, a code that is not a string is unknown |
| `fontSize` (em size, mm) | `font.size`, at most 50 |
| `fontStyle` contains `"bold"` | `font.bold` |
| `letterSpacing` | `letterSpacing` × 1.65 (`LETTER_SPACING_SCALE`): the app draws letter spacing about 1.65 times wider than it stores it |
| `lineSpacing` | `lineSpacing` (−5 to 10) |
| `textAlignHorizonral` (sic), or `textAlignHorizontal` | `align`: 0 left, 1 center, 2 right |
| `textAlignVertical` | `verticalAlign`: 0 top, 1 middle, 2 and 3 bottom |
| `lineBreakMode` 1 | `wrap` |
| `textStyle` contains `"minimized"` | `fit: "shrink"`; otherwise `fit: "none"` |
| `colorReverse` 1 | `reverse` |

Optional numbers of the wrong type (`letterSpacing: "0.3"`) count as absent.

## Skipped and approximated

| Code | Kind | When |
|---|---|---|
| `unsupported-element` | warning | barcodes, images, NIIMBOT live or form QR codes, vertical text, unknown element types; skipped |
| `rotated-element` | warning | a rotated element, or a `rotate` that is not a number (only multiples of 360 count as unrotated); skipped |
| `unsupported-style` | warning | approximated; `feature` says what: `underline` and `italic` (dropped), `adaptive` (shrinks like `minimized`), `auto-height` (the stored box is kept), `word-spacing` (differs from letter spacing; ignored), `dashed` and `reverse` lines (drawn solid), `reverse` QR (drawn normally), `align`, `vertical-align`, `level` (an unknown value; the default is used), `value` (not text, a number or a boolean; imported as empty) |
| `unknown-font` | warning | the font code is in neither table; the family comes from `fontCatalog` or is HarmonyOS Sans |
| `unrecognized-binding` | warning | the element is bound, but `value` is not a column reference; imported as static text |
| `value-clamped` | warning | a number outside the v1 range (font size, letter or line spacing) was clamped |
| `invalid-element` | warning | the element is malformed (`issue: "required"` or `"invalid-type"` for its box) or failed `validateTemplate()` (`issue` is the validator's code); dropped |
| `invalid-input` | failure | the template is not an object, or `elements` is not an array |
| `unknown-size` | failure | no size (see Size) |
| `invalid-template` | failure | a template-level validation error, for example more than 200 elements after skipping (`issues` attached) |

## Fonts

| Code | Family | Bundled by |
|---|---|---|
| `ZT001` | HarmonyOS Sans | `@spokospace/labels-render` |
| `ZT347` | Viga | `@spokospace/labels-render` |
| `ZT021` | Inconsolata (regular and bold) | this package, `niimbotFonts` |
| `ZT348` | Baloo Paaji | this package, `niimbotFonts` |
| `ZT063` | Markazi Text | this package, `niimbotFonts` |
| `ZT015` | Cookie | this package, `niimbotFonts` |

`NIIMBOT_FONT_FAMILIES` exports this table. Pass `niimbotFonts` to `loadFonts()` together with render's `bundledFonts` (Quick start) and every family in the table is registered. The files (about 0.8 MB in all) ship in the package's `fonts/` folder and are fetched only by `loadFonts()`; each `data` is a `new URL("../../fonts/<file>", import.meta.url)`, which bundlers such as Vite copy as assets.

All four are under the SIL Open Font License 1.1, with the license next to each file. `fonts/README.md` lists the source, the pinned commit and the SHA-256 of every file; they come from the upstream repositories (`google/fonts`, `EkType/Baloo`), never from NIIMBOT's servers. Every family covers the Polish letters. Only Inconsolata has a bold face: `bold: true` in any other of these families draws the regular face with render's `missing-font` warning at `/font/bold`. Markazi Text is a variable font drawn at its default weight, 400. Any other code imports with the app catalogue's family name (when `fontCatalog` has it) and an `unknown-font` warning; a host that has such a font can register it under that name. Every family other than HarmonyOS Sans gets `fallback: ["HarmonyOS Sans"]`, so text with letters a font lacks (Polish ones in Viga, for example) is drawn in HarmonyOS Sans.

## Privacy

Both functions are pure: they read only what they are given, run locally and send nothing anywhere. Do not commit templates exported from your own app; the tests use made-up data only.

## License

MIT. The font files in `fonts/` keep their own license, the SIL Open Font License 1.1 (see Fonts).
