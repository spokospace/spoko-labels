import { describe, expect, it } from "vitest";
import { B1, imageToRows, InvalidArgumentError, type ImageLike, type PrinterModel } from "../src/index.js";
import { fromHex, solidImage, syntheticImage, toHex } from "./helpers.js";
import { imageVectors } from "./fixtures/prototype-vectors.js";

const tiny: PrinterModel = { ...B1, id: "tiny", headDots: 16 };

describe("imageToRows", () => {
  it.each(imageVectors)("matches the prototype rows: $name ($width x $height)", ({ width, height, seed, rows }) => {
    expect(imageToRows(syntheticImage(width, height, seed)).map(toHex)).toEqual(rows);
  });

  it("returns head-width rows, one per image row", () => {
    const rows = imageToRows(solidImage(10, 5, [0, 0, 0, 255]));
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r).toHaveLength(48);
  });

  it("centers a narrower image", () => {
    // 4 black dots on a 16-dot head: offset 6, so dots 6..9 are set -> 00000011 11000000
    expect(toHex(imageToRows(solidImage(4, 1, [0, 0, 0, 255]), tiny)[0] as Uint8Array)).toBe("03c0");
  });

  it("crops a wider image around the center", () => {
    // 20 px wide, left 4 black / middle 12 white / right 4 black; head 16 -> offset -2 keeps px 2..17
    const data = new Uint8ClampedArray(20 * 4);
    for (let x = 0; x < 20; x++) {
      const black = x < 4 || x >= 16;
      data.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], x * 4);
    }
    // visible: px2,3 black (dots 0,1), px4..15 white, px16,17 black (dots 14,15)
    expect(toHex(imageToRows({ width: 20, height: 1, data }, tiny)[0] as Uint8Array)).toBe("c003");
  });

  it("uses the leftmost dot as the most significant bit", () => {
    // 8 px wide on an 8-dot head (no offset): only the first pixel is black
    const data = new Uint8ClampedArray(8 * 4).fill(255);
    data.set([0, 0, 0, 255], 0);
    expect(toHex(imageToRows({ width: 8, height: 1, data }, { ...tiny, headDots: 8 })[0] as Uint8Array)).toBe("80");
  });

  it("thresholds gray at 128: 127 is black, 128 is white", () => {
    const img = (v: number): ImageLike => ({ width: 1, height: 1, data: new Uint8ClampedArray([v, v, v, 255]) });
    const head8 = { ...tiny, headDots: 8 };
    expect(toHex(imageToRows(img(127), head8)[0] as Uint8Array)).toBe("10");
    expect(toHex(imageToRows(img(128), head8)[0] as Uint8Array)).toBe("00");
  });

  it("weights the channels like luma (green counts most)", () => {
    const head8 = { ...tiny, headDots: 8 };
    const px = (r: number, g: number, b: number): ImageLike => ({ width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, 255]) });
    expect(toHex(imageToRows(px(255, 0, 255), head8)[0] as Uint8Array)).toBe("10"); // (299*255 + 114*255)/1000 = 105
    expect(toHex(imageToRows(px(0, 255, 0), head8)[0] as Uint8Array)).toBe("00"); // 149.7
  });

  it("treats fully transparent pixels as white, even with black color channels", () => {
    expect(toHex(imageToRows(solidImage(4, 1, [0, 0, 0, 0]), tiny)[0] as Uint8Array)).toBe("0000");
  });

  it("rejects empty images and data of the wrong size", () => {
    expect(() => imageToRows({ width: 0, height: 1, data: new Uint8ClampedArray(0) })).toThrow(InvalidArgumentError);
    expect(() => imageToRows({ width: 1, height: 0, data: new Uint8ClampedArray(0) })).toThrow(InvalidArgumentError);
    expect(() => imageToRows({ width: 1.5, height: 1, data: new Uint8ClampedArray(6) })).toThrow(InvalidArgumentError);
    expect(() => imageToRows({ width: 2, height: 2, data: new Uint8ClampedArray(8) })).toThrow(/expected 16/);
  });

  it("rejects an image taller than a page can hold", () => {
    expect(() => imageToRows({ width: 1, height: 65536, data: new Uint8ClampedArray(65536 * 4) })).toThrow(InvalidArgumentError);
  });

  it("round-trips through fromHex for the helpers", () => {
    expect(toHex(fromHex("c003"))).toBe("c003");
  });
});
