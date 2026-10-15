# AGENTS.md

spoko labels prints labels on NIIMBOT label printers straight from the browser over Web Bluetooth (BLE). It is a pnpm + TypeScript monorepo: a printer protocol library, a label template engine (text, QR, lines; data bound to columns), an importer for templates designed in the NIIMBOT desktop app, an embeddable "print label" dialog for other web apps, and a public web app that loads data from xlsx files or an API. First hardware target: NIIMBOT B1 (203 dpi, 384-dot head, 50×30 mm labels). MIT licensed; code, docs, issues and PRs are in English.

## Status

`packages/core` (`@spokospace/labels-core`) is implemented and checked on a real NIIMBOT B1: packet codec, `Printer` (info, print with density, copies, calibration offset, abort), Web Bluetooth transport, and a manual hardware-check page (`pnpm --filter @spokospace/labels-core example`). `packages/render` (`@spokospace/labels-render`) is implemented too: template format v1, validation, rendering, bundled fonts and a demo page. `packages/niimbot` (`@spokospace/labels-niimbot`) reads templates out of the NIIMBOT app's database (`extractTemplates`), converts them and bundles the OFL fonts they use (`niimbotFonts`); an example page (`pnpm --filter @spokospace/labels-niimbot example`) reads a database file, previews and prints. The remaining packages are being ported from a prototype that lives outside this repo (Python + plain JS), package by package, through specs in `.ai/specs/`. `packages/embed` (`@spokospace/labels-embed`) prints from other web apps: a shared printer session, a status chip and a print dialog, shipped as a self-contained browser bundle (`pnpm --filter @spokospace/labels-embed bundle`) with an example host. `apps/web` (`@spokospace/labels-web`, private) is the public web app, built phase by phase from `.ai/specs/2026-10-14-labels-web-app.md`: the app shell, i18n, the built-in templates, the preview, data loading (sample rows, xlsx, a JSON API, column mapping, search and row selection), printing (embed's chip and print dialog, calibration settings, the printer help; hardware check pending) and the import from the NIIMBOT desktop app (templates kept in `localStorage`) are in (`pnpm --filter @spokospace/labels-web dev`); template JSON files and deep links follow. Paths below marked *(planned)* do not exist yet — create them as the spec says, do not invent a different layout.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| Printer protocol, BLE connection (`packages/core`) | `.ai/specs/2026-10-12-labels-core-protocol-and-ble.md`, `packages/core/README.md`, `BACKWARD_COMPATIBILITY.md` | Packets are `55 55 CMD LEN DATA… CHK AA AA`, `CHK = XOR(CMD, LEN, DATA…)`. Skip unsolicited `0xD3` ("line check") packets when waiting for a reply. `navigator.bluetooth.requestDevice()` must be the first `await` after a click — anything awaited before it loses the user gesture. Silent reconnect (`getDevices()`) is optional browser support, never required. Any protocol change needs a hardware check on a real printer, stated in the PR. |
| Template rendering (`packages/render`) | render spec, `BACKWARD_COMPATIBILITY.md` (template format) | 8 dots per mm; output is thresholded to pure black/white (`< 128` = black). QR modules are whole dots. Template geometry is in mm. Rendering changes must keep the golden-image tests passing or update them deliberately with before/after images in the PR. |
| Niimbot template import (`packages/niimbot`) | import spec, `BACKWARD_COMPATIBILITY.md` (import output) | The 1.65× letter-spacing factor, the font-code table and every other Niimbot quirk live in this package, never in the render format. Any change to the output for the same input (mapping, rounding, the font table) updates the snapshot deliberately and gets a changelog entry. Fixtures are made up: never commit templates exported from a real app. Niimbot `fontSize` is the em size in mm; its `letterSpacing` renders ~1.65× wider than the stored value (measured on app thumbnails). Field bindings like `C0` mean "column C of the data source". Treat the Niimbot data format as unstable: parse defensively, fail per template, never crash the whole import. |
| Embeddable printing (`packages/embed`) | `.ai/specs/2026-10-13-labels-embed.md`, `packages/embed/README.md`, `BACKWARD_COMPATIBILITY.md` (Embed API) | No framework dependency in the public API. Everything the host passes is data (template + rows + columns); the package fetches and sends nothing. `session.connect()` must be reached straight from a click. Every printer command goes through the session's queue (labels-core rejects a second command while one runs). The bundle must keep fonts as files next to it (a test checks it). |
| Web app (`apps/web`) | `.ai/specs/2026-10-14-labels-web-app.md`, `apps/web/README.md` | Data the user loads (xlsx, API responses) stays in the browser unless a spec says otherwise. UI strings go through the i18n dictionary (PL + EN). Works on Chrome/Edge desktop and Android; show a clear message elsewhere (no Web Bluetooth on iOS/Firefox; Brave needs a flag). Show everything loaded as text (`textContent`, built nodes), never through `innerHTML`. Rows from files and APIs are built with `Object.fromEntries` and read with `Object.hasOwn` (a column can be named `__proto__`). Package error, issue and import codes are worded in typed `Record` dictionaries, so a new code fails `pnpm typecheck`. Deploys are manual (`deploy:pages`), never from CI. |
| Fonts and bundled assets | `LICENSE`, the asset's own license | Only redistribute fonts whose license allows it (e.g. SIL OFL) and keep the license file next to the font. |
| Tooling, CI, release | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js` | pnpm only. Pin new dependencies to versions that have been out for at least a week. Do not rely on GitHub Actions for validation; run the validation gate locally. |
| Agent pipeline, labels, process | `SDLC.md`, `.ai/agentic.config.json`, `.ai/trackers/github.md` | Follow the label state machine and the claim protocol in `SDLC.md`. |

## Never commit

- Personal templates, real product/tool data, printer serials or MAC addresses. Examples and fixtures are made up.
- Fonts or other assets without a redistributable license.
- Secrets or tokens of any kind.

## Validation gate

Run in this order before every PR (see `SDLC.md`):

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Related documents

- `SDLC.md` — ticket flow, labels, claim protocol
- `CODE_REVIEW.md` — review rules applied by `om-code-review`
- `BACKWARD_COMPATIBILITY.md` — protected contract surfaces
- `.ai/agentic.config.json` — pipeline configuration read by every `om-*` skill
