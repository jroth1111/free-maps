import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment routing", () => {
  it("routes version-sensitive documents through the selected Worker version", () => {
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

  it("keeps the acceptance preview isolated from production routes and caches", () => {
    const config = JSON.parse(readFileSync(resolve("wrangler.jsonc"), "utf8")) as {
      r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
      vars?: Record<string, string>;
      env?: {
        preview?: {
          name?: string;
          workers_dev?: boolean;
          preview_urls?: boolean;
          routes?: unknown[];
          version_metadata?: { binding?: string };
          r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
          vars?: Record<string, string>;
        };
      };
    };
    const preview = config.env?.preview;

    expect(preview).toMatchObject({
      name: "free-maps-preview",
      workers_dev: true,
      preview_urls: false,
      routes: [],
      version_metadata: { binding: "CF_VERSION_METADATA" },
    });
    expect(preview?.r2_buckets).toEqual(config.r2_buckets);
    expect(preview?.vars).toMatchObject({
      APP_VERSION: config.vars?.APP_VERSION,
      BASEMAP_VERSION: config.vars?.BASEMAP_VERSION,
      BASEMAP_KEY: config.vars?.BASEMAP_KEY,
      TILE_CACHE_VERSION: config.vars?.TILE_CACHE_VERSION,
      TILE_ENCODING_REVISION: config.vars?.TILE_ENCODING_REVISION,
      TILE_CACHE_NAMESPACE: "free-maps-preview",
      PRODUCTION_ORIGIN: "https://free-maps-preview.gwizz.workers.dev",
    });
    expect(preview?.vars?.PRODUCTION_ORIGIN).not.toBe(config.vars?.PRODUCTION_ORIGIN);
    expect(readFileSync(resolve("package.json"), "utf8")).toContain('"deploy:preview": "node scripts/deploy.mjs --preview"');
    const deployScript = readFileSync(resolve("scripts/deploy.mjs"), "utf8");
    expect(deployScript).toContain('"--env", preview.length ? "preview" : ""');
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

  it("accepts role identities while rejecting personal source-commit email", () => {
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

  it("scans source commits instead of GitHub merge metadata after a main push", () => {
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
    const base = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
    const createCommit = (parents: string[], email: string, subject: string) => execFileSync("git", [
      "commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent]),
    ], {
      encoding: "utf8",
      input: `${subject}\n`,
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
      env: { ...process.env, CHECK_SECRETS_HEAD: head, GITHUB_BASE_REF: "", GITHUB_EVENT_NAME: "push" },
    });

    const roleEmail = ["codex", "openai.com"].join("@");
    const personalEmail = ["person", "example.test"].join("@");
    const acceptedSource = createCommit([base], roleEmail, "accepted source");
    const acceptedMerge = createCommit([base, acceptedSource], personalEmail, "merge metadata");
    expect(run(acceptedMerge)).toMatchObject({ status: 0 });

    const rejectedSource = createCommit([base], personalEmail, "rejected source");
    const rejectedMerge = createCommit([base, rejectedSource], personalEmail, "merge metadata");
    const rejected = run(rejectedMerge);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain(`${rejectedSource}:author email is not a no-reply identity`);
    expect(rejected.stderr).not.toContain(`${rejectedMerge}:author email is not a no-reply identity`);
  });
});
