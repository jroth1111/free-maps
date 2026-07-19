type MapLibreModule = typeof import("maplibre-gl/dist/maplibre-gl-csp");

let mapLibreModulePromise: Promise<MapLibreModule> | undefined;

/** Load the optional peer after activation and share successful evaluations. */
export const loadMapLibre = (): Promise<MapLibreModule> => {
  if (!mapLibreModulePromise) {
    mapLibreModulePromise = import("maplibre-gl/dist/maplibre-gl-csp").catch((cause) => {
      mapLibreModulePromise = undefined;
      throw cause;
    });
  }
  return mapLibreModulePromise;
};
