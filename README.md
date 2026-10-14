<picture>
  <source media="(prefers-color-scheme: dark)" srcset="art/cover-dark.jpg">
  <img alt="spoko-labels: print labels on NIIMBOT printers straight from the browser over Web Bluetooth" src="art/cover-light.jpg">
</picture>

# spoko-labels

Print labels on NIIMBOT label printers straight from the browser — no driver, no desktop app, no phone. Over Web Bluetooth.

**Try it: [spoko-labels.pages.dev](https://spoko-labels.pages.dev)**. Pick a template, load the sample data, an xlsx file or a JSON API, see exactly what will print, and print it on a NIIMBOT B1 from Chrome or Edge. Your data stays in the browser.

<img alt="The spoko labels web app: a connected printer in the header, the built-in templates, the data sources and an exact preview of a product label with a "Print this label" button" src="art/web-app.png" width="800">

> Work in progress. The packages below work today; the web app is being built phase by phase.

## What works today

- **[`@spokospace/labels-core`](packages/core/README.md)**: connect to a NIIMBOT B1 from a click, read its battery and firmware, and print any black-and-white image with a chosen density, number of copies and calibration offset; a print can be aborted. Checked on a real B1 with 50×30 mm labels.
- **A hardware-check page** for trying it on your own printer: `pnpm --filter @spokospace/labels-core example`, then open `http://localhost:8080/examples/hardware-check/` in Chrome or Edge (see the [package README](packages/core/README.md#hardware-check-page)).
- **[The web app](apps/web/README.md)**, live at [spoko-labels.pages.dev](https://spoko-labels.pages.dev): built-in templates, an exact preview, and data from sample rows, an xlsx file or a JSON API, with column mapping, search and row selection, and printing with the printer chip, the print dialog and calibration.

Not published to npm yet.

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
| [`@spokospace/labels-core`](packages/core/README.md) | printer protocol and Web Bluetooth connection (available) |
| [`@spokospace/labels-render`](packages/render/README.md) | label template engine (available) |
| [`@spokospace/labels-niimbot`](packages/niimbot/README.md) | import templates from the NIIMBOT desktop app (available: reading the app's database, conversion, the free fonts and an example page; checked on a B1) |
| [`@spokospace/labels-embed`](packages/embed/README.md) | print from other web apps: shared printer connection, status chip and print dialog (available; hardware check pending) |
| `apps/web` | the public web app, live at [spoko-labels.pages.dev](https://spoko-labels.pages.dev) (in progress: templates, preview, data loading and printing; see [its README](apps/web/README.md)) |

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
