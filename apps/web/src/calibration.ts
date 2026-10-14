import { B1, OFFSET_LIMITS_MM } from "@spokospace/labels-core";
import { readStored, STORAGE_KEYS, writeStored } from "./storage.js";

// The calibration (`offsetMm`, A13): where the image lands on the label. It belongs to the printer and the roll,
// not to a print, so it is set once in the settings panel, remembered, and passed to every printLabels call.

export const AXES = ["x", "y"] as const;
export type Axis = (typeof AXES)[number];
export type Offset = Readonly<Record<Axis, number>>;

/** The ranges labels-core's `Printer.print()` accepts: x sideways either way, y down only. */
export const OFFSET_LIMITS: Readonly<Record<Axis, { readonly min: number; readonly max: number }>> = {
  x: { min: -OFFSET_LIMITS_MM.x, max: OFFSET_LIMITS_MM.x },
  y: { min: 0, max: OFFSET_LIMITS_MM.y },
};

/** The B1's default (0 mm across, 0.5 mm down): what core uses when no offset is given. */
export const DEFAULT_OFFSET: Offset = B1.offsetMm;

export function validAxis(axis: Axis, value: unknown): value is number {
  const { min, max } = OFFSET_LIMITS[axis];
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** A stored value; anything that is not two numbers within the limits gives the default. */
export function parseOffset(stored: string | null): Offset {
  if (stored === null) return DEFAULT_OFFSET;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value === "object" && value !== null) {
      const { x, y } = value as Record<string, unknown>;
      if (validAxis("x", x) && validAxis("y", y)) return { x, y };
    }
  } catch {
    // Not JSON: the default below.
  }
  return DEFAULT_OFFSET;
}

export function loadOffset(from?: Parameters<typeof readStored>[1]): Offset {
  return parseOffset(readStored(STORAGE_KEYS.offsetMm, from));
}

/** Returns false when it could not be stored (the value still applies until the tab closes). */
export function saveOffset(offset: Offset, to?: Parameters<typeof writeStored>[2]): boolean {
  return writeStored(STORAGE_KEYS.offsetMm, JSON.stringify(offset), to);
}
