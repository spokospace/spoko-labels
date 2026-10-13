# @spokospace/labels-core

Print labels on NIIMBOT printers straight from the browser over Web Bluetooth (BLE). This package is the protocol and connection layer: packet codec, a transport interface, a Web Bluetooth transport, a `Printer` class and a helper that turns an image into print rows. It has no runtime dependencies. Rendering labels, templates and UI live in other packages.

> **Status: pre-release (`0.0.0`).** The API may still change in a minor version (see `BACKWARD_COMPATIBILITY.md`).
> **NIIMBOT B1: checked on a real printer** (firmware 5.26, 50x30 mm gap labels): connect, `info()`, printing at densities 1 to 5, `copies`, the calibration offset and aborting. The results and the paths that are still covered only by unit tests are listed in the pull request that introduced the transport (#4) and tracked in #16. No other model is supported yet.

## Quick start

```ts
import { imageToRows, Printer } from "@spokospace/labels-core";

button.addEventListener("click", async () => {
  // Nothing may be awaited before this call: the browser needs the click's user gesture.
  const printer = await Printer.connect();

  const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  await printer.print(imageToRows(image), { density: 3, copies: 1 });
});
```

`imageToRows` accepts anything shaped like `ImageData` (`{ width, height, data }` with RGBA bytes). An image wider than the 384-dot print head is center-cropped, a narrower one is centered. A pixel is black when it is not fully transparent and its gray value is below 128.

## Rules that are easy to break

- **Call `Printer.connect()` (or `WebBluetoothTransport.request()`) straight from a click handler.** The device chooser needs the user gesture, and any `await` before the call loses it.
- **Close the NIIMBOT phone app first.** A printer that is connected to a phone stops advertising and cannot be reached; the chooser will not list it. You get a `device-unreachable` error: word it as "the printer may be connected to another device".
- **One command at a time.** A second `print()` or `info()` while one is running rejects with `busy`. Await each call, or use `copies`.
- **Web Bluetooth needs a secure context** (HTTPS or `localhost`).

## API

| Export | What it does |
|---|---|
| `Printer.connect(model?)` | Opens the chooser and returns a connected `Printer`. |
| `new Printer(transport, model?)` | A printer over any `Transport` (for tests, or another link). |
| `printer.info()` | `{ battery?, serial?, firmware? }`. A value the printer does not answer is left out. `battery` is a small level (3 on a B1), not a percentage. `firmware` is formatted as `"5.26"` (the printer reports two bytes, 5 and 26, which is the integer 1306; this is what the official NIIMBOT app shows); the unformatted integer is in `firmwareRaw`. |
| `printer.print(rows, options?)` | Prints one page. Options: `density` (integer within the model's range), `copies` (1 to 255; each copy is a separate print job), `offsetMm` (`{ x, y }` calibration in millimetres, like the official app; the B1 default is 0.5 mm down, see below), `onProgress({ stage, percent })`, `signal` (`AbortSignal`). |
| `printer.disconnect()`, `printer.connected` | Close the link, check the link. |
| `WebBluetoothTransport` | `isSupported()`, `request(model?)`, `reconnect(model?, { timeoutMs? })`, `deviceName`. |
| `imageToRows(image, model?)` | RGBA image to 1-bit rows of `headDots / 8` bytes. |
| `encodePacket`, `PacketParser`, `encodeRows`, `CMD`, `INFO_KEY` | The pure protocol codec, usable without any I/O. |
| `B1`, `PrinterModel` | The model descriptor: head width, name prefixes, density range, row gap. |
| `Transport` | The interface a link must implement. |

### Where the print lands on the label (calibration)

On the B1 the printer starts printing slightly before a label begins, so without a correction the first rows of the image fall on the gap between labels. The model therefore moves the image down by `offsetMm.y` (0.5 mm, that is 4 blank rows; 8 rows are 1 mm). The value was measured on one B1 with 50x30 gap labels, so it may differ a little on other printers or rolls. Pass `offsetMm` to `print()` to calibrate, the way the official app's "Calibration" screen does: `x` moves the image right (negative: left), `y` moves it down (0 to 10 mm). Raise `y` if the top of a print is cut off, lower it if the bottom is; `{ x: 0, y: 0 }` sends the image as given. Dots that leave the head are dropped. Also keep text away from the label edges: the head prints 48 mm across, so a 50 mm label has about 1 mm of blank space on each side, and the corners of most labels are rounded.

### Aborting

Pass an `AbortSignal` to `print()`. The printer is told to end the job (best effort) and the call rejects with `aborted`. Checked on a B1: aborting while rows were being sent, and aborting after all rows were sent while the printer was already working, both cancel the label (nothing is printed); after the first the printer was ready for the next print straight away. With `copies` greater than 1, labels that were already printed stay printed and the remaining copies are not sent.

### Reconnecting without the chooser (experimental)

`WebBluetoothTransport.reconnect()` reconnects to a printer picked earlier without opening the chooser. Chrome only exposes this behind `chrome://flags/#enable-web-bluetooth-new-permissions-backend`. It never throws: it resolves `null` when the API is missing, no printer was remembered, or the printer is not reachable in time. Always fall back to `Printer.connect()` from a click.

## Errors

Every error extends `LabelsCoreError` and has a stable `code`. The messages are for developers; translate the codes for users.

| `code` | Class | When |
|---|---|---|
| `bluetooth-unsupported` | `BluetoothUnsupportedError` | No Web Bluetooth (iOS, Firefox, Brave without its flag), Bluetooth switched off or disabled in the browser, or the page is blocked from using it (no user gesture, insecure context, permissions policy). See `cause` for the browser's own message. |
| `chooser-cancelled` | `ChooserCancelledError` | The chooser was closed without picking a printer. |
| `device-unreachable` | `DeviceUnreachableError` | The printer could not be connected: not advertising (for example connected to a phone), GATT connect failed or timed out after 10 s, or the NIIMBOT service is missing. |
| `disconnected` | `DisconnectedError` | The link dropped, or a write failed even in 20-byte chunks. |
| `no-response` | `NoResponseError` | No reply within 2 s; `step` names the command. |
| `refused` | `RefusedError` | The printer refused a command; `step` names it. |
| `print-timeout` | `PrintTimeoutError` | The printer did not report the page as finished within 30 s (per printed label). |
| `busy` | `PrinterBusyError` | Another command is running on this printer. |
| `aborted` | `AbortedError` | The `AbortSignal` fired. |
| `invalid-argument` | `InvalidArgumentError` | Bad density, copies, rows or image. |
| `protocol` | `ProtocolError` | A malformed packet arrived while a reply was awaited. |

## Browser support

Chrome and Edge on Windows, macOS, Linux and Android. Brave needs `brave://flags/#brave-web-bluetooth-api`. Safari, Firefox and every browser on iOS have no Web Bluetooth: `WebBluetoothTransport.isSupported()` returns `false` there, so check it first and show a clear message.

## Testing without a printer

The `Printer` only needs a `Transport`. Implement the four-method interface over an in-memory buffer to test your integration without hardware; this repository's own tests do that with a scripted fake.

## Hardware check page

`examples/hardware-check/` is a small manual page for trying the package on a real printer: connect, `info()`, print made-up test labels at any density and copy count, abort at different moments, and log raw packets. It is meant for the hardware verification of a new release, not as an app.

```bash
pnpm --filter @spokospace/labels-core example
# then open http://localhost:8080/examples/hardware-check/ in Chrome or Edge
```

## License

MIT
