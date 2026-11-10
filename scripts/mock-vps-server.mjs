// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8089;
const SERVING_DIR = process.argv[2] || "/tmp/mock-vps-deploy/dist";

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Mock storage-api endpoint
    if (pathname === "/api/storage/chili3d-db/recents") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ id: "rkCpzg-RRw54RMY1meB4B", name: "Dự án 1" }]));
        return;
    }

    if (pathname.startsWith("/api/storage/chili3d-db/")) {
        const docPath = path.resolve(__dirname, "../data/du_an_1_latest.json");
        if (fs.existsSync(docPath)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            fs.createReadStream(docPath).pipe(res);
            return;
        }
    }

    // Proxy other API endpoints if needed
    if (pathname.startsWith("/api/")) {
        fetch(`http://136.66.95.155${url.pathname}${url.search}`, {
            method: req.method,
            headers: { host: "136.66.95.155" },
        })
            .then(async (vpsRes) => {
                res.writeHead(vpsRes.status, Object.fromEntries(vpsRes.headers.entries()));
                const buf = await vpsRes.arrayBuffer();
                res.end(Buffer.from(buf));
            })
            .catch((err) => {
                res.writeHead(502, { "Content-Type": "text/plain" });
                res.end(`Proxy Error: ${err.message}`);
            });
        return;
    }

    if (pathname === "/" || pathname === "/index.html") {
        pathname = "/index.html";
    }

    const filePath = path.join(SERVING_DIR, pathname);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${pathname}`);
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const headers = { "Content-Type": contentType };

    if (pathname === "/index.html" || pathname.endsWith(".json")) {
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    } else if (pathname.match(/\.[0-9a-fA-F]{8,32}\.(js|css|wasm)$/)) {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Mock VPS Server running on http://127.0.0.1:${PORT}`);
});
