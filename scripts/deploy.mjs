import { spawnSync } from "node:child_process";

const executable = (name) => process.platform === "win32" ? `${name}.cmd` : name;

function run(name, args, options = {}) {
  const result = spawnSync(executable(name), args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout?.trim() ?? "";
}

const dirty = run("git", ["status", "--porcelain"]);
if (dirty) {
  console.error("Refusing to deploy a dirty worktree because /api/health must identify the deployed source commit.");
  process.exit(1);
}

const commit = run("git", ["rev-parse", "HEAD"]);
const preview = process.argv.slice(2);
if (preview.length > 1 || (preview.length === 1 && preview[0] !== "--preview")) {
  console.error("Usage: node scripts/deploy.mjs [--preview]");
  process.exit(1);
}
run("npm", ["run", "build"], { stdio: "inherit" });
run("npx", ["wrangler", "deploy", "--env", preview.length ? "preview" : "", "--var", `GIT_COMMIT:${commit}`], { stdio: "inherit" });
