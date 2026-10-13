/** NIIMBOT packet command codes (request codes; replies use their own codes). */
export const CMD = {
  CONNECT: 0xc1,
  HEARTBEAT: 0xdc,
  GET_INFO: 0x40,
  /** Read the loaded roll's RFID tag: tag UID, barcode, serial, the used/total label count and the label type. */
  GET_RFID: 0x1a,
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  PRINT_START: 0x01,
  PAGE_START: 0x03,
  SET_PAGE_SIZE: 0x13,
  PRINT_EMPTY_ROW: 0x84,
  PRINT_BITMAP_ROW: 0x85,
  PAGE_END: 0xe3,
  PRINT_STATUS: 0xa3,
  PRINT_END: 0xf3,
  /** Unsolicited "line check" progress packet the printer sends while it receives rows. */
  PRINTER_CHECK_LINE: 0xd3,
} as const;

/** Selector byte of the `GET_INFO` command. */
export const INFO_KEY = {
  FIRMWARE: 9,
  BATTERY: 10,
  SERIAL: 11,
} as const;
