import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./worker/index.ts",
    miniflare: {
      compatibilityDate: "2026-07-19",
      r2Buckets: ["BASEMAP"],
      bindings: {
        TILE_SESSION_SECRET: ["free", "maps", "worker", "test", "only"].join("-"),
        APP_VERSION: "0.3.0-test",
        BASEMAP_VERSION: "20260717",
        BASEMAP_KEY: "basemaps/greater-melbourne-20260717.pmtiles",
        TILE_CACHE_NAMESPACE: "free-maps-test",
        TILE_CACHE_VERSION: "v0.3.0-test",
        TILE_ENCODING_REVISION: "mvt-gzip-v1-test",
        PRODUCTION_ORIGIN: "https://free-maps.forkandflag.com",
      },
      serviceBindings: { ASSETS: () => new Response("asset", { status: 200 }) },
    },
  })],
  test: { include: ["tests/worker/**/*.test.ts"] },
});
