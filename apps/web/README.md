# @spokospace/labels-web

The public web app: pick a template, see exactly what will print, and (in later phases) load data from an xlsx file or a JSON API and print on a NIIMBOT B1 from the browser. Built with Vite and plain TypeScript, no UI framework. Private: it exports no code.

> **Status: Phase 1 of `.ai/specs/2026-10-14-labels-web-app.md`.** The app shell, Polish and English, the built-in templates and the preview are in. Data loading, printing, the NIIMBOT import and deep links follow in later phases.

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
- `src/browser.ts`: the banners for a browser without Web Bluetooth (with Brave's flag) and for a page that is not HTTPS.
- `public/_headers`: the Cloudflare Pages headers (Content Security Policy, `Permissions-Policy: bluetooth=(self)` and others).
- `scripts/deploy.mjs`: the deploy, below.

Everything the user loads or a template holds is shown as text (`textContent`, built nodes), never as HTML.

## Fonts

Labels are drawn with HarmonyOS Sans (© Huawei Device Co., Ltd., HarmonyOS Sans Fonts License Agreement) and SIL OFL fonts. The footer shows "Font: HarmonyOS Sans © Huawei Device Co., Ltd.", as the agreement asks. The build copies `LICENSE-HarmonyOS-Sans.txt` and every `OFL-*.txt` into `dist/assets/`, next to the font files (a test checks it).

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
- `dist/` is missing or was built from another commit.

The custom domain is set in the Cloudflare dashboard, not here.

**Checking a deploy.** A deploy is done only when the live page shows the merged commit:
1. Open the production URL. The footer shows the version: the short commit and its date.
2. Compare it with `git rev-parse --short origin/main`.
3. `pnpm dlx wrangler@4.151.0 pages deployment list --project-name spoko-labels` lists the latest deployment.

If the footer shows an older commit, the deploy did not happen: run it again.
