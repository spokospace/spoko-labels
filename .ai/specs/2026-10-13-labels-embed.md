# @spokospace/labels-embed: print labels from another web app

> Status: approved design (#37). D1–D6 come from the maintainer in chat on 2026-10-13. The maintainer accepted A1–A6. The spec review's findings are folded in; A2 is refined to use an open shadow root (see A2). Implemented (Phases 1 and 2); the bundle is built with esbuild directly instead of Vite's library mode (same engine, no asset inlining to configure). Hardware check on a NIIMBOT B1 (2026-10-13): connecting from the chip, the battery and printing from the example host passed.

## 📝 TLDR
Other web apps should print labels on a NIIMBOT printer without building any of it themselves. The first host is the maintainer's inventory panel, garazyn.polo.blue (Laravel + Filament v5). There a user prints a single label from a record page, or a few labels for the rows picked on a list. The printer is connected once and stays connected while the user moves between pages.

Proposed (future behavior): a framework-free package `@spokospace/labels-embed` with three parts:
- **Printer session.** One connection per page, shared by everything on it. It survives in-page navigation (Filament SPA mode, Livewire `wire:navigate`), and after a full reload it tries a silent reconnect. It also owns the print queue and the batches.
- **Status chip.** `<spoko-printer-status>`, for a toolbar: it shows the connection state and print progress, and a click connects.
- **Print dialog.** `printLabels({ template, rows, columns? })` opens a modal. It shows a preview of each label at exact dots, copies and density, a connect button when needed, progress, and cancel.

The host owns the templates and the data. The package never fetches anything and never sends data anywhere.

## 📝 Problem Statement
- **The current flow is manual.** Today garazyn prints labels through an HTML print page (`qr.print`), and the alternative is an xlsx export loaded into the NIIMBOT desktop app. Neither gets close to the label printer from the panel.
- **The connection does not survive navigation.** A Web Bluetooth connection lives as long as the page. Panels move between pages all the time (products, tools, containers), and opening the device chooser before every label is not usable.
- **Every host would rebuild the same pieces.** The packages give hosts render and print, but each host would still have to build the connection handling, the error wording, the preview, copies and density, batching, and the BLE rules (user gesture, one command at a time).
- **Different records need different templates.** In garazyn, tools use one template; products and containers use another.

## 📝 Resolved decisions
| # | Decision | Source |
|---|---|---|
| D1 | Printing happens inside the host (garazyn), in a modal, not in a separate app. | maintainer, 2026-10-13 |
| D2 | One printer connection per panel session, kept across page changes by running the panel as a single-page app (Filament `->spa()`). A full reload needs one reconnect. | maintainer |
| D3 | Templates are predefined per record type and stored by the host (garazyn's database), passed as template v1 JSON, with the column order when a template binds by position. | maintainer |
| D4 | Mostly single labels, sometimes the rows picked on a list (a bulk action). | maintainer |
| D5 | No framework in the public API; the host gets a JS API, a window event and two custom elements. | issue #11, AGENTS.md |
| D6 | The public web app (#12) comes later: Vite + plain TypeScript, Cloudflare Pages with a manual `wrangler` deploy. | maintainer |

## 📝 Proposed Solution
### Printer session (`printerSession`)
- **Connecting** (`connect()`, from a click only).
  - The first `await` is `WebBluetoothTransport.request(model)`, which keeps the user gesture. The session then builds `new Printer(transport, model)`.
  - The device name comes from `transport.deviceName`, and disconnects come from `transport.onDisconnect`.
  - `Printer.connect()` is not used, because it hides the transport.
  - `labels-core` does not change.
- **Silent reconnect** (`tryReconnect()`).
  - On page load it calls `WebBluetoothTransport.reconnect(model)`.
  - It never throws. Where Chrome does not support it (today it is behind a flag), it returns `false` and the chip shows "connect".
- **One command at a time.**
  - Every printer call (`info()`, `print()`) goes through one internal promise chain in the session. Core's `busy` therefore never reaches the user, and if it does, it is reported as an internal error.
  - `info()` (battery) runs after connecting and after a whole batch, never between rows.
  - There is no polling.
- **One tab holds the printer.**
  - While connected, the session holds an exclusive Web Lock (`navigator.locks.request("spoko-labels-printer", { ifAvailable: true }, …)`).
  - A tab that cannot get the lock does not connect, and shows "The printer is in use in another tab of this app."
  - Chrome shares one GATT link between tabs, so without the lock two tabs could mix their commands on one printer.
  - Without the Web Locks API, which is unlikely in Chrome or Edge, the session connects without the lock.
- **States.** States are exposed as `state` plus a `statechange` event (`EventTarget`):
  - `unsupported` (with a reason);
  - `disconnected`;
  - `busy-elsewhere`;
  - `connecting`;
  - `connected` (`name`, `battery?`);
  - `printing` (`name`, `done`, `total`).
- **Batches run in the session, not in the dialog.**
  - The batch survives the dialog's element being removed, for example by a Livewire body swap. Progress is session state, so the chip shows it on every page.
  - While printing, the session cancels `livewire:navigate` with "Printing in progress", and sets `beforeunload` for full reloads.
- **One copy per page.** The bundle installs `window.spokoLabels = { version, session, printLabels }` once.
  - A second evaluation of the same version reuses it.
  - A different version, for example after a host deploy, refuses to install and logs a warning. The host loads the bundle in `<head>` with `data-navigate-track`, so Livewire does a full reload when the asset version changes.

### Printing (`printLabels`)
```ts
printLabels({
  template,            // template v1 JSON; a template-level error is shown in the dialog
  rows,                // one label per row: Record<string, unknown>, at most 200
  columns?,            // column names in order, needed by templates that bind by position (bindIndex, Niimbot imports)
  title?,              // dialog title, e.g. the record name
  copies?, density?,   // initial values; the user can change them
  lang?,               // "pl" | "en"; default from <html lang>, then "en"
}): Promise<PrintOutcome>
```
- **The dialog.** `<spoko-print-dialog>` opens with `<dialog>.showModal()`: focus trap, Escape, inert background, and focus goes back to the opener. It contains:
  - the preview of the current row, drawn on a `<canvas>` in the design orientation (an image turned by `printRotation` is turned back), at zoom 2×;
  - arrows to page through the rows;
  - the render warnings for that row, in plain words. Render runs with `printableWidth` = `headDots / dotsPerMm`, so `outside-printable-area` shows up;
  - copies (1 to 99) and density;
  - Connect when not connected, then Print;
  - progress shown as "label 3 of 12", and Cancel;
  - a fixed line "Font: HarmonyOS Sans © Huawei Device Co., Ltd." whenever the template uses HarmonyOS Sans, which every v1 fallback does. This meets the license's "prominent notice" for every host.
- **Printing a batch.** The session prints the rows one after another. Each row is rendered and printed with `copies: 1`, repeated `copies` times. This makes the count exact on cancel or failure. Already printed labels stay printed. A failure stops the batch.
- **No gesture needed to print.** Only Connect needs a click. So a host may reach `printLabels` after a server roundtrip, for example a Livewire bulk action. `connect()` must not be reached from code that a click did not start directly.
- **The promise.** It resolves when the dialog closes, with `PrintOutcome`. Closing before Print resolves `{ printed: 0, cancelled: true }`.
- **A second call while a dialog is open** rejects with `TypeError("a print dialog is already open")`.
- **Fonts.** Only the families the template uses, plus HarmonyOS Sans as the coverage fallback, load on first use. Later calls use the cache.
- **Settings.** The density is remembered in `localStorage`, wrapped in try/catch. Copies start at 1, or at what the host passes. Calibration (`offsetMm`) uses the model's default, or the host's `offsetMm` option. Nothing else is stored.

### Window event (for server-driven hosts)
- **The event.** The bundle listens for a `spoko-labels:print` `CustomEvent` on `window` whose `detail` is a `PrintRequest`, and calls `printLabels`.
- **Why.** A Filament action can do `$this->dispatch('spoko-labels:print', template: …, rows: …)` instead of building JavaScript strings, which carry escaping and XSS risk.
- **Outcome.** The result comes back as a `spoko-labels:printed` event with the `PrintOutcome`.

### Status chip (`<spoko-printer-status>`)
- **Markup.** A `<button>` in an open shadow root. The state is announced through `aria-live="polite"`. It shows a printer icon plus the state:
  - "Połącz drukarkę";
  - "Drukarka: B1-xxxx · bateria 3";
  - "Drukuje 2/5…";
  - "W użyciu w innej karcie";
  - "Brak Bluetooth".
- **Battery.** Shown as the printer's own level (a small number, 3 on a full B1), not as a percentage; its maximum is not known per model yet.
- **Click.** It connects when disconnected. When connected, it opens a one-item menu: Disconnect.
- **Theming.** Through CSS custom properties (`--spoko-labels-accent`, `--spoko-labels-fg`, `--spoko-labels-bg`, `--spoko-labels-radius`) and `::part(button)`. Light and dark come through `color-scheme`.
- **Lifecycle.** It subscribes to the session in `connectedCallback` and unsubscribes in `disconnectedCallback`, so Livewire swaps and morphs do not leak listeners. Its own children live in the shadow root, so a morph of the host component does not wipe them. The host may still wrap it in `wire:ignore`.

### Messages (PL and EN)
- **Language.** It is read when the dialog opens, from the `lang` option, else `<html lang>` normalized (`pl-PL` → `pl`), else `en`.
- **Every `labels-core` error code has wording.**
  - `device-unreachable` → "The printer may be connected to a phone; close the NIIMBOT app."
  - `bluetooth-unsupported` → "Printing needs Chrome or Edge on a computer or Android (Brave: turn on its Bluetooth flag)."
  - `busy`, `protocol` and `no-response` → "Something went wrong; try again, then restart the printer."
- **Every render warning code has wording** too (as on the example pages).

### Delivery
- **Two entry points.**
  - **npm entry (`src/index.ts`):** no side effects (`sideEffects: false`). Hosts call `defineElements()` themselves.
  - **Bundle entry (`src/bundle.ts`):** calls `defineElements()` and installs `window.spokoLabels`.
- **Bundle build.** A dev-only Vite library build, with a pinned version, produces:
  - `dist/bundle/labels-embed.js`: one ES module containing core, render, niimbot and qrcode-generator;
  - `dist/bundle/fonts/`: the font files, unhashed. The bracketed `MarkaziText[wght].ttf` is emitted as `MarkaziText-wght.ttf`. All license files go next to them: `LICENSE-HarmonyOS-Sans.txt` and the `OFL-*.txt`.
- **Font URLs.** They resolve relative to the bundle (`new URL("fonts/…", import.meta.url)`), so the folder works from any path. A test checks that the built bundle contains no `data:font` and that every font URL resolves from a sub-path.
- **Styles.** They come from constructed stylesheets in the shadow roots: no inline `<style>`, no `unsafe-inline`.
- **Size.** About 1.2 MB of fonts, loaded per family on demand. The JS is roughly 100–150 kB.
- **Host requirements** (listed in the README):
  - HTTPS;
  - a Permissions-Policy that does not disable `bluetooth`;
  - CSP `script-src` and `font-src` allowing the host's own origin.
- **Install in the host.** `pnpm --filter @spokospace/labels-embed bundle` produces the folder, and the host copies it into its public assets, pinned to a version, until the npm release (#18).

### Host integration (garazyn, in its own repository after this package ships)
Recorded so the API fits it. It is not part of this repository's work.
- **Loading.** The panel enables `->spa()`. A head render hook loads the bundle with `data-navigate-track`. A topbar render hook places `<spoko-printer-status>`.
- **Templates.** A settings page stores one template v1 per record type (tool; product or container), with its `columns` when it binds by position.
  - Templates come from the `labels-niimbot` import page ("Copy JSON") or are written by hand.
  - The data mapping per type, from the record to the row, lives in garazyn: short name, name, QR data, location, number.
- **Actions.** A "Print label" record action, and a bulk action for the selected rows, dispatch `spoko-labels:print`.
- **Existing flows.** The `qr.print` page and the xlsx export stay.

Alternatives rejected:
- **A separate print window** holding the connection (BroadcastChannel). The maintainer chose SPA mode.
- **An iframe hosted elsewhere.** It needs `allow="bluetooth"` and cross-origin data, for no gain.
- **Light-DOM elements.** Livewire morphs remove children rendered client-side.
- **A framework component (React, Livewire).** It would tie the package to one host.

## 📝 Architecture
```
host page (Filament SPA)
 ├─ <spoko-printer-status>  ──────────────┐   (subscribes)
 ├─ action ─▶ printLabels() / spoko-labels:print ─▶ <spoko-print-dialog> ─ preview: render() per row
 │                                         ▼
 └──────────── printerSession (singleton, Web Lock, command queue, batch) ── Printer (labels-core) ── BLE ── B1
```
Package layout (`packages/embed`):
- `src/session.ts`: the session (states, connect, reconnect, lock, queue, batch).
- `src/dialog.ts`: `<spoko-print-dialog>` and `printLabels()`.
- `src/status.ts`: `<spoko-printer-status>`.
- `src/i18n.ts`: the PL and EN dictionary.
- `src/fonts.ts`: per-family lazy loading.
- `src/index.ts` and `src/bundle.ts`: the two entries.
- `test/fake-transport.ts`: a small fake, copied from core's test helper, which is not exported.
- `examples/host/`: a made-up host. Its navigation swaps `document.body` with fetched HTML and re-runs scripts, as Livewire does, across three pages, plus a fake "morph" button that re-renders the chip's container. It has single and bulk printing, made-up templates (a tool and a product), and a second-tab check.

## 📝 API Contracts
```ts
export const printerSession: PrinterSession;
type SessionState =
  | { kind: "unsupported"; reason: "no-bluetooth" | "insecure-context" }
  | { kind: "disconnected" } | { kind: "busy-elsewhere" } | { kind: "connecting" }
  | { kind: "connected"; name: string; battery?: number }
  | { kind: "printing"; name: string; done: number; total: number };
interface PrinterSession extends EventTarget {        // "statechange"
  readonly state: SessionState;
  connect(): Promise<void>;                           // from a click only
  tryReconnect(): Promise<boolean>;                   // silent; false when not possible
  disconnect(): Promise<void>;
}
export function printLabels(request: PrintRequest): Promise<PrintOutcome>;
export function defineElements(): void;               // idempotent: checks customElements.get() first
export interface PrintRequest {
  template: unknown; rows: Record<string, unknown>[]; columns?: string[]; title?: string;
  copies?: number; density?: number; offsetMm?: { x: number; y: number }; lang?: "pl" | "en";
}
export interface PrintOutcome {
  printed: number;                                    // labels printed, copies included
  cancelled: boolean;
  error?: { code: ErrorCode | "template" | "render"; row: number }; // row is 0-based
}
```
- `printLabels` rejects only on host bugs. It gives `TypeError` for a bad request shape or a dialog already open, and `RangeError` for 0 rows or more than 200. Data problems (an invalid template, render warnings, printer errors) are shown in the dialog and returned in `PrintOutcome`.
- **Protected surface.** The "Embed API" row in `BACKWARD_COMPATIBILITY.md` covers:
  - the element names, CSS custom properties and parts;
  - `printLabels`, `printerSession` and `defineElements`;
  - the events: `statechange`, `spoko-labels:print` and `spoko-labels:printed`;
  - `window.spokoLabels`.

## 📝 Edge Cases & Failure Scenarios
| Case | Behavior |
|---|---|
| No Web Bluetooth (iOS, Firefox, Brave without the flag) | The chip and the dialog say so; preview still works, Print is disabled. |
| Not a secure context | `unsupported` with `insecure-context`. |
| Printer connected to the phone app | `device-unreachable` → "close the NIIMBOT app"; stay disconnected. |
| Another tab of the app holds the printer | `busy-elsewhere`; no connection attempt. |
| Printer turns off mid-session | `transport.onDisconnect` → `disconnected`; the next Print offers Connect. |
| Printer drops mid-batch | Batch stops; "Printed 3 of 5; label 4 failed: printer disconnected"; outcome `{ printed: 3, error }`. |
| User cancels mid-batch | The current label is aborted (best effort, as in core); outcome `{ cancelled: true, printed }` exact. |
| User navigates (wire:navigate) while printing | Navigation is cancelled with a message; the batch continues. |
| Full page reload while printing | `beforeunload` prompt; if confirmed, the batch is lost with the page. |
| Dialog element removed while printing | The batch keeps running in the session; the promise resolves when it ends. |
| Full page reload | `tryReconnect()`; where unsupported the chip offers to connect. |
| Same bundle evaluated twice | `window.spokoLabels` reused; `defineElements` idempotent. |
| New bundle version mid-session | `data-navigate-track` forces a full reload; a second version never installs alongside. |
| Template invalid | The dialog shows the template errors; Print is disabled. |
| `bindIndex` template without `columns` | Render's `missing-column` warnings show; the label prints empty fields (host bug, documented). |
| `printLabels` while a dialog is open | `TypeError`. |
| 0 or 200+ rows | `RangeError` (host bug). |
| `localStorage` unavailable (private mode) | Density falls back to the default; no error. |

## 📝 Risks & Impact Review
- **The SPA mode is the host's choice.** Without it, every page load needs a reconnect: one click and the chooser, or a silent reconnect where Chrome supports it. The package works either way.
- **Livewire behavior.** It is emulated in the example host (body swap, script re-run, morph) and then confirmed in garazyn. The hardware check covers navigation during printing and two tabs.
- **BLE stability over long sessions.** It has not been checked for hours of idle connection. The hardware check covers 15 minutes of navigation and printing.
- **Privacy.** Nothing leaves the page. No telemetry. Rows exist only in memory while the dialog is open or a batch runs.

## 📋 Phasing
1. **Session and status chip.** Scaffold, `session.ts` (lock, queue, batch) against the fake transport, `<spoko-printer-status>`, i18n, and the example host with the Livewire-like navigation.
2. **Dialog, printing, delivery.** `printLabels`, the window event, preview, cancel, settings, lazy fonts, and the bundle build with its tests.
3. **Hardware check** on a B1 using the example host (below).
4. **(garazyn repository) Integration**, under its own spec or PR there.

## 📋 Implementation Plan
1. **Scaffold** `packages/embed` like the other packages: `@spokospace/labels-embed`, ESM, `sideEffects: false`, depending on core, render and niimbot. The gate is green with an empty export.
2. **`session.ts`.** Tests with the fake transport:
   - the state transitions;
   - errors become states;
   - an `onDisconnect` event;
   - `tryReconnect` when unsupported;
   - the Web Lock, held and refused (a fake `navigator.locks`);
   - a print requested during the post-connect `info()` waits instead of failing;
   - a batch of 3 rows × 2 copies sends 6 prints in order;
   - cancel gives an exact count;
   - a failure stops the batch;
   - the navigation guard is set and cleared;
   - the batch survives the dialog's removal.
3. **`i18n.ts`.** Tests:
   - every core `ErrorCode` and every render warning code has PL and EN wording;
   - `<html lang>` normalization;
   - the `en` fallback.
4. **`status.ts`.** Tests in happy-dom (a pinned dev dependency):
   - each state renders;
   - a click connects when disconnected;
   - `aria-live`;
   - listeners are removed on disconnect from the DOM;
   - a parent re-render (morph) keeps it working.
5. **`dialog.ts`, `printLabels()` and the window event.** Tests:
   - request validation and the error types;
   - a second call while open;
   - template errors disable Print;
   - the HarmonyOS notice is present;
   - the outcome on close;
   - the event round trip;
   - the density is remembered, and `localStorage` failures are tolerated.
6. **Bundle.** The Vite build (pinned), the font copy and rename, the licenses, and a test that the built bundle has no `data:font` and resolves fonts from a sub-path. README sections:
   - the API;
   - installing in a host;
   - Filament SPA notes (`data-navigate-track`, `wire:ignore`);
   - CSP and Permissions-Policy;
   - browser support;
   - the HarmonyOS Sans notice.
7. **`examples/host/`** as described. Update `AGENTS.md` (`packages/embed` no longer planned) and `BACKWARD_COMPATIBILITY.md` (the Embed API row).

## 🧪 Hardware checks (Phase 3, maintainer)
1. Connect once from the chip and move between the three example pages, printing a single label on each. There must be no reconnect.
2. Bulk-print 3 rows with 2 copies: 6 labels, in order.
3. Start a 5-row batch and click a navigation link: the navigation is refused and the batch finishes.
4. Cancel during a 5-row batch: printing stops, and the printed count matches the labels.
5. Open the example in a second tab: the chip says "in use in another tab". Close the first tab, then connect from the second.
6. Turn the printer off: the chip shows disconnected. Turn it on, click the chip: connected again.
7. Reload the page: silent reconnect where supported, otherwise the chip offers to connect.

## 📝 Resolved assumptions (accepted by the maintainer on 2026-10-13)
| # | Question | Decision | Why |
|---|---|---|---|
| A1 | How does garazyn get the code before an npm release? | Copy the self-contained bundle (`dist/bundle/`) into its public assets | No npm release yet (#18); one file plus fonts, version pinned in the host. |
| A2 | UI technology | Custom elements with their own small CSS, themable through CSS variables. Refined after the spec review: in an open shadow root with constructed stylesheets and `::part()`, because Livewire morphs remove light-DOM children rendered client-side | Framework-free; fits Blade/Filament and anything else. |
| A3 | Battery | Refreshed after connect and after each batch, through the command queue; no polling | Keeps BLE quiet and never collides with printing. |
| A4 | Rows per call | At most 200 | Bulk actions on a page of a list; prevents accidental huge batches. |
| A5 | What is remembered | Density in `localStorage`; calibration and copies come from the host or the defaults | Simplest; the B1 default calibration is measured. |
| A6 | Test DOM | happy-dom (pinned dev dependency) | The element logic needs a DOM; vitest supports it per file. |
