import { niimbotFonts } from "@spokospace/labels-niimbot";
import { bundledFonts, type FontSource } from "@spokospace/labels-render";

// The fonts the app draws with, in two sets. The built-in templates need labels-render's bundled fonts only;
// the OFL fonts of labels-niimbot (about 800 kB more) are loaded the first time an imported template can be
// shown, so a visitor who never imports does not download them.

/** labels-render's bundled fonts: HarmonyOS Sans and Viga, enough for every built-in template. */
export const BASE_FONTS: readonly FontSource[] = bundledFonts;

/** The base fonts and the families NIIMBOT templates use, so imported templates draw as they were designed. */
export const ALL_FONTS: readonly FontSource[] = [...bundledFonts, ...niimbotFonts];
