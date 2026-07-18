import maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import type { ErrorEvent as MapLibreErrorEvent, GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { type MapRenderer, type MapRendererState } from "../core";
import { loadHeritageLightStyle } from "./style";

const SOURCE = "free-map-points";
const CLUSTERS = "free-map-clusters";
const COUNTS = "free-map-cluster-count";
const POINTS = "free-map-unclustered";
const MAPLIBRE_SHADOW_CSS = `.maplibregl-map{font:12px/20px Helvetica Neue,Arial,Helvetica,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:rgb(0 0 0/0)}.maplibregl-canvas{left:0;position:absolute;top:0}.maplibregl-canvas-container.maplibregl-interactive{cursor:grab;user-select:none}.maplibregl-canvas-container.maplibregl-touch-zoom-rotate{touch-action:pan-x pan-y}.maplibregl-control-container .maplibregl-ctrl-top-left{left:0;position:absolute;top:0}.maplibregl-control-container .maplibregl-ctrl-top-right{position:absolute;right:0;top:0}.maplibregl-control-container .maplibregl-ctrl-bottom-left{bottom:0;left:0;position:absolute}.maplibregl-control-container .maplibregl-ctrl-bottom-right{bottom:0;position:absolute;right:0}.maplibregl-ctrl{clear:both;pointer-events:auto;transform:translate(0)}.maplibregl-ctrl-bottom-left .maplibregl-ctrl,.maplibregl-ctrl-top-left .maplibregl-ctrl{float:left;margin:10px 0 0 10px}.maplibregl-ctrl-bottom-right .maplibregl-ctrl,.maplibregl-ctrl-top-right .maplibregl-ctrl{float:right;margin:10px 10px 0 0}.maplibregl-ctrl-bottom-left .maplibregl-ctrl,.maplibregl-ctrl-bottom-right .maplibregl-ctrl{margin-bottom:10px;margin-top:0}.maplibregl-ctrl-group{background:#fff;border-radius:4px;box-shadow:0 0 0 2px rgb(0 0 0/.1)}.maplibregl-ctrl-group button{background:transparent;border:0;box-sizing:border-box;cursor:pointer;display:block;height:29px;outline:none;padding:0;width:29px}.maplibregl-ctrl-group button+button{border-top:1px solid #ddd}.maplibregl-ctrl-icon{background-position:50%;background-repeat:no-repeat;display:block;height:100%;width:100%}.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon{background-image:linear-gradient(#333,#333),linear-gradient(#333,#333);background-position:center;background-size:13px 2px,2px 13px}.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon{background-image:linear-gradient(#333,#333);background-position:center;background-size:13px 2px}.maplibregl-ctrl-attrib{background:rgb(255 255 255/.82);font-size:10px;line-height:12px;padding:0 5px}.maplibregl-ctrl-attrib a{color:rgb(0 0 0/.75);text-decoration:none}.maplibregl-ctrl-attrib-button{display:none}.maplibregl-canvas:focus{outline:2px solid #8b2635;outline-offset:-2px}`;

function geojson(state: MapRendererState): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: state.points.map((point) => ({ type: "Feature", id: point.id, geometry: { type: "Point", coordinates: [point.lng, point.lat] }, properties: { id: point.id, title: point.title } })) };
}

export interface MapLibreRendererOptions {
  style?: StyleSpecification;
  styleUrl?: string;
  tileJsonUrl?: string;
  tileSessionEndpoint?: string;
  requestHeaders?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  workerUrl?: string;
  devicePixelRatioCeiling?: number;
  fadeDuration?: number;
  sharedWorkerPool?: boolean;
  initializationDelayMs?: number;
}

let initializationQueue = Promise.resolve();
let prewarmed = false;

async function resolveHeaders(options: MapLibreRendererOptions): Promise<HeadersInit> {
  let headers = typeof options.requestHeaders === "function" ? await options.requestHeaders() : options.requestHeaders ?? {};
  if (options.tileSessionEndpoint) {
    const response = await fetch(options.tileSessionEndpoint, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error(`Tile session failed with ${response.status}`);
    const body = await response.json() as { token?: string };
    if (!body.token) throw new Error("Tile session response did not include a token");
    headers = { ...Object.fromEntries(new Headers(headers)), authorization: `Bearer ${body.token}` };
  }
  return headers;
}

export class MapLibreRenderer implements MapRenderer {
  private map?: MapLibreMap;
  private state?: MapRendererState;
  private onSelect?: (id: string) => void;
  private selected?: string;

  constructor(private options: MapLibreRendererOptions = {}) {}

  async mount(container: HTMLElement, state: MapRendererState, onSelect: (id: string) => void) {
    if (this.map) { await this.update(state); return; }
    this.state = state;
    this.onSelect = onSelect;
    const stylesheet = document.createElement("style");
    stylesheet.dataset.freeMapsMaplibre = "";
    stylesheet.textContent = MAPLIBRE_SHADOW_CSS;
    container.before(stylesheet);
    const delay = this.options.initializationDelayMs ?? 80;
    const turn = initializationQueue.then(() => new Promise<void>((resolve) => setTimeout(resolve, delay)));
    initializationQueue = turn.catch(() => undefined);
    await turn;
    const headers = await resolveHeaders(this.options);
    const style = this.options.style ?? await loadHeritageLightStyle(this.options.styleUrl);
    if (this.options.tileJsonUrl && style.sources.protomaps && "url" in style.sources.protomaps) style.sources.protomaps.url = new URL(this.options.tileJsonUrl, location.origin).href;
    maplibregl.setWorkerUrl(this.options.workerUrl ?? "/assets/maplibre-gl-csp-worker-v5.7.1.js");
    if (this.options.sharedWorkerPool !== false && !prewarmed) { maplibregl.prewarm(); prewarmed = true; }
    const sameOriginTiles = this.options.tileJsonUrl?.startsWith("/") ?? false;
    const map = new maplibregl.Map({
      container,
      style,
      center: [state.dataset.center.lng, state.dataset.center.lat],
      zoom: state.dataset.defaultZoom,
      attributionControl: { compact: true },
      fadeDuration: this.options.fadeDuration ?? 0,
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, this.options.devicePixelRatioCeiling ?? 1.5),
      transformRequest: (url: string) => {
        const resolved = new URL(url, location.href);
        if (sameOriginTiles && resolved.pathname.startsWith("/tiles/")) url = `${location.origin}${resolved.pathname}${resolved.search}`;
        return { url, headers: Object.fromEntries(new Headers(headers)) };
      },
    });
    this.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    await new Promise<void>((resolve, reject) => { map.once("load", () => resolve()); map.once("error", (event: MapLibreErrorEvent) => reject(event.error)); });
    map.addSource(SOURCE, { type: "geojson", data: geojson(state), cluster: true, clusterRadius: 46, clusterMaxZoom: 15, generateId: false });
    map.addLayer({ id: CLUSTERS, type: "circle", source: SOURCE, filter: ["has", "point_count"], paint: { "circle-color": ["step", ["get", "point_count"], "#b58b34", 20, "#9a6d1f", 100, "#8b2635"], "circle-radius": ["step", ["get", "point_count"], 18, 20, 23, 100, 29], "circle-stroke-color": "#fffdf9", "circle-stroke-width": 2 } });
    map.addLayer({ id: COUNTS, type: "symbol", source: SOURCE, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 }, paint: { "text-color": "#ffffff" } });
    map.addLayer({ id: POINTS, type: "circle", source: SOURCE, filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#8b2635", "#b58b34"], "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 11, 8], "circle-stroke-color": "#fffdf9", "circle-stroke-width": 2 } });
    map.on("click", CLUSTERS, async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id as number | undefined;
      if (clusterId == null) return;
      const zoom = await (map.getSource(SOURCE) as GeoJSONSource).getClusterExpansionZoom(clusterId);
      map.easeTo({ center: (feature!.geometry as Point).coordinates as [number, number], zoom });
    });
    map.on("click", POINTS, (event: MapLayerMouseEvent) => { const id = event.features?.[0]?.properties?.id as string | undefined; if (id) this.onSelect?.(id); });
    for (const layer of [CLUSTERS, POINTS]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
    this.applySelection(state.selectedId);
  }

  async update(state: MapRendererState) {
    this.state = state;
    if (!this.map?.getSource(SOURCE)) return;
    (this.map.getSource(SOURCE) as GeoJSONSource).setData(geojson(state));
    this.applySelection(state.selectedId);
    const selected = state.points.find((point) => point.id === state.selectedId);
    if (selected) this.map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(this.map.getZoom(), 17) });
  }

  private applySelection(id: string | null) {
    if (!this.map?.getSource(SOURCE)) return;
    if (this.selected) this.map.removeFeatureState({ source: SOURCE, id: this.selected }, "selected");
    this.selected = id ?? undefined;
    if (id) this.map.setFeatureState({ source: SOURCE, id }, { selected: true });
  }

  fitBounds(bounds: [number, number, number, number]) {
    if (!this.map) return;
    if (bounds[0] === bounds[2] && bounds[1] === bounds[3]) this.map.easeTo({ center: [bounds[0], bounds[1]], zoom: 16 });
    else this.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 56, maxZoom: 16 });
  }

  resetView() { if (this.map && this.state) this.map.easeTo({ center: [this.state.dataset.center.lng, this.state.dataset.center.lat], zoom: this.state.dataset.defaultZoom }); }
  destroy() { this.map?.remove(); this.map = undefined; }
}
