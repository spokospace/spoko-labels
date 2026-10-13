import { CHARACTERISTIC_UUID, SERVICE_UUID } from "../src/web-bluetooth.js";

export const domError = (name: string, message = name): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

export class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  readonly writes: Uint8Array[] = [];
  notificationsStarted = false;
  /** Decides whether a write of these bytes fails. */
  failWrite: (bytes: Uint8Array) => boolean = () => false;

  startNotifications(): Promise<this> {
    this.notificationsStarted = true;
    return Promise.resolve(this);
  }

  writeValueWithoutResponse(value: BufferSource): Promise<void> {
    const bytes = new Uint8Array(ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value);
    if (this.failWrite(bytes)) return Promise.reject(domError("NetworkError", "GATT operation failed"));
    this.writes.push(bytes);
    return Promise.resolve();
  }

  /** Simulate a notification. The bytes sit inside a larger buffer to exercise the DataView offset. */
  notify(bytes: Uint8Array): void {
    const backing = new Uint8Array(bytes.length + 4);
    backing.set(bytes, 2);
    this.value = new DataView(backing.buffer, 2, bytes.length);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

export interface FakeDeviceOptions {
  name?: string;
  /** Make `gatt.connect()` fail with this error. */
  connectError?: Error;
  /** Make `gatt.connect()` hang forever. */
  connectHangs?: boolean;
  /** Services the device exposes; defaults to the vendor service. */
  services?: string[];
  /** Characteristics of the service; defaults to the vendor characteristic. */
  characteristics?: string[];
  withWatchAdvertisements?: boolean;
}

export class FakeDevice extends EventTarget {
  readonly name: string;
  readonly characteristic = new FakeCharacteristic();
  readonly gatt: { connected: boolean; connect: () => Promise<unknown>; disconnect: () => void };
  watchCalls = 0;
  watchSignal: AbortSignal | undefined;
  watchAdvertisements: ((options?: { signal?: AbortSignal }) => Promise<void>) | undefined;

  constructor(private readonly options: FakeDeviceOptions = {}) {
    super();
    this.name = options.name ?? "B1-TEST";
    this.gatt = {
      connected: false,
      connect: () => {
        if (options.connectHangs) return new Promise(() => undefined);
        if (options.connectError) return Promise.reject(options.connectError);
        this.gatt.connected = true;
        return Promise.resolve({
          getPrimaryService: (uuid: string) =>
            (options.services ?? [SERVICE_UUID]).includes(uuid)
              ? Promise.resolve({
                  getCharacteristic: (c: string) =>
                    (options.characteristics ?? [CHARACTERISTIC_UUID]).includes(c)
                      ? Promise.resolve(this.characteristic)
                      : Promise.reject(domError("NotFoundError", "No characteristic")),
                })
              : Promise.reject(domError("NotFoundError", "No service")),
        });
      },
      disconnect: () => {
        const wasConnected = this.gatt.connected;
        this.gatt.connected = false;
        if (wasConnected) this.dispatchEvent(new Event("gattserverdisconnected"));
      },
    };
    if (options.withWatchAdvertisements) {
      this.watchAdvertisements = (watchOptions) => {
        this.watchCalls++;
        this.watchSignal = watchOptions?.signal;
        return Promise.resolve();
      };
    }
  }

  /** Simulate the printer being heard advertising. */
  advertise(): void {
    this.dispatchEvent(new Event("advertisementreceived"));
  }
}

export interface FakeBluetooth {
  requestDevice: (options: { filters: { namePrefix: string }[]; optionalServices: string[] }) => Promise<FakeDevice>;
  getDevices?: () => Promise<FakeDevice[]>;
  /** Every `requestDevice` option object received. */
  requests: { filters: { namePrefix: string }[]; optionalServices: string[] }[];
}

export function fakeBluetooth(
  pick: () => Promise<FakeDevice> | FakeDevice,
  extras: { getDevices?: () => Promise<FakeDevice[]> } = {},
): FakeBluetooth {
  const bluetooth: FakeBluetooth = {
    requests: [],
    requestDevice(options) {
      bluetooth.requests.push(options);
      return Promise.resolve(pick());
    },
  };
  if (extras.getDevices) bluetooth.getDevices = extras.getDevices;
  return bluetooth;
}
