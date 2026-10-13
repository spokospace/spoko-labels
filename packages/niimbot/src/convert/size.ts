import { LIMITS } from "@spokospace/labels-render";
import { finite, get, isObject, round, type Json } from "./context.js";

/** "T50*30-230WHITE": width 50 mm, height 30 mm. */
const ROLL_NAME = /^T(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)/;

type Size = { width: number; height: number };

const inRange = (value: unknown): value is number => finite(value) && value > 0 && value <= LIMITS.maxLabelSize;

/** A rounded size, or `undefined` when either side is not a number in (0, 300]. */
const sized = (width: unknown, height: unknown): Size | undefined =>
  inRange(width) && inRange(height) ? { width: round(width), height: round(height) } : undefined;

/** Whether a host-supplied size is usable; the importer throws on an invalid `defaultSize`. */
export const isValidSize = (size: unknown): size is Size => isObject(size) && sized(size.width, size.height) !== undefined;

/** The label size: explicit width and height, then the first readable roll name, then `fallback`. */
export function convertSize(raw: Json, fallback: Size | undefined): Size | undefined {
  const explicit = sized(get(raw, "width"), get(raw, "height"));
  if (explicit) return explicit;

  const rollNames = get(raw, "rollNames");
  if (Array.isArray(rollNames)) {
    for (const name of rollNames) {
      const match = typeof name === "string" ? ROLL_NAME.exec(name) : null;
      const fromRoll = match && sized(Number(match[1]), Number(match[2]));
      if (fromRoll) return fromRoll;
    }
  }

  return fallback && sized(fallback.width, fallback.height);
}
