import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { layers, namedFlavor } from "@protomaps/basemaps";

const release = "v0.3.0";
const output = resolve("public/map-assets", release);
for (const stale of ["public/sprites", "public/fonts/Noto Sans Medium", "public/fonts/Noto Sans Italic"]) rmSync(resolve(stale), { recursive: true, force: true });
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const flavor = { ...namedFlavor("light"), background: "#f2f1ec", earth: "#f2f1ec", water: "#aadaff", park_a: "#d3ecc7", park_b: "#b9e2a8", buildings: "#e8e6df", minor: "#ffffff", major: "#ffffff", highway: "#ffe9a3", roads_label_minor: "#8a8378", roads_label_major: "#6b675e", city_label: "#3c4043" };
const melbourneRedundantLayers = new Set(["landuse_aerodrome", "roads_runway", "roads_taxiway", "landuse_runway"]);
const retained = layers("protomaps", flavor, { lang: "en" })
  .filter((layer) => !/pois|transit|airport|shield/i.test(layer.id) && !melbourneRedundantLayers.has(layer.id))
  .map((layer) => {
    const copy = structuredClone(layer);
    if (copy.type === "symbol" && copy.layout && "text-font" in copy.layout) copy.layout["text-font"] = ["Noto Sans Regular"];
    return copy;
  });
const style = {
  version: 8,
  name: "Free Maps Atlas light",
  glyphs: "/fonts/v0.3.0/{fontstack}/{range}.pbf",
  sources: { protomaps: { type: "vector", url: "/tiles/melbourne.json", attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>' } },
  layers: retained,
};
const ids = new Set(retained.map((layer) => layer.id));
if (ids.size !== retained.length) throw new Error("Generated style has duplicate layer ids");
const regressionChecks = [
  { zoom: 5, required: ["background", "earth", "water", "places_locality"] },
  { zoom: 10, required: ["background", "water", "roads_major", "places_locality"] },
  { zoom: 14, required: ["water", "buildings", "roads_minor", "roads_labels_major"] },
  { zoom: 18, required: ["buildings", "roads_minor_service", "address_label", "roads_oneway"] },
];
for (const check of regressionChecks) for (const id of check.required) {
  const layer = retained.find((candidate) => candidate.id === id);
  if (!layer || (layer.minzoom != null && layer.minzoom > check.zoom) || (layer.maxzoom != null && layer.maxzoom <= check.zoom)) throw new Error(`Style regression at z${check.zoom}: ${id} is not visible`);
}
writeFileSync(resolve(output, "atlas-light.json"), `${JSON.stringify(style)}\n`);
writeFileSync(resolve(output, "atlas-light.json.meta"), `${JSON.stringify({ generatedBy: "scripts/generate-map-assets.mjs", release, labelFace: "Noto Sans Regular", omittedPatterns: ["pois", "transit", "airport", "shield"], omittedMelbourneLayers: [...melbourneRedundantLayers], regressionChecks }, null, 2)}\n`);
// The style currently retains no icon-image layers, so the reduced sprite index is intentionally empty.
writeFileSync(resolve(output, "atlas-light-sprite.json"), "{}\n");
writeFileSync(resolve(output, "atlas-light-sprite.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgIACdRZ6QAAAABJRU5ErkJggg==", "base64"));
writeFileSync(resolve(output, "atlas-light-sprite@2x.json"), "{}\n");
writeFileSync(resolve(output, "atlas-light-sprite@2x.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wHwMDAwMDEwMDAwAANQAF/2u7VQAAAABJRU5ErkJggg==", "base64"));

const workerSource = resolve("node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js");
const workerTarget = resolve("public/assets/maplibre-gl-csp-worker-v5.24.0.js");
mkdirSync(dirname(workerTarget), { recursive: true });
cpSync(workerSource, workerTarget);

const regularGlyphDir = resolve("assets/glyphs/Noto Sans Regular");
if (!readFileSync(resolve(regularGlyphDir, "0-255.pbf")).byteLength) throw new Error("Regular glyph subset is missing");
cpSync(regularGlyphDir, resolve("public/fonts/v0.3.0/Noto Sans Regular"), { recursive: true });
console.log(`Generated ${retained.length} validated Atlas light layers, versioned glyphs/sprites, and the CSP worker.`);
