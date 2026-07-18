import type { FreeMapExplorerElement } from "../src/element";
import { fetchDataset, options, register } from "./shared";
setTimeout(() => void import("../src/element/fonts.css"), 1_000);

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
