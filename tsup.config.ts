import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    core: "src/core/index.ts",
    element: "src/element/index.ts",
    maplibre: "src/maplibre/index.ts",
    react: "src/react/index.tsx",
    cloudflare: "src/cloudflare/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: false,
  treeshake: true,
  external: ["react", "react-dom", "maplibre-gl", "maplibre-gl/dist/maplibre-gl-csp"],
});
