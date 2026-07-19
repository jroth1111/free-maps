import { applyUrlState, parseUrlState, type FreeMapUrlState } from "../src/core";
import type { FreeMapExplorerElement } from "../src/element";
import { options, register } from "./shared";

register();
const explorer = document.querySelector<FreeMapExplorerElement>("free-map-explorer")!;
explorer.options = { ...options, searchArea: true };
const apply = (state: FreeMapUrlState) => { explorer.query = state.query; explorer.category = state.category; explorer.sort = state.sort; explorer.activeFilters = state.filters; explorer.selectedId = state.point; };
apply(parseUrlState(location.href));
const write = (mode: "replace" | "push") => {
  const url = applyUrlState(new URL(location.href), { query: explorer.query, category: explorer.category, sort: explorer.sort, point: explorer.selectedId, filters: explorer.activeFilters });
  history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
};
explorer.addEventListener("free-map-filter-change", () => write("replace"));
explorer.addEventListener("free-map-select", () => write("push"));
window.addEventListener("popstate", () => apply(parseUrlState(location.href)));
