import type { QrElement, QrLevel } from "@spokospace/labels-render";
import { convertContent } from "./binding.js";
import { get, present, type ElementContext } from "./context.js";
import type { Box } from "./element.js";

/** Niimbot's `codeType` for a QR code. */
const QR_CODE_TYPE = 31;
const LEVELS: Record<number, QrLevel> = { 0: "L", 1: "M", 2: "Q", 3: "H" };

/** A Niimbot `qrcode` element, or `null` when it is skipped. */
export function convertQr(ctx: ElementContext, box: Box): QrElement | null {
  // Live and form codes are NIIMBOT cloud services: their content is a URL to the app's backend.
  if (get(ctx.raw, "isLive") === true || get(ctx.raw, "isForm") === true) {
    ctx.warn("unsupported-element");
    return null;
  }
  const codeType = get(ctx.raw, "codeType");
  if (present(codeType) && codeType !== QR_CODE_TYPE) {
    ctx.warn("unsupported-element", "codeType");
    return null;
  }
  const content = convertContent(ctx);

  let level: QrLevel = "L";
  const correctLevel = get(ctx.raw, "correctLevel");
  if (typeof correctLevel === "number" && Object.hasOwn(LEVELS, correctLevel)) level = LEVELS[correctLevel] as QrLevel;
  else if (present(correctLevel)) ctx.approximated("correctLevel", "level");
  if (get(ctx.raw, "colorReverse") === 1) ctx.approximated("colorReverse", "reverse");

  const element: QrElement = { type: "qr", ...box, content };
  if (level !== "L") element.level = level;
  return element;
}
