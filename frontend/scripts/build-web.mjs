import { access } from "node:fs/promises";
import { resolve } from "node:path";

const publicDir = resolve("public");

await access(resolve(publicDir, "index.html"));
await access(resolve(publicDir, "app.js"));
await access(resolve(publicDir, "manifest.webmanifest"));

console.log("Frontend web assets ready:", publicDir);
