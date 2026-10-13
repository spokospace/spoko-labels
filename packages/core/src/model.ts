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
  /** Dots per millimetre (203 dpi is 8). */
  readonly dotsPerMm: number;
  /**
   * Default print calibration in millimetres: how far the image is moved right (`x`) and down (`y`) on the
   * label. The B1 starts printing slightly before a label begins, so without `y` the first rows of the image
   * fall on the gap between labels.
   */
  readonly offsetMm: { readonly x: number; readonly y: number };
}

/**
 * NIIMBOT B1: 203 dpi, 384-dot head (48 mm), 50x30 mm labels.
 * `densityRange` 1..5 with default 3: the official NIIMBOT app's device catalogue lists the same range and
 * default for the B1, and a real B1 accepted densities 1, 3 and 5 (hardware check).
 */
export const B1: PrinterModel = {
  id: "B1",
  namePrefixes: ["B1"],
  headDots: 384,
  defaultDensity: 3,
  densityRange: { min: 1, max: 5 },
  rowGapMs: 10,
  dotsPerMm: 8,
  // Measured on one B1 with 50x30 gap labels: the first 4 rows (0.5 mm) were lost at the top.
  offsetMm: { x: 0, y: 0.5 },
};
