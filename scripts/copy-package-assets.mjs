import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  ["node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2", "hanken-grotesk-latin-wght-normal.woff2"],
  ["node_modules/@fontsource-variable/literata/files/literata-latin-wght-normal.woff2", "literata-latin-wght-normal.woff2"],
];
mkdirSync(resolve(root, "dist/assets"), { recursive: true });
mkdirSync(resolve(root, "public/fonts/ui"), { recursive: true });
for (const [source, name] of assets) {
  copyFileSync(resolve(root, source), resolve(root, "dist/assets", name));
  copyFileSync(resolve(root, source), resolve(root, "public/fonts/ui", name));
}
const css = readFileSync(resolve(root, "src/element/fonts.css"), "utf8").replaceAll("/fonts/ui/", "./assets/");
writeFileSync(resolve(root, "dist/heritage.css"), css);
