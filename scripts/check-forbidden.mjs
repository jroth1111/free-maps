import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const forbidden = ["@googlemaps", "google.maps", "maps.googleapis.com", "maps.google.com"];
const roots = ["src", "demo", "worker", "dist"].map((path) => resolve(path));
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".json"]);
const failures = [];
const walk = (path) => {
  if (!statSync(path).isDirectory()) return;
  for (const name of readdirSync(path)) {
    const entry = join(path, name);
    if (statSync(entry).isDirectory()) walk(entry);
    else if (extensions.has(extname(entry))) {
      const content = readFileSync(entry, "utf8").toLowerCase();
      for (const value of forbidden) if (content.includes(value)) failures.push(`${entry}: ${value}`);
    }
  }
};
for (const root of roots) walk(root);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("No forbidden runtime map-provider references found.");
