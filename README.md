# spoko-labels

Print labels on NIIMBOT label printers straight from the browser — no driver, no desktop app, no phone. Over Web Bluetooth.

> Work in progress. The first target is the NIIMBOT B1; the packages below are being built.

## What it will do

- **Print from the browser** over Web Bluetooth (Chrome/Edge on desktop and Android).
- **Render label templates** — text, QR codes, lines — with fields bound to your data.
- **Import templates you designed in the NIIMBOT desktop app**, so existing designs keep working.
- **Load data** from an xlsx file or any JSON API, search it, pick rows, print.
- **Embed a "Print label" dialog** in your own web app.

## Packages

| Package | Purpose |
|---|---|
| `@spokospace/labels-core` | printer protocol and Web Bluetooth connection |
| `@spokospace/labels-render` | label template engine |
| `@spokospace/labels-niimbot` | import templates from the NIIMBOT desktop app |
| `@spokospace/labels-embed` | drop-in "Print label" dialog for other apps |
| `apps/web` | the public web app |

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Contributions follow [SDLC.md](SDLC.md); AI agents start with [AGENTS.md](AGENTS.md).

## Acknowledgements

The agent skills in `.claude/skills/` (the `om-*` spec, implementation, review and merge pipeline described in [SDLC.md](SDLC.md)) come from [open-mercato/skills](https://github.com/open-mercato/skills/). The exact versions in use are pinned in [skills-lock.json](skills-lock.json).

## Not affiliated

This is an independent project. It is not affiliated with or endorsed by NIIMBOT.

## License

[MIT](LICENSE)
