import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const gzipBytes = (path) => gzipSync(readFileSync(path), { level: 9 }).byteLength;
const visited = new Set();
const staticBytes = (path) => {
  const absolute = resolve(path);
  if (visited.has(absolute)) return 0;
  visited.add(absolute);
  const source = readFileSync(absolute, "utf8");
  let total = gzipBytes(absolute);
  for (const match of source.matchAll(/(?:from\s+|import\s+)["'](\.\/[^"']+\.js)["']/g)) total += staticBytes(resolve("dist", match[1]));
  return total;
};
const shell = staticBytes("dist/core.js") + staticBytes("dist/element.js");
if (shell > 15 * 1024) throw new Error(`Core + element shell is ${(shell / 1024).toFixed(1)} KiB gzip; budget is at most 15 KiB`);
for (const name of ["atlas.css", "atlas-dark.css", "signal.css", "signal-dark.css", "contrast.css"]) {
  const bytes = gzipBytes(resolve("dist/themes", name));
  if (bytes > 1.5 * 1024) throw new Error(`${name} is ${(bytes / 1024).toFixed(1)} KiB gzip; budget is at most 1.5 KiB`);
}
const workerDir = resolve("worker-dist");
let workerBytes = 0;
if (statSync(workerDir, { throwIfNoEntry: false })?.isDirectory()) for (const name of readdirSync(workerDir)) { const path = join(workerDir, name); if (statSync(path).isFile() && name.endsWith(".js")) workerBytes += gzipBytes(path); }
if (workerBytes && workerBytes >= 1024 * 1024) throw new Error(`Worker is ${(workerBytes / 1024).toFixed(1)} KiB gzip; budget is under 1 MiB`);
console.log(`core + element: ${(shell / 1024).toFixed(1)} KiB gzip${workerBytes ? `; worker: ${(workerBytes / 1024).toFixed(1)} KiB gzip` : ""}`);
