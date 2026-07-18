export { MapLibreRenderer, type MapLibreRendererOptions } from "./renderer";
export { DEFAULT_HERITAGE_STYLE_URL, loadHeritageLightStyle } from "./style";
import { MapLibreRenderer, type MapLibreRendererOptions } from "./renderer";
export const createMapLibreRenderer = (options: MapLibreRendererOptions = {}) => async () => new MapLibreRenderer(options);
