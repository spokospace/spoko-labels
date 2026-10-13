// Tiny static file server for the demo page. No dependencies.
// Web Bluetooth needs a secure context, and http://localhost counts as one.
//
//   pnpm --filter @spokospace/labels-render example
//   open http://localhost:8081/examples/demo/
//
// The root is this package, so the page can import ../../dist, the bundled fonts, and (through
// node_modules) the labels-core build and qrcode-generator; see the import map in demo/index.html.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 8081);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (statSync(path).isDirectory()) path = join(path, "index.html");
    statSync(path);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(path).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo page: http://localhost:${port}/examples/demo/`);
});
