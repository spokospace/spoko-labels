# Code review

Applied by `om-code-review` (and therefore `om-auto-review-pr`) in addition to its built-in checklist, and by human reviewers. Severity follows the pipeline's discipline: **blocker** (must fix before merge), **major** (should fix in this PR), **minor** (fine as a follow-up issue).

## Review priorities

1. **Correctness on real hardware** — a label that prints wrong, prints blank or hangs the printer is worse than a crash.
2. **Contracts** — anything listed in `BACKWARD_COMPATIBILITY.md`.
3. **Security and privacy** — the library runs inside other people's authenticated apps.
4. **Clarity** — small modules, typed boundaries, no cleverness the next reader has to reverse-engineer.

## Repository-specific checks

### Printer protocol and Bluetooth

- Protocol changes (packets, command order, timing, chunking) state in the PR which printer they were tested on. No hardware evidence → **blocker** for anything beyond refactors that provably keep the bytes identical (a test asserting the packet bytes counts).
- `requestDevice()` is called before any other `await` in a click handler (user gesture). Violations are a **blocker**: the chooser silently fails.
- Waiting for a reply ignores unsolicited `0xD3` packets and has a timeout; a reply that never comes ends in a readable error, never a hang.
- Errors shown to users are actionable ("printer is connected to a phone", "lid open") — not raw exceptions.

### Rendering and templates

- Output is pure black/white at 8 dots/mm; QR modules are whole dots. Changes to layout math come with golden-image tests (or deliberately updated ones, with before/after images in the PR).
- Template format changes follow `BACKWARD_COMPATIBILITY.md` (versioned, old templates still render or migrate).
- Text that does not fit is shrunk or wrapped as the template says — never silently cut, never drawn outside the label.

### Public API and packages

- Every exported symbol is intentional, typed, and documented in the package README.
- No new runtime dependency without a reason in the PR; prefer the platform (Canvas, Web Bluetooth, `fetch`).
- Packages do not import from each other's internals — only from their public entry points.

### Data and privacy

- Data the user loads (xlsx, API rows) stays in the browser unless a spec says otherwise; no telemetry.
- No personal data, real inventory, printer serials/MACs or private templates in code, fixtures, screenshots or docs.
- Fonts and other bundled assets carry a redistributable license.

### General

- TypeScript strict mode; no `any` without a comment saying why; no non-null assertions on data from the outside world.
- UI strings go through the i18n dictionary (PL + EN).
- The validation gate (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`) passes locally — CI is not relied on.
