import { execFileSync, spawnSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const result = tracked.length ? spawnSync("rg", ["-n", "--no-heading", "(?i)(api[_-]?key|secret|token|password)\\s*[:=]\\s*['\"][A-Za-z0-9_./+-]{16,}", ...tracked], { encoding: "utf8" }) : { status: 1, stdout: "" };
if (result.status === 0 && result.stdout.trim()) { console.error(result.stdout); process.exit(1); }
if (result.status !== 0 && result.status !== 1) throw new Error("Secret scan failed to run");
console.log("No likely committed secrets found.");
