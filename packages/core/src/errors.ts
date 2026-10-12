/**
 * Stable machine-readable error codes. Callers translate these into user-facing text;
 * no human-readable wording is part of the contract.
 */
export type ErrorCode =
  | "bluetooth-unsupported"
  | "chooser-cancelled"
  | "device-unreachable"
  | "disconnected"
  | "no-response"
  | "refused"
  | "print-timeout"
  | "busy"
  | "aborted"
  | "invalid-argument"
  | "protocol";

export class LabelsCoreError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class BluetoothUnsupportedError extends LabelsCoreError {
  constructor(message = "Web Bluetooth is not available in this browser", options?: ErrorOptions) {
    super("bluetooth-unsupported", message, options);
  }
}

export class ChooserCancelledError extends LabelsCoreError {
  constructor(message = "The device chooser was closed without picking a printer", options?: ErrorOptions) {
    super("chooser-cancelled", message, options);
  }
}

/**
 * The printer could not be reached. A printer that is connected to another device
 * (typically the phone app) stops advertising, so callers should word this as
 * "the printer may be connected to another device".
 */
export class DeviceUnreachableError extends LabelsCoreError {
  constructor(message = "The printer could not be reached", options?: ErrorOptions) {
    super("device-unreachable", message, options);
  }
}

export class DisconnectedError extends LabelsCoreError {
  constructor(message = "The printer is disconnected", options?: ErrorOptions) {
    super("disconnected", message, options);
  }
}

export class NoResponseError extends LabelsCoreError {
  readonly step: string;

  constructor(step: string, options?: ErrorOptions) {
    super("no-response", `No reply from the printer at step "${step}"`, options);
    this.step = step;
  }
}

export class RefusedError extends LabelsCoreError {
  readonly step: string;

  constructor(step: string, options?: ErrorOptions) {
    super("refused", `The printer refused step "${step}"`, options);
    this.step = step;
  }
}

export class PrintTimeoutError extends LabelsCoreError {
  constructor(message = "The printer did not report the print as finished in time", options?: ErrorOptions) {
    super("print-timeout", message, options);
  }
}

export class PrinterBusyError extends LabelsCoreError {
  constructor(message = "Another command is already running on this printer", options?: ErrorOptions) {
    super("busy", message, options);
  }
}

export class AbortedError extends LabelsCoreError {
  constructor(message = "The operation was aborted", options?: ErrorOptions) {
    super("aborted", message, options);
  }
}

export class InvalidArgumentError extends LabelsCoreError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid-argument", message, options);
  }
}

export class ProtocolError extends LabelsCoreError {
  constructor(message = "The printer sent a malformed packet", options?: ErrorOptions) {
    super("protocol", message, options);
  }
}
