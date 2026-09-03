// Local preview of dist/ with the same Accept negotiation as nginx/default.conf.template.
//   node build.mjs && PORT=8090 node serve.mjs
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT) || 8090;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

http
  .createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.includes("..")) return res.writeHead(400).end();
    if (pathname === "/health") return res.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    const variant = /text\/html/i.test(req.headers.accept || "") ? ".html" : ".md";
    const candidates = pathname === "/" ? [`/index${variant}`] : [pathname, pathname + variant, pathname + ".html"];
    for (const candidate of candidates) {
      const file = path.join(DIST, candidate);
      if (!file.startsWith(DIST) || !(await isFile(file))) continue;
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        vary: "Accept",
        "cache-control": "no-store",
      });
      return res.end(await readFile(file));
    }
    res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
  })
  .listen(PORT, () => console.log(`prompton-docs preview: http://localhost:${PORT}/  (serving dist/, Accept negotiation like nginx)`));
