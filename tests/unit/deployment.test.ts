import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment routing", () => {
  it("routes every asset request through the selected Worker version", () => {
    const config = JSON.parse(readFileSync(resolve("wrangler.jsonc"), "utf8")) as {
      assets?: { run_worker_first?: boolean };
      exports?: { default?: { cache?: { enabled?: boolean } } };
    };

    expect(config.assets?.run_worker_first).toBe(true);
    expect(config.exports?.default?.cache?.enabled).toBe(false);
  });
});
