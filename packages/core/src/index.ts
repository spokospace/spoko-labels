export { CMD, INFO_KEY } from "./protocol/commands.js";
export { encodePacket, PacketParser, type Packet, type ParsedFrame } from "./protocol/packet.js";
export { encodeRows, MAX_ROWS } from "./protocol/rows.js";
export { imageToRows, type ImageLike } from "./image.js";
export { B1, type PrinterModel } from "./model.js";
export type { Transport } from "./transport.js";
export { Printer, type PrinterInfo, type PrintOptions, type PrintProgress } from "./printer.js";
export {
  AbortedError,
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
  type ErrorCode,
} from "./errors.js";
