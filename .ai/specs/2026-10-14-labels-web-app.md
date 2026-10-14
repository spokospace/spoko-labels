# Web app and demo (`apps/web`)

> Status: draft design for #12, written by `om-auto-write-spec`. D1–D8 come from the maintainer. A1–A16 are autonomous defaults, open for override before merge. The maintainer confirmed A15 (the deep-link format) in chat on 2026-10-14.

## 📝 TLDR
Anyone with a NIIMBOT B1 should be able to open a web page and print labels from their own data, with nothing to install.

Today the packages can do it, but only through developer example pages (`packages/*/examples/`). Each covers one piece, in English, with no data loading.

Proposed (future behavior): a public web app in `apps/web`, built with Vite and plain TypeScript and hosted on Cloudflare Pages. Its first screen is the demo:
- pick one of several made-up 50 × 30 mm templates, or a template imported from the NIIMBOT desktop app;
- see the exact black and white dots that will print, with the label's rounded corners and the safe area;
- load data from an xlsx file or a JSON API URL, search it and pick rows;
- connect the printer and print, with copies, density and calibration.

Everything the user loads stays in the browser. The app reuses `labels-core`, `labels-render`, `labels-niimbot` and the public API of `labels-embed`. It adds no new package API.

## 📝 Problem Statement
- **There is no app.** The packages are libraries. A user who is not a developer cannot print with them.
- **The example pages are not for users.**
  - The render demo (`packages/render/examples/demo/`) has templates and a preview, but no data loading.
  - The import page (`packages/niimbot/examples/import/`) reads the NIIMBOT database, but shows raw JSON.
  - The hardware check (`packages/core/examples/hardware-check/`) is a test bench.
  - All three are English only.
- **Connecting is the hard part for users.** Web Bluetooth works only in some browsers. Brave hides it behind flags. A printer still connected to the NIIMBOT phone app cannot be found. A first print may land a little off the label. Each of these needs a plain message, not an error code.
- **The demo shows what the project can do.** The maintainer asked for a public demo with several templates, a preview, the NIIMBOT import and printing (issue #12).

## 📝 Resolved decisions (maintainer)
| # | Decision | Source |
|---|---|---|
| D1 | Vite and plain TypeScript, no UI framework, in `apps/web`. | maintainer, #37 (embed spec D6), #12 run |
| D2 | Hosting on Cloudflare Pages, deployed by hand with `wrangler`. GitHub Actions are not available on this account, so nothing relies on CI. | maintainer |
| D3 | The demo templates are made up. No maintainer templates, data or printer details are committed. | maintainer, `AGENTS.md` |
| D4 | The app reuses `labels-core`, `labels-render` and `labels-niimbot`. It imports NIIMBOT templates from the app's `.isar` database file, as `packages/niimbot/examples/import` does. It may reuse the session and dialog pieces of `labels-embed`. | maintainer |
| D5 | Data comes from an xlsx file, parsed in the browser, or from a JSON API URL. It stays in the browser. | maintainer, `AGENTS.md` |
| D6 | The printer messages cover: Web Bluetooth support; Brave's flags; closing the NIIMBOT phone app; calibration (`offsetMm`); density. For Brave, `brave://flags/#brave-web-bluetooth-api` must be Enabled. `#enable-web-bluetooth-new-permissions-backend` turns on silent reconnect after a reload. The maintainer checked this on Brave 1.97. Chrome and Edge have the same permissions-backend flag. | maintainer |
| D7 | Templates support `printRotation` and QR `align` / `verticalAlign` (template v1, merged in #36 and #39). | maintainer |
| D8 | UI strings go through an i18n dictionary, Polish and English. Chrome and Edge on desktop and Android are supported; other browsers get a clear message. | `AGENTS.md`, #12 |

## 📝 Resolved assumptions (autonomous defaults)
| # | Question | Default | Why | Confirm? |
|---|---|---|---|---|
| A1 | One spec, or split the app, the demo and the deploy? | One spec. The demo is the app's first screen, and the deploy is a documented manual step. | Neither part works without the other. Each phase below still ships on its own. | reversible |
| A2 | How does the app print? | Through the public `labels-embed` API: `printerSession`, `<spoko-printer-status>` and `printLabels()`, imported from the package entry. The app calls `defineElements()` once at start-up and never loads the bundle too. | The connection, the queue, the Web Lock, progress, cancel and the error wording already exist and are checked on a B1. It adds no new contract. | reversible |
| A3 | xlsx parser | `read-excel-file` (MIT), pinned, loaded only when the user picks a file. The first sheet is read, and its first row holds the column names. | Small and kept up to date. The npm build of SheetJS is out of date and has open advisories. | reversible |
| A4 | Shape of the JSON API response | An array of objects, or an object holding such an array at a path the user gives (for example `data.items`). Nested values are shown as JSON text. | Covers most APIs without a mapping language. | reversible |
| A5 | API requests | `GET` only, `credentials: "omit"`, no custom headers, HTTPS only. The API must allow CORS. There is no proxy. | Nothing secret is stored in the app, and no data passes through a server (D5). | reversible |
| A6 | Matching data columns to a template | Each template field gets a column picker. Pickers match column names automatically, ignoring case and diacritics. For templates imported from NIIMBOT, which bind by position, the pickers set the column order. | The user's sheet rarely uses the template's column names. | reversible |
| A7 | What is remembered in the browser | In `localStorage`: language, last template, imported templates, calibration and the API URL with its path. The data itself is never stored; it lives in memory until the tab closes. All access is wrapped in try/catch. | Nothing personal is kept. A reload costs one click to load the data again. | reversible |
| A8 | Template editing | No visual editor. A template can be loaded from a JSON file, and copied or downloaded as JSON. | An editor is a project of its own. JSON covers garazyn and other hosts. | reversible |
| A9 | Copies | One copies value for the whole print, in the embed dialog. | It is what the dialog does today. Copies per row can come later. | reversible |
| A10 | Rows per print | At most 200 (embed's `MAX_LABELS`). Selecting more shows a message and disables Print. | Embed's limit, which guards against accidental huge batches. | reversible |
| A11 | Printer models | B1 only (`B1` from `labels-core`); preview width 48 mm. | The only model checked. | reversible |
| A12 | Language | Polish when `navigator.language` starts with `pl`, otherwise English. A switch in the header changes it and is remembered. | Matches the user base. | reversible |
| A13 | Calibration and density | Calibration (`offsetMm` x and y, in mm) is set in a Printer settings panel with the B1 default (0 / 0.5 mm). It is remembered and passed to `printLabels`. Density is set in the dialog, which remembers it. | Reuses the dialog. Calibration belongs to the printer and roll, not to a print. | reversible |
| A14 | Size limits | xlsx files up to 10 MB, API responses up to 10 MB, at most 10,000 rows, the NIIMBOT database up to 64 MB (as `extractTemplates` allows). | Keeps a phone responsive. Real files are far smaller. | reversible |
| A15 | The deep-link format (`#add=…`) | `#template=<id>` selects a template. `#add=<base64url of a JSON object or an array of objects>` adds rows to the selection. Both open the app with a preview and never print by themselves. | `BACKWARD_COMPATIBILITY.md` already protects web-app deep links. The earlier prototype (`niimbot-b1-bt`) has no deep links, so there is no older format to accept. | Confirmed by the maintainer, 2026-10-14 |
| A16 | Deploy target | Cloudflare Pages project `spoko-labels`, deployed with a pinned `wrangler` run through `pnpm dlx`. The custom domain is set by the maintainer in the Cloudflare dashboard. | Nothing to install in the workspace. The domain is an account choice, not a code change. | reversible |

Deferred (not in this spec): CSV files, a visual template editor, other printer models and label sizes, reading the roll's RFID to pick a template, offline use (PWA), copies per row, API authentication.

## 📝 Proposed Solution
### Screen
One page, one column on a phone and two on a desktop:
- **Header.** App name, the printer status chip (`<spoko-printer-status>`), a printer settings button and the PL / EN switch.
- **Template.** A list of templates: the built-in ones, then the imported ones. Buttons: "Import from NIIMBOT app", "Load JSON", "Copy JSON", "Download JSON".
- **Preview.** The current row on the selected template, at exact dots, in the design orientation. It shows:
  - the label's shape, with its rounded corners;
  - the safe area as a dashed line;
  - the strips the 48 mm head does not cover, shaded;
  - the render warnings in plain words.
  It is drawn the way the render demo draws it. That code is copied into the app and adapted; the render demo stays as it is.
- **Data.** "Use sample data", "Open xlsx file" and "Load from URL". Then:
  - the column pickers (A6);
  - a search box, matching any column and ignoring case and diacritics;
  - a table of rows with checkboxes, "select all shown" and a count, "3 selected".
  Clicking a row previews it.
- **Print.** "Print selected (3)" opens the embed dialog with the mapped rows, the template, its column order and the calibration. With nothing selected, it prints the previewed row.
- **Footer.** "Font: HarmonyOS Sans © Huawei Device Co., Ltd." (the license's notice), links to the source and to the help.

### Templates
- **Built-in.** Three or four made-up 50 × 30 mm templates: a product label, an address label, a tool or inventory label with a QR code, and one designed upright with `printRotation`. Each has made-up sample rows. They live in `apps/web/src/templates/` as TypeScript and are checked by `validateTemplate()` in a test.
- **Imported from NIIMBOT.**
  - The user picks `niimbot_db.isar`. The help shows where Windows keeps it, and says to close the app first.
  - `extractTemplates()` and then `importTemplates()` run in the page.
  - A result list shows each template with a small preview, its warnings and the failures, in plain words.
  - The user ticks the templates to keep. They are saved in `localStorage` with the name and the import date. Each can be removed.
- **From a JSON file.** The file goes through `validateTemplate()`. Errors are listed; the template is kept only if it is valid.

### Data
- **xlsx.**
  - `read-excel-file` is loaded on demand.
  - The first sheet's first row gives the column names. Empty and duplicate names become `Column C` and `Name (2)`.
  - Cells become text: numbers as written, dates as `YYYY-MM-DD`.
- **JSON API.**
  - `fetch(url, { credentials: "omit" })`, with a 15 s timeout and a 10 MB cap.
  - The array comes from the top level or from the given path (A4). The columns are the union of the object keys, in order of first appearance.
  - A "Reload" button fetches again.
- **Sample data.** Each built-in template has its own sample rows, so the demo works without a file.
- **Mapping.** The app builds the input from the pickers. The source data is not changed. `render()` and `printLabels` receive the same input:
  - **Templates that bind by name** (`bind`): `rows` are keyed by the template's bind names, each holding the picked column's value. No `columns`.
  - **Templates that bind by position** (`bindIndex`, NIIMBOT imports): `rows` are keyed by the source column names, and `columns` lists the picked column names in template position order (position 0 first). An unpicked position gets a placeholder name that no row has, so render reports `missing-column`.
  - A template that uses both gets both.

### Printer
- **Connecting.** The chip and the dialog own connecting. The app calls `printerSession.tryReconnect()` on load.
- **Help panel ("Printer help").** It opens from a help button next to the chip, and from a banner the app shows for what it can see. The app cannot add links inside the chip or the dialog (their shadow DOM is embed's), so it shows the banner:
  - on a session `statechange` to `unsupported` or `busy-elsewhere`;
  - when `printLabels` resolves with `outcome.error.code`, for example `device-unreachable`, the banner says what failed and links to the matching help section.
  A connect from the chip that fails gives the app no code, so the help button stays visible at all times. It covers:
  - **Browser support.** Chrome or Edge on a computer or Android. iOS and Firefox cannot print. The preview still works there.
  - **Brave.** Open `brave://flags`, set "Web Bluetooth API" (`#brave-web-bluetooth-api`) to Enabled, and restart. Optional: "Use the new permissions backend for Web Bluetooth" (`#enable-web-bluetooth-new-permissions-backend`) keeps the printer connected after a reload. Chrome and Edge have the same optional flag, under `chrome://flags` and `edge://flags`.
  - **The phone app.** Close the NIIMBOT app on the phone, or turn the phone's Bluetooth off. A printer connected to a phone does not appear in the list.
  - **Calibration.** If the top or bottom of the print is cut, change the vertical offset. Raise it if the top is cut, lower it if the bottom is. The horizontal offset moves the print right.
  - **Density.** Higher is darker. 3 is the default; 4 or 5 suit thin text.
- **Detection on load.**
  - No `navigator.bluetooth`: a banner. In Brave (`navigator.brave`) the banner points to the flag; elsewhere it names the supported browsers.
  - Not a secure context: a banner (only possible on a misconfigured host).
- **Settings panel.** Calibration x and y in mm, within the ranges `Printer.print()` accepts (`x` −8 to 8 mm, `y` 0 to 10 mm). Those limits are not exported, so the app repeats them, and a test pins them against a print that `labels-core` rejects. There is a "Reset to default" button and a link to the help. Saved in `localStorage`; a saved value outside the limits, or not a number, falls back to the default on load.

### Deep links (A15, confirmed)
- `#template=<id>` selects a built-in template, or an imported one by its saved id. Imported ids are namespaced (`imp-…`), so they never equal a built-in id. An unknown id opens the default template with a notice.
- `#add=<base64url JSON>` adds one row (an object) or several (an array, at most 200), selected. The link rows become their own data source, "Rows from the link", which replaces the current source the way opening a file does. Its columns are the union of the keys; mapping and search work on it as on any source.
- A hash longer than 32 kB is not read ("This link is too long").
- Values are only shown and rendered: never inserted as HTML, never fetched, never printed without a click.
- A broken link shows "This link could not be read" and the app opens normally.
- After reading, the hash is cleared with `history.replaceState`, so a reload does not add the rows again.

### i18n
- `apps/web/src/i18n/pl.ts` and `en.ts` export the same keys, checked by type.
- A test checks that every key, every render issue code, every NIIMBOT import warning and failure code, and every `labels-core` error code has text in both languages.
- `<html lang>` follows the chosen language, so the embed dialog uses the same one.

### Delivery
- **Build.** `pnpm --filter @spokospace/labels-web build` runs `vite build` to `apps/web/dist/`. It runs inside the root `pnpm build`, so it is part of the validation gate.
- **Fonts.** Font files are copied as hashed assets by Vite, through the `new URL(…, import.meta.url)` references in `labels-render` and `labels-niimbot`. The license files are copied next to them.
- **Headers.** `apps/web/public/_headers` (Cloudflare Pages) sets:
  - `Content-Security-Policy`: `default-src 'self'`; `connect-src 'self' https:` (the user's API); `img-src 'self' data: blob:`; no `unsafe-inline` scripts;
  - `Permissions-Policy: bluetooth=(self)`;
  - `Referrer-Policy: no-referrer`;
  - long caching for `/assets/*`.
  The app starts no workers. Phase 2 checks the built `dist/` under the real headers (`wrangler pages dev dist`): an xlsx file loads, the fonts load and no CSP error appears in the console.
- **Deploy** (manual, from the maintainer's machine):
  ```bash
  pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
  pnpm --filter @spokospace/labels-web deploy   # pnpm dlx wrangler@<pinned> pages deploy dist --project-name spoko-labels
  ```
  The README in `apps/web` lists the commands and the one-time `wrangler login`. A deploy is done only when the live page matches the merge: open the production URL, compare the footer's commit with `git rev-parse --short origin/main`, and check `wrangler pages deployment list`. If they differ, the deploy did not happen; run it again.
- **Version in the footer.** The build writes the short commit hash and the date into the page. A deploy can then be checked against the merged commit.

Alternatives rejected:
- **An in-page print flow on `printerSession.printBatch`.** It is not part of the Embed API contract, and it would duplicate the dialog.
- **A UI framework.** The maintainer chose plain TypeScript (D1). The screen is small.
- **A server-side proxy for APIs without CORS.** Data would leave the browser (D5).
- **SheetJS from its own CDN.** It would be the only dependency served from outside npm.

## 📝 Architecture
```
apps/web (new)
 ├─ templates (built-in, imported, JSON) ── labels-niimbot: extractTemplates, importTemplates, niimbotFonts
 ├─ data (sample, xlsx via read-excel-file, JSON API) ── column mapping ── rows + columns
 ├─ preview ── labels-render: validateTemplate, render, loadFonts, bundledFonts
 ├─ print ── labels-embed: printLabels (dialog), printerSession, <spoko-printer-status>
 │                                    └── labels-core: Printer, WebBluetoothTransport, B1 ── BLE ── B1
 └─ i18n, help, settings, deep links
```
Takeaway: the app is a consumer of the four packages' public entry points. No package changes and no new export are needed; the one value core does not export (the calibration limits) is repeated in the app and pinned by a test.

Layout of `apps/web`:
- `index.html`, `vite.config.ts`, `package.json` (`@spokospace/labels-web`, `private: true`).
- `src/main.ts`: start-up, wiring and state.
- `src/state.ts`: a small store (current template, data, mapping, selection) with change events.
- `src/templates/`: built-in templates and sample rows, and the template store (imported templates in `localStorage`).
- `src/data/`: `xlsx.ts`, `api.ts`, `mapping.ts`, `search.ts`.
- `src/preview.ts`: rendering and drawing the preview with its overlays.
- `src/niimbot-import.ts`: the import flow and its result list.
- `src/printer.ts`: the chip, the help, the settings and the `printLabels` call.
- `src/deeplink.ts`: parsing and applying the hash.
- `src/i18n/`: the dictionaries and `t()`.
- `public/_headers`.
- `test/`: unit tests, and made-up fixtures (a small xlsx, API JSON).

## 📝 API Contracts
The app exports no code. Its contracts are:
- **Deep links** (A15, confirmed). `#template=<id>` and `#add=<base64url JSON>`, combined as `#template=tool&add=…`. The "Web app deep links" in `BACKWARD_COMPATIBILITY.md` lists these parameters. After that, removing or renaming one needs at least one minor release in which the old form still works.
- **The JSON API input** (A4). `GET <url>` returns `T[]`, or an object with `T[]` at the given path, where `T` is a flat object. It is documented in the app's help. It is not a protected surface.
- **Stored templates.** They are template v1 JSON, already protected by the template format row.

## 📝 UI/UX
- **States.** Each one is in the dictionary:
  - no data yet ("Use sample data or open a file");
  - loading a file or URL, with a spinner and Cancel for the URL;
  - an empty search result;
  - errors for a file, a URL, CORS, too large, or no rows;
  - a NIIMBOT import with nothing found, explained with the file location;
  - no Bluetooth, with the help.
- **Accessibility.**
  - Every control has a label.
  - The row table works with the keyboard: arrows move, space selects.
  - Status changes are announced (`aria-live`).
  - The preview canvas has a text alternative that lists the label's texts.
  - The embed dialog brings its own focus handling.
- **Phone.** One column. The preview is at the top. The table becomes a list. The Print button stays at the bottom of the screen.
- **Unsupported browser.** Everything except connecting and printing works, so a user can check the templates and the data before switching browsers.

Prototype: none. Mockups were skipped in this run; see the PR.

## 📝 Edge Cases & Failure Scenarios
| Case | What the user sees |
|---|---|
| No Web Bluetooth (iOS, Firefox) | A banner and help. Preview works; Print is disabled. |
| Brave with the flag off | A banner pointing to `brave://flags/#brave-web-bluetooth-api`. |
| Printer connected to the phone app | The embed message ("close the NIIMBOT app") in the dialog. After it closes, the app's banner links to the help. |
| Loading a URL is cancelled, or takes over 15 s | "Loading stopped" or "The server did not answer in 15 s"; the previous data stays. |
| xlsx over 10 MB, NIIMBOT file over 64 MB | "This file is too large (limit …)"; nothing is read. |
| Saved state no longer valid on a later visit (a template id gone, calibration out of range, a stored template that fails validation) | Falls back to the default template or calibration; an invalid stored template is listed as broken, with Remove. |
| An unknown `#template` id | The default template, with a notice. |
| A new deploy while a batch prints | The open tab keeps the code it loaded; the batch finishes. The next reload gets the new version. |
| Silent reconnect not available | The chip offers Connect. The help mentions the optional flag. |
| xlsx that is not an xlsx, or is password-protected | "This file could not be read as an xlsx file." |
| An xlsx with an empty first sheet | "No rows found in the first sheet." |
| More than 10,000 rows | The first 10,000 load, with a notice. |
| API blocked by CORS (a `TypeError` on fetch) | "The server does not allow this page to read it (CORS)", with a short explanation. |
| API returns HTML or an error status | The status code, or "The response is not JSON". |
| The array path does not exist | "No list found at `data.items`", showing the top-level keys. |
| A template field with no mapped column | Render's `missing-column` warning, worded; the field prints empty. |
| A NIIMBOT file with no templates | `no-templates-found`, worded, with where the file lives. |
| Imported template fails (`unknown-size` and others) | Listed with the reason. The other templates import. |
| `localStorage` full or blocked | Imported templates stay for this tab only, with a notice. Nothing else breaks. |
| More than 200 rows selected | "You can print at most 200 labels at once"; Print is disabled. |
| A broken `#add` link | "This link could not be read"; the app opens normally. |
| Printing in another tab of the app | The chip shows "in use in another tab" (embed's Web Lock). |

## 📝 Risks & Impact Review
- **Deep links become a contract** once published (A15, confirmed). This is the only hard-to-reverse choice here.
- **Data privacy.** Rows stay in memory. The only network requests are the app's own assets and the API URL the user types. There is no analytics or telemetry. The CSP keeps scripts to the app's origin.
- **Reliance on the Embed API.** The app relies on the Embed API's surface only, so an embed change that breaks the app also breaks the hosts. That is already governed by `BACKWARD_COMPATIBILITY.md`.
- **Deploys are manual.** A merged PR is not live until the maintainer runs the deploy. The footer's commit hash makes the deployed version visible.
- **Brave and the flags.** Flag names change between browser versions. The help text names the version it was checked on (Brave 1.97) and is updated when a report comes in.
- **Fonts.** The HarmonyOS Sans notice is in the footer and in the dialog. The OFL licenses ship next to the fonts.

## 📋 Phasing
1. **App shell and templates.** Scaffold, i18n, built-in templates, preview, browser banners, `_headers`, the deploy script and README. It ships as a working template showcase.
2. **Data.** Sample data, xlsx, JSON API, column mapping, search and selection.
3. **Printing.** The chip, `printLabels`, the settings panel and the help. The hardware check follows.
4. **NIIMBOT import and template files.** Import, the template store, and loading and copying JSON.
5. **Deep links.** It updates `BACKWARD_COMPATIBILITY.md`.

## 📋 Implementation Plan
### Phase 1: app shell and templates
1. Scaffold `apps/web`: `@spokospace/labels-web`, private, Vite 8.3.4 (the version already in the lockfile), workspace dependencies on the four packages. `tsconfig` extends the base. ESLint already covers it. Update the `AGENTS.md` web app row (`apps/web` no longer planned). The gate is green with an empty page.
2. i18n: `pl.ts` and `en.ts`, `t()`, language detection and the switch. Test: both dictionaries have the same keys, and detection works.
3. Built-in templates and sample rows. Test: each one passes `validateTemplate()` with no issues, and renders without warnings for its sample rows.
4. Preview: render, the overlays and the warnings list. Test: the overlay geometry for rectangle, rounded and circle shapes and for a `printRotation` 90 template, using `@napi-rs/canvas` in Node, as `labels-render`'s tests do (a pinned dev dependency of the app).
5. Browser banners (no Bluetooth, Brave, insecure). Test: the detection logic on fake `navigator` objects.
6. `_headers`, the version in the footer, the `deploy` script and the README with the manual deploy steps.

### Phase 2: data
7. `xlsx.ts`: header handling, cell conversion, the limits. Test: a small made-up fixture with duplicate or empty headers, dates and numbers.
8. `api.ts`: fetch with a timeout, the size cap, the array path, column union and errors. Test: a mocked `fetch`, covering CORS-like failures, HTML responses and a missing path.
9. `mapping.ts`: automatic matching (case and diacritics), and both bind-by-name and bind-by-position templates. Test.
10. `search.ts` and the row table with selection, the 200 limit and keyboard use. Test in happy-dom.

### Phase 3: printing
11. `defineElements()` at start-up, the chip in the header, `tryReconnect()` on load, and the Print button calling `printLabels` with the mapped rows, the columns and the calibration. Test: the `PrintRequest` built from the state for a bind-by-name and a bind-by-position template, with a stubbed `printLabels`; the error banner for an `outcome.error.code`.
12. The settings panel (calibration, its limits, reset, storage). Test, including `localStorage` failures.
13. The help panel, with links from banners and errors. Test: every `labels-core` error code links to a help section.
14. Hardware check on a B1 (below).

### Phase 4: NIIMBOT import and template files
15. The import flow: file input, size check, extract, import, the result list with worded warnings and failures, selection and saving. Test: made-up `NiimbotTemplate` input, through the same path as the page.
16. The template store: save, list, remove, and an id that stays stable. Load, copy and download JSON. Test.

### Phase 5: deep links
17. `deeplink.ts`: parse, validate, apply, clear the hash. Tests: valid and broken links, an unknown template id, a hash over 32 kB, more than 200 rows, and that it never prints. Add the parameters to the "Web app deep links" row of `BACKWARD_COMPATIBILITY.md`.

Phases 1–4 form a complete app without Phase 5, and can be deployed without it.

Message coverage: the Edge Cases rows whose message comes from the app (not from embed) are tested in happy-dom in the step that adds them. The rows that need a real browser or printer (Brave, the phone app, Android) are manual, in the hardware checks.

## 🧪 Hardware checks (Phase 3, maintainer)
1. In Chrome on a computer, pick the tool template and use the sample data. Connect from the chip and print one label. It must match the preview.
2. Select 3 rows and print 2 copies: 6 labels, in order.
3. Set the vertical calibration to 1.5 mm and print again: the print moves down by 1 mm compared with step 1.
4. With the NIIMBOT phone app connected to the printer, try to connect. The help message about the phone app appears.
5. In Brave with the flag off, open the app: the banner points to the flag. Turn it on, restart, connect and print.
6. On Android in Chrome, load a made-up xlsx file and print one label.

## 🔍 Review notes
A fresh-context review ran on this spec before the PR. It found that the calibration limits are not exported, that the app cannot put help links inside the embed elements, and that the mapping, the deep-link rules and some failure modes were unclear. All twelve findings are folded in above.
