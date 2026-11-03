// Serves the repository as it is (no build step), for the browser tests.
// Usage: node tests/support/server.js   (PORT defaults to 4173)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || rel.includes("/node_modules/")) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
