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

    expect(config.assets?.run_worker_first).toEqual(["/api/*", "/tiles/*"]);
    expect(config.exports?.default?.cache?.enabled).toBe(false);
    expect(headers).not.toMatch(/\/fonts\/(?:Noto|ui\/)/);
    for (const section of headers.split(/\n(?=\/)/).filter((value) => !/^\/(?:assets|fonts\/v|map-assets\/v)/.test(value))) {
      expect(section).not.toContain("Cloudflare-CDN-Cache-Control");
    }
  });
});
