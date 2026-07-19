import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { FreeMapExplorer } from "../src/react";
import { fetchDataset, options, renderer } from "./shared";

const dataset = await fetchDataset(250);
createRoot(document.querySelector("#react-root")!).render(createElement(FreeMapExplorer, { data: dataset, renderer, options, activation: "eager", className: "free-map-theme-atlas" }));
