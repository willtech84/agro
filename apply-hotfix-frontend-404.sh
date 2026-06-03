#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_SERVER="$ROOT_DIR/frontend/server.js"

echo "[agro-hotfix] Aplicando correção do server.js do frontend..."
cat > "$FRONTEND_SERVER" <<'SERVER'
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT || 3000;
const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";

const publicPathCandidates = [
  resolve(process.cwd(), "public"),
  resolve(fileURLToPath(new URL("./public/", import.meta.url)))
];

const publicPath = publicPathCandidates.find((candidate) => existsSync(resolve(candidate, "index.html")));

if (!publicPath) {
  const details = publicPathCandidates.map((candidate) => `- ${candidate}`).join("\n");
  throw new Error(`Diretório public não encontrado. Caminhos tentados:\n${details}`);
}

const indexFilePath = resolve(publicPath, "index.html");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function getSafeFilePath(pathname) {
  const relativePath = pathname.replace(/^[/\\]+/, "") || "index.html";
  const resolvedPath = resolve(publicPath, relativePath);
  const rel = relative(publicPath, resolvedPath);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }

  return resolvedPath;
}

async function proxyApi(req, res, pathname, search) {
  const target = `${backendUrl}${pathname.replace(/^\/api/, "")}${search}`;

  try {
    const headers = {
      accept: firstHeader(req.headers.accept) || "application/json"
    };

    if (req.headers.authorization) {
      headers.authorization = firstHeader(req.headers.authorization);
    }

    if (req.headers["content-type"]) {
      headers["content-type"] = firstHeader(req.headers["content-type"]);
    }

    const fetchOptions = {
      method: req.method,
      headers
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = req;
      fetchOptions.duplex = "half";
    }

    const upstream = await fetch(target, {
      ...fetchOptions
    });

    const body = await upstream.arrayBuffer();
    const responseHeaders = { "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8" };
    res.writeHead(upstream.status, responseHeaders);
    res.end(Buffer.from(body));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Backend indisponível", details: error.message }));
  }
}

async function serveFile(res, filePath) {
  if (!filePath) {
    return false;
  }

  try {
    const data = await readFile(filePath);
    const type = contentTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await proxyApi(req, res, url.pathname, url.search);
    return;
  }

  let pathname = "/";

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  if (pathname === "/") {
    const rootServed = await serveFile(res, indexFilePath);

    if (rootServed) {
      return;
    }
  }

  const filePath = getSafeFilePath(pathname);
  const served = await serveFile(res, filePath);

  if (served) {
    return;
  }

  if (!extname(pathname)) {
    const fallbackServed = await serveFile(res, indexFilePath);

    if (fallbackServed) {
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(port, () => {
  console.log(`[agro-frontend] Frontend running on port ${port}`);
  console.log(`[agro-frontend] Serving static files from: ${publicPath}`);
  console.log(`[agro-frontend] cwd: ${process.cwd()}`);
});
SERVER

echo "[agro-hotfix] Correção aplicada em frontend/server.js"
echo "[agro-hotfix] Agora execute: cd /c/agro && ./start-local.sh"
