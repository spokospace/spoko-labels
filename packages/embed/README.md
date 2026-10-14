# @spokospace/labels-embed

Print labels on a NIIMBOT printer from your own web app: one printer connection shared by the whole page, a status chip for your toolbar, and a print dialog with a preview. No framework, nothing to configure on a server. Built on [`labels-core`](../core/README.md) (printer and Bluetooth), [`labels-render`](../render/README.md) (templates) and [`labels-niimbot`](../niimbot/README.md) (fonts).

> **Status: pre-release (`0.0.0`).** Not published to npm yet: use the browser bundle below. The API is a protected contract (see `BACKWARD_COMPATIBILITY.md`, "Embed API").

```html
<script type="module" src="/vendor/labels-embed/labels-embed.js" data-navigate-track></script>

<spoko-printer-status></spoko-printer-status>
<button id="print">Print label</button>
<script type="module">
  document.getElementById("print").addEventListener("click", () => {
    window.spokoLabels.printLabels({ template, rows: [{ name: "Blue crate", code: "BX-0012" }], title: "Blue crate" });
  });
</script>
```

Your app keeps the templates (`labels-render` template v1 JSON) and the data. The package fetches nothing and sends nothing anywhere: the rows exist only in the page while the dialog is open or a batch prints.

## Installing the bundle

```bash
pnpm --filter @spokospace/labels-embed bundle
```

This writes `packages/embed/dist/bundle/`:
- `labels-embed.js`: one ES module, about 85 kB, with everything inside.
- `fonts/`: the font files with their licenses.

Copy the whole folder into your app's public assets, for example `public/vendor/labels-embed/`, and keep the two together: the fonts are found relative to the script, and load only when a label needs them. Pin the folder to a version: copy it again to update.

The bundle registers the two elements, installs `window.spokoLabels` (`{ version, session, printLabels }`), listens for the `spoko-labels:print` event (below), and tries to reconnect to the printer picked earlier, where the browser allows it.

It installs itself once per page. A second copy of the bundle with another version refuses to install and logs a warning. Until the first release every build says `0.0.0`, so this check cannot tell two builds apart; rely on `data-navigate-track` (below), which reloads the page when the script's URL changes.

## Printing

```ts
printLabels({
  template,            // template v1 JSON
  rows,                // one label per row: objects keyed by the template's bind names, 1 to 200
  columns?,            // column names in order, for templates that bind by position (imported from NIIMBOT)
  title?,              // the dialog's title
  copies?, density?,   // initial values; the user can change them in the dialog
  offsetMm?,           // calibration, { x, y } mm; default the printer's (0.5 mm down on a B1)
  lang?,               // "pl" | "en"; default from <html lang>, else English
}): Promise<{ printed: number; cancelled: boolean; error?: { code: string; row: number } }>
```

The dialog shows each row's label at exact dots (with arrows when there are several rows), the notes about it, copies and density, Connect when the printer is not connected, then Print, progress and Cancel. It resolves when the user closes it:
- `printed` counts labels, copies included.
- `cancelled` is true when the user closed the dialog without printing or cancelled a batch.
- `error` names the first label that failed (`row` is 0-based) and why (a `labels-core` error code, `"template"` or `"render"`).

Rows print one after another, one print job per label, so a cancel or a failure leaves an exact count. The density last used is remembered in the browser.

`printLabels` rejects only for a bug in the calling code: `TypeError` for a bad request or when a dialog is already open, `RangeError` for 0 or more than 200 rows. A template with errors, a missing column or a printer problem is shown in the dialog instead.

Printing needs no click; connecting does. So you may call `printLabels` after a round trip to your server.

### From the server (Livewire, Filament)

Instead of building JavaScript strings, dispatch a browser event with the request as its detail:

```php
$this->dispatch('spoko-labels:print', template: $template, rows: [$row], title: $record->name);
```

The result comes back as a `spoko-labels:printed` event on `window` whose `detail` is the outcome.

## The printer session

`window.spokoLabels.session` (or `printerSession` from the package) holds the page's one connection:
- **States.** `state` is one of: `unsupported`, `disconnected`, `busy-elsewhere`, `connecting`, `connected` (`name`, `battery`) and `printing` (`done`, `total`). It fires a `statechange` event when it changes.
- **Methods.** `connect()` opens the device chooser; call it straight from a click. `disconnect()` closes the connection. `tryReconnect()` reconnects without the chooser, where Chrome allows it (today behind `chrome://flags/#enable-web-bluetooth-new-permissions-backend`).
- **One tab at a time.** Only one tab of your app holds the printer, through a Web Lock. Other tabs show "Printer in use in another tab" until it lets go.
- **While printing.**
  - Livewire navigation by link (`wire:navigate`) is refused, and reloading the page asks first, so a batch is not cut off.
  - Back and forward are let through, because the URL has already changed. The batch goes on in the session and the chip shows its progress; the dialog itself goes away with the page.
- **Reconnecting on load.** It does not block the chip: a click can connect meanwhile, and the first connection wins.

## The status chip

`<spoko-printer-status>` shows the state and connects on click; when connected, its menu offers Disconnect. Theme it with CSS custom properties: `--spoko-labels-accent`, `--spoko-labels-fg`, `--spoko-labels-bg`, `--spoko-labels-radius`, `::part(button)` and `::part(label)`. On screens narrower than 40em, while disconnected or connected, the chip shows only a printer icon and the state dot (the text stays for screen readers and in a desktop tooltip). States that need words (no Bluetooth, printer in another tab, printing progress) always show them. Set `compact="always"` to shrink it like that on every screen, or `compact="never"` to always show the text. This changes how the chip looks on phones for existing hosts. Its language is its `lang` attribute, else `<html lang>`; changing `lang` redraws it at once, while a change to `<html lang>` alone shows on the next state change or when the chip is attached again. The dialog uses the same properties, and `::part(dialog)`.

## Single-page panels (Filament, Livewire)

A Web Bluetooth connection lives as long as the page. To keep one connection while users move around a panel:
- **Single-page mode.** Run the panel as a single-page app: in Filament, call `->spa()` on the panel. Page changes then swap the content without reloading. The connection, the chip's state and a running batch survive.
- **Load the bundle once.** Load it in `<head>` with `data-navigate-track`. Livewire then reloads the page fully when you deploy a new version of the bundle, instead of mixing two versions.
- **Where to put the chip.** Put `<spoko-printer-status>` in the topbar, for example with a render hook. Its markup lives in a shadow root, so morphs of the surrounding component do not wipe it. Wrapping it in `wire:ignore` is fine too.

After a full reload the user reconnects with one click (or silently, where Chrome allows it).

## Requirements

- **Browser.** Chrome or Edge on a computer or Android. Elsewhere (iOS, Firefox, Brave without its Bluetooth flag) the chip and the dialog say so; the preview still works.
- **Server.**
  - HTTPS (or `localhost`).
  - A `Permissions-Policy` that does not disable `bluetooth`.
  - A Content Security Policy that allows your own origin in `script-src` and `font-src`.
  - Styles come from constructed stylesheets, so `style-src 'unsafe-inline'` is not needed.
- **Printer.** Close the NIIMBOT phone app first: a printer connected to a phone cannot be reached.

## Fonts and the HarmonyOS Sans notice

The bundle carries HarmonyOS Sans (© Huawei Device Co., Ltd., HarmonyOS Sans Fonts License Agreement) and the SIL OFL fonts of `labels-render` and `labels-niimbot`. Their licenses are in `fonts/`. The dialog always shows "Font: HarmonyOS Sans © Huawei Device Co., Ltd.", the notice the agreement asks for wherever rendered labels are shown. Keep the license files next to the fonts.

## Example host

```bash
pnpm --filter @spokospace/labels-embed example
# open http://localhost:8083/examples/host/ in Chrome or Edge
```

The example is a made-up inventory with three pages that switch in place like `wire:navigate`. It has a status chip in the top bar, "print label" buttons, "print selected" for a list, and a button that re-renders the top bar the way a Livewire morph does.

## Using the npm entry

The package entry (`import { printLabels, printerSession, defineElements } from "@spokospace/labels-embed"`) has no side effects. Call `defineElements()` once before using the elements; it is safe to call again. Use either the npm entry or the bundle on a page, not both: each would have its own printer session.

## License

MIT. The bundled fonts keep their own licenses (see `fonts/` in the bundle).
