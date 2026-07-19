import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";
import type { MapRenderer, MapRendererMountOptions, MapRendererState, MapViewportCause, RenderablePoint } from "../core";
import { getSharedTileSession, resolveProtectedPrefix, resolveTileHeaders, scopedRequestHeaders, type TileHeaders, type TileSessionOptions } from "../maplibre/session";

const TILE_SIZE = 256;
const MAX_TILE_ZOOM = 12;
const DRAW_LAYERS = ["landuse", "water", "buildings", "roads"] as const;
const FEATURE_LIMITS: Record<(typeof DRAW_LAYERS)[number], number> = { landuse: 16, water: 16, buildings: 32, roads: 48 };

interface TileJson {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
}

interface DrawFeature {
  layer: (typeof DRAW_LAYERS)[number];
  type: number;
  extent: number;
  kind?: string;
  geometry: Array<Array<{ x: number; y: number }>>;
}

interface DrawTile { x: number; y: number; z: number; features: DrawFeature[]; }
interface ScreenTarget { x: number; y: number; radius: number; points: RenderablePoint[]; lng: number; lat: number; }
interface TileJsonResult { value: TileJson; responseUrl: string; }

export interface VectorCanvasRendererOptions {
  tileJsonUrl: string;
  basemapStyle: VectorBasemapStyle;
  tileSession?: TileSessionOptions;
  tileHeaders?: TileHeaders;
  devicePixelRatioCeiling?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface VectorBasemapStyle {
  background: string;
  water: string;
  landUse: string;
  building: string;
  road: string;
  majorRoad: string;
  highway: string;
  attributionBackground: string;
  attributionText: string;
}

export const neutralLightBasemap: Readonly<VectorBasemapStyle> = Object.freeze({ background: "#eef2f3", water: "#b9dce8", landUse: "#dce8d5", building: "#ddd9d2", road: "#c8c6c1", majorRoad: "#ffffff", highway: "#f0d38a", attributionBackground: "rgb(255 255 255 / .86)", attributionText: "#334155" });
export const neutralDarkBasemap: Readonly<VectorBasemapStyle> = Object.freeze({ background: "#111827", water: "#173a4a", landUse: "#1d352d", building: "#303744", road: "#475569", majorRoad: "#64748b", highway: "#9a7b3f", attributionBackground: "rgb(15 23 42 / .88)", attributionText: "#e2e8f0" });
const basemapKeys: Array<keyof VectorBasemapStyle> = ["background", "water", "landUse", "building", "road", "majorRoad", "highway", "attributionBackground", "attributionText"];

const yieldMainThread = (): Promise<void> => {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
};

const transientStatus = (status: number) => status === 429 || status >= 500;
async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
  let response = await fetch(input, init);
  if (!transientStatus(response.status) || init.signal?.aborted) return response;
  await response.body?.cancel();
  await yieldMainThread();
  if (init.signal?.aborted) throw new DOMException("Map activation was cancelled", "AbortError");
  response = await fetch(input, init);
  return response;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const lngToWorld = (lng: number, zoom: number) => ((lng + 180) / 360) * TILE_SIZE * 2 ** zoom;
const latToWorld = (lat: number, zoom: number) => {
  const sin = Math.sin(clamp(lat, -85.051129, 85.051129) * Math.PI / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom;
};
const worldToLng = (x: number, zoom: number) => x / (TILE_SIZE * 2 ** zoom) * 360 - 180;
const worldToLat = (y: number, zoom: number) => {
  const n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * 2 ** zoom);
  return 180 / Math.PI * Math.atan(Math.sinh(n));
};

const cssToken = (styles: CSSStyleDeclaration, name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

function decodeFeature(layer: DrawFeature["layer"], feature: VectorTileFeature): DrawFeature {
  return {
    layer,
    type: feature.type,
    extent: feature.extent,
    kind: typeof feature.properties.kind === "string" ? feature.properties.kind : undefined,
    geometry: feature.loadGeometry().map((ring) => ring.map(({ x, y }) => ({ x, y }))),
  };
}

async function decodeTile(buffer: ArrayBuffer, x: number, y: number, z: number): Promise<DrawTile> {
  if (!buffer.byteLength) return { x, y, z, features: [] };
  const tile = new VectorTile(new Pbf(buffer));
  const features: DrawFeature[] = [];
  let decoded = 0;
  for (const layerName of DRAW_LAYERS) {
    const layer = tile.layers[layerName];
    if (!layer) continue;
    const limit = Math.min(layer.length, FEATURE_LIMITS[layerName]);
    for (let index = 0; index < limit; index++) {
      features.push(decodeFeature(layerName, layer.feature(index)));
      if (++decoded % 4 === 0) await yieldMainThread();
    }
  }
  return { x, y, z, features };
}

function replaceTileTemplate(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export class VectorCanvasRenderer implements MapRenderer {
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private state?: MapRendererState;
  private onSelect?: (id: string) => void;
  private center = { lng: 0, lat: 0 };
  private zoom = 12;
  private tiles: DrawTile[] = [];
  private targets: ScreenTarget[] = [];
  private abort = new AbortController();
  private resize?: ResizeObserver;
  private controls?: HTMLElement;
  private attribution?: HTMLElement;
  private dragging?: { x: number; y: number; latestX: number; latestY: number; centerX: number; centerY: number; moved: boolean };
  private panFrame: number | null = null;
  private tileRequestFrame: number | null = null;
  private suppressNextClick = false;
  private tileRequestRevision = 0;
  private tileJsonPromise?: Promise<TileJsonResult>;
  private listeners: Array<() => void> = [];
  private onViewportChange?: MapRendererMountOptions["onViewportChange"];

  constructor(private options: VectorCanvasRendererOptions) {
    if (!options.tileJsonUrl) throw new Error("VectorCanvasRendererOptions.tileJsonUrl is required");
    if (!options.basemapStyle || basemapKeys.some((key) => typeof options.basemapStyle[key] !== "string" || !options.basemapStyle[key].trim())) throw new Error("VectorCanvasRendererOptions.basemapStyle requires explicit background, water, landUse, building, road, majorRoad, highway, attributionBackground, and attributionText colors");
    if (options.tileHeaders && !options.tileSession) throw new Error("tileHeaders requires tileSession.protectedUrlPrefix so credentials can be scoped safely");
  }

  async mount(container: HTMLElement, state: MapRendererState, onSelect: (id: string) => void, mountOptions?: MapRendererMountOptions): Promise<void> {
    if (this.canvas) { await this.update(state); return; }
    this.state = state;
    this.onSelect = onSelect;
    this.onViewportChange = mountOptions?.onViewportChange;
    this.center = { ...state.dataset.center };
    this.zoom = state.dataset.defaultZoom;
    const canvas = document.createElement("canvas");
    canvas.className = "free-map-vector-canvas";
    canvas.setAttribute("aria-label", `${state.dataset.label} interactive map`);
    canvas.tabIndex = 0;
    Object.assign(canvas.style, { display: "block", height: "100%", width: "100%", touchAction: "none" });
    container.replaceChildren(canvas);
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false }) ?? undefined;
    if (!this.context) throw new Error("Canvas 2D is unavailable");
    this.installChrome(container);
    this.installInteraction();
    this.resize = new ResizeObserver(() => { if (this.sizeCanvas()) { this.draw(); this.requestVisibleTiles(); } });
    this.resize.observe(container);
    this.sizeCanvas();
    this.draw();
    await this.loadVisibleTiles();
    if (this.abort.signal.aborted) throw new DOMException("Map activation was cancelled", "AbortError");
    canvas.dataset.tilesPainted = "true";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async update(state: MapRendererState): Promise<void> {
    this.state = state;
    const selected = state.points.find((point) => point.id === state.selectedId);
    if (selected) { this.center = { lng: selected.lng, lat: selected.lat }; this.zoom = Math.max(this.zoom, 15); await this.loadVisibleTiles(); }
    this.draw();
  }

  fitBounds(bounds: [number, number, number, number]): void {
    const width = this.canvas?.clientWidth ?? 1;
    const height = this.canvas?.clientHeight ?? 1;
    this.center = { lng: (bounds[0] + bounds[2]) / 2, lat: (bounds[1] + bounds[3]) / 2 };
    for (let zoom = this.options.maxZoom ?? 17; zoom >= (this.options.minZoom ?? 3); zoom--) {
      const spanX = Math.abs(lngToWorld(bounds[2], zoom) - lngToWorld(bounds[0], zoom));
      const spanY = Math.abs(latToWorld(bounds[1], zoom) - latToWorld(bounds[3], zoom));
      if (spanX <= width - 112 && spanY <= height - 112) { this.zoom = zoom; break; }
    }
    this.draw(); this.requestVisibleTiles(); this.emitViewport("programmatic");
  }

  resetView(): void {
    if (!this.state) return;
    this.center = { ...this.state.dataset.center };
    this.zoom = this.state.dataset.defaultZoom;
    this.draw(); this.requestVisibleTiles(); this.emitViewport("programmatic");
  }

  destroy(): void {
    this.abort.abort();
    if (this.panFrame !== null && this.panFrame >= 0) cancelAnimationFrame(this.panFrame);
    if (this.tileRequestFrame !== null && this.tileRequestFrame >= 0) cancelAnimationFrame(this.tileRequestFrame);
    this.panFrame = null;
    this.tileRequestFrame = null;
    this.resize?.disconnect();
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.canvas?.remove();
    this.controls?.remove();
    this.attribution?.remove();
    this.canvas = undefined;
    this.context = undefined;
  }

  private sizeCanvas(): boolean {
    if (!this.canvas || !this.context) return false;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, this.options.devicePixelRatioCeiling ?? 1.5);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    const changed = this.canvas.width !== width || this.canvas.height !== height;
    if (changed) { this.canvas.width = width; this.canvas.height = height; }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return changed;
  }

  private installChrome(container: HTMLElement): void {
    container.style.position = "relative";
    const controls = document.createElement("div");
    controls.setAttribute("part", "map-controls");
    Object.assign(controls.style, { bottom: "10px", display: "grid", position: "absolute", right: "10px", zIndex: "2" });
    for (const [label, delta, text] of [["Zoom in", 1, "+"], ["Zoom out", -1, "−"]] as const) {
      const button = document.createElement("button");
      button.type = "button"; button.setAttribute("aria-label", label); button.textContent = text;
      Object.assign(button.style, { background: "var(--free-map-control-surface,#fff)", border: "1px solid var(--free-map-control-border,#cbd5e1)", color: "var(--free-map-control-text,#172033)", cursor: "pointer", font: "700 20px/1 system-ui", height: "30px", width: "30px" });
      const zoom = () => this.changeZoom(delta, "user");
      button.addEventListener("click", zoom);
      this.listeners.push(() => button.removeEventListener("click", zoom));
      controls.append(button);
    }
    const attribution = document.createElement("div");
    attribution.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
    Object.assign(attribution.style, { background: this.options.basemapStyle.attributionBackground, bottom: "0", color: this.options.basemapStyle.attributionText, font: "10px/14px system-ui", left: "0", padding: "0 5px", position: "absolute", zIndex: "2" });
    for (const link of attribution.querySelectorAll("a")) { link.style.color = "inherit"; link.style.textDecoration = "none"; }
    container.append(controls, attribution);
    this.controls = controls;
    this.attribution = attribution;
  }

  private installInteraction(): void {
    const canvas = this.canvas!;
    const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      canvas.addEventListener(type, listener as EventListener, options);
      this.listeners.push(() => canvas.removeEventListener(type, listener as EventListener, options));
    };
    on("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.dragging = { x: event.clientX, y: event.clientY, latestX: event.clientX, latestY: event.clientY, centerX: lngToWorld(this.center.lng, this.zoom), centerY: latToWorld(this.center.lat, this.zoom), moved: false };
    });
    on("pointermove", (event) => {
      if (!this.dragging) return;
      this.dragging.latestX = event.clientX;
      this.dragging.latestY = event.clientY;
      this.dragging.moved ||= Math.hypot(event.clientX - this.dragging.x, event.clientY - this.dragging.y) > 5;
      this.schedulePanDraw();
    });
    const finishDrag = (cancelled = false) => {
      if (!this.dragging) return;
      this.paintPan();
      this.suppressNextClick = !cancelled && this.dragging.moved;
      this.dragging = undefined;
      this.requestVisibleTiles();
      this.emitViewport("user");
    };
    on("pointerup", () => finishDrag()); on("pointercancel", () => finishDrag(true));
    on("wheel", (event) => { event.preventDefault(); this.changeZoom(event.deltaY < 0 ? 1 : -1, "user"); }, { passive: false });
    on("click", (event) => {
      if (!this.canvas) return;
      if (this.suppressNextClick) { this.suppressNextClick = false; return; }
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      const target = this.targets.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) <= candidate.radius + 6);
      if (!target) {
        const worldX = lngToWorld(this.center.lng, this.zoom) + x - rect.width / 2;
        const worldY = latToWorld(this.center.lat, this.zoom) + y - rect.height / 2;
        this.center = { lng: worldToLng(worldX, this.zoom), lat: worldToLat(worldY, this.zoom) };
        this.changeZoom(1, "user");
        return;
      }
      if (target.points.length === 1 && target.points[0]!.id !== this.state?.selectedId) this.onSelect?.(target.points[0]!.id);
      else if (target.points.length === 1) { this.center = { lng: target.lng, lat: target.lat }; this.changeZoom(1, "user"); }
      else { this.center = { lng: target.lng, lat: target.lat }; this.changeZoom(1, "user"); }
    });
    on("keydown", (event) => {
      if (event.key === "+" || event.key === "=") this.changeZoom(1, "user");
      else if (event.key === "-") this.changeZoom(-1, "user");
      else if (event.key.startsWith("Arrow")) {
        const amount = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -80 : 80;
        const x = lngToWorld(this.center.lng, this.zoom) + (event.key === "ArrowLeft" || event.key === "ArrowRight" ? amount : 0);
        const y = latToWorld(this.center.lat, this.zoom) + (event.key === "ArrowUp" || event.key === "ArrowDown" ? amount : 0);
        this.center = { lng: worldToLng(x, this.zoom), lat: worldToLat(y, this.zoom) }; this.draw(); this.requestVisibleTiles(); this.emitViewport("user");
      }
    });
  }

  private changeZoom(delta: number, cause: MapViewportCause): void {
    this.zoom = clamp(this.zoom + delta, this.options.minZoom ?? 3, this.options.maxZoom ?? 17);
    this.draw(); this.requestVisibleTiles(); this.emitViewport(cause);
  }

  private emitViewport(cause: MapViewportCause): void {
    if (!this.canvas || !this.onViewportChange) return;
    const centerX = lngToWorld(this.center.lng, this.zoom); const centerY = latToWorld(this.center.lat, this.zoom);
    const halfWidth = this.canvas.clientWidth / 2; const halfHeight = this.canvas.clientHeight / 2;
    this.onViewportChange({ bounds: [worldToLng(centerX - halfWidth, this.zoom), worldToLat(centerY + halfHeight, this.zoom), worldToLng(centerX + halfWidth, this.zoom), worldToLat(centerY - halfHeight, this.zoom)], center: { ...this.center }, zoom: this.zoom, cause });
  }

  private requestVisibleTiles(): void {
    if (this.tileRequestFrame !== null) return;
    this.tileRequestFrame = -1;
    const frame = requestAnimationFrame(() => {
      this.tileRequestFrame = null;
      void this.loadVisibleTiles().catch((cause) => {
        if (!this.abort.signal.aborted) console.error("Free Maps vector tile refresh failed", cause);
      });
    });
    if (this.tileRequestFrame !== null) this.tileRequestFrame = frame;
  }

  private schedulePanDraw(): void {
    if (this.panFrame !== null) return;
    this.panFrame = -1;
    const frame = requestAnimationFrame(() => { this.panFrame = null; this.paintPan(); });
    if (this.panFrame !== null) this.panFrame = frame;
  }

  private paintPan(): void {
    if (!this.dragging) return;
    this.center = {
      lng: worldToLng(this.dragging.centerX - (this.dragging.latestX - this.dragging.x), this.zoom),
      lat: worldToLat(this.dragging.centerY - (this.dragging.latestY - this.dragging.y), this.zoom),
    };
    this.draw();
  }

  private async credentials(): Promise<{ prefix?: URL; token?: string; tileHeaders: Record<string, string> }> {
    if (!this.options.tileSession) return { tileHeaders: {} };
    const [token, tileHeaders] = await Promise.all([getSharedTileSession(this.options.tileSession, this.abort.signal), resolveTileHeaders(this.options.tileHeaders)]);
    const prefix = resolveProtectedPrefix(this.options.tileSession);
    return { prefix, token, tileHeaders };
  }

  private async loadVisibleTiles(): Promise<void> {
    if (!this.canvas || this.abort.signal.aborted) return;
    const revision = ++this.tileRequestRevision;
    const { prefix, token, tileHeaders } = await this.credentials();
    const tileJsonUrl = new URL(this.options.tileJsonUrl, location.href).href;
    if (!this.tileJsonPromise) {
      const tileJsonHeaders = prefix && token ? scopedRequestHeaders(tileJsonUrl, prefix, token, tileHeaders) : undefined;
      this.tileJsonPromise = fetchWithRetry(tileJsonUrl, { headers: tileJsonHeaders, signal: this.abort.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`TileJSON request failed with ${response.status}`);
        return { value: await response.json() as TileJson, responseUrl: response.url || tileJsonUrl };
      }).catch((cause) => { this.tileJsonPromise = undefined; throw cause; });
    }
    const { value: tileJson, responseUrl } = await this.tileJsonPromise;
    const tileZoom = clamp(Math.floor(this.zoom) - 1, tileJson.minzoom ?? 0, Math.min(tileJson.maxzoom ?? MAX_TILE_ZOOM, MAX_TILE_ZOOM));
    const scale = 2 ** (this.zoom - tileZoom);
    const width = this.canvas.clientWidth; const height = this.canvas.clientHeight;
    const centerX = lngToWorld(this.center.lng, tileZoom); const centerY = latToWorld(this.center.lat, tileZoom);
    const minX = Math.floor((centerX - width / (2 * scale)) / TILE_SIZE); const maxX = Math.floor((centerX + width / (2 * scale)) / TILE_SIZE);
    const worldTileLimit = 2 ** tileZoom - 1;
    const minY = clamp(Math.floor((centerY - height / (2 * scale)) / TILE_SIZE), 0, worldTileLimit);
    const maxY = clamp(Math.floor((centerY + height / (2 * scale)) / TILE_SIZE), 0, worldTileLimit);
    const template = new URL(tileJson.tiles[0]!, responseUrl).href.replaceAll("%7B", "{").replaceAll("%7D", "}");
    const jobs: Array<Promise<{ buffer?: ArrayBuffer; failed?: Error; x: number; y: number; z: number }>> = [];
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const normalizedX = ((x % 2 ** tileZoom) + 2 ** tileZoom) % 2 ** tileZoom;
      const url = replaceTileTemplate(template, tileZoom, normalizedX, y);
      const headers = prefix && token ? scopedRequestHeaders(url, prefix, token, tileHeaders) : undefined;
      jobs.push(fetchWithRetry(url, { headers, signal: this.abort.signal }).then(async (response) => {
        if (response.status === 204) return { x, y, z: tileZoom };
        if (!response.ok) throw new Error(`Vector tile request failed with ${response.status}`);
        return { buffer: await response.arrayBuffer(), x, y, z: tileZoom };
      }).catch((cause) => {
        if (this.abort.signal.aborted) throw cause;
        return { failed: cause instanceof Error ? cause : new Error(String(cause)), x, y, z: tileZoom };
      }));
    }
    const responses = await Promise.all(jobs);
    const failures = responses.filter((response) => response.failed);
    if (failures.length === responses.length) throw failures[0]!.failed;
    const tiles: DrawTile[] = [];
    // Cached responses can all resolve in one turn. Decode sequentially so
    // their bounded batches cannot accumulate into a single long task.
    for (const response of responses) {
      tiles.push(response.buffer ? await decodeTile(response.buffer, response.x, response.y, response.z) : { x: response.x, y: response.y, z: response.z, features: [] });
    }
    if (revision !== this.tileRequestRevision || this.abort.signal.aborted) return;
    this.tiles = tiles;
    this.canvas.dataset.tileCount = String(tiles.length);
    this.draw();
  }

  private draw(): void {
    const canvas = this.canvas; const context = this.context; const state = this.state;
    if (!canvas || !context || !state) return;
    const width = canvas.clientWidth; const height = canvas.clientHeight;
    const styles = getComputedStyle(canvas);
    const background = this.options.basemapStyle.background;
    context.clearRect(0, 0, width, height); context.fillStyle = background; context.fillRect(0, 0, width, height);
    for (const layer of DRAW_LAYERS) for (const tile of this.tiles) for (const feature of tile.features) if (feature.layer === layer) this.drawFeature(context, tile, feature, width, height);
    this.drawPoints(context, state.points, state.selectedId, width, height, styles);
    context.fillStyle = cssToken(styles, "--free-map-text-muted", "#665f57");
    context.font = "10px system-ui"; context.textAlign = "right"; context.textBaseline = "bottom";
    context.fillText(`z${this.zoom.toFixed(0)}`, width - 46, height - 6);
    canvas.dataset.zoom = this.zoom.toFixed(0);
  }

  private drawFeature(context: CanvasRenderingContext2D, tile: DrawTile, feature: DrawFeature, width: number, height: number): void {
    const scale = 2 ** (this.zoom - tile.z);
    const centerX = lngToWorld(this.center.lng, tile.z) * scale; const centerY = latToWorld(this.center.lat, tile.z) * scale;
    context.beginPath();
    for (const ring of feature.geometry) for (let index = 0; index < ring.length; index++) {
      const point = ring[index]!;
      const x = (tile.x * TILE_SIZE + point.x / feature.extent * TILE_SIZE) * scale - centerX + width / 2;
      const y = (tile.y * TILE_SIZE + point.y / feature.extent * TILE_SIZE) * scale - centerY + height / 2;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    if (feature.type === 3) {
      context.fillStyle = feature.layer === "water" ? this.options.basemapStyle.water : feature.layer === "landuse" ? this.options.basemapStyle.landUse : this.options.basemapStyle.building;
      context.fill("evenodd");
    } else if (feature.type === 2) {
      context.strokeStyle = feature.kind === "highway" ? this.options.basemapStyle.highway : feature.kind === "major_road" ? this.options.basemapStyle.majorRoad : this.options.basemapStyle.road;
      context.lineWidth = feature.kind === "highway" ? 2.4 : feature.kind === "major_road" ? 1.8 : 1;
      context.stroke();
    }
  }

  private drawPoints(context: CanvasRenderingContext2D, points: RenderablePoint[], selectedId: string | null, width: number, height: number, styles: CSSStyleDeclaration): void {
    const marker = cssToken(styles, "--free-map-marker", "#2563eb");
    const selected = cssToken(styles, "--free-map-marker-selected", "#b42318");
    const stroke = cssToken(styles, "--free-map-marker-stroke", "#ffffff");
    const cluster = cssToken(styles, "--free-map-cluster", "#2563eb");
    const clusterText = cssToken(styles, "--free-map-cluster-text", "#ffffff");
    const centerX = lngToWorld(this.center.lng, this.zoom); const centerY = latToWorld(this.center.lat, this.zoom);
    const cells = new Map<string, ScreenTarget>();
    for (const point of points) {
      const x = lngToWorld(point.lng, this.zoom) - centerX + width / 2; const y = latToWorld(point.lat, this.zoom) - centerY + height / 2;
      if (x < -30 || y < -30 || x > width + 30 || y > height + 30) continue;
      const key = `${Math.floor(x / 46)}:${Math.floor(y / 46)}`;
      const target = cells.get(key);
      if (target) { target.points.push(point); target.x = (target.x * (target.points.length - 1) + x) / target.points.length; target.y = (target.y * (target.points.length - 1) + y) / target.points.length; target.lng = (target.lng * (target.points.length - 1) + point.lng) / target.points.length; target.lat = (target.lat * (target.points.length - 1) + point.lat) / target.points.length; }
      else cells.set(key, { x, y, radius: 10, points: [point], lng: point.lng, lat: point.lat });
    }
    this.targets = [...cells.values()];
    for (const target of this.targets) {
      const count = target.points.length; const isSelected = count === 1 && target.points[0]!.id === selectedId;
      target.radius = count > 1 ? (count >= 100 ? 25 : count >= 20 ? 21 : 17) : isSelected ? 11 : 8;
      context.beginPath(); context.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
      context.fillStyle = count > 1 ? cluster : isSelected ? selected : marker; context.fill();
      context.strokeStyle = stroke; context.lineWidth = 2; context.stroke();
      if (count > 1) { context.fillStyle = clusterText; context.font = "700 12px system-ui"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(count > 999 ? `${Math.round(count / 1000)}k` : String(count), target.x, target.y); }
    }
  }
}

export const createVectorCanvasRenderer = (options: VectorCanvasRendererOptions) => () => Promise.resolve(new VectorCanvasRenderer(options));
