import { describe, expect, it } from "vitest";
import {
  AbortedError,
  B1,
  BluetoothUnsupportedError,
  ChooserCancelledError,
  DeviceUnreachableError,
  DisconnectedError,
  InvalidArgumentError,
  LabelsCoreError,
  NoResponseError,
  PrinterBusyError,
  PrintTimeoutError,
  ProtocolError,
  RefusedError,
} from "../src/index.js";

describe("errors", () => {
  it("maps every class to its stable code", () => {
    const cases: [LabelsCoreError, string][] = [
      [new BluetoothUnsupportedError(), "bluetooth-unsupported"],
      [new ChooserCancelledError(), "chooser-cancelled"],
      [new DeviceUnreachableError(), "device-unreachable"],
      [new DisconnectedError(), "disconnected"],
      [new NoResponseError("density"), "no-response"],
      [new RefusedError("density"), "refused"],
      [new PrintTimeoutError(), "print-timeout"],
      [new PrinterBusyError(), "busy"],
      [new AbortedError(), "aborted"],
      [new InvalidArgumentError("bad"), "invalid-argument"],
      [new ProtocolError(), "protocol"],
    ];
    for (const [error, code] of cases) {
      expect(error).toBeInstanceOf(LabelsCoreError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
    }
  });

  it("names the failed step and keeps the cause", () => {
    const cause = new Error("boom");
    const error = new NoResponseError("page end", { cause });
    expect(error.step).toBe("page end");
    expect(error.cause).toBe(cause);
    expect(new RefusedError("density").step).toBe("density");
  });

  it("uses the class name as the error name", () => {
    expect(new PrinterBusyError().name).toBe("PrinterBusyError");
  });
});

describe("B1 model", () => {
  it("describes the 203 dpi, 384-dot head", () => {
    expect(B1.headDots).toBe(384);
    expect(B1.headDots % 8).toBe(0);
    expect(B1.namePrefixes).toEqual(["B1"]);
    expect(B1.defaultDensity).toBe(3);
    expect(B1.densityRange.min).toBeLessThanOrEqual(B1.defaultDensity);
    expect(B1.densityRange.max).toBeGreaterThanOrEqual(B1.defaultDensity);
    expect(B1.rowGapMs).toBe(10);
    expect(B1.topOffsetRows).toBeGreaterThanOrEqual(0);
  });
});
