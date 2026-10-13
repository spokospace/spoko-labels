# @spokospace/labels-render

Label templates for NIIMBOT printers: a versioned, millimetre-based template format (text, QR codes, lines; content bound to data columns by name) and its validator. Rendering a template to a black-and-white image that `@spokospace/labels-core` can print is being added next.

> **Status: pre-release (`0.0.0`), schema and validation only.** The template format may still change until the renderer lands and golden images pin its defaults; after that it is a protected contract (see `BACKWARD_COMPATIBILITY.md`). Not published to npm yet.

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
      "font": { "family": "Barlow Semi Condensed", "size": 4, "bold": true },
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

The renderer will add `missing-column`, `value-truncated`, `missing-font`, `missing-glyphs`, `text-overflow`, `qr-empty`, `qr-too-long` and `qr-too-small`.

## License

MIT
