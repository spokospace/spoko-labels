import type { FontSource, RenderEnvironment } from "../environment/types.js";
import type { RenderWarning } from "../schema/issues.js";

/** Fonts loaded into one environment, ready for `render()`. Create it with `loadFonts()`. */
export interface FontRegistry {
  /** Registered family names, in registration order. */
  readonly families: readonly string[];
}

/** One loaded font file. */
export interface Face {
  /** The name the font is registered under in the environment; the only name ever put into `ctx.font`. */
  internalName: string;
  ascent: number;
  descent: number;
  ranges: readonly (readonly [number, number])[];
}

interface Family {
  regular?: Face;
  bold?: Face;
}

/** The registries `loadFonts()` created, with their faces; a registry object from anywhere else is unknown. */
const families = new WeakMap<FontRegistry, Map<string, Family>>();
let nextId = 0;

/**
 * Load fonts into an environment. Every source gets its own internal name (`spoko-labels-<n>`), so fonts of
 * the host page can never stand in for them and a template's family name never reaches a CSS font string.
 *
 * @throws RangeError for an empty list or a source with an empty family or non-positive metrics; rejects with the
 * environment's error when a file cannot be loaded.
 */
export async function loadFonts(environment: RenderEnvironment, sources: readonly FontSource[]): Promise<FontRegistry> {
  if (sources.length === 0) throw new RangeError("loadFonts needs at least one font");
  for (const s of sources) {
    if (!s.family) throw new RangeError("A font source needs a family name");
    if (!(s.ascent > 0 && s.descent >= 0 && Number.isFinite(s.ascent + s.descent))) {
      throw new RangeError(`Font ${s.family} needs a positive ascent and a non-negative descent per em`);
    }
  }
  const faces = sources.map((source) => ({ source, internalName: `spoko-labels-${nextId++}` }));
  await Promise.all(faces.map(({ source, internalName }) => environment.loadFont(source, internalName)));

  const byFamily = new Map<string, Family>();
  for (const { source, internalName } of faces) {
    const family = byFamily.get(source.family) ?? {};
    family[source.bold ? "bold" : "regular"] = {
      internalName,
      ascent: source.ascent,
      descent: source.descent,
      ranges: [...source.unicodeRanges].sort((a, b) => a[0] - b[0]),
    };
    byFamily.set(source.family, family);
  }
  const registry: FontRegistry = Object.freeze({ families: Object.freeze([...byFamily.keys()]) });
  families.set(registry, byFamily);
  return registry;
}

function covers(face: Face, codePoint: number): boolean {
  let lo = 0;
  let hi = face.ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = face.ranges[mid] ?? [0, -1];
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return true;
  }
  return false;
}

const WHITESPACE = /\s/u;

function coversText(face: Face, text: string): boolean {
  for (const ch of text) {
    if (!WHITESPACE.test(ch) && !covers(face, ch.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

export interface FaceChoice {
  face: Face;
  warnings: RenderWarning[];
}

/**
 * Pick the face for one text element. Candidates in order, without duplicates: `family`, each fallback, then
 * every registered family; unregistered names are skipped with `missing-font`. The first candidate that covers
 * every non-whitespace code point wins; when none does, the first candidate is used with `missing-glyphs`.
 * A missing bold face falls back to the regular one with `missing-font` at `/font/bold`.
 *
 * `path` is the element's JSON pointer; warnings point inside it.
 */
export function chooseFace(
  registry: FontRegistry,
  font: { family: string; bold: boolean; fallback: readonly string[] },
  text: string,
  path: string,
): FaceChoice {
  const known = families.get(registry);
  if (!known) throw new TypeError("Unknown font registry: create it with loadFonts()");
  const warnings: FaceChoice["warnings"] = [];

  const named: [string, string][] = [
    [font.family, `${path}/font/family`],
    ...font.fallback.map((name, i): [string, string] => [name, `${path}/font/fallback/${i}`]),
  ];
  const candidates: string[] = [];
  for (const [name, at] of named) {
    if (!known.has(name)) warnings.push({ code: "missing-font", path: at });
    else if (!candidates.includes(name)) candidates.push(name);
  }
  for (const name of known.keys()) if (!candidates.includes(name)) candidates.push(name);

  const faceOf = (name: string): Face => {
    const family = known.get(name) ?? {};
    // A family always has at least one face.
    return ((font.bold ? family.bold : family.regular) ?? family.regular ?? family.bold) as Face;
  };
  const chosen = candidates.find((name) => coversText(faceOf(name), text));
  if (chosen === undefined) warnings.push({ code: "missing-glyphs", path });
  const name = chosen ?? (candidates[0] as string);
  if (font.bold && !known.get(name)?.bold) warnings.push({ code: "missing-font", path: `${path}/font/bold` });
  return { face: faceOf(name), warnings };
}
