// Test labels drawn with plain Canvas 2D. Made-up content only. 384 x 240 dots = 48 x 30 mm at 8 dots/mm.
export const WIDTH = 384;
export const HEIGHT = 240;

function base() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.textBaseline = "top";
  return { canvas, ctx };
}

/** Each entry draws onto a fresh canvas; `caption` is a short line such as the density used. */
export const LABELS = {
  "Frame and text": (caption) => {
    const { canvas, ctx } = base();
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("labels-core", 24, 28);
    ctx.font = "26px sans-serif";
    ctx.fillText("hardware check", 24, 90);
    ctx.fillText(caption || "48 x 30 mm", 24, 130);
    ctx.fillRect(24, 180, WIDTH - 48, 6);
    return canvas;
  },
  "Edge ruler (is anything cut off?)": (caption) => {
    const { canvas, ctx } = base();
    ctx.fillRect(0, 0, WIDTH, 6);
    ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);
    ctx.fillRect(0, 0, 6, HEIGHT);
    ctx.fillRect(WIDTH - 6, 0, 6, HEIGHT);
    for (let x = 0; x <= WIDTH; x += 8) ctx.fillRect(x, 6, 1, x % 80 === 0 ? 30 : 12);
    for (let y = 0; y <= HEIGHT; y += 8) ctx.fillRect(6, y, y % 80 === 0 ? 30 : 12, 1);
    ctx.font = "22px sans-serif";
    ctx.fillText(caption || "ruler: 10 mm ticks", 60, 100);
    return canvas;
  },
  "Margin probe (numbered mm scales)": () => {
    // Every edge carries a scale in millimetres measured from that edge of the 48 x 30 mm image
    // (8 dots = 1 mm). The smallest number you can still read on the printed label on each side
    // tells how much of that edge is lost.
    const { canvas, ctx } = base();
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const tick = (x, y, w, h) => ctx.fillRect(x, y, w, h);
    for (let mm = 0; mm <= 48; mm++) {
      const x = Math.min(mm * 8, WIDTH - 1);
      const long = mm % 5 === 0;
      tick(x, 0, 1, long ? 14 : 7); // top, numbered from the left edge
      tick(x, HEIGHT - (long ? 14 : 7), 1, long ? 14 : 7); // bottom
      if (long && mm > 0 && mm < 47) {
        ctx.fillText(String(mm), x, 22);
        ctx.fillText(String(mm), x, HEIGHT - 22);
      }
    }
    ctx.textAlign = "left";
    for (let mm = 0; mm <= 30; mm++) {
      const y = Math.min(mm * 8, HEIGHT - 1);
      const long = mm % 5 === 0;
      tick(0, y, long ? 14 : 7, 1); // left, numbered from the top edge
      tick(WIDTH - (long ? 14 : 7), y, long ? 14 : 7, 1); // right
      if (long && mm > 0 && mm < 30) {
        ctx.fillText(String(mm), 18, y);
        ctx.textAlign = "right";
        ctx.fillText(String(mm), WIDTH - 18, y);
        ctx.textAlign = "left";
      }
    }
    ctx.textAlign = "center";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("TOP", WIDTH / 2, 70);
    ctx.font = "13px sans-serif";
    ctx.fillText("numbers = mm from that edge", WIDTH / 2, 100);
    ctx.fillText("top row = first row sent", WIDTH / 2, 120);
    return canvas;
  },
  "Top offset probe (1-dot bars)": () => {
    // Bar k is one dot high and sits in image row k (row 0 is the first row that is sent). If the first
    // `n` rows fall outside the label, bars 0 to n-1 are missing: the number under the first visible
    // bar is the number of rows (8 rows = 1 mm) lost at the top.
    const { canvas, ctx } = base();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let k = 0; k <= 15; k++) {
      const x = 12 + k * 23;
      ctx.fillRect(x, k, 16, 1);
      ctx.fillText(String(k), x + 8, 20 + (k % 2) * 13);
    }
    // the same at the bottom, counted from the last row (239 is the last row that is sent)
    for (let k = 0; k <= 15; k++) {
      const x = 12 + k * 23;
      ctx.fillRect(x, HEIGHT - 1 - k, 16, 1);
      ctx.fillText(String(k), x + 8, HEIGHT - 36 - (k % 2) * 13);
    }
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("rows lost at top = first visible bar", WIDTH / 2, 90);
    ctx.font = "13px sans-serif";
    ctx.fillText("bars at the bottom are counted from the last row", WIDTH / 2, 115);
    ctx.fillText("(8 dots = 1 mm)", WIDTH / 2, 135);
    return canvas;
  },
  "Density test (black blocks and stripes)": (caption) => {
    const { canvas, ctx } = base();
    ctx.fillRect(16, 16, 160, 90);
    for (let x = 200; x < WIDTH - 16; x += 8) ctx.fillRect(x, 16, 4, 90);
    for (let y = 130; y < 200; y += 6) ctx.fillRect(16, y, WIDTH - 32, 3);
    ctx.font = "20px sans-serif";
    ctx.fillText(caption || "solid / stripes / lines", 16, 208);
    return canvas;
  },
  "Checkerboard": () => {
    const { canvas, ctx } = base();
    const size = 16;
    for (let y = 0; y < HEIGHT; y += size) {
      for (let x = 0; x < WIDTH; x += size) if (((x + y) / size) % 2 === 0) ctx.fillRect(x, y, size, size);
    }
    return canvas;
  },
  "Mostly empty (single line)": () => {
    const { canvas, ctx } = base();
    ctx.fillRect(40, 120, WIDTH - 80, 2);
    return canvas;
  },
};
