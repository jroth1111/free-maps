import type { FreeMapExplorerElement, FreeMapSurfaceElement } from "../src/element";
import { fetchDataset, options, register } from "./shared";

register();
const dataset = await fetchDataset(250);
const compact = document.querySelector<FreeMapExplorerElement>("free-map-explorer")!;
compact.data = dataset; compact.options = options;
const surface = document.querySelector<FreeMapSurfaceElement>("free-map-surface")!;
surface.data = { ...dataset, id: "single-location", points: dataset.points.slice(0, 1) }; surface.options = options;
const activateSurface = () => setTimeout(() => void surface.activate(), 4_000);
if (typeof IntersectionObserver === "undefined") activateSurface();
else {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect(); activateSurface();
  });
  observer.observe(surface);
}
