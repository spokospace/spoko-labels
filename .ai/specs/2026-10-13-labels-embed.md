# @spokospace/labels-embed: print labels from another web app

> Status: draft for approval (#11). Decisions so far come from the maintainer in chat on 2026-10-13 (see Resolved decisions); the remaining defaults are listed under Resolved assumptions. Not implemented yet.

## 📝 TLDR
Other web apps should print labels on a NIIMBOT printer without building any of it themselves. The first host is the maintainer's inventory panel, garazyn.polo.blue (Laravel + Filament). There a user prints a single label from a record page, or a few labels for the rows picked on a list. The printer is connected once and stays connected while the user moves between pages.

Proposed (future behavior): a framework-free package `@spokospace/labels-embed` with three parts:
- **Printer session.** One connection per page, shared by everything on it. It survives in-page navigation (Filament SPA mode, Livewire `wire:navigate`), and after a full reload it tries a silent reconnect.
- **Status chip.** `<spoko-printer-status>`, for a toolbar: it shows the connection state, and a click connects.
- **Print dialog.** `printLabels({ template, rows, columns? })` opens a modal. It shows a preview of each label at exact dots, copies and density, a connect button when needed, progress, and abort.

The host owns the templates and the data. The package never fetches anything and never sends data anywhere.

## 📝 Problem Statement
- **The current flow is manual.** Today garazyn prints labels through an HTML print page (`qr.print`), and the alternative is an xlsx export loaded into the NIIMBOT desktop app. Neither gets close to the label printer from the panel.
- **The connection does not survive navigation.** A Web Bluetooth connection lives as long as the page. Panels move between pages all the time (products, tools, containers), and opening the device chooser before every label is not usable.
- **Every host would rebuild the same pieces.** The packages give hosts render and print, but each host would still have to build the connection handling, the error wording (iOS, Firefox, Brave flag, phone app holding the printer), the preview, the copies and density controls, and the batching.
- **Different records need different templates.** In garazyn, tools use one template; products and containers use another.

## 📝 Resolved decisions
| # | Decision | Source |
|---|---|---|
| D1 | Printing happens inside the host (garazyn), in a modal, not in a separate app. | maintainer, 2026-10-13 |
| D2 | One printer connection per panel session, kept across page changes by running the panel as a single-page app (Filament `->spa()`). A full reload needs one reconnect. | maintainer |
| D3 | Templates are predefined per record type and stored by the host (in garazyn's database), passed to the dialog as template v1 JSON. | maintainer |
| D4 | Mostly single labels, sometimes the rows picked on a list (a bulk action). | maintainer |
| D5 | No framework in the public API; the host gets a JS API and two custom elements. | issue #11, AGENTS.md |
| D6 | The public web app (#12) comes later: Vite + plain TypeScript, hosted on Cloudflare Pages with a manual `wrangler` deploy. | maintainer |

## 📝 Proposed Solution
**The printer session (`printerSession`).**
- **One per page.** It is a module singleton, also exposed as `window.spokoLabels.session`, so a script that runs twice (for example after a `wire:navigate`) finds the existing connection instead of opening a second one.
- **States:** `unsupported` (no Web Bluetooth, with the reason), `disconnected`, `connecting`, `connected` (with the printer name and battery level), `printing`. Every change is an `EventTarget` event (`statechange`).
- **`connect()`.** It must be called straight from a click. It calls `Printer.connect()` first, so the user gesture is kept.
- **`tryReconnect()`.** On page load it calls `WebBluetoothTransport.reconnect()`. It never throws, and it has no effect where Chrome does not support it, which is behind a flag today. Then the chip simply shows "connect".
- **Battery.** It refreshes `info()` (battery) after connecting and after each print. There is no polling, so BLE traffic stays low and stays out of the way of printing.
- **Disconnects.** When the printer drops (turned off, out of range), the state goes back to `disconnected` and the chip shows it.

**Printing (`printLabels`).**
```ts
printLabels({
  template,            // template v1 JSON (validated; a template-level error shows in the dialog)
  rows,                // one label per row: Record<string, unknown>
  columns?,            // column names in order, for templates imported from NIIMBOT (bindIndex)
  title?,              // dialog title, e.g. the record name
  copies?, density?,   // initial values; the user can change them
}): Promise<PrintOutcome>   // { printed: number, cancelled: boolean }
```
- **Dialog.** It opens a modal `<spoko-print-dialog>` with:
  - a preview of the current row at exact dots, with arrows to page through the rows;
  - the render warnings for that row, in plain words;
  - copies (1 to 99) and density;
  - Connect when not connected, then Print;
  - progress shown as "label 3 of 12", and Cancel (an `AbortSignal`).
- **Batches.** The rows print one after another: one render and one `print()` per row, with `copies` per row. A failure stops the batch and says which row failed and why. Rows already printed stay printed.
- **Fonts.** They load on first use (`bundledFonts` and `niimbotFonts`) and are cached for the page.
- **Settings.** Density, copies default and calibration (`offsetMm`) are remembered per browser in `localStorage`. The host can pass defaults.
- **Limit.** At most 200 rows per call. More is a host bug and throws `RangeError`.

**The status chip (`<spoko-printer-status>`).**
- It shows a small printer icon and the state: not connected, connected with the printer name and battery, printing, or not supported.
- A click connects when disconnected. When connected, a click opens a menu with Disconnect and Calibration.
- It uses no shadow-DOM styling that fights the host: it has its own small CSS, themable through CSS custom properties (`--spoko-labels-accent` and others), and supports light and dark through `color-scheme`.

**Messages.**
- Every string comes from a PL/EN dictionary. The language is picked from the `lang` option, otherwise from `<html lang>`.
- The `labels-core` error codes become plain words. For example, `device-unreachable` reads "The printer may be connected to a phone; close the NIIMBOT app." Brave without its flag, iOS and Firefox get "Printing needs Chrome or Edge on a computer or Android."

**Delivery.**
- **Bundle.** Until the first npm release (#18), the package builds a self-contained ESM bundle: `dist/bundle/labels-embed.js`, which includes core, render, niimbot and qrcode-generator, plus a `fonts/` folder.
- **Install in the host.** The host copies both into its public assets. A `pnpm --filter @spokospace/labels-embed bundle` command produces them, and the README gives the copy step and the asset version to pin.
- **Fonts.** Font URLs resolve relative to the bundle, so it works from any path.

**Host integration (garazyn, done in its own repository after this package ships).** Recorded here so the API fits it. It is not part of this repository's work.
- **SPA mode.** The panel enables `->spa()`. A render hook loads the bundle once and puts `<spoko-printer-status>` in the topbar.
- **Templates.** A settings page stores one template v1 per record type: tool, and product or container. Templates come from the `labels-niimbot` example page (import, then "Copy JSON") or are written by hand.
- **Record pages.** A "Print label" action calls `printLabels({ template, rows: [row] })`. The row comes from the record: short name, name, QR data, location, number.
- **Lists.** A bulk action does the same with the rows picked on the list.
- **What replaces what.** The existing `qr.print` HTML page and the xlsx export stay as they are.

Alternatives rejected:
- **A separate print window holding the connection (BroadcastChannel).** It works without SPA mode, but the user has to keep an extra window open. The maintainer chose SPA mode.
- **An iframe hosted elsewhere.** Web Bluetooth in an iframe needs `allow="bluetooth"` and same-site rules. The host's data would cross origins, and nothing is gained over a bundle.
- **A framework component (React, Livewire).** It would tie the package to one host; custom elements work in any of them.

## 📝 Architecture
```
host page (Filament SPA)
 ├─ <spoko-printer-status>  ──┐
 ├─ "Print label" action ─▶ printLabels({template, rows}) ─▶ <spoko-print-dialog>
 │                             │                                 │ render() per row (labels-render)
 │                             ▼                                 ▼
 └────────────── printerSession (singleton) ── Printer (labels-core) ── Web Bluetooth ── B1
```
Package layout (`packages/embed`):
- `src/session.ts`: the printer session (states, connect, reconnect, info, print queue).
- `src/dialog.ts`: `<spoko-print-dialog>` and `printLabels()`.
- `src/status.ts`: `<spoko-printer-status>`.
- `src/i18n.ts`: the PL and EN dictionary and error wording.
- `src/settings.ts`: per-browser settings in `localStorage`.
- `src/index.ts`: public exports and the `define()` call that registers the elements.
- `examples/host/`: a made-up host page with a fake "panel" of three pages switched in place (an SPA-like `history.pushState`), a status chip, single and bulk printing, and made-up templates.
- `bundle.config` (Vite library mode, dev-only).

## 📝 API Contracts
```ts
export const printerSession: PrinterSession;
interface PrinterSession extends EventTarget {
  readonly state: SessionState;            // { kind: "unsupported", reason } | { kind: "disconnected" } | { kind: "connecting" }
                                           // | { kind: "connected", name, battery? } | { kind: "printing", done, total }
  connect(): Promise<void>;                // from a click only
  tryReconnect(): Promise<boolean>;        // silent; false when not possible
  disconnect(): Promise<void>;
}
export function printLabels(request: PrintRequest): Promise<PrintOutcome>;
export function defineElements(): void;   // registers <spoko-printer-status>, <spoko-print-dialog>; idempotent
export interface PrintRequest { template: unknown; rows: Record<string, unknown>[]; columns?: string[]; title?: string; copies?: number; density?: number; lang?: "pl" | "en" }
export interface PrintOutcome { printed: number; cancelled: boolean; error?: { code: string; row: number } }
```
- `printLabels` rejects only on host bugs: `TypeError` for a bad request shape, `RangeError` for 0 rows or more than 200. Data problems (an invalid template, render warnings, printer errors) are shown in the dialog and come back in `PrintOutcome`.
- The element names, the attributes, the CSS custom properties, the events, `printLabels` and `printerSession` become a protected surface in `BACKWARD_COMPATIBILITY.md` (the "Embed API" row).

## 📝 UI/UX
- **Status chip:** the printer icon plus one word, "Drukarka: połączona (B1-xxxx, bateria 3)", "Połącz drukarkę", "Drukuje 2/5…" or "Brak Bluetooth". It is keyboard accessible.
- **Dialog:** title, preview (zoom 2×), "Etykieta 1 z 5" with arrows, warnings, copies, density, Print or Connect, progress, Cancel. Escape and the backdrop close it when not printing.
- **First connection:** the chooser opens. The dialog explains "pick the printer whose name starts with B1, then Pair; close the NIIMBOT phone app first".
- **Mobile (Android Chrome):** the same flow; the dialog is full-screen below 600 px.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| No Web Bluetooth (iOS, Firefox, Brave without the flag) | The chip and the dialog say so; preview still works, Print is disabled. |
| Printer connected to the phone app | `device-unreachable` → "close the NIIMBOT app"; stay disconnected. |
| Printer turns off mid-session | `disconnected` event → state disconnected; the next Print offers Connect. |
| Printer drops mid-batch | Batch stops; "Printed 3 of 5; row 4 failed: printer disconnected"; outcome `{ printed: 3, error }`. |
| User cancels mid-batch | The current label is aborted (best effort, as in core); outcome `{ cancelled: true }`. |
| Full page reload | `tryReconnect()` on load; where unsupported, the chip shows "connect" (one click + chooser). |
| Script loaded twice (SPA re-evaluation) | The existing session and the element definitions are reused (idempotent `define`). |
| Two tabs of the panel | Each tab has its own session; only one can hold the printer, and the other gets `device-unreachable` with a hint that another tab may be connected. |
| Template invalid | The dialog shows the template errors; Print is disabled. |
| Row value missing for a bound column | Render's `missing-column` warning is shown and printed empty, as render does. |
| 200+ rows | `RangeError` (host bug). |

## 📝 Risks & Impact Review
- **The SPA mode is the host's choice.** Without it, every page load needs a reconnect: one click and the chooser, or a silent reconnect where Chrome supports it. The package works either way, and the README says so.
- **BLE stability over long sessions.** It has not been checked for hours of idle connection. The hardware check covers 15 minutes of panel navigation and printing.
- **Bundle size.** The fonts are about 2 MB (HarmonyOS Sans plus the OFL fonts) and load lazily on the first preview. The JS is roughly 100 kB.
- **Privacy.** Nothing leaves the page. No telemetry. Rows exist only in memory while the dialog is open.

## 📋 Phasing
1. **Session and status chip.** `packages/embed` scaffold, `session.ts` with a fake transport, `<spoko-printer-status>`, i18n, and the example host with an SPA-like navigation.
2. **Dialog and printing.** `printLabels`, preview, batches, cancel, settings, and the bundle build.
3. **Hardware check** on a B1 using the example host: connect once, navigate, print single and batch, cancel, reload and reconnect.
4. **(garazyn repository) Integration**, under its own spec or PR there: SPA mode, settings for templates per type, the actions.

## 📋 Implementation Plan
1. **Scaffold** `packages/embed` like the other packages: `@spokospace/labels-embed`, ESM, depending on core, render and niimbot. The gate is green with an empty export.
2. **`session.ts`.** Tests with the fake transport from core:
   - the state transitions;
   - `connect()` errors become states;
   - a disconnect event;
   - `tryReconnect()` when unsupported;
   - idempotence when imported twice (`window.spokoLabels`).
3. **`i18n.ts`.** Tests:
   - every `labels-core` error code has PL and EN text;
   - the language comes from the option, then `<html lang>`, then `en`.
4. **`status.ts`.** Tests in happy-dom or jsdom (a pinned dev dependency):
   - it renders each state;
   - a click calls `connect` when disconnected;
   - it is keyboard accessible.
5. **`dialog.ts` and `printLabels()`.** Tests:
   - request validation;
   - a batch of 3 rows prints 3 times, with copies;
   - a failure stops the batch and returns the outcome;
   - cancel;
   - template errors disable Print;
   - settings are remembered.
6. **The bundle build** (Vite library mode) and the README:
   - the API;
   - copying the bundle into a host;
   - SPA notes;
   - browser support;
   - the HarmonyOS Sans notice.
7. **`examples/host/`** with made-up data and templates (a tool and a product). Update `AGENTS.md` (`packages/embed` no longer planned) and `BACKWARD_COMPATIBILITY.md` (the Embed API).

## 🧪 Hardware checks (Phase 3, maintainer)
- Connect once from the chip, move between the three example pages, and print a single label on each. There must be no reconnect.
- Bulk-print 3 rows with 2 copies: 6 labels, in order.
- Cancel during a 5-row batch: printing stops, and the outcome is reported.
- Turn the printer off: the chip shows disconnected. Turn it on, click the chip: connected again.
- Reload the page: silent reconnect where supported, otherwise the chip offers to connect.

## 📝 Resolved assumptions (defaults, confirm on the PR)
| # | Question | Default | Why |
|---|---|---|---|
| A1 | How does garazyn get the code before an npm release? | Copy a self-contained bundle (`dist/bundle/`) into its public assets | No npm release yet (#18); one file plus fonts, version pinned in the host. |
| A2 | UI technology | Custom elements with their own small CSS, themable through CSS variables, no shadow-DOM isolation | Framework-free; fits Blade/Filament and anything else. |
| A3 | Battery polling | None; refreshed after connect and each print | Keeps BLE quiet between prints. |
| A4 | Rows per call | At most 200 | Bulk actions on a page of a list; prevents accidental huge batches. |
| A5 | Where are density and calibration kept? | `localStorage` per browser, host can pass defaults | A printer is used from one or two computers. |
| A6 | Test DOM | happy-dom (pinned dev dependency) | The element logic needs a DOM; vitest supports it per file. |
