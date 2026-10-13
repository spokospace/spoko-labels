import { niimbotFonts } from "@spokospace/labels-niimbot";
import { bundledFonts, loadFonts, type FontRegistry, type FontSource, type NormalizedTemplate, type RenderEnvironment } from "@spokospace/labels-render";

/** Every font this package can load: labels-render's and the OFL fonts Niimbot templates use. */
const ALL_FONTS: readonly FontSource[] = [...bundledFonts, ...niimbotFonts];

/** Always loaded: it covers Polish and is every imported template's fallback. */
const BASE_FAMILY = "HarmonyOS Sans";

/** The families a validated template names (font and fallbacks), plus HarmonyOS Sans; sorted, unique. */
export function familiesOf(template: NormalizedTemplate): string[] {
  const families = new Set([BASE_FAMILY]);
  for (const element of template.elements) {
    if (element.type !== "text") continue;
    families.add(element.font.family);
    for (const family of element.font.fallback) families.add(family);
  }
  return [...families].sort();
}

const loaded = new Map<string, Promise<FontRegistry>>();

/**
 * The fonts a template needs, loaded once per set of families and kept for the page. Families no bundled font
 * provides are skipped (render reports them as `missing-font`).
 */
export function fontsFor(environment: RenderEnvironment, template: NormalizedTemplate): Promise<FontRegistry> {
  const families = familiesOf(template);
  const key = families.join("\n");
  let registry = loaded.get(key);
  if (!registry) {
    registry = loadFonts(environment, ALL_FONTS.filter((source) => families.includes(source.family)));
    // A failed load is not cached, so the next preview tries again.
    registry.catch(() => loaded.delete(key));
    loaded.set(key, registry);
  }
  return registry;
}
