/**
 * A label size as it passes the print head: `widthMm` across the head, `heightMm` along the feed. A
 * 50 x 30 mm roll on a B1 is `{ widthMm: 50, heightMm: 30 }`; a template designed upright (30 x 50) with a
 * quarter turn prints at that size too.
 */
export interface RollSize {
  widthMm: number;
  heightMm: number;
}

/**
 * How the loaded roll compares with a label:
 * - `match`: every candidate size of the roll fits the label;
 * - `ambiguous`: some candidates fit and some do not (the count is shared by several sizes);
 * - `mismatch`: no candidate fits;
 * - `unknown`: nothing is known about the roll (no tag, or a count missing from the table).
 */
export type RollVerdict = "match" | "mismatch" | "ambiguous" | "unknown";

export interface RollMatch {
  verdict: RollVerdict;
  candidates: readonly RollSize[];
}

const size = (widthMm: number, heightMm: number): RollSize => Object.freeze({ widthMm, heightMm });

/**
 * Nominal label count (`RfidInfo.nominalLabels`, the number in the roll's name) → the sizes sold with it,
 * from roll names collected in #7 (`T<width>*<height>-<count>…`). No identifiers: a row needs only a name.
 * A count shared by several sizes lists them all.
 */
const BY_NOMINAL_LABELS: ReadonlyMap<number, readonly RollSize[]> = new Map([
  [95, [size(50, 80)]],
  [120, [size(40, 60)]],
  [150, [size(50, 50)]],
  [230, [size(50, 30), size(30, 30)]],
  [320, [size(40, 20), size(50, 20)]],
]);

const NONE: readonly RollSize[] = Object.freeze([]);

/** The sizes a roll with this nominal label count can have; empty when the count is missing or not in the table. */
export function rollCandidates(nominalLabels: number | undefined): readonly RollSize[] {
  if (nominalLabels === undefined) return NONE;
  return BY_NOMINAL_LABELS.get(nominalLabels) ?? NONE;
}

/**
 * The printed size of a label designed at `width` x `height` mm and turned `printRotation` degrees clockwise
 * (template v1's `size` and `printRotation`): a quarter turn swaps the two sides.
 */
export function printedSize(design: { width: number; height: number }, printRotation = 0): RollSize {
  const quarter = printRotation === 90 || printRotation === 270;
  return { widthMm: quarter ? design.height : design.width, heightMm: quarter ? design.width : design.height };
}

/**
 * Compare a label's printed size with the loaded roll's candidate sizes. A candidate fits when both sides
 * are within `toleranceMm` (default 1 mm). Pure: the caller reads the roll and decides what to show.
 */
export function matchRoll(label: RollSize, candidates: readonly RollSize[], toleranceMm = 1): RollMatch {
  if (candidates.length === 0) return { verdict: "unknown", candidates };
  const fits = (roll: RollSize): boolean =>
    Math.abs(roll.widthMm - label.widthMm) <= toleranceMm && Math.abs(roll.heightMm - label.heightMm) <= toleranceMm;
  const fitting = candidates.filter(fits).length;
  const verdict: RollVerdict = fitting === candidates.length ? "match" : fitting > 0 ? "ambiguous" : "mismatch";
  return { verdict, candidates };
}
