/** The family every imported text falls back to: bundled by `labels-render`, covers Polish, the app's default. */
export const DEFAULT_FAMILY = "HarmonyOS Sans";

/** The app's default font code, used when an element has none. */
export const DEFAULT_FONT_CODE = "ZT001";

/**
 * NIIMBOT font codes with the family names imported templates use. HarmonyOS Sans and Viga are bundled
 * by `@spokospace/labels-render`; the other four (SIL OFL) by this package.
 */
export const NIIMBOT_FONT_FAMILIES: Readonly<Record<string, string>> = Object.freeze({
  ZT001: "HarmonyOS Sans",
  ZT347: "Viga",
  ZT021: "Inconsolata",
  ZT348: "Baloo Paaji",
  ZT063: "Markazi Text",
  ZT015: "Cookie",
});

/** Longest family name taken from the app's catalogue. */
const MAX_CATALOG_NAME = 100;

const lookup = (table: Readonly<Record<string, string>> | undefined, code: string): string | undefined => {
  if (!table || !Object.hasOwn(table, code)) return undefined;
  const value = table[code];
  if (typeof value !== "string") return undefined;
  const name = value.trim().slice(0, MAX_CATALOG_NAME);
  return name.length > 0 ? name : undefined;
};

/**
 * The family for a font code: the host's table, the built-in table, then the app's catalogue (`known`
 * false), then HarmonyOS Sans (`known` false).
 */
export function familyFor(
  code: string,
  fonts: Readonly<Record<string, string>> | undefined,
  catalog: Readonly<Record<string, string>> | undefined,
): { family: string; known: boolean } {
  const own = lookup(fonts, code) ?? lookup(NIIMBOT_FONT_FAMILIES, code);
  if (own !== undefined) return { family: own, known: true };
  return { family: lookup(catalog, code) ?? DEFAULT_FAMILY, known: false };
}
