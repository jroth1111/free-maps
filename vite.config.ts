import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const inlineShellCss = {
  name: "inline-shell-css",
  enforce: "post" as const,
  generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
    const styles = Object.entries(bundle).filter(([, asset]) => asset.type === "asset" && asset.fileName.endsWith(".css"));
    const inlined = new Set<string>();
    for (const asset of Object.values(bundle)) if (asset.type === "asset" && asset.fileName.endsWith(".html")) for (const [key, cssAsset] of styles) {
      const href = cssAsset.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const before = String(asset.source);
      asset.source = before.replace(new RegExp(`<link rel="stylesheet"[^>]+href="/${href}"[^>]*>`), `<style>${String(cssAsset.source)}</style>`);
      if (asset.source !== before) inlined.add(key);
    }
    for (const key of inlined) delete bundle[key];
  },
};

export default defineConfig({
  plugins: [inlineShellCss, react()],
  root: "demo",
  publicDir: "../public",
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve("demo/index.html"),
        embed: resolve("demo/embed/index.html"),
        states: resolve("demo/states/index.html"),
        vanilla: resolve("demo/vanilla/index.html"),
        react: resolve("demo/react/index.html"),
        stress: resolve("demo/stress/index.html"),
        notFound: resolve("demo/404.html"),
      },
    },
  },
  server: { port: 4173, strictPort: true },
});
