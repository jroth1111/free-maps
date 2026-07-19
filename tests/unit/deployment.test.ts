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
    for (const section of headers.split(/\n(?=\/)/).filter((value) => !/^\/(?:assets|fonts\/v|map-assets\/v)/.test(value))) {
      expect(section).not.toContain("Cloudflare-CDN-Cache-Control");
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
    expect(shared).not.toMatch(/themes\/.*\.css/);
    expect(states).not.toMatch(/themes\/.*\.css/);
  });
});
