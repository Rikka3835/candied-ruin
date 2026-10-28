import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const port = Number(process.argv[3] || 8099);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(root, p);
    if (!file.startsWith(root)) {
      res.writeHead(403).end("no");
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" }).end("404 " + p);
        return;
      }
      res.writeHead(200, { 'cache-control': 'no-store', "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  })
  .listen(port, "127.0.0.1", () => console.log("serving " + root + " on " + port));

