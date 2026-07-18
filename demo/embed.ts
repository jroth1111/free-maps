import type { FreeMapExplorerElement, FreeMapSurfaceElement } from "../src/element";
import { fetchDataset, options, register } from "./shared";

register();
const dataset = await fetchDataset(250);
const compact = document.querySelector<FreeMapExplorerElement>("free-map-explorer")!;
compact.data = dataset; compact.options = options;
const surface = document.querySelector<FreeMapSurfaceElement>("free-map-surface")!;
surface.data = { ...dataset, id: "single-location", points: dataset.points.slice(0, 1) }; surface.options = options;
if (typeof IntersectionObserver === "undefined") setTimeout(() => void surface.activate(), 1_500);
else {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect(); setTimeout(() => void surface.activate(), 1_500);
  });
  observer.observe(surface);
}
