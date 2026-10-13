// Tiny static file server for the hardware-check page. No dependencies.
// Web Bluetooth needs a secure context, and http://localhost counts as one.
//
//   pnpm --filter @spokospace/labels-core example
//   open http://localhost:8080/examples/hardware-check/
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

createServer((req, res) => {
  let path;
  try {
    path = normalize(join(root, decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname)));
  } catch {
    // A malformed escape such as "%E0%A4%A" would otherwise throw and stop the server.
    res.writeHead(400).end("Bad request");
    return;
  }
  if (path !== root && !path.startsWith(root + sep)) {
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
  createReadStream(path)
    .on("error", () => res.destroy())
    .pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Hardware-check page: http://localhost:${port}/examples/hardware-check/`);
});
