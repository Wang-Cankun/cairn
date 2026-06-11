/**
 * Minimal static file server for verifying the production `dist/` bundle (and any immutable
 * snapshot dir, which has the identical shape: index.html + assets/ + data/). No dependencies.
 *
 *   bun run scripts/serve.ts [dir] [port]
 *
 * Defaults: dir = ./dist, port = 4178. SPA-style fallback to index.html for unknown routes.
 */
import { join, normalize } from "node:path";

const dir = process.argv[2] ?? join(import.meta.dir, "..", "dist");
const port = Number(process.argv[3] ?? 4178);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function contentType(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  return TYPES[ext] ?? "application/octet-stream";
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    // prevent path traversal
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(dir, safe);

    let file = Bun.file(filePath);
    if (!(await file.exists())) {
      // SPA fallback for client-side routing / direct deep links
      file = Bun.file(join(dir, "index.html"));
      if (!(await file.exists())) {
        return new Response("404", { status: 404 });
      }
      return new Response(file, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response(file, { headers: { "content-type": contentType(filePath) } });
  },
});

console.log(`cairn-site static server → http://localhost:${server.port}  (serving ${dir})`);
