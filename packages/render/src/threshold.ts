/**
 * RGBA to pure black and white, in place: a pixel is black when its gray value
 * `(299 R + 587 G + 114 B) / 1000` is below 128, otherwise white; alpha becomes 255. The same rule as
 * `imageToRows()` in labels-core, so printing the result changes nothing.
 */
export function threshold(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const gray = ((data[i] ?? 0) * 299 + (data[i + 1] ?? 0) * 587 + (data[i + 2] ?? 0) * 114) / 1000;
    const v = gray < 128 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}
