/**
 * RGBA to pure black and white, in place: a pixel is black when its gray value
 * `(299 R + 587 G + 114 B) / 1000` is below 128, otherwise white; alpha becomes 255. The gray rule of
 * `imageToRows()` in labels-core (copied: this package has no runtime dependency on it). Alpha is ignored
 * because the renderer paints an opaque white background first; the output is opaque, so printing it
 * changes nothing.
 */
export function threshold(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const weighted = (data[i] as number) * 299 + (data[i + 1] as number) * 587 + (data[i + 2] as number) * 114;
    const v = weighted < 128_000 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}
