import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { layers, namedFlavor } from "@protomaps/basemaps";

const output = resolve("public/map-assets");
for (const stale of ["public/sprites", "public/fonts/Noto Sans Medium", "public/fonts/Noto Sans Italic", "public/map-assets/heritage-light.json"]) rmSync(resolve(stale), { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const flavor = { ...namedFlavor("light"), background: "#f2f1ec", earth: "#f2f1ec", water: "#aadaff", park_a: "#d3ecc7", park_b: "#b9e2a8", buildings: "#e8e6df", minor: "#ffffff", major: "#ffffff", highway: "#ffe9a3", roads_label_minor: "#8a8378", roads_label_major: "#6b675e", city_label: "#3c4043" };
const retained = layers("protomaps", flavor, { lang: "en" })
  .filter((layer) => !/pois|transit|airport|shield/i.test(layer.id))
  .map((layer) => {
    const copy = structuredClone(layer);
    if (copy.type === "symbol" && copy.layout && "text-font" in copy.layout) copy.layout["text-font"] = ["Noto Sans Regular"];
    return copy;
  });
const style = {
  version: 8,
  name: "Free Maps heritage light",
  glyphs: "/fonts/{fontstack}/{range}.pbf",
  sources: { protomaps: { type: "vector", url: "/tiles/melbourne.json", attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>' } },
  layers: retained,
};
writeFileSync(resolve(output, "heritage-light-v0.2.0.json"), `${JSON.stringify(style)}\n`);
writeFileSync(resolve(output, "heritage-light.json.meta"), `${JSON.stringify({ generatedBy: "scripts/generate-map-assets.mjs", labelFace: "Noto Sans Regular", omitted: ["pois", "transit", "airport", "shield"] }, null, 2)}\n`);
// The style currently retains no icon-image layers, so the reduced sprite index is intentionally empty.
writeFileSync(resolve(output, "heritage-light-sprite.json"), "{}\n");
writeFileSync(resolve(output, "heritage-light-sprite.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgIACdRZ6QAAAABJRU5ErkJggg==", "base64"));
writeFileSync(resolve(output, "heritage-light-sprite@2x.json"), "{}\n");
writeFileSync(resolve(output, "heritage-light-sprite@2x.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wHwMDAwMDEwMDAwAANQAF/2u7VQAAAABJRU5ErkJggg==", "base64"));

const workerSource = resolve("node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js");
const workerTarget = resolve("public/assets/maplibre-gl-csp-worker-v5.7.1.js");
mkdirSync(dirname(workerTarget), { recursive: true });
cpSync(workerSource, workerTarget);

const regularGlyphDir = resolve("public/fonts/Noto Sans Regular");
if (!readFileSync(resolve(regularGlyphDir, "0-255.pbf")).byteLength) throw new Error("Regular glyph subset is missing");
console.log(`Generated ${retained.length} heritage-light layers, an empty reduced sprite atlas, and the CSP worker.`);
