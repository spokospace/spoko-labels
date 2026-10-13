import { SpokoPrintDialog } from "./dialog.js";
import { SpokoPrinterStatus } from "./status.js";

export { MAX_LABELS, printLabels, type PrintOutcome, type PrintRequest } from "./dialog.js";
export { printerSession } from "./instance.js";
export type { PrinterSession, SessionState } from "./session.js";

/**
 * Registers `<spoko-printer-status>` and `<spoko-print-dialog>`. Safe to call more than once: a name that
 * is already defined is left alone. Importing this package registers nothing by itself.
 */
export function defineElements(registry: CustomElementRegistry = customElements): void {
  if (!registry.get("spoko-printer-status")) registry.define("spoko-printer-status", SpokoPrinterStatus);
  if (!registry.get("spoko-print-dialog")) registry.define("spoko-print-dialog", SpokoPrintDialog);
}
