# @spokospace/labels-web

The public web app: pick a template, load data from an xlsx file or a JSON API, see exactly what will print, and (in a later phase) print on a NIIMBOT B1 from the browser. Built with Vite and plain TypeScript, no UI framework. Private: it exports no code.

> **Status: Phases 1 and 2 of `.ai/specs/2026-10-14-labels-web-app.md`.** The app shell, Polish and English, the built-in templates, the preview and the data (sample rows, xlsx files, a JSON API, column mapping, search and row selection) are in. Printing, the NIIMBOT import and deep links follow in later phases.

## Running it

```bash
pnpm install
pnpm --filter @spokospace/labels-web dev       # http://localhost:5173
pnpm --filter @spokospace/labels-web build     # writes apps/web/dist/
pnpm --filter @spokospace/labels-web preview   # serves dist/
```

Nothing has to be built first: `vite.config.ts` resolves the four workspace packages to their sources (`packages/<name>/src/index.ts`), and Vite copies the fonts they reference as hashed assets.

## What is where

- `index.html`, `src/main.ts`: the page and its wiring.
- `src/i18n/`: `en.ts` and `pl.ts` (the same keys, checked by type), `t()`, the language switch, and the wording of every code the packages report (`ErrorCode`, the embed outcome codes, `IssueCode`, the NIIMBOT import codes), typed so that a new code fails `pnpm typecheck` until it is worded.
- `src/templates/builtin.ts`: the built-in templates and their sample rows. Everything in them is made up. Their ids (`product`, `address`, `tool`, `upright`) will be part of the deep-link contract.
- `src/preview.ts`, `src/overlay.ts`: the preview at exact dots, with the label shape, the safe area and the strips outside the 48 mm print head, the worded render warnings and a text alternative for the canvas.
- `src/data/`: loading and shaping data, without the DOM.
  - `xlsx.ts`: the first sheet of an xlsx file, through `read-excel-file` (loaded on demand). The first row names the columns (an empty name becomes "Column C", a repeated one "Name (2)"); cells become text (numbers with `String(n)`, dates as `YYYY-MM-DD` in UTC). Files over 10 MB are not read; at most 10,000 rows are kept, with a notice. The archive is inflated on the page and handed over uncompressed, because read-excel-file's unzipper would otherwise start a blob: Web Worker for large sheets, which the CSP blocks. The bytes actually inflated are counted (not the sizes the zip headers claim), and a file that unpacks to over 256 MB is refused.
  - `api.ts`: a JSON API: `GET`, `credentials: "omit"`, no custom headers, HTTPS only (`http://localhost` and `http://127.0.0.1` in `vite dev` only), a 15 s timeout, Cancel, and a 10 MB cap counted on the streamed body. The rows are an array at the top level or at a dot path (`data.items`); the columns are the union of the keys; nested values become JSON text. Only the URL without its query, fragment and credentials is remembered, with the path.
  - `mapping.ts`: the column pickers' logic. Fields bound by name get row keys of that name; fields bound by position (NIIMBOT imports) get a row key of their own per position (`"\u0000pos-0"`, …), listed in `columns`, so they never collide with a bind name or a source column; a field with no pick has no row key, so render reports `missing-column` and it prints empty.
  - `search.ts`: search over every column, ignoring case and diacritics.
  - `table.ts`: the shared row shape. Rows are built with `Object.fromEntries` and read with `Object.hasOwn`, so a column named `__proto__` is an ordinary column.
- `src/data-panel.ts`: the Data panel: the source buttons, the URL form, the pickers, the search and the row table (checkboxes, "select all shown", the count and the 200-label limit, arrows and space on the keyboard, a list on phones). The data stays in memory; nothing loaded is stored.
- `src/browser.ts`: the banners for a browser without Web Bluetooth (with Brave's flag) and for a page that is not HTTPS.
- `public/_headers`: the Cloudflare Pages headers (Content Security Policy, `Permissions-Policy: bluetooth=(self)` and others).
- `scripts/deploy.mjs`: the deploy, below.

Everything the user loads or a template holds is shown as text (`textContent`, built nodes), never as HTML.

## Fonts

Labels are drawn with HarmonyOS Sans (© Huawei Device Co., Ltd., HarmonyOS Sans Fonts License Agreement) and SIL OFL fonts. The footer shows "Font: HarmonyOS Sans © Huawei Device Co., Ltd.", as the agreement asks. The build copies `LICENSE-HarmonyOS-Sans.txt` and every `OFL-*.txt` unchanged into `dist/licenses/` (a test checks it); the footer's font notice links to the HarmonyOS Sans license. They are not in `dist/assets/`, which is cached for a year as immutable and suits hashed file names only.

## Deploying (Cloudflare Pages, by hand)

Nothing deploys from CI: GitHub Actions do not run on this account, so merging a pull request does not change the live site. The maintainer deploys from their own machine.

One time: log in to Cloudflare with the same pinned wrangler the script uses.

```bash
pnpm dlx wrangler@4.151.0 login
```

Each deploy, from an up-to-date checkout of `main`:

```bash
git switch main && git pull
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm --filter @spokospace/labels-web run deploy:pages
```

The script is `deploy:pages`, not `deploy`: `pnpm --filter … deploy` would run pnpm's own `deploy` command. It runs `pnpm dlx wrangler@4.151.0 pages deploy dist --project-name spoko-labels --branch main`, and refuses, with a message, when:
- the working tree has uncommitted or untracked files;
- `HEAD` is not `origin/main` (after `git fetch origin main`);
- `dist/` is missing, was built from another commit, or was built from a tree with uncommitted changes (its commit is marked `-dirty`).

The custom domain is set in the Cloudflare dashboard, not here.

**Checking a deploy.** A deploy is done only when the live page shows the merged commit:
1. Open the production URL. The footer shows the version: the short commit and its date.
2. Compare it with `git rev-parse --short origin/main`.
3. `pnpm dlx wrangler@4.151.0 pages deployment list --project-name spoko-labels` lists the latest deployment.

If the footer shows an older commit, the deploy did not happen: run it again.
