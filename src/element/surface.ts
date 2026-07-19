import { LitElement, html, type PropertyValues } from "lit";
import { property, query } from "lit/decorators.js";
import { pointIsMappable, toRenderablePoints, type FreeMapActivation, type FreeMapDataset, type FreeMapElementOptions, type MapRendererFactory, type MapRendererState } from "../core";
import { FreeMapRuntimeController } from "./controller";
import { structuralStyles } from "./styles";

export class FreeMapSurfaceElement extends LitElement {
  static styles = structuralStyles;
  private runtime = new FreeMapRuntimeController(this);
  private _data: FreeMapDataset | null = null;
  @property({ attribute: false }) get data(): FreeMapDataset | null { return this._data; }
  set data(value: FreeMapDataset | null) { const old = this._data; this._data = value; this.runtime.setData(value); this.requestUpdate("data", old); }
  @property({ attribute: false }) renderer: MapRendererFactory | null = null;
  @property({ attribute: false }) options: FreeMapElementOptions = {};
  @property() src: string | null = null;
  @property({ reflect: true }) activation: FreeMapActivation = "visible";
  @property({ attribute: "selected-id" }) selectedId: string | null = null;
  @property({ type: Boolean, reflect: true }) compact = true;
  @query(".map-host") private mapHost?: HTMLDivElement;

  async activate(): Promise<void> { await this.runtime.activate(); }
  async reload(): Promise<void> { await this.runtime.reload(); }
  select(id: string | null): void { this.runtimeSelect(id); }
  fitAll(): void { this.runtime.fitAll(); }
  resetView(): void { this.runtime.resetView(); }
  runtimeContainer(): HTMLElement | undefined { return this.mapHost; }
  runtimeState(): MapRendererState | null { const dataset = this.runtime.dataset; return dataset ? { dataset, points: toRenderablePoints(dataset.points, dataset, this.selectedId, this.options.validPoint ?? pointIsMappable), selectedId: this.selectedId, options: this.options } : null; }
  runtimeSelect(id: string | null): void { const dataset = this.runtime.dataset; const next = id && dataset?.points.some((point) => point.id === id) ? id : null; this.selectedId = next; this.dispatchEvent(new CustomEvent("free-map-select", { bubbles: true, composed: true, detail: { id: next, point: dataset?.points.find((point) => point.id === next) ?? null } })); }
  protected updated(changed: PropertyValues<this>): void { if (changed.has("src")) this.runtime.setSrc(this.src); if (changed.has("activation")) this.runtime.activationChanged(); }
  render() { if (this.runtime.phase === "error") return html`<div class="error" part="errors" role="alert"><h2>Map unavailable</h2><p>${this.runtime.failure?.message}</p></div>`; return html`<div class="shell" part="shell" aria-busy=${this.runtime.phase === "loading" ? "true" : "false"}><div class="map" part="map"><div class="map-host"></div><div class="map-state" part="status" ?hidden=${this.runtime.active}>Map loads when eligible.</div></div></div>`; }
}

declare global { interface HTMLElementTagNameMap { "free-map-surface": FreeMapSurfaceElement } }
