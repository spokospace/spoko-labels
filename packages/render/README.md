# @spokospace/labels-render

Label templates for NIIMBOT printers: a versioned, millimetre-based template format (text, QR codes, lines; content bound to data columns by name), its validator, and a renderer that turns a template and a row of data into a pure black-and-white image that `@spokospace/labels-core` prints as is.

> **Status: pre-release (`0.0.0`).** The template format v1, the issue codes and the exports are protected contracts (see `BACKWARD_COMPATIBILITY.md`). Not published to npm yet.

> **Fonts:** this package bundles **HarmonyOS Sans** (© Huawei Device Co., Ltd., under the HarmonyOS Sans Fonts License Agreement) and **Viga** (SIL Open Font License 1.1). Software that shows labels rendered with HarmonyOS Sans must say that it uses HarmonyOS Sans. Details: [`fonts/README.md`](fonts/README.md).

## Quick start

```ts
import { browserEnvironment, bundledFonts, loadFonts, render } from "@spokospace/labels-render";
import { B1, imageToRows, Printer } from "@spokospace/labels-core";

const environment = browserEnvironment();
const fonts = await loadFonts(environment, bundledFonts); // once; fetches the font files

const { image, warnings } = render(template, { row: { Name: "Blue crate", Code: "BX-0012" } }, {
  environment,
  fonts,
  printableWidth: B1.headDots / B1.dotsPerMm, // 48 mm
});
// show `warnings` to the user and draw `image` as a preview; then, in a click handler:
const printer = await Printer.connect(); // must be the first await after the click
await printer.print(imageToRows(image));
```

`render()` is synchronous. The image is label-sized (a 50x30 mm template gives 400x240 dots); `imageToRows()` center-crops it to the print head.

## Template format, version 1

All geometry is in millimetres. The origin is the top-left corner of the label and `y` grows down. Elements are painted in array order (later ones on top).

```json
{
  "version": 1,
  "name": "Storage box",
  "size": { "width": 50, "height": 30 },
  "shape": { "kind": "rounded", "radius": 2 },
  "elements": [
    {
      "type": "text",
      "x": 2, "y": 2, "width": 30, "height": 7,
      "content": { "bind": "Name" },
      "font": { "family": "HarmonyOS Sans", "size": 4, "bold": true },
      "wrap": true
    },
    { "type": "line", "x": 2, "y": 10, "width": 46, "height": 0.4 },
    {
      "type": "qr",
      "x": 34, "y": 12, "width": 14, "height": 14,
      "content": { "bind": "Code" },
      "level": "M"
    },
    {
      "type": "text",
      "x": 2, "y": 20, "width": 30, "height": 7,
      "content": { "text": "Shelf A" },
      "font": { "family": "Viga", "size": 5 },
      "reverse": true, "align": "center", "verticalAlign": "middle"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `version` | Always `1` for this format. |
| `name` | Optional display name. |
| `size` | The label: `width`, `height`, each above 0 and at most 300 mm. |
| `shape` | Optional. `{ "kind": "rectangle" }` (default), `{ "kind": "rounded", "radius": mm }` or `{ "kind": "circle" }` (an ellipse inscribed in `size`). Used for the preview and the safe-area warning only; the printed image is always the full rectangle. For a circle with `safeMargin`, the safe area is the ellipse with both semi-axes reduced by the margin: exact for round labels, slightly generous near the ends of an elongated one. |
| `safeMargin` | Optional extra inset from the shape's edge to keep clear, 0 to 10 mm. Default 0. |
| `elements` | At most 200 elements. |

Every element has `type`, `x`, `y` (−300 to 300), `width`, `height` (above 0, at most 300) and an optional free-form `id`.

**`content`** (text and QR) says where the value comes from:

- `{ "text": "Shelf A" }`: static text.
- `{ "bind": "Name" }`: the row's cell in the column named `Name`.
- `{ "bindIndex": 2 }`: the third column (0-based) of the data source's column list.
- `{ "bind": "Name", "bindIndex": 2 }`: by name, and by position only when no column has that name.

`bind` must not be empty and `bindIndex` must be a whole number from 0. When `text` is present it wins: a `bind` next to it is reported as an unknown property.

**`text`** elements also take:

| Field | Default | Meaning |
|---|---|---|
| `font` | required | `{ family, size, bold?, fallback? }`. `family` is a non-empty name; `size` is the em size in mm (above 0, at most 50). `fallback` lists up to 8 families to try when `family` has no glyphs for the text. |
| `letterSpacing` | `0` | mm added between characters, −5 to 5. |
| `lineSpacing` | `0` | mm added between lines, −5 to 10. |
| `align` | `"left"` | `"left"`, `"center"`, `"right"`. |
| `verticalAlign` | `"top"` | `"top"`, `"middle"`, `"bottom"`. |
| `wrap` | `false` | Wrap at spaces. Without it each `\n`-separated paragraph is one line. |
| `fit` | `"shrink"` | `"shrink"` lowers the size until the text fits its box; `"none"` keeps the size. Text that still does not fit is reported, never silently cut. |
| `minSize` | `0.75` | The smallest em size shrink may reach, mm (0.75 mm is 6 dots). Above `font.size` it is treated as `font.size`. |
| `reverse` | `false` | Fill the box black and draw the text white. |

**`qr`** elements take `level`: `"L"` (default), `"M"`, `"Q"` or `"H"`. **`line`** elements are filled rectangles: a horizontal line is a wide, thin box.

## Validating

```ts
import { validateTemplate } from "@spokospace/labels-render";

const { template, issues } = validateTemplate(JSON.parse(json), { printableWidth: 48 });
```

`validateTemplate` never throws on bad input (only on a bad `printableWidth`). It returns:

- `template`: the template with every default filled in and unknown properties removed, or `null` when a template-level field (`version`, `name`, `size`, `shape`, `safeMargin`, `elements`) is wrong. An element with an error is removed; the rest stay.
- `issues`: `{ severity, code, path }` with a JSON pointer `path` into the input, for example `/elements/3/font/size`. `"error"` means the element (or the whole template) was dropped; `"warning"` means it was kept.

`printableWidth` is the width the print head covers, in mm. It belongs to the printer, not to the template: a NIIMBOT B1 prints 48 mm across (`headDots / dotsPerMm` of the `B1` model in `@spokospace/labels-core`), so on a 50 mm label about 1 mm on each side never prints.

Only an object's own properties are read, so objects built in code behave exactly like parsed JSON.

The package also exports `TEMPLATE_VERSION` (`1`), `DEFAULTS` (the values filled in for omitted fields), `LIMITS` (the ranges above), the template types (`Template`, `Element`, `TextElement`, `QrElement`, `LineElement`, `Content`, `Shape`, `FontSpec` and the option unions) and the `Normalized*` types that describe what `validateTemplate` returns, with every default present.

## Rendering

`render(template, { row, columns }, { environment, fonts, printableWidth? })` returns `{ image, warnings }`:

- `image`: `{ width, height, data }`, RGBA, every pixel black or white, at 8 dots per mm.
- `warnings`: `{ code, path }`. Every validation issue of the template is included (an element with an error is skipped and the rest renders), plus what rendering found: missing columns and fonts, text that does not fit, QR problems, and drawn content (overflowing text, an oversized QR code) outside the safe or printable area.
- A template-level error (bad `version`, `size`, `shape`, `elements`) throws `TemplateError`, whose `issues` are the validation issues.

How elements are drawn:

- **Text** uses the font's own metrics: line height is `ceil(ascent × px) + ceil(descent × px)`. With `fit: "shrink"`, the size is the largest whole pixel size from `minSize` to `font.size` at which the text fits its box (one dot of overhang allowed); with `wrap`, the text rewraps at every size tried. Text that still does not fit is drawn and reported as `text-overflow`, never cut silently.
- **Fonts**: the family is chosen per element, for the whole text, by glyph coverage: `font.family`, then each `fallback`, then every loaded family in order; the first that has every character wins. So Polish text in Viga (which has no Polish letters) is drawn in HarmonyOS Sans with no warning. A missing bold face uses the regular one (`missing-font`); there is no synthetic bold.
- **QR codes** are encoded as UTF-8, in the smallest symbol that fits, with whole dots per module, centered in the box. No quiet zone is added: leave a margin around the box.
- **Lines** fill their box, at least one dot thick.

### Fonts and environments

`loadFonts(environment, sources)` loads fonts once and returns a registry for `render()`. `bundledFonts` lists the bundled files (families `"Viga"` and `"HarmonyOS Sans"`, regular and bold); add your own `FontSource` (`family`, `bold?`, `data` as a `URL` or `ArrayBuffer`, `ascent` and `descent` per em from the font's `hhea` table, `unicodeRanges` from its `cmap`). Each font is registered under an internal name, so the host page's fonts never stand in for it and a template's family name never reaches a CSS font string.

`browserEnvironment()` draws on an `OffscreenCanvas` (or a `<canvas>`) and loads fonts with `FontFace`. Any other `RenderEnvironment` (`createCanvas`, `loadFont`) works too; this package's tests use `@napi-rs/canvas` in Node. Text measurement differs slightly between canvas engines, so the same template can break a line differently in another browser; the preview shows what will print.

## Issue codes

Callers translate the codes; the package has no user-facing text.

| `code` | Severity | When |
|---|---|---|
| `invalid-type` | error | A value has the wrong JSON type: numbers given as strings (`"version": "1"` included), a fractional `bindIndex`. |
| `required` | error | A required field is missing. |
| `out-of-range` | error | A number outside its range, a value outside its allowed set, or an empty `bind`, `family` or fallback name. |
| `unsupported-version` | error | `version` is not `1`. |
| `unknown-element` | warning | An element `type` other than `text`, `qr`, `line`; the element is removed. |
| `unknown-property` | warning | A property the format does not know; it is removed. |
| `outside-label` | warning | An element box reaches past the label. |
| `outside-safe-area` | warning | An element box is inside the label but leaves the safe area (the shape, its rounded corners, `safeMargin`). |
| `outside-printable-area` | warning | An element box leaves the centered `printableWidth` strip. |

Raised by `render()` (always warnings):

| `code` | When |
|---|---|
| `missing-column` | The content names a column the row does not have (path `…/content`); the value is empty. |
| `value-truncated` | A text value over 2000 code points was cut (path `…/content`). |
| `missing-font` | `font.family` (`…/font/family`), a fallback (`…/font/fallback/<i>`) or the bold face (`…/font/bold`) is not loaded. |
| `missing-glyphs` | No loaded family has every character of the text. |
| `text-overflow` | The text does not fit its box even at `minSize` (or with `fit: "none"`). |
| `qr-empty` | The QR content is empty; nothing is drawn. |
| `qr-too-long` | The content does not fit a QR symbol at this level; nothing is drawn. |
| `qr-too-small` | The box is smaller than one dot per module; the symbol is drawn at one dot per module, overflowing the box. |

`outside-safe-area` and `outside-printable-area` are also raised by `render()` for what was drawn, not only for element boxes.

## License

MIT
