import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const secret = /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_./+-]{16,}/i;
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const localHome = /(?:\/(?:Users|home)\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/i;
const matches = [];
for (const file of tracked) {
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const generatedDependencyMetadata = file === "package-lock.json";
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (secret.test(line)) matches.push(`${file}:${index + 1}:likely secret`);
    if (localHome.test(line)) matches.push(`${file}:${index + 1}:local home path`);
    if (!generatedDependencyMetadata) {
      for (const candidate of line.matchAll(email)) {
        if (!/@(?:2x|3x)\.(?:json|png|webp|avif)$/i.test(candidate[0])) {
          matches.push(`${file}:${index + 1}:email address`);
        }
      }
    }
  });
}

const allowedCommitEmail = /^(?:noreply@github\.com|noreply@anthropic\.com|codex@openai\.com|\d+\+[A-Z0-9-]+@users\.noreply\.github\.com)$/i;
const requestedHead = process.env.CHECK_SECRETS_HEAD ?? "HEAD";
const parentLine = execFileSync("git", ["rev-list", "--parents", "-n", "1", requestedHead], { encoding: "utf8" }).trim().split(" ");
// pull_request workflows check out a synthetic merge commit. Its author is
// GitHub account metadata, not repository content or a branch commit, so scan
// the PR head (second parent) instead.
const scanHead = process.env.GITHUB_EVENT_NAME === "pull_request" && parentLine.length >= 3 ? parentLine[2] : parentLine[0];
const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
let revisions = [scanHead];
try {
  const base = execFileSync("git", ["merge-base", scanHead, baseRef], { encoding: "utf8" }).trim();
  const introduced = execFileSync("git", ["rev-list", `${base}..${scanHead}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  if (introduced.length) revisions = introduced;
} catch {
  // A source archive may not have the remote base ref; checking its resolved
  // head is still deterministic and avoids widening the scan to unrelated refs.
}
const identities = execFileSync("git", ["show", "-s", "--format=%H%x00%ae%x00%ce", ...revisions], { encoding: "utf8" });
for (const row of identities.trim().split("\n")) {
  if (!row) continue;
  const [commit, authorEmail, committerEmail] = row.split("\0");
  if (!allowedCommitEmail.test(authorEmail)) matches.push(`${commit}:author email is not a no-reply identity`);
  if (!allowedCommitEmail.test(committerEmail)) matches.push(`${commit}:committer email is not a no-reply identity`);
}

if (matches.length) {
  console.error(matches.join("\n"));
  process.exit(1);
}
console.log("No likely committed secrets, personal paths, emails, or non-no-reply Git identities found.");
