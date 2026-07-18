import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const secret = /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_./+-]{16,}/i;
const matches = [];
for (const file of tracked) {
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => { if (secret.test(line)) matches.push(`${file}:${index + 1}:${line}`); });
}
if (matches.length) { console.error(matches.join("\n")); process.exit(1); }
console.log("No likely committed secrets found.");
