# Template v1: QR alignment in its box

> Status: approved by the maintainer in chat on 2026-10-14, after printing garazyn labels on a B1. Implemented together with this spec.

## 📝 TLDR
A QR element gains optional `align` and `verticalAlign`, the same values text elements use. They say where the symbol sits in its box when whole-dot modules leave it smaller than the box. The defaults are `"center"` and `"middle"`, which is today's placement, so existing templates render the same.

## 📝 Problem Statement
- **The symbol is smaller than its box.** The renderer draws QR modules in whole dots (sharp edges at 203 dpi) and centers the symbol. A 16.8 mm box is 134 dots. A 25-module symbol takes 125 of them and leaves 4 to 5 dots (about 0.6 mm) above and below.
- **It does not line up.** Labels designed in the NIIMBOT app put the QR flush with the bottom of its box, which is level with the ID box beside it. The NIIMBOT app scales the symbol to fill the box. Printed with labels-render, the code floats 0.6 mm above that line. The maintainer noticed it on the garazyn tool, product and container labels.
- **Only the template author knows where it belongs.** Bottom-right is right for those labels. Another layout may want top-left or centered, so no single fixed placement fits all.

## 📝 Resolved decisions
| # | Decision | Rationale |
|---|---|---|
| A1 | Place, never scale: modules stay whole dots | The render spec's rule (sharp modules, reliable scans) stays. Alignment only moves the leftover dots. |
| A2 | Reuse text's `align` / `verticalAlign` names and values | One vocabulary for template authors and editors. |
| A3 | Defaults `"center"` / `"middle"` (not text's `"left"` / `"top"`) | Existing QR templates keep rendering exactly as before (golden images unchanged). |
| A4 | The NIIMBOT importer does not set them | Its output for the same input stays the same (no snapshot change). Hosts set the alignment in the templates they store; garazyn does. |

## 📝 Proposed Solution
- **Format (additive, still version 1).** On `qr` elements: `align?: "left" | "center" | "right"` and `verticalAlign?: "top" | "middle" | "bottom"`.
  - The validator fills the defaults `"center"` and `"middle"`.
  - Any other value is `out-of-range` and removes the element, as for text.
- **Layout.** `layoutQr()` takes the alignment and puts the symbol at the start, the middle or the end of the box on each axis. The leftover is under one module per side.
- **Overflow.** When the box is too small (`qr-too-small`), the symbol is drawn at one dot per module and overflows the box. Alignment then decides which side it overflows.

## 📝 Backward compatibility
The change is additive: no field changes meaning and the defaults reproduce today's placement. `BACKWARD_COMPATIBILITY.md` (Template format) lists the new fields and their defaults.

## 📝 Testing
- `layoutQr`: every edge combination places the symbol exactly.
- The validator keeps given values, fills the defaults, and rejects an unknown value.
- `render`: right/bottom alignment puts the last dark dot on the box's last dot, and the default leaves it 3 dots in.
- Golden images: unchanged.
