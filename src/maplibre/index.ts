export { MapLibreRenderer, type MapLibreRendererOptions } from "./renderer";
export { assertRendererOptions, classifyViewportCause, resolveRendererColors } from "./renderer";
export { loadMapStyle } from "./style";
export { matchesProtectedUrl, resolveProtectedPrefix, scopedRequestHeaders, type TileHeaders, type TileSessionOptions } from "./session";
import { MapLibreRenderer, type MapLibreRendererOptions } from "./renderer";
export const createMapLibreRenderer = (options: MapLibreRendererOptions) => async () => new MapLibreRenderer(options);
