export { MapLibreRenderer } from "./renderer";
export { buildHeritageLightStyle, heritageFamiliarLight } from "./style";
export const createMapLibreRenderer = async () => new (await import("./renderer")).MapLibreRenderer();
