import { LitElement, html, nothing, type PropertyValues } from "lit";
import { property, query as queryElement, state } from "lit/decorators.js";
import { filterAndSortPoints, indexPoints, pointIsMappable, toRenderablePoints, type FreeMapActivation, type FreeMapDataset, type FreeMapElementOptions, type FreeMapPoint, type FreeMapSort, type IndexedFreeMapPoint, type MapRendererFactory, type MapRendererState } from "../core";
import { FreeMapRuntimeController } from "./controller";
import { structuralStyles } from "./styles";

const labels = { explorerTitle: "Map explorer", searchPlaceholder: "Search area, place…", categoryLabel: "Category", sortLabel: "Sort", allCategories: "All categories", showAll: "Show all", resetView: "Zoom to CBD", empty: "No places match these filters.", mapUnavailable: "Map unavailable", retry: "Try again", details: "View details" };
const ROW_HEIGHT = 88;
const OVERSCAN = 6;

export class FreeMapExplorerElement extends LitElement {
  static styles = structuralStyles;
  private runtime = new FreeMapRuntimeController(this);
  private _data: FreeMapDataset | null = null;
  private indexed: IndexedFreeMapPoint[] = [];
  private indexedDataset: FreeMapDataset | null = null;
  private filteredMemo?: { dataset: FreeMapDataset; query: string; category: string; sort: FreeMapSort; indexed: IndexedFreeMapPoint[]; rows: FreeMapPoint[] };
  private renderableMemo?: { dataset: FreeMapDataset; rows: FreeMapPoint[]; selectedId: string | null; validPoint: NonNullable<FreeMapElementOptions["validPoint"]>; points: MapRendererState["points"] };

  @property({ attribute: false }) get data(): FreeMapDataset | null { return this._data; }
  set data(value: FreeMapDataset | null) { const old = this._data; this._data = value; this.runtime.setData(value); this.requestUpdate("data", old); }
  @property({ attribute: false }) renderer: MapRendererFactory | null = null;
  @property({ attribute: false }) options: FreeMapElementOptions = {};
  @property() src: string | null = null;
  @property({ reflect: true }) activation: FreeMapActivation = "visible";
  @property() query = "";
  @property() category = "all";
  @property() sort: FreeMapSort = "ranking";
  @property({ attribute: "selected-id" }) selectedId: string | null = null;
  @property({ type: Boolean, reflect: true }) compact = false;

  @state() private listScrollTop = 0;
  @state() private viewportHeight = 520;
  @state() private hintVisible = true;
  @queryElement(".map-host") private mapHost?: HTMLDivElement;
  @queryElement(".results") private resultsHost?: HTMLDivElement;

  private get datasetValue(): FreeMapDataset | null { return this.runtime.dataset; }
  private get effectiveLabels() { return { ...labels, ...this.options.labels }; }
  private get filtered() {
    const dataset = this.datasetValue;
    if (!dataset) return [];
    const cached = this.filteredMemo;
    if (cached && cached.dataset === dataset && cached.indexed === this.indexed && cached.query === this.query && cached.category === this.category && cached.sort === this.sort) return cached.rows;
    const rows = filterAndSortPoints(this.indexed, dataset.categories, this.query, this.category, this.sort);
    this.filteredMemo = { dataset, indexed: this.indexed, query: this.query, category: this.category, sort: this.sort, rows };
    return rows;
  }
  private renderable(rows: FreeMapPoint[], dataset: FreeMapDataset) {
    const validPoint = this.options.validPoint ?? pointIsMappable;
    const cached = this.renderableMemo;
    if (cached && cached.dataset === dataset && cached.rows === rows && cached.selectedId === this.selectedId && cached.validPoint === validPoint) return cached.points;
    const points = toRenderablePoints(rows, dataset, this.selectedId, validPoint);
    this.renderableMemo = { dataset, rows, selectedId: this.selectedId, validPoint, points };
    return points;
  }

  async activate(): Promise<void> { await this.runtime.activate(); }
  async reload(): Promise<void> { await this.runtime.reload(); }
  select(id: string | null): void { this.runtimeSelect(id); }
  fitAll(): void { this.select(null); this.runtime.fitAll(); }
  resetView(): void { this.select(null); this.runtime.resetView(); }
  runtimeContainer(): HTMLElement | undefined { return this.mapHost; }
  runtimeState(): MapRendererState | null {
    const dataset = this.datasetValue;
    if (!dataset) return null;
    const rows = this.filtered;
    return { dataset, points: this.renderable(rows, dataset), selectedId: this.selectedId, options: this.options };
  }
  runtimeSelect(id: string | null): void {
    const dataset = this.datasetValue;
    const next = id && dataset?.points.some((point) => point.id === id) ? id : null;
    if (next === this.selectedId) return;
    this.selectedId = next;
    this.dispatchEvent(new CustomEvent("free-map-select", { bubbles: true, composed: true, detail: { id: next, point: dataset?.points.find((point) => point.id === next) ?? null } }));
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("src")) this.runtime.setSrc(this.src);
    if (changed.has("activation")) this.runtime.activationChanged();
    if (this.datasetValue !== this.indexedDataset) { this.indexedDataset = this.datasetValue; this.indexed = indexPoints(this.datasetValue?.points ?? []); this.filteredMemo = undefined; this.renderableMemo = undefined; }
    if (changed.has("query") || changed.has("category") || changed.has("sort")) {
      const rows = this.filtered;
      if (this.datasetValue && this.selectedId && !rows.some((point) => point.id === this.selectedId)) this.runtimeSelect(null);
      this.dispatchEvent(new CustomEvent("free-map-filter-change", { bubbles: true, composed: true, detail: { query: this.query, category: this.category, sort: this.sort, count: rows.length } }));
      this.listScrollTop = 0;
      if (this.resultsHost) this.resultsHost.scrollTop = 0;
    }
  }

  private onScroll(event: Event): void { const host = event.currentTarget as HTMLDivElement; this.listScrollTop = host.scrollTop; this.viewportHeight = host.clientHeight; }
  private score(point: FreeMapPoint): string { if (this.options.formatScore) return this.options.formatScore(point); if (point.score != null) return point.score.toFixed(1); if (point.rank != null) return `#${point.rank}`; return "Unranked"; }
  private renderRows(rows: FreeMapPoint[], dataset: FreeMapDataset) {
    if (!rows.length) return html`<div class="empty" part="empty">${this.effectiveLabels.empty}</div>`;
    const start = Math.max(0, Math.floor(this.listScrollTop / ROW_HEIGHT) - OVERSCAN);
    const count = Math.ceil(this.viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    return html`<div class="virtual" style=${`height:${rows.length * ROW_HEIGHT}px`}>${rows.slice(start, start + count).map((point, offset) => {
      const mappable = (this.options.validPoint ?? pointIsMappable)(point, dataset);
      return html`<div class="row" part="result-row" style=${`transform:translateY(${(start + offset) * ROW_HEIGHT}px)`}><button type="button" aria-current=${this.selectedId === point.id ? "true" : nothing} @click=${() => this.select(point.id)}><div class="title"><span>${point.title}</span><span class="score">${this.score(point)}</span></div><div class="meta">${this.options.formatMeta?.(point) ?? [point.area, point.branchLabel, point.priceLabel].filter(Boolean).join(" · ")} ${!mappable ? html`<span class="unavailable"> · Map unavailable</span>` : nothing}</div>${point.summary ? html`<div class="summary">${point.summary}</div>` : nothing}</button></div>`;
    })}</div>`;
  }
  private renderDetails(point: FreeMapPoint, dataset: FreeMapDataset) {
    const detailUrl = this.options.detailLinkBuilder?.(point) ?? point.detailsUrl;
    const external = this.options.externalMapLinkBuilder?.(point);
    const branchCount = dataset.points.filter((row) => row.groupId && row.groupId === point.groupId).length;
    return html`<section class="details" part="details" aria-label="Selected place"><div class="details-meta">${this.filtered.length} in list${branchCount > 1 ? ` · 1 of ${branchCount} locations` : ""}</div><h2>${point.title}</h2>${point.summary ? html`<p>${point.summary}</p>` : nothing}${!pointIsMappable(point, dataset) ? html`<p class="unavailable">Map unavailable — this place remains available in the list.</p>` : nothing}<div class="links">${external ? html`<a href=${external} target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>` : nothing}${detailUrl ? html`<a class="primary" href=${detailUrl}>${this.effectiveLabels.details}</a>` : nothing}</div></section>`;
  }
  render() {
    if (this.runtime.phase === "error") return html`<div class="error" part="errors" role="alert"><h2>${this.effectiveLabels.mapUnavailable}</h2><p>${this.runtime.failure?.message}</p>${this.runtime.failure?.retryable ? html`<button type="button" @click=${() => this.reload()}>${this.effectiveLabels.retry}</button>` : nothing}</div>`;
    const dataset = this.datasetValue;
    if (!dataset || this.runtime.phase === "loading") return html`<div class="shell" part="shell" aria-busy="true"><div class="map" part="map"><div class="map-state" part="status" role="status">Loading map…</div></div></div>`;
    const rows = this.filtered;
    const selected = dataset.points.find((point) => point.id === this.selectedId);
    const mapped = this.renderable(rows, dataset);
    return html`<div class="shell" part="shell">${this.hintVisible && !this.compact ? html`<div class="tip" part="status" role="status"><span><strong>Interactive map</strong> — Pan, zoom, or choose a place. List and pins stay in sync.</span><button type="button" aria-label="Dismiss map tips" @click=${() => { this.hintVisible = false; }}>×</button></div>` : nothing}<div class="layout"><section class="controls" part="controls"><h2>${this.effectiveLabels.explorerTitle}</h2><p class="lede">${dataset.label} — filter the list and map together.</p><label class="search"><span class="sr-only">Search places</span><input part="search-input" type="search" .value=${this.query} placeholder=${this.effectiveLabels.searchPlaceholder} @input=${(event: InputEvent) => { this.query = (event.target as HTMLInputElement).value; }} /></label><div class="fields"><label class="field"><span>${this.effectiveLabels.categoryLabel}</span><select part="category-select" .value=${this.category} @change=${(event: Event) => { this.category = (event.target as HTMLSelectElement).value; }}><option value="all">${this.effectiveLabels.allCategories}</option>${dataset.categories.map((category) => html`<option value=${category.id}>${category.parentId ? "↳ " : ""}${category.label}</option>`)}</select></label><label class="field"><span>${this.effectiveLabels.sortLabel}</span><select part="sort-select" .value=${this.sort} @change=${(event: Event) => { this.sort = (event.target as HTMLSelectElement).value as FreeMapSort; }}><option value="ranking">Ranking</option><option value="score">Score</option><option value="name">Name (A–Z)</option></select></label></div></section><section class="map" part="map" aria-label=${`Map, ${mapped.length} locations`}><div class="map-actions"><button class="action" part="fit-button" type="button" @click=${() => this.fitAll()}>${this.effectiveLabels.showAll} ${mapped.length} pin${mapped.length === 1 ? "" : "s"}</button><button class="action" part="reset-button" type="button" @click=${() => this.resetView()}>${this.effectiveLabels.resetView}</button></div><div class="map-host"></div><div class="map-state" part="status" ?hidden=${this.runtime.active}>Map loads when eligible.</div></section><h2 class="sr-only" id="free-map-results">Place results</h2><div class="results" part="results" role="region" aria-label="Place results" @scroll=${this.onScroll}>${this.renderRows(rows, dataset)}</div>${selected ? this.renderDetails(selected, dataset) : nothing}</div></div>`;
  }
}

declare global { interface HTMLElementTagNameMap { "free-map-explorer": FreeMapExplorerElement } }
