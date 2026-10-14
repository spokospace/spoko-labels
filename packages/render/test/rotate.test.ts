import { describe, expect, it } from "vitest";
import { turn, type RgbaImage } from "../src/index.js";

// A 3 x 2 image whose pixel (x, y) has red = 10 * y + x, so every pixel can be traced after a turn.
const W = 3;
const H = 2;
function image(): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([10 * y + x, 1, 2, 255], (y * W + x) * 4);
  return { width: W, height: H, data };
}

/** The red values of an image, row by row. */
const reds = (img: RgbaImage): number[][] =>
  Array.from({ length: img.height }, (_, y) => Array.from({ length: img.width }, (_, x) => img.data[(y * img.width + x) * 4] as number));

describe("turn", () => {
  it("turns 90 degrees clockwise: the left column becomes the top row", () => {
    const out = turn(image(), 90);
    expect([out.width, out.height]).toEqual([2, 3]);
    expect(reds(out)).toEqual([
      [10, 0],
      [11, 1],
      [12, 2],
    ]);
  });

  it("turns 180 degrees", () => {
    const out = turn(image(), 180);
    expect([out.width, out.height]).toEqual([3, 2]);
    expect(reds(out)).toEqual([
      [12, 11, 10],
      [2, 1, 0],
    ]);
  });

  it("turns 270 degrees clockwise: the right column becomes the top row", () => {
    const out = turn(image(), 270);
    expect([out.width, out.height]).toEqual([2, 3]);
    expect(reds(out)).toEqual([
      [2, 12],
      [1, 11],
      [0, 10],
    ]);
  });

  it("keeps whole pixels, returns the same object at 0 and comes back after a full turn", () => {
    const original = image();
    expect(turn(original, 0)).toBe(original);
    for (const [a, b] of [[90, 270], [180, 180], [270, 90]] as const) {
      const back = turn(turn(original, a), b);
      expect([back.width, back.height]).toEqual([W, H]);
      expect([...back.data]).toEqual([...original.data]);
    }
    expect(turn(original, 90).data[3]).toBe(255);
  });
});
