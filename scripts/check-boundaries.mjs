import { readFileSync } from "node:fs";

const rules = [
  { files: ["dist/core.js", "dist/cloudflare.js"], forbidden: ["maplibre-gl", "from\"lit\"", "from\"react\"", "document.", "customElements"] },
  { files: ["dist/element.js"], forbidden: ["maplibre-gl", "from\"react\""] },
  { files: ["dist/react.js"], forbidden: ["maplibre-gl"] },
];
const failures = [];
for (const rule of rules) for (const file of rule.files) {
  const text = readFileSync(file, "utf8");
  for (const token of rule.forbidden) if (text.includes(token)) failures.push(`${file} contains forbidden dependency token ${token}`);
}
const elementSource = readFileSync("src/element/index.ts", "utf8");
if (/\n\s*defineFreeMapElements\(\);/.test(elementSource)) failures.push("element entry registers custom elements as an import side effect");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("Package dependency boundaries and explicit element registration verified.");
