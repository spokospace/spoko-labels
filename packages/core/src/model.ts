/** Everything that differs between printer models. Keep model-specific values here and nowhere else. */
export interface PrinterModel {
  readonly id: string;
  /** Bluetooth device name prefixes used to filter the chooser. */
  readonly namePrefixes: readonly string[];
  /** Print head width in dots; each image row is `headDots / 8` bytes. */
  readonly headDots: number;
  readonly defaultDensity: number;
  /** Inclusive range of accepted `density` values. */
  readonly densityRange: { readonly min: number; readonly max: number };
  /** Pause between row packets, in milliseconds. */
  readonly rowGapMs: number;
}

/**
 * NIIMBOT B1: 203 dpi, 384-dot head (48 mm), 50x30 mm labels.
 * `densityRange` is provisional: the reference implementation only ever used 3.
 * It is confirmed or narrowed by the hardware check before the transport ships.
 */
export const B1: PrinterModel = {
  id: "B1",
  namePrefixes: ["B1"],
  headDots: 384,
  defaultDensity: 3,
  densityRange: { min: 1, max: 5 },
  rowGapMs: 10,
};
