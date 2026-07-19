import { openStreetMapUrl, type FreeMapElementOptions, type MapRendererFactory } from "../src/core";
import { defineFreeMapElements } from "../src/element";
import { loadMapLibre } from "../src/maplibre/loader";

export const renderer: MapRendererFactory = async () => {
  const rendererModule = import("../src/maplibre");
  // Eligibility is established before the renderer factory runs. Start the
  // optional peer beside the small renderer shell so neither creates a
  // serial network waterfall; mount owns the awaited shared promise.
  void loadMapLibre().catch(() => undefined);
  const { MapLibreRenderer } = await rendererModule;
  return new MapLibreRenderer({
    styleUrl: "/map-assets/v0.3.0/heritage-light.json",
    styleIsKnownValid: true,
    tileJsonUrl: "/tiles/melbourne.json",
    tileSession: { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" },
    workerUrl: "/assets/maplibre-gl-csp-worker-v5.24.0.js",
    devicePixelRatioCeiling: 1.5,
    fadeDuration: 0,
    sharedWorkerPool: true,
  });
};
export const options: FreeMapElementOptions = {
  externalMapLinkBuilder: (point) => point.position ? openStreetMapUrl(point.position.lat, point.position.lng) : undefined,
  formatMeta: (point) => [point.area, point.priceLabel].filter(Boolean).join(" · "),
};
export const register = (): void => defineFreeMapElements({ renderer });
export async function fetchDataset(size: 250 | 5000) {
  const response = await fetch(`/api/v1/demo-dataset?size=${size}`);
  if (!response.ok) throw new Error(`Dataset failed with ${response.status}`);
  return await response.json();
}
