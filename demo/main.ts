import "../src/element/fonts.css";
import "../src/element";
import type { FreeMapConfig, FreeMapDataset, FreeMapUrlState } from "../src/core";
import { applyUrlState, openStreetMapUrl, parseUrlState } from "../src/core";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { FreeMapExplorer as ReactFreeMapExplorer } from "../src/react";
import type { FreeMapExplorerElement } from "../src/element";
import "./site.css";

const app = document.querySelector<HTMLElement>("#app")!;
const params = new URL(location.href).searchParams;
const view = params.get("view") ?? "full";
const datasetUrl = (size: 250 | 5000) => `/api/v1/demo-dataset?size=${size}`;
const config: FreeMapConfig = {
  tileJsonUrl: "/tiles/melbourne.json",
  tileSessionEndpoint: "/api/tile-session",
  externalMapLinkBuilder: (point) => point.position ? openStreetMapUrl(point.position.lat, point.position.lng) : undefined,
  formatMeta: (point) => [point.area, point.priceLabel].filter(Boolean).join(" · "),
};
if (params.get("test") === "1") {
  config.tileSessionEndpoint = undefined;
  config.style = { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9e6df" } }] };
}

const heading = (title: string, copy: string) => `<section class="intro"><p class="eyebrow">Free Maps v0.1.0</p><h1>${title}</h1><p>${copy}</p></section>`;

function configure(element: FreeMapExplorerElement, state?: FreeMapUrlState) {
  element.config = config;
  if (state) {
    element.query = state.query;
    element.category = state.category;
    element.sort = state.sort;
    element.selectedId = state.point;
  }
}

function bindUrl(explorer: FreeMapExplorerElement) {
  const write = (mode: "replace" | "push") => {
    const state: FreeMapUrlState = { query: String(explorer.query ?? ""), category: String(explorer.category ?? "all"), sort: explorer.sort as FreeMapUrlState["sort"], point: explorer.selectedId ? String(explorer.selectedId) : null };
    const url = applyUrlState(new URL(location.href), state);
    history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  };
  explorer.addEventListener("free-map-filter-change", () => write("replace"));
  explorer.addEventListener("free-map-select", () => write("push"));
  window.addEventListener("popstate", () => configure(explorer, parseUrlState(location.href)));
}

function createExplorer(size: 250 | 5000, urlState = true) {
  const explorer = document.createElement("free-map-explorer");
  explorer.setAttribute("src", datasetUrl(size));
  explorer.setAttribute("loading", "visible");
  configure(explorer, urlState ? parseUrlState(location.href) : undefined);
  if (urlState) bindUrl(explorer);
  return explorer;
}

async function fetchDataset(size: 250 | 5000) {
  const response = await fetch(datasetUrl(size));
  if (!response.ok) throw new Error(`Dataset failed with ${response.status}`);
  return response.json() as Promise<FreeMapDataset>;
}

async function render() {
  if (view === "compact") {
    app.innerHTML = `${heading("Compact and single-location maps", "The same public element API scales down to an embed and a focused surface.")}<section class="demo-grid"><article><h2>Compact embed</h2><div id="compact"></div></article><article><h2>Single location</h2><div id="surface"></div></article></section>`;
    const dataset = await fetchDataset(250);
    const compact = document.createElement("free-map-explorer"); compact.compact = true; compact.setDataset(dataset); compact.config = config; document.querySelector("#compact")!.append(compact);
    const surface = document.createElement("free-map-surface"); surface.setDataset({ ...dataset, points: dataset.points.slice(0, 1) }); surface.config = config; document.querySelector("#surface")!.append(surface);
    return;
  }
  if (view === "states") {
    app.innerHTML = `${heading("Loading, error, empty, missing-coordinate and theme states", "State handling remains inside the component while routing and data ownership remain outside.")}<section class="state-grid"><article><h2>Loading</h2><free-map-explorer src="/api/v1/demo-dataset?size=250" loading="visible"></free-map-explorer></article><article><h2>Retryable error</h2><free-map-explorer id="error" src="/api/v1/not-a-dataset" loading="eager"></free-map-explorer></article><article><h2>Empty result</h2><div id="empty"></div></article><article><h2>Missing coordinate</h2><div id="missing"></div></article><article class="night"><h2>Theme override</h2><div id="theme"></div></article></section>`;
    document.querySelector<HTMLElement & { config: FreeMapConfig }>("free-map-explorer")!.config = config;
    document.querySelector<HTMLElement & { config: FreeMapConfig }>("#error")!.config = config;
    const dataset = await fetchDataset(250);
    const empty = document.createElement("free-map-explorer"); empty.setDataset({ ...dataset, id: "empty", points: [] }); empty.config = config; empty.loading = "eager"; document.querySelector("#empty")!.append(empty);
    const missingPoint = dataset.points.find((point) => !point.position)!;
    const missing = document.createElement("free-map-explorer"); missing.setDataset({ ...dataset, id: "missing", points: [missingPoint] }); missing.config = config; missing.loading = "eager"; document.querySelector("#missing")!.append(missing);
    const themed = document.createElement("free-map-explorer"); themed.setDataset({ ...dataset, id: "theme", points: dataset.points.slice(0, 20) }); themed.config = config; themed.loading = "eager"; document.querySelector("#theme")!.append(themed);
    return;
  }
  if (view === "react") {
    app.innerHTML = `${heading("React integration", "A thin optional-peer wrapper forwards the element properties, events and imperative API.")}<div id="react-root"></div>`;
    const dataset = await fetchDataset(250);
    createRoot(document.querySelector("#react-root")!).render(createElement(ReactFreeMapExplorer, { dataset, config, loading: "eager", onSelect: (detail) => console.info("free-map-select", detail) }));
    return;
  }
  if (view === "vanilla") {
    app.innerHTML = `${heading("Vanilla custom element", "Create the element, assign dataset or src, and listen for composed DOM events.")}<pre><code>import 'free-maps/element';\nconst map = document.createElement('free-map-explorer');\nmap.src = '/api/places';\nmap.config = config;</code></pre><div id="vanilla-map"></div>`;
    document.querySelector("#vanilla-map")!.append(createExplorer(250));
    return;
  }
  if (view === "stress") {
    app.innerHTML = `${heading("5,000-point stress explorer", "The list is fixed-row virtualized and MapLibre clusters the same filtered point set.")}<aside id="diagnostics" class="diagnostics" aria-live="polite">Waiting for dataset…</aside><div id="stress-map"></div>`;
    const explorer = createExplorer(5000, false);
    explorer.loading = "eager";
    const diagnostics = document.querySelector("#diagnostics")!;
    let started = performance.now();
    explorer.addEventListener("free-map-filter-change", (event) => {
      requestAnimationFrame(() => {
        const mounted = explorer.shadowRoot?.querySelectorAll(".row").length ?? 0;
        diagnostics.textContent = `${(event as CustomEvent).detail.count.toLocaleString()} matches · ${mounted} mounted rows · ${(performance.now() - started).toFixed(1)} ms update`;
        started = performance.now();
      });
    });
    explorer.addEventListener("free-map-ready", () => {
      const mounted = explorer.shadowRoot?.querySelectorAll(".row").length ?? 0;
      diagnostics.textContent = `5,000 matches · ${mounted} mounted rows · ready`;
      started = performance.now();
    });
    document.querySelector("#stress-map")!.append(explorer);
    return;
  }
  app.innerHTML = `${heading("A map explorer you can own", "Framework-neutral elements, lazy MapLibre rendering, same-origin protected PMTiles, and deterministic synthetic data.")}<div id="full-map"></div>`;
  document.querySelector("#full-map")!.append(createExplorer(250));
}

void render();
