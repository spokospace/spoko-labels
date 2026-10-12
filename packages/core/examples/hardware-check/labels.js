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
