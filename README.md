<picture>
  <source media="(prefers-color-scheme: dark)" srcset="art/cover-dark.jpg">
  <img alt="spoko-labels: print labels on NIIMBOT printers straight from the browser over Web Bluetooth" src="art/cover-light.jpg">
</picture>

# spoko-labels

Print labels on NIIMBOT label printers straight from the browser — no driver, no desktop app, no phone. Over Web Bluetooth.

> Work in progress. The packages below are being built.

## Tested on the NIIMBOT B1

Development and testing happen mainly on a **NIIMBOT B1** (203 dpi, 384-dot print head, 50×30 mm labels). That is the printer every change is checked against, so it is the one to expect to work. Other NIIMBOT models speak a similar protocol, but they are not tested yet; reports and pull requests are welcome.

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

## Not affiliated

This is an independent project. It is not affiliated with or endorsed by NIIMBOT.

## License

[MIT](LICENSE)
