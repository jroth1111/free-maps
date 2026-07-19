import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment routing", () => {
  it("routes every asset request through the selected Worker version", () => {
    const config = JSON.parse(readFileSync(resolve("wrangler.jsonc"), "utf8")) as {
      assets?: { run_worker_first?: string[] };
      exports?: { default?: { cache?: { enabled?: boolean } } };
    };
    const headers = readFileSync(resolve("public/_headers"), "utf8");

    expect(config.assets?.run_worker_first).toEqual([
      "/api/*", "/tiles/*", "/", "/embed", "/embed/", "/states", "/states/", "/vanilla", "/vanilla/", "/react", "/react/", "/stress", "/stress/",
    ]);
    expect(config.exports?.default?.cache?.enabled).toBe(false);
    expect(headers).not.toMatch(/\/fonts\/(?:Noto|ui\/)/);
    for (const section of headers.split(/\n(?=\/)/).filter((value) => value.split("\n", 1)[0] !== "/*" && !/^\/(?:assets|fonts\/v|map-assets\/v)/.test(value))) {
      expect(section).toContain("Cloudflare-CDN-Cache-Control: no-store");
      expect(section).not.toMatch(/Cloudflare-CDN-Cache-Control: public/);
    }
  });

  it("discovers demo themes before route enhancement", () => {
    const siteCss = readFileSync(resolve("demo/site.css"), "utf8");
    const statesCss = readFileSync(resolve("demo/states.css"), "utf8");
    const shared = readFileSync(resolve("demo/shared.ts"), "utf8");
    const states = readFileSync(resolve("demo/states.ts"), "utf8");
    const statesHtml = readFileSync(resolve("demo/states/index.html"), "utf8");

    expect(siteCss).toContain('@import "../src/themes/atlas.css"');
    for (const theme of ["atlas-dark", "signal", "signal-dark", "contrast"]) expect(statesCss).toContain(`@import "../src/themes/${theme}.css"`);
    expect(statesHtml).toContain('<link rel="stylesheet" href="/states.css">');
    expect(statesHtml).not.toMatch(/<free-map-explorer(?![^>]*\brole="region")[^>]*\baria-label=/);
    expect(shared).not.toMatch(/themes\/.*\.css/);
    expect(states).not.toMatch(/themes\/.*\.css/);
  });

  it("accepts the Codex role identity for synthetic PR heads while rejecting personal commit email", () => {
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
    const base = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
    const createCommit = (email: string) => execFileSync("git", ["commit-tree", tree, "-p", base], {
      encoding: "utf8",
      input: "identity fixture\n",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Automated fixture",
        GIT_AUTHOR_EMAIL: email,
        GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
        GIT_COMMITTER_NAME: "Automated fixture",
        GIT_COMMITTER_EMAIL: email,
        GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
      },
    }).trim();
    const run = (head: string) => spawnSync(process.execPath, [resolve("scripts/check-secrets.mjs")], {
      encoding: "utf8",
      env: { ...process.env, CHECK_SECRETS_HEAD: head, GITHUB_BASE_REF: "main", GITHUB_EVENT_NAME: "" },
    });

    const roleEmail = ["codex", "openai.com"].join("@");
    const personalEmail = ["person", "example.test"].join("@");
    expect(run(createCommit(roleEmail))).toMatchObject({ status: 0 });
    const rejected = run(createCommit(personalEmail));
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("author email is not a no-reply identity");
    expect(rejected.stderr).toContain("committer email is not a no-reply identity");
  });
});
