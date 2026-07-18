import type { FreeMapExplorerElement } from "../src/element";
import { options, register } from "./shared";

register();
const explorer = document.querySelector<FreeMapExplorerElement>("free-map-explorer")!;
explorer.options = options;
const diagnostics = document.querySelector("#diagnostics")!;
let started = performance.now();
explorer.addEventListener("free-map-filter-change", (event) => requestAnimationFrame(() => {
  const mounted = explorer.shadowRoot?.querySelectorAll(".row").length ?? 0;
  diagnostics.textContent = `${(event as CustomEvent).detail.count.toLocaleString()} matches · ${mounted} mounted rows · ${(performance.now() - started).toFixed(1)} ms update`;
  started = performance.now();
}));
explorer.addEventListener("free-map-ready", () => { diagnostics.textContent = `5,000 matches · ${explorer.shadowRoot?.querySelectorAll(".row").length ?? 0} mounted rows · ready`; });
