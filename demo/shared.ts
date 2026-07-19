import { openStreetMapUrl, type FreeMapElementOptions, type MapRendererFactory } from "../src/core";
import { defineFreeMapElements } from "../src/element";
import "../src/themes/atlas.css";

export const renderer: MapRendererFactory = async () => {
  const { VectorCanvasRenderer, neutralLightBasemap } = await import("../src/vector");
  return new VectorCanvasRenderer({
    tileJsonUrl: "/tiles/melbourne.json",
    tileSession: { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" },
    basemapStyle: neutralLightBasemap,
    devicePixelRatioCeiling: 1.5,
  });
};
export const options: FreeMapElementOptions = {
  externalMapLinkBuilder: (point) => point.position ? openStreetMapUrl(point.position.lat, point.position.lng) : undefined,
  formatMeta: (point) => [point.area, point.priceLabel].filter(Boolean).join(" · "),
  quickFilters: [
    { id: "open-now", label: "Open now", matches: (point) => point.metadata?.openNow === true },
    { id: "top-rated", label: "Top rated", matches: (point) => point.metadata?.topRated === true },
  ],
};
export const register = (): void => defineFreeMapElements({ renderer });
export async function fetchDataset(size: 250 | 5000) {
  const response = await fetch(`/api/v1/demo-dataset?size=${size}`);
  if (!response.ok) throw new Error(`Dataset failed with ${response.status}`);
  return await response.json();
}
