import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./worker/index.ts",
    miniflare: {
      compatibilityDate: "2026-07-18",
      r2Buckets: ["BASEMAP"],
      bindings: {
        TILE_SESSION_SECRET: ["free", "maps", "worker", "test", "only"].join("-"),
        APP_VERSION: "0.1.0-test",
        BASEMAP_VERSION: "20260717",
        BASEMAP_KEY: "basemaps/greater-melbourne-20260717.pmtiles",
        PRODUCTION_ORIGIN: "https://free-maps.forkandflag.com",
      },
      serviceBindings: { ASSETS: () => new Response("asset", { status: 200 }) },
    },
  })],
  test: { include: ["tests/worker/**/*.test.ts"] },
});
