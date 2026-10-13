import { PrinterSession } from "./session.js";

/** The page's printer session, shared by the status chip, the dialog and the host. */
export const printerSession = new PrinterSession();
