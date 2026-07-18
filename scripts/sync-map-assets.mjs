import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const revision = "028c18f713baecad011301ff7a69acc39bcc2ae7";
const base = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${revision}`;
const paths = [
  ...["0-255.pbf", "256-511.pbf", "8192-8447.pbf"].map((range) => `fonts/Noto Sans Regular/${range}`),
];
for (const path of paths) {
  const response = await fetch(`${base}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  const destination = resolve(root, "public", path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  console.log(path);
}
