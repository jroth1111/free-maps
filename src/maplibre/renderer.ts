import maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import type { ErrorEvent as MapLibreErrorEvent, GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { type MapRenderer, type MapRendererState, type RenderablePoint } from "../core";
import { getSharedTileSession, resolveProtectedPrefix, resolveTileHeaders, scopedRequestHeaders, type TileHeaders, type TileSessionOptions } from "./session";
import { loadMapStyle } from "./style";

const SOURCE = "free-map-points";
const CLUSTERS = "free-map-clusters";
const COUNTS = "free-map-cluster-count";
const POINTS = "free-map-unclustered";

interface RendererColors {
  controlSurface: string;
  controlText: string;
  controlBorder: string;
  focus: string;
  marker: string;
  markerSelected: string;
  markerStroke: string;
  cluster: string;
  clusterMedium: string;
  clusterLarge: string;
  clusterText: string;
}

const color = (styles: CSSStyleDeclaration, name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

export function resolveRendererColors(container: HTMLElement): RendererColors {
  const styles = getComputedStyle(container);
  return {
    controlSurface: color(styles, "--free-map-control-surface", "#ffffff"),
    controlText: color(styles, "--free-map-control-text", "#172033"),
    controlBorder: color(styles, "--free-map-control-border", "#cbd5e1"),
    focus: color(styles, "--free-map-focus", "#2563eb"),
    marker: color(styles, "--free-map-marker", "#2563eb"),
    markerSelected: color(styles, "--free-map-marker-selected", "#b42318"),
    markerStroke: color(styles, "--free-map-marker-stroke", "#ffffff"),
    cluster: color(styles, "--free-map-cluster", "#2563eb"),
    clusterMedium: color(styles, "--free-map-cluster-medium", "#175cd3"),
    clusterLarge: color(styles, "--free-map-cluster-large", "#1849a9"),
    clusterText: color(styles, "--free-map-cluster-text", "#ffffff"),
  };
}

const maplibreCss = (colors: RendererColors) => `.maplibregl-map{font:12px/20px Helvetica Neue,Arial,Helvetica,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:rgb(0 0 0/0)}.maplibregl-canvas{left:0;position:absolute;top:0}.maplibregl-canvas-container.maplibregl-interactive{cursor:grab;user-select:none}.maplibregl-canvas-container.maplibregl-touch-zoom-rotate{touch-action:pan-x pan-y}.maplibregl-control-container .maplibregl-ctrl-top-left{left:0;position:absolute;top:0}.maplibregl-control-container .maplibregl-ctrl-top-right{position:absolute;right:0;top:0}.maplibregl-control-container .maplibregl-ctrl-bottom-left{bottom:0;left:0;position:absolute}.maplibregl-control-container .maplibregl-ctrl-bottom-right{bottom:0;position:absolute;right:0}.maplibregl-ctrl{clear:both;pointer-events:auto;transform:translate(0)}.maplibregl-ctrl-bottom-left .maplibregl-ctrl,.maplibregl-ctrl-top-left .maplibregl-ctrl{float:left;margin:10px 0 0 10px}.maplibregl-ctrl-bottom-right .maplibregl-ctrl,.maplibregl-ctrl-top-right .maplibregl-ctrl{float:right;margin:10px 10px 0 0}.maplibregl-ctrl-bottom-left .maplibregl-ctrl,.maplibregl-ctrl-bottom-right .maplibregl-ctrl{margin-bottom:10px;margin-top:0}.maplibregl-ctrl-group{background:${colors.controlSurface};border:1px solid ${colors.controlBorder};border-radius:4px;box-shadow:0 0 0 1px rgb(0 0 0/.08);color:${colors.controlText}}.maplibregl-ctrl-group button{background:transparent;border:0;box-sizing:border-box;color:inherit;cursor:pointer;display:block;height:29px;outline:none;padding:0;width:29px}.maplibregl-ctrl-group button+button{border-top:1px solid ${colors.controlBorder}}.maplibregl-ctrl-icon{background-position:50%;background-repeat:no-repeat;display:block;height:100%;width:100%}.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon{background-image:linear-gradient(currentColor,currentColor),linear-gradient(currentColor,currentColor);background-position:center;background-size:13px 2px,2px 13px}.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon{background-image:linear-gradient(currentColor,currentColor);background-position:center;background-size:13px 2px}.maplibregl-ctrl-attrib{background:color-mix(in srgb,${colors.controlSurface} 86%,transparent);color:${colors.controlText};font-size:10px;line-height:12px;padding:0 5px}.maplibregl-ctrl-attrib a{color:inherit;text-decoration:none}.maplibregl-ctrl-attrib-button{display:none}.maplibregl-canvas:focus{outline:2px solid ${colors.focus};outline-offset:-2px}`;

function geojson(state: MapRendererState): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: state.points.map((point) => ({ type: "Feature", id: point.id, geometry: { type: "Point", coordinates: [point.lng, point.lat] }, properties: { id: point.id, title: point.title } })) };
}

export interface MapLibreRendererOptions {
  workerUrl: string;
  style?: StyleSpecification;
  styleUrl?: string;
  styleIsKnownValid?: boolean;
  tileJsonUrl?: string;
  tileSession?: TileSessionOptions;
  tileHeaders?: TileHeaders;
  devicePixelRatioCeiling?: number;
  fadeDuration?: number;
  sharedWorkerPool?: boolean;
}

export function assertRendererOptions(options: MapLibreRendererOptions): void {
  if (!options.workerUrl) throw new Error("MapLibreRendererOptions.workerUrl is required");
  if (Boolean(options.style) === Boolean(options.styleUrl)) throw new Error("Configure exactly one of MapLibreRendererOptions.style or styleUrl");
  if (options.tileHeaders && !options.tileSession) throw new Error("tileHeaders requires tileSession.protectedUrlPrefix so credentials can be scoped safely");
}

let prewarmed = false;

const pointsEqual = (left: RenderablePoint[] | undefined, right: RenderablePoint[]) => {
  if (left === right) return true;
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < right.length; index++) {
    const a = left[index]!; const b = right[index]!;
    if (a.id !== b.id || a.title !== b.title || a.lat !== b.lat || a.lng !== b.lng) return false;
  }
  return true;
};

export class MapLibreRenderer implements MapRenderer {
  private map?: MapLibreMap;
  private state?: MapRendererState;
  private onSelect?: (id: string) => void;
  private selected?: string;
  private renderedPoints?: RenderablePoint[];
  private stylesheet?: HTMLStyleElement;
  private abort = new AbortController();
  private pendingState?: MapRendererState;
  private updatePromise?: Promise<void>;

  constructor(private options: MapLibreRendererOptions) { assertRendererOptions(options); }

  async mount(container: HTMLElement, state: MapRendererState, onSelect: (id: string) => void) {
    if (this.map) { await this.update(state); return; }
    this.state = state;
    this.onSelect = onSelect;
    const colors = resolveRendererColors(container);
    const stylesheet = document.createElement("style");
    stylesheet.dataset.freeMapsMaplibre = "";
    stylesheet.textContent = maplibreCss(colors);
    container.before(stylesheet);
    this.stylesheet = stylesheet;

    maplibregl.setWorkerUrl(this.options.workerUrl);
    if (this.options.sharedWorkerPool !== false && !prewarmed) { maplibregl.prewarm(); prewarmed = true; }

    const stylePromise = this.options.style ? Promise.resolve(structuredClone(this.options.style)) : loadMapStyle(this.options.styleUrl!);
    const credentialsPromise = this.options.tileSession ? Promise.all([
      getSharedTileSession(this.options.tileSession, this.abort.signal),
      resolveTileHeaders(this.options.tileHeaders),
    ]) : Promise.resolve(null);
    const [style, credentials] = await Promise.all([stylePromise, credentialsPromise]);
    if (this.abort.signal.aborted) throw new DOMException("Map activation was cancelled", "AbortError");
    if (this.options.tileJsonUrl && style.sources.protomaps && "url" in style.sources.protomaps) style.sources.protomaps.url = new URL(this.options.tileJsonUrl, location.href).href;
    const prefix = this.options.tileSession ? resolveProtectedPrefix(this.options.tileSession) : undefined;
    const map = new maplibregl.Map({
      container,
      style,
      center: [state.dataset.center.lng, state.dataset.center.lat],
      zoom: state.dataset.defaultZoom,
      attributionControl: { compact: true },
      fadeDuration: this.options.fadeDuration ?? 0,
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, this.options.devicePixelRatioCeiling ?? 1.5),
      validateStyle: this.options.styleIsKnownValid ? false : true,
      transformRequest: (url: string) => {
        if (!credentials || !prefix) return { url };
        const headers = scopedRequestHeaders(url, prefix, credentials[0], credentials[1]);
        return headers ? { url, headers } : { url };
      },
    });
    this.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    await new Promise<void>((resolve, reject) => { map.once("load", () => resolve()); map.once("error", (event: MapLibreErrorEvent) => reject(event.error)); });
    if (this.abort.signal.aborted) throw new DOMException("Map activation was cancelled", "AbortError");
    map.addSource(SOURCE, { type: "geojson", data: geojson(state), cluster: true, clusterRadius: 46, clusterMaxZoom: 15, generateId: false });
    this.renderedPoints = state.points;
    map.addLayer({ id: CLUSTERS, type: "circle", source: SOURCE, filter: ["has", "point_count"], paint: { "circle-color": ["step", ["get", "point_count"], colors.cluster, 20, colors.clusterMedium, 100, colors.clusterLarge], "circle-radius": ["step", ["get", "point_count"], 18, 20, 23, 100, 29], "circle-stroke-color": colors.markerStroke, "circle-stroke-width": 2 } });
    map.addLayer({ id: COUNTS, type: "symbol", source: SOURCE, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 }, paint: { "text-color": colors.clusterText } });
    map.addLayer({ id: POINTS, type: "circle", source: SOURCE, filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], colors.markerSelected, colors.marker], "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 11, 8], "circle-stroke-color": colors.markerStroke, "circle-stroke-width": 2 } });
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
    await new Promise<void>((resolve) => { map.once("render", () => resolve()); map.triggerRepaint(); });
  }

  update(state: MapRendererState): Promise<void> {
    this.pendingState = state;
    if (!this.updatePromise) {
      this.updatePromise = Promise.resolve().then(() => {
        const latest = this.pendingState;
        this.pendingState = undefined;
        if (!latest || !this.map?.getSource(SOURCE)) return;
        const pointsChanged = !pointsEqual(this.renderedPoints, latest.points);
        const selectionChanged = this.selected !== (latest.selectedId ?? undefined);
        this.state = latest;
        if (pointsChanged) {
          (this.map.getSource(SOURCE) as GeoJSONSource).setData(geojson(latest));
          this.renderedPoints = latest.points;
        }
        if (selectionChanged) {
          this.applySelection(latest.selectedId);
          const selected = latest.points.find((point) => point.id === latest.selectedId);
          if (selected) this.map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(this.map.getZoom(), 17) });
        }
      }).finally(() => { this.updatePromise = undefined; if (this.pendingState) void this.update(this.pendingState); });
    }
    return this.updatePromise;
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
  destroy() { this.abort.abort(); this.map?.remove(); this.map = undefined; this.stylesheet?.remove(); this.stylesheet = undefined; }
}
