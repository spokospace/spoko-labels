import { InvalidArgumentError } from "./errors.js";
import { B1, type PrinterModel } from "./model.js";
import { MAX_ROWS } from "./protocol/rows.js";

const RGBA_STRIDE = 4;
/** Gray values below this are black. */
const GRAY_THRESHOLD = 128;

/** Structurally compatible with the DOM `ImageData`: RGBA bytes, row by row. */
export interface ImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * Convert an RGBA image into head-width 1-bit rows (1 = black, most significant bit leftmost).
 * An image wider than the head is center-cropped, a narrower one is centered. A pixel is
 * black when it is not fully transparent and its gray value is below 128.
 */
export function imageToRows(image: ImageLike, model: PrinterModel = B1): Uint8Array[] {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new InvalidArgumentError(`Image size ${width}x${height} is not valid`);
  }
  if (height > MAX_ROWS) throw new InvalidArgumentError(`Image is ${height} rows tall, the maximum is ${MAX_ROWS}`);
  if (data.length !== width * height * RGBA_STRIDE) {
    throw new InvalidArgumentError(`Image data has ${data.length} bytes, expected ${width * height * RGBA_STRIDE}`);
  }

  const offset = Math.floor((model.headDots - width) / 2);
  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(model.headDots / 8);
    for (let x = 0; x < model.headDots; x++) {
      const sx = x - offset;
      if (sx < 0 || sx >= width) continue;
      const i = (y * width + sx) * RGBA_STRIDE;
      const gray = ((data[i] as number) * 299 + (data[i + 1] as number) * 587 + (data[i + 2] as number) * 114) / 1000;
      if (gray < GRAY_THRESHOLD && (data[i + 3] as number) > 0) row[x >> 3] = (row[x >> 3] as number) | (0x80 >> (x & 7));
    }
    rows.push(row);
  }
  return rows;
}
