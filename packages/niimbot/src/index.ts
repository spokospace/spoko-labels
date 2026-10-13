export { importTemplates } from "./convert/import.js";
export { extractTemplates } from "./extract/scan.js";
export { LETTER_SPACING_SCALE } from "./convert/text.js";
export { NIIMBOT_FONT_FAMILIES } from "./fonts/codes.js";
export { niimbotFonts } from "./fonts/bundled.js";
export type {
  ExtractResult,
  ExtractWarning,
  ExtractWarningCode,
  ImportFailure,
  ImportFailureCode,
  ImportOptions,
  ImportResult,
  ImportSource,
  ImportWarning,
  ImportWarningCode,
  ImportedTemplate,
  NiimbotTemplate,
} from "./types.js";
