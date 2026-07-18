import { LitElement, html, type PropertyValues } from "lit";
import { property, query } from "lit/decorators.js";
import { heritageLightStyles } from "./styles";
import { parseFreeMapDataset, pointIsMappable, toRenderablePoints, type FreeMapConfig, type FreeMapDataset, type MapRenderer } from "../core";

export class FreeMapSurfaceElement extends LitElement {
  static styles = [heritageLightStyles];
  private _dataset: FreeMapDataset | undefined;
  @property({ attribute: false }) mapDataset: FreeMapDataset | undefined;
  @property({ attribute: false }) config: FreeMapConfig = {};
  @property({ attribute: "selected-id" }) selectedId: string | null = null;
  @property({ type: Boolean, reflect: true }) compact = true;
  @query(".map-host") private host: HTMLDivElement | undefined;
  private renderer: MapRenderer | undefined;
  private mounting: Promise<void> | undefined;

  constructor() {
    super();
    Object.defineProperty(this, "dataset", { configurable: true, enumerable: true, get: () => this._dataset, set: (value: FreeMapDataset | undefined) => { const old = this._dataset; this._dataset = value; this.requestUpdate("mapDataset", old); } });
  }
  setDataset(value: FreeMapDataset | undefined) { const old = this._dataset; this._dataset = value; this.requestUpdate("mapDataset", old); }

  disconnectedCallback() { this.renderer?.destroy(); this.renderer = undefined; super.disconnectedCallback(); }
  select(id: string | null) { this.selectedId = id; this.dispatchEvent(new CustomEvent("free-map-select", { bubbles: true, composed: true, detail: { id, point: this._dataset?.points.find((point) => point.id === id) ?? null } })); }
  fitAll() { this.renderer?.fitAll(); }
  resetView() { this.renderer?.resetView(); }
  reload() { this.requestUpdate(); }

  protected updated(_changed: PropertyValues<this>) { void this.sync(); }
  private async sync() {
    if (!this._dataset || !this.host) return;
    const dataset = parseFreeMapDataset(this._dataset);
    const state = { dataset, points: toRenderablePoints(dataset.points, dataset, this.selectedId, this.config.validPoint ?? pointIsMappable), selectedId: this.selectedId, config: this.config };
    if (this.renderer) { await this.renderer.update(state); return; }
    if (!this.mounting) this.mounting = (async () => {
      try {
        const factory = this.config.rendererFactory ?? (async () => (await import("../maplibre")).createMapLibreRenderer());
        this.renderer = await factory();
        await this.renderer.mount(this.host!, state, (id) => this.select(id));
        this.dispatchEvent(new CustomEvent("free-map-ready", { bubbles: true, composed: true, detail: { datasetId: dataset.id, pointCount: dataset.points.length, mappedCount: state.points.length } }));
      } catch (cause) { this.dispatchEvent(new CustomEvent("free-map-error", { bubbles: true, composed: true, detail: { code: "renderer", message: cause instanceof Error ? cause.message : String(cause), cause, retryable: true } })); }
    })();
    await this.mounting;
  }

  render() { return html`<div class="shell" part="shell"><div class="map" part="map"><div class="map-host"></div></div></div>`; }
}

declare global { interface HTMLElementTagNameMap { "free-map-surface": FreeMapSurfaceElement } }
