# @spokospace/labels-core

Print labels on NIIMBOT printers straight from the browser over Web Bluetooth (BLE). This package is the protocol and connection layer: packet codec, a transport interface, a Web Bluetooth transport, a `Printer` class and a helper that turns an image into print rows. It has no runtime dependencies. Rendering labels, templates and UI live in other packages.

> **Status: pre-release (`0.0.0`).** The API may still change in a minor version (see `BACKWARD_COMPATIBILITY.md`).
> **NIIMBOT B1: hardware verification is pending.** The code is ported from a prototype that printed on a real B1, and it is tested against that prototype's bytes and a fake transport, but this package has not yet been run on a printer. Results of that check are recorded in the pull request that introduces the transport. Until then, treat B1 support as unverified. No other model is supported.

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
| `printer.info()` | `{ battery?, serial?, firmware? }`. A value the printer does not answer is left out. `firmware` is the raw decimal value the printer reports. |
| `printer.print(rows, options?)` | Prints one page. Options: `density` (integer within the model's range), `copies` (1 to 65535), `onProgress({ stage, percent })`, `signal` (`AbortSignal`). |
| `printer.disconnect()`, `printer.connected` | Close the link, check the link. |
| `WebBluetoothTransport` | `isSupported()`, `request(model?)`, `reconnect(model?, { timeoutMs? })`, `deviceName`. |
| `imageToRows(image, model?)` | RGBA image to 1-bit rows of `headDots / 8` bytes. |
| `encodePacket`, `PacketParser`, `encodeRows`, `CMD`, `INFO_KEY` | The pure protocol codec, usable without any I/O. |
| `B1`, `PrinterModel` | The model descriptor: head width, name prefixes, density range, row gap. |
| `Transport` | The interface a link must implement. |

### Aborting

Pass an `AbortSignal` to `print()`. Before the page is finished the printer is told to end the job (best effort) and the call rejects with `aborted`. After the last row has been sent the page is already inside the printer, so the label may still print.

### Reconnecting without the chooser (experimental)

`WebBluetoothTransport.reconnect()` reconnects to a printer picked earlier without opening the chooser. Chrome only exposes this behind `chrome://flags/#enable-web-bluetooth-new-permissions-backend`. It never throws: it resolves `null` when the API is missing, no printer was remembered, or the printer is not reachable in time. Always fall back to `Printer.connect()` from a click.

## Errors

Every error extends `LabelsCoreError` and has a stable `code`. The messages are for developers; translate the codes for users.

| `code` | Class | When |
|---|---|---|
| `bluetooth-unsupported` | `BluetoothUnsupportedError` | No Web Bluetooth (iOS, Firefox, Brave without its flag), or the page is blocked from using it (no user gesture, insecure context, permissions policy; see `cause`). |
| `chooser-cancelled` | `ChooserCancelledError` | The chooser was closed without picking a printer. |
| `device-unreachable` | `DeviceUnreachableError` | The printer could not be connected: not advertising (for example connected to a phone), GATT connect failed or timed out after 10 s, or the NIIMBOT service is missing. |
| `disconnected` | `DisconnectedError` | The link dropped, or a write failed even in 20-byte chunks. |
| `no-response` | `NoResponseError` | No reply within 2 s; `step` names the command. |
| `refused` | `RefusedError` | The printer refused a command; `step` names it. |
| `print-timeout` | `PrintTimeoutError` | The printer did not report the page as finished within `30 s + 5 s x (copies - 1)`. |
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
