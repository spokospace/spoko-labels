import qrcode from "qrcode-generator";
import type { QrLevel } from "../schema/types.js";
import type { DotRect } from "./units.js";

export type QrLayout =
  | { kind: "empty" }
  | { kind: "too-long" }
  | {
      kind: "ok";
      /** Modules per side. */
      modules: number;
      isDark: (row: number, col: number) => boolean;
      /** Dots per module. */
      moduleSize: number;
      /** The symbol, in dots, centered in the box (it overflows the box when `tooSmall`). */
      rect: DotRect;
      /** The box is narrower than one dot per module. */
      tooSmall: boolean;
    };

/**
 * `qrcode-generator`'s default byte conversion keeps the low 8 bits of each UTF-16 unit. Feeding it a string
 * whose units are the UTF-8 bytes makes it encode real UTF-8, without changing the library's global
 * `stringToBytes` setting (which the host page may rely on).
 */
function utf8AsByteString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x2000) out += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return out;
}

/** Encode `text` and place the symbol in `box`: whole dots per module, centered, no quiet zone added. */
export function layoutQr(text: string, level: QrLevel, box: DotRect): QrLayout {
  if (text.length === 0) return { kind: "empty" };
  const qr = qrcode(0, level);
  try {
    qr.addData(utf8AsByteString(text), "Byte");
    qr.make();
  } catch {
    // The library throws when the data does not fit the largest symbol (version 40) at this level.
    return { kind: "too-long" };
  }
  const modules = qr.getModuleCount();
  const side = Math.min(box.width, box.height);
  const moduleSize = Math.max(Math.floor(side / modules), 1);
  const size = modules * moduleSize;
  return {
    kind: "ok",
    modules,
    isDark: (row, col) => qr.isDark(row, col),
    moduleSize,
    rect: {
      x: box.x + Math.round((box.width - size) / 2),
      y: box.y + Math.round((box.height - size) / 2),
      width: size,
      height: size,
    },
    tooSmall: side < modules,
  };
}
