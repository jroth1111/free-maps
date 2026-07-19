import type { FreeMapExplorerElement } from "../src/element";
import { fetchDataset, options, register } from "./shared";

register();
for (const element of document.querySelectorAll<FreeMapExplorerElement>("free-map-explorer")) element.options = options;
const dataset = await fetchDataset(250);
const error = document.querySelector<FreeMapExplorerElement>("#error")!;
error.renderer = async () => { throw new Error("Demonstration renderer failed to load"); };
error.data = dataset;
document.querySelector<FreeMapExplorerElement>("#empty")!.data = { ...dataset, id: "empty", points: [] };
const missingPoint = dataset.points.find((point: { position?: unknown }) => !point.position);
document.querySelector<FreeMapExplorerElement>("#missing")!.data = { ...dataset, id: "missing", points: missingPoint ? [missingPoint] : [] };
document.querySelector<FreeMapExplorerElement>("#theme")!.data = { ...dataset, id: "theme", points: dataset.points.slice(0, 20) };
document.querySelector<FreeMapExplorerElement>("#theme-dark")!.data = { ...dataset, id: "theme-dark", points: dataset.points.slice(20, 40) };
document.querySelector<FreeMapExplorerElement>("#signal")!.data = { ...dataset, id: "signal", points: dataset.points.slice(40, 60) };
document.querySelector<FreeMapExplorerElement>("#signal-dark")!.data = { ...dataset, id: "signal-dark", points: dataset.points.slice(60, 80) };
document.querySelector<FreeMapExplorerElement>("#contrast")!.data = { ...dataset, id: "contrast", points: dataset.points.slice(80, 100) };
