import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const heritageFamiliarLight = () => ({
  ...namedFlavor("light"),
  background: "#f2f1ec", earth: "#f2f1ec", water: "#aadaff", park_a: "#d3ecc7", park_b: "#b9e2a8", wood_a: "#cfe8bf", wood_b: "#a8d88f", scrub_a: "#dcecc9", scrub_b: "#c3e2a9", glacier: "#ffffff", sand: "#f6eec7", beach: "#faf2c7", hospital: "#f4e8e8", industrial: "#eceae4", school: "#eee9dc", pedestrian: "#ecebe5", zoo: "#d3ecc7", aerodrome: "#e9e9e6", runway: "#dadad6", pier: "#ecebe5", buildings: "#e8e6df", minor_service: "#ffffff", minor_a: "#f4f3ee", minor_b: "#ffffff", minor_service_casing: "#e4e2da", minor_casing: "#e4e2da", other: "#f7f6f1", link: "#ffffff", link_casing: "#dcd9d0", major: "#ffffff", major_casing_early: "#dcd9d0", major_casing_late: "#dcd9d0", highway: "#ffe9a3", highway_casing_early: "#eecf74", highway_casing_late: "#eecf74", bridges_other: "#f7f6f1", bridges_minor: "#ffffff", bridges_minor_casing: "#dcd9d0", bridges_link: "#ffffff", bridges_link_casing: "#dcd9d0", bridges_major: "#ffffff", bridges_major_casing: "#dcd9d0", bridges_highway: "#ffe9a3", bridges_highway_casing: "#eecf74", tunnel_minor: "#f3f2ed", tunnel_link: "#f3f2ed", tunnel_major: "#f3f2ed", tunnel_highway: "#fbf0cd", railway: "#d9d7d0", boundaries: "#a8a6a1", roads_label_minor: "#8a8378", roads_label_minor_halo: "#ffffff", roads_label_major: "#6b675e", roads_label_major_halo: "#ffffff", ocean_label: "#5b8cb8", subplace_label: "#77716a", subplace_label_halo: "#f2f1ec", city_label: "#3c4043", city_label_halo: "#ffffff", state_label: "#9a958d", state_label_halo: "#f2f1ec", country_label: "#7d7873",
  landcover: { grassland: "rgba(218,239,205,1)", barren: "rgba(242,238,220,1)", urban_area: "rgba(236,234,228,1)", farmland: "rgba(226,238,208,1)", glacier: "rgba(255,255,255,1)", scrub: "rgba(228,238,208,1)", forest: "rgba(198,228,178,1)" },
});

export function buildHeritageLightStyle(tileJsonUrl: string, assetOrigin = typeof location === "undefined" ? "" : location.origin): StyleSpecification {
  const source = "protomaps";
  return {
    version: 8,
    glyphs: `${assetOrigin}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assetOrigin}/sprites/v4/light`,
    sources: { [source]: { type: "vector", url: tileJsonUrl, attribution: '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' } },
    layers: layers(source, heritageFamiliarLight(), { lang: "en" }).filter((layer) => !layer.id.includes("pois")),
  } as StyleSpecification;
}
