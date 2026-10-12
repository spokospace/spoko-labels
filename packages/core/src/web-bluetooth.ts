import {
  BluetoothUnsupportedError,
  ChooserCancelledError,
  DeviceUnreachableError,
  DisconnectedError,
} from "./errors.js";
import { B1, type PrinterModel } from "./model.js";
import type { Transport } from "./transport.js";

/** Vendor GATT service and characteristic (notify + write without response) shared by NIIMBOT printers. */
export const SERVICE_UUID = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
export const CHARACTERISTIC_UUID = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_RECONNECT_TIMEOUT_MS = 6000;
/** Safe write size when the negotiated MTU is the BLE default. */
const FALLBACK_CHUNK_BYTES = 20;

// Web Bluetooth is not part of `lib.dom`, so only the parts used here are declared.
interface GattCharacteristicLike extends EventTarget {
  readonly value?: DataView | null | undefined;
  startNotifications(): Promise<unknown>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
}
interface GattServiceLike {
  getCharacteristic(uuid: string): Promise<GattCharacteristicLike>;
}
interface GattServerLike {
  getPrimaryService(uuid: string): Promise<GattServiceLike>;
}
interface BluetoothDeviceLike extends EventTarget {
  readonly name?: string | undefined;
  readonly gatt?: { readonly connected: boolean; connect(): Promise<GattServerLike>; disconnect(): void } | undefined;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
}
interface BluetoothLike {
  requestDevice(options: {
    filters: { namePrefix: string }[];
    optionalServices: string[];
  }): Promise<BluetoothDeviceLike>;
  getDevices?(): Promise<BluetoothDeviceLike[]>;
}

const getBluetooth = (): BluetoothLike | undefined =>
  (globalThis as { navigator?: { bluetooth?: BluetoothLike } }).navigator?.bluetooth;

/** Resolves when the device is heard advertising, after `timeoutMs`, or when `signal` aborts; cleans up after itself. */
function waitForAdvertisement(device: BluetoothDeviceLike, timeoutMs: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      device.removeEventListener("advertisementreceived", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    device.addEventListener("advertisementreceived", done);
    signal.addEventListener("abort", done);
  });
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "");

/** Transport over a Web Bluetooth GATT characteristic. Build one with `request()` or `reconnect()`. */
export class WebBluetoothTransport implements Transport {
  private readonly dataListeners = new Set<(bytes: Uint8Array) => void>();
  private readonly disconnectListeners = new Set<() => void>();

  private constructor(
    private readonly device: BluetoothDeviceLike,
    private readonly characteristic: GattCharacteristicLike,
  ) {
    characteristic.addEventListener("characteristicvaluechanged", () => {
      const value = characteristic.value;
      if (!value) return;
      const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      for (const listener of this.dataListeners) listener(bytes);
    });
    device.addEventListener("gattserverdisconnected", () => {
      for (const listener of this.disconnectListeners) listener();
    });
  }

  static isSupported(): boolean {
    return getBluetooth() !== undefined;
  }

  /**
   * Open the browser's device chooser and connect to the printer that is picked.
   * Must be called straight from a click handler: `requestDevice()` is reached before any `await`,
   * and nothing may be awaited before calling this method.
   */
  static async request(model: PrinterModel = B1): Promise<WebBluetoothTransport> {
    const bluetooth = getBluetooth();
    if (!bluetooth) throw new BluetoothUnsupportedError();
    let device: BluetoothDeviceLike;
    try {
      device = await bluetooth.requestDevice({
        filters: model.namePrefixes.map((namePrefix) => ({ namePrefix })),
        optionalServices: [SERVICE_UUID],
      });
    } catch (error) {
      // A closed chooser is a NotFoundError; NotAllowed/Security mean Web Bluetooth is blocked here
      // (no user gesture, insecure context, permissions policy).
      const name = errorName(error);
      if (name === "NotFoundError") throw new ChooserCancelledError(undefined, { cause: error });
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new BluetoothUnsupportedError("Web Bluetooth is blocked for this page", { cause: error });
      }
      throw new DeviceUnreachableError(undefined, { cause: error });
    }
    return WebBluetoothTransport.attach(device);
  }

  /**
   * Reconnect to a printer picked earlier without the chooser. Experimental: Chrome only exposes
   * `getDevices()` behind `chrome://flags/#enable-web-bluetooth-new-permissions-backend`.
   * Resolves `null` (never throws) when that is unavailable, no printer was remembered, or the
   * printer was not reachable in time. Fall back to `request()` then.
   */
  static async reconnect(
    model: PrinterModel = B1,
    options: { timeoutMs?: number } = {},
  ): Promise<WebBluetoothTransport | null> {
    const bluetooth = getBluetooth();
    if (!bluetooth?.getDevices) return null;
    const timeoutMs = options.timeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS;
    const watching = new AbortController();
    try {
      const devices = await bluetooth.getDevices();
      const device = devices.find((d) => model.namePrefixes.some((prefix) => (d.name ?? "").startsWith(prefix)));
      if (!device) return null;
      // A sleeping link only comes back after the printer has been heard advertising again.
      if (device.watchAdvertisements) {
        const heard = waitForAdvertisement(device, timeoutMs, watching.signal);
        await device.watchAdvertisements({ signal: watching.signal });
        await heard;
      }
      return await WebBluetoothTransport.attach(device);
    } catch {
      return null;
    } finally {
      watching.abort();
    }
  }

  private static async attach(device: BluetoothDeviceLike): Promise<WebBluetoothTransport> {
    const gatt = device.gatt;
    if (!gatt) throw new DeviceUnreachableError("The device has no GATT server");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeviceUnreachableError("Connecting to the printer timed out")), CONNECT_TIMEOUT_MS);
      });
      const connecting = (async () => {
        const server = await gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        const found = await service.getCharacteristic(CHARACTERISTIC_UUID);
        await found.startNotifications();
        return found;
      })();
      // If the timeout wins, a late failure of the abandoned attempt must not surface as unhandled.
      connecting.catch(() => undefined);
      const characteristic = await Promise.race([connecting, timeout]);
      return new WebBluetoothTransport(device, characteristic);
    } catch (error) {
      if (gatt.connected) gatt.disconnect();
      throw error instanceof DeviceUnreachableError ? error : new DeviceUnreachableError(undefined, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  get deviceName(): string {
    return this.device.name ?? "";
  }

  get connected(): boolean {
    return this.device.gatt?.connected ?? false;
  }

  async write(packet: Uint8Array): Promise<void> {
    if (!this.connected) throw new DisconnectedError();
    try {
      await this.characteristic.writeValueWithoutResponse(packet);
    } catch {
      // Small MTU: the printer reassembles the stream, so resend the same packet in 20-byte chunks.
      try {
        for (let i = 0; i < packet.length; i += FALLBACK_CHUNK_BYTES) {
          await this.characteristic.writeValueWithoutResponse(packet.slice(i, i + FALLBACK_CHUNK_BYTES));
        }
      } catch (error) {
        throw new DisconnectedError(undefined, { cause: error });
      }
    }
  }

  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.device.gatt?.connected) this.device.gatt.disconnect();
  }
}
