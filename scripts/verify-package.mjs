import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

mkdirSync("artifacts", { recursive: true });
for (const name of ["free-maps-0.2.0.tgz", "free-maps-0.2.0.tgz.sha256"]) rmSync(resolve("artifacts", name), { force: true });
const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", "artifacts"], { encoding: "utf8" }))[0];
const tarball = resolve("artifacts", packed.filename);
for (const entry of ["package/dist/core.js", "package/dist/cloudflare.js", "package/dist/element.js", "package/dist/react.js", "package/dist/heritage.css"]) if (!packed.files.some((file) => file.path === entry.slice(8))) throw new Error(`Package is missing ${entry}`);
for (const file of ["dist/core.js", "dist/cloudflare.js", "dist/element.js"]) {
  const text = readFileSync(file, "utf8");
  if (/maplibre-gl|from\s*["']react/.test(text)) throw new Error(`${file} pulls MapLibre or React`);
}
const root = mkdtempSync(join(tmpdir(), "free-maps-package-"));
try {
  for (const kind of ["vanilla", "react"]) {
    const fixture = join(root, kind); mkdirSync(fixture);
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { "free-maps": `file:${tarball}`, typescript: "^5.9.2", ...(kind === "react" ? { react: "^19.1.1", "@types/react": "^19.1.10" } : {}) } }));
    writeFileSync(join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, module: "ESNext", moduleResolution: "Bundler", target: "ES2022", lib: ["ES2022", "DOM"], jsx: "react-jsx", skipLibCheck: true }, include: ["index.ts", "index.tsx"] }));
    writeFileSync(join(fixture, kind === "react" ? "index.tsx" : "index.ts"), kind === "react" ? `import { FreeMapExplorer } from "free-maps/react"; import { createMapLibreRenderer } from "free-maps/maplibre"; import type { FreeMapDataset } from "free-maps/core"; declare const data: FreeMapDataset; <FreeMapExplorer data={data} renderer={createMapLibreRenderer()} />;` : `import { parseFreeMapDataset } from "free-maps/core"; import { defineFreeMapElements } from "free-maps/element"; import type { PmtilesHandlerOptions } from "free-maps/cloudflare"; defineFreeMapElements(); void parseFreeMapDataset; type Options = PmtilesHandlerOptions;`);
    execFileSync("npm", ["install", "--ignore-scripts"], { cwd: fixture, stdio: "ignore" });
    execFileSync("npx", ["tsc", "--noEmit"], { cwd: fixture, stdio: "inherit" });
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log(`${basename(tarball)} installs and typechecks in isolated vanilla and React fixtures.`);
