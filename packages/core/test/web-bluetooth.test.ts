import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  B1,
  BluetoothUnsupportedError,
  ChooserCancelledError,
  CMD,
  DeviceUnreachableError,
  DisconnectedError,
  encodePacket,
  Printer,
  WebBluetoothTransport,
} from "../src/index.js";
import { CHARACTERISTIC_UUID, SERVICE_UUID } from "../src/web-bluetooth.js";
import { domError, FakeDevice, fakeBluetooth, type FakeBluetooth } from "./fake-bluetooth.js";

function install(bluetooth: FakeBluetooth | undefined): void {
  vi.stubGlobal("navigator", bluetooth ? { bluetooth } : {});
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  const outcome = promise.then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  return outcome;
};

describe("WebBluetoothTransport.isSupported", () => {
  it("reflects navigator.bluetooth", () => {
    install(undefined);
    expect(WebBluetoothTransport.isSupported()).toBe(false);
    install(fakeBluetooth(() => new FakeDevice()));
    expect(WebBluetoothTransport.isSupported()).toBe(true);
  });
});

describe("WebBluetoothTransport.request", () => {
  it("asks the chooser for the model's name prefixes and the vendor service", async () => {
    const bluetooth = fakeBluetooth(() => new FakeDevice());
    install(bluetooth);
    await WebBluetoothTransport.request();
    expect(bluetooth.requests).toEqual([{ filters: [{ namePrefix: "B1" }], optionalServices: [SERVICE_UUID] }]);
  });

  it("uses the prefixes of the given model", async () => {
    const bluetooth = fakeBluetooth(() => new FakeDevice());
    install(bluetooth);
    await WebBluetoothTransport.request({ ...B1, namePrefixes: ["X1", "X2"] });
    expect(bluetooth.requests[0]?.filters).toEqual([{ namePrefix: "X1" }, { namePrefix: "X2" }]);
  });

  it("calls requestDevice synchronously, before the first microtask yield (user gesture rule)", () => {
    const bluetooth = fakeBluetooth(() => new FakeDevice());
    install(bluetooth);
    void WebBluetoothTransport.request();
    expect(bluetooth.requests).toHaveLength(1);
  });

  it("Printer.connect keeps the same rule", () => {
    const bluetooth = fakeBluetooth(() => new FakeDevice());
    install(bluetooth);
    void Printer.connect();
    expect(bluetooth.requests).toHaveLength(1);
  });

  it("connects, subscribes to notifications and exposes the device name", async () => {
    const device = new FakeDevice({ name: "B1-TEST" });
    install(fakeBluetooth(() => device));
    const transport = await WebBluetoothTransport.request();
    expect(transport.connected).toBe(true);
    expect(transport.deviceName).toBe("B1-TEST");
    expect(device.characteristic.notificationsStarted).toBe(true);
  });

  it("fails with bluetooth-unsupported when navigator.bluetooth is missing", async () => {
    install(undefined);
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(BluetoothUnsupportedError);
  });

  it("maps a closed chooser (NotFoundError) to chooser-cancelled", async () => {
    install(fakeBluetooth(() => Promise.reject(domError("NotFoundError", "User cancelled the chooser"))));
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(ChooserCancelledError);
  });

  it.each(["NotAllowedError", "SecurityError"])("maps %s to bluetooth-unsupported and keeps the cause", async (name) => {
    const cause = domError(name);
    install(fakeBluetooth(() => Promise.reject(cause)));
    const error = await rejection(WebBluetoothTransport.request());
    expect(error).toBeInstanceOf(BluetoothUnsupportedError);
    expect((error as BluetoothUnsupportedError).cause).toBe(cause);
  });

  it("maps any other chooser failure to device-unreachable", async () => {
    install(fakeBluetooth(() => Promise.reject(domError("TypeError"))));
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(DeviceUnreachableError);
  });

  it("maps a failed GATT connect to device-unreachable with the cause", async () => {
    const cause = domError("NetworkError", "Connection attempt failed");
    install(fakeBluetooth(() => new FakeDevice({ connectError: cause })));
    const error = await rejection(WebBluetoothTransport.request());
    expect(error).toBeInstanceOf(DeviceUnreachableError);
    expect((error as DeviceUnreachableError).cause).toBe(cause);
  });

  it("maps a missing service to device-unreachable and drops the link", async () => {
    const device = new FakeDevice({ services: [] });
    install(fakeBluetooth(() => device));
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(DeviceUnreachableError);
    expect(device.gatt.connected).toBe(false);
  });

  it("maps a missing characteristic to device-unreachable", async () => {
    install(fakeBluetooth(() => new FakeDevice({ characteristics: [] })));
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(DeviceUnreachableError);
  });

  it("times out a hanging GATT connect after 10 s", async () => {
    install(fakeBluetooth(() => new FakeDevice({ connectHangs: true })));
    const start = Date.now();
    expect(await rejection(WebBluetoothTransport.request())).toBeInstanceOf(DeviceUnreachableError);
    expect(Date.now() - start).toBe(10_000);
  });
});

describe("WebBluetoothTransport I/O", () => {
  async function connected(device = new FakeDevice()) {
    install(fakeBluetooth(() => device));
    return { device, transport: await WebBluetoothTransport.request() };
  }

  it("delivers notification bytes, respecting the DataView offset", async () => {
    const { device, transport } = await connected();
    const received: number[][] = [];
    transport.onData((bytes) => received.push([...bytes]));
    device.characteristic.notify(new Uint8Array([1, 2, 3]));
    device.characteristic.notify(new Uint8Array([9]));
    expect(received).toEqual([[1, 2, 3], [9]]);
  });

  it("stops delivering after unsubscribe", async () => {
    const { device, transport } = await connected();
    const listener = vi.fn();
    const off = transport.onData(listener);
    off();
    device.characteristic.notify(new Uint8Array([1]));
    expect(listener).not.toHaveBeenCalled();
  });

  it("writes one whole packet in a single write", async () => {
    const { device, transport } = await connected();
    const packet = encodePacket(CMD.SET_DENSITY, [3]);
    await transport.write(packet);
    expect(device.characteristic.writes).toEqual([packet]);
  });

  it("falls back to 20-byte chunks from byte 0 when the whole write fails", async () => {
    const { device, transport } = await connected();
    device.characteristic.failWrite = (bytes) => bytes.length > 20;
    const packet = encodePacket(CMD.PRINT_BITMAP_ROW, Array.from({ length: 60 }, (_, i) => i));
    await transport.write(packet);
    const writes = device.characteristic.writes;
    // 4 header + 60 data + 3 footer = 67 bytes
    expect(writes.map((w) => w.length)).toEqual([20, 20, 20, 7]);
    expect(Uint8Array.from(writes.flatMap((w) => [...w]))).toEqual(packet);
  });

  it("fails with disconnected when the chunked write fails too", async () => {
    const { device, transport } = await connected();
    device.characteristic.failWrite = () => true;
    const error = await transport.write(encodePacket(CMD.CONNECT)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DisconnectedError);
    expect((error as DisconnectedError).cause).toBeDefined();
  });

  it("refuses to write on a dropped link", async () => {
    const { device, transport } = await connected();
    device.gatt.disconnect();
    expect(await transport.write(encodePacket(CMD.CONNECT)).catch((e: unknown) => e)).toBeInstanceOf(DisconnectedError);
  });

  it("notifies disconnect listeners when the device drops the link", async () => {
    const { device, transport } = await connected();
    const listener = vi.fn();
    transport.onDisconnect(listener);
    device.gatt.disconnect();
    expect(listener).toHaveBeenCalledOnce();
    expect(transport.connected).toBe(false);
  });

  it("close() drops the link", async () => {
    const { device, transport } = await connected();
    await transport.close();
    expect(device.gatt.connected).toBe(false);
  });

  it("works under a Printer end to end (handshake goes over the fake link)", async () => {
    const { device } = await connected();
    install(fakeBluetooth(() => device));
    const printer = await Printer.connect();
    const run = printer.info().catch(() => null);
    await vi.runAllTimersAsync();
    await run;
    expect(device.characteristic.writes[0]?.[2]).toBe(CMD.CONNECT);
  });
});

describe("WebBluetoothTransport.reconnect", () => {
  it("resolves null when getDevices is unavailable", async () => {
    install(fakeBluetooth(() => new FakeDevice()));
    expect(await WebBluetoothTransport.reconnect()).toBeNull();
  });

  it("resolves null when navigator.bluetooth is missing", async () => {
    install(undefined);
    expect(await WebBluetoothTransport.reconnect()).toBeNull();
  });

  it("resolves null when no remembered device matches the model", async () => {
    const other = new FakeDevice({ name: "Z9-OTHER" });
    install(fakeBluetooth(() => other, { getDevices: () => Promise.resolve([other]) }));
    expect(await WebBluetoothTransport.reconnect()).toBeNull();
  });

  it("connects to a remembered printer without watching advertisements when unsupported", async () => {
    const device = new FakeDevice({ name: "B1-TEST" });
    install(fakeBluetooth(() => device, { getDevices: () => Promise.resolve([device]) }));
    const transport = await WebBluetoothTransport.reconnect();
    expect(transport?.connected).toBe(true);
  });

  it("waits until the printer is heard advertising, then connects", async () => {
    const device = new FakeDevice({ withWatchAdvertisements: true });
    install(fakeBluetooth(() => device, { getDevices: () => Promise.resolve([device]) }));
    const pending = WebBluetoothTransport.reconnect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(device.gatt.connected).toBe(false);
    device.advertise();
    const transport = await pending;
    expect(transport?.connected).toBe(true);
    expect(device.watchCalls).toBe(1);
    expect(device.watchSignal?.aborted).toBe(true);
  });

  it("gives up waiting for an advertisement after the timeout and still tries to connect", async () => {
    const device = new FakeDevice({ withWatchAdvertisements: true });
    install(fakeBluetooth(() => device, { getDevices: () => Promise.resolve([device]) }));
    const pending = WebBluetoothTransport.reconnect(B1, { timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending)?.connected).toBe(true);
  });

  it("resolves null instead of throwing when the connection fails", async () => {
    const device = new FakeDevice({ connectError: domError("NetworkError") });
    install(fakeBluetooth(() => device, { getDevices: () => Promise.resolve([device]) }));
    const result = WebBluetoothTransport.reconnect();
    await vi.runAllTimersAsync();
    expect(await result).toBeNull();
  });

  it("resolves null when getDevices itself fails", async () => {
    install(fakeBluetooth(() => new FakeDevice(), { getDevices: () => Promise.reject(domError("SecurityError")) }));
    expect(await WebBluetoothTransport.reconnect()).toBeNull();
  });
});

describe("constants", () => {
  it("uses the NIIMBOT vendor UUIDs", () => {
    expect(SERVICE_UUID).toBe("e7810a71-73ae-499d-8c15-faa9aef0c3f2");
    expect(CHARACTERISTIC_UUID).toBe("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f");
  });
});
