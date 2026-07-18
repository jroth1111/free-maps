import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const inlineShellCss = {
  name: "inline-shell-css",
  enforce: "post" as const,
  generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
    const entry = Object.entries(bundle).find(([, asset]) => asset.type === "asset" && asset.fileName.endsWith(".css") && String(asset.source).includes(".site-header"));
    if (!entry) return;
    const [key, cssAsset] = entry; const css = String(cssAsset.source);
    for (const asset of Object.values(bundle)) if (asset.type === "asset" && asset.fileName.endsWith(".html")) asset.source = String(asset.source).replace(new RegExp(`<link rel="stylesheet"[^>]+href="/${cssAsset.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`), `<style>${css}</style>`);
    delete bundle[key];
  },
};

export default defineConfig({
  plugins: [inlineShellCss, react()],
  root: "demo",
  publicDir: "../public",
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    sourcemap: false,
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
