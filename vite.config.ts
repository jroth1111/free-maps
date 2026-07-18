import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "demo",
  publicDir: "../public",
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: { port: 4173, strictPort: true },
});
