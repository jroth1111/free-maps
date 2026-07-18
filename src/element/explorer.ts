import { LitElement, html, nothing, type PropertyValues } from "lit";
import { property, query as queryElement, state } from "lit/decorators.js";
import { heritageLightStyles } from "./styles";
import { filterAndSortPoints, indexPoints, parseFreeMapDataset, pointIsMappable, toRenderablePoints, type FreeMapConfig, type FreeMapDataset, type FreeMapErrorDetail, type FreeMapPoint, type FreeMapSort, type IndexedFreeMapPoint, type MapRenderer } from "../core";

const labels = {
  explorerTitle: "Map explorer", searchPlaceholder: "Search area, place…", categoryLabel: "Category", sortLabel: "Sort", allCategories: "All categories", showAll: "Show all", resetView: "Zoom to CBD", empty: "No places match these filters.", mapUnavailable: "Map unavailable", retry: "Try again", details: "View details",
};
const ROW_HEIGHT = 88;
const OVERSCAN = 6;

export class FreeMapExplorerElement extends LitElement {
  static styles = heritageLightStyles;

  private _dataset: FreeMapDataset | undefined;
  @property({ attribute: false }) mapDataset: FreeMapDataset | undefined;
  constructor() {
    super();
    Object.defineProperty(this, "dataset", { configurable: true, enumerable: true, get: () => this._dataset, set: (value: FreeMapDataset | undefined) => this.setDataset(value) });
  }
  setDataset(value: FreeMapDataset | undefined) {
    const old = this._dataset;
    this._dataset = value;
    if (value) { this.abort?.abort(); this.sourceDataset = undefined; this.acceptDataset(value); }
    this.requestUpdate("mapDataset", old);
  }

  @property({ attribute: false }) config: FreeMapConfig = {};
  @property() src = "";
  @property() query = "";
  @property() category = "all";
  @property() sort: FreeMapSort = "ranking";
  @property({ attribute: "selected-id" }) selectedId: string | null = null;
  @property({ type: Boolean, reflect: true }) compact = false;
  @property({ reflect: true }) loading: "visible" | "eager" = "visible";

  @state() private sourceDataset: FreeMapDataset | undefined;
  @state() private phase: "idle" | "loading" | "ready" | "error" = "idle";
  @state() private failure: FreeMapErrorDetail | undefined;
  @state() private activated = false;
  @state() private listScrollTop = 0;
  @state() private viewportHeight = 520;
  @state() private hintVisible = true;

  @queryElement(".map-host") private mapHost: HTMLDivElement | undefined;
  @queryElement(".results") private resultsHost: HTMLDivElement | undefined;

  private indexed: IndexedFreeMapPoint[] = [];
  private abort: AbortController | undefined;
  private renderer: MapRenderer | undefined;
  private rendererPromise: Promise<MapRenderer> | undefined;
  private rendererMountPromise: Promise<void> | undefined;
  private observer: IntersectionObserver | undefined;
  private readyEmitted = false;

  private get activeDataset() { return this._dataset ?? this.sourceDataset; }
  private get effectiveLabels() { return { ...labels, ...this.config.labels }; }
  private get filtered() { const dataset = this.activeDataset; return dataset ? filterAndSortPoints(this.indexed, dataset.categories, this.query, this.category, this.sort) : []; }

  connectedCallback() {
    super.connectedCallback();
    if (this.loading === "eager") this.activated = true;
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.observer?.disconnect();
    this.renderer?.destroy();
    this.renderer = undefined;
    this.rendererPromise = undefined;
    this.rendererMountPromise = undefined;
    super.disconnectedCallback();
  }

  protected firstUpdated() {
    if (!this.activated) {
      if (typeof IntersectionObserver === "undefined") this.activated = true;
      else {
        this.observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) { this.activated = true; this.observer?.disconnect(); }
        }, { rootMargin: "240px" });
        this.observer.observe(this);
      }
    }
    if (this._dataset) this.acceptDataset(this._dataset);
    else if (this.src) void this.reload();
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has("src") && !this._dataset && this.src) void this.reload();
    if (changed.has("loading") && this.loading === "eager") this.activated = true;
    if (changed.has("query") || changed.has("category") || changed.has("sort")) {
      const rows = this.filtered;
      if (this.activeDataset && this.selectedId && !rows.some((point) => point.id === this.selectedId)) this.select(null);
      this.dispatchEvent(new CustomEvent("free-map-filter-change", { bubbles: true, composed: true, detail: { query: this.query, category: this.category, sort: this.sort, count: rows.length } }));
      this.listScrollTop = 0;
      if (this.resultsHost) this.resultsHost.scrollTop = 0;
    }
    if (this.activated && this.phase === "ready") void this.syncRenderer();
  }

  private acceptDataset(value: FreeMapDataset) {
    try {
      const parsed = parseFreeMapDataset(value);
      this.indexed = indexPoints(parsed.points);
      this.phase = "ready";
      this.failure = undefined;
      this.readyEmitted = false;
      if (this.selectedId && !parsed.points.some((point) => point.id === this.selectedId)) this.selectedId = null;
    } catch (cause) { this.reportError("dataset", cause, false); }
  }

  async reload() {
    if (this._dataset) { this.acceptDataset(this._dataset); return; }
    if (!this.src) { this.reportError("configuration", new Error("Set dataset or src"), false); return; }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.phase = "loading";
    this.failure = undefined;
    try {
      const response = await fetch(this.src, { signal: abort.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Dataset request failed with ${response.status}`);
      const parsed = parseFreeMapDataset(await response.json());
      if (abort.signal.aborted || this._dataset) return;
      this.sourceDataset = parsed;
      this.indexed = indexPoints(parsed.points);
      this.phase = "ready";
      this.readyEmitted = false;
    } catch (cause) {
      if (!abort.signal.aborted) this.reportError("fetch", cause, true);
    }
  }

  select(id: string | null) {
    const dataset = this.activeDataset;
    const next = id && dataset?.points.some((point) => point.id === id) ? id : null;
    if (next === this.selectedId) return;
    this.selectedId = next;
    this.dispatchEvent(new CustomEvent("free-map-select", { bubbles: true, composed: true, detail: { id: next, point: dataset?.points.find((point) => point.id === next) ?? null } }));
  }

  fitAll() { this.select(null); this.renderer?.fitAll(); }
  resetView() { this.select(null); this.renderer?.resetView(); }

  private reportError(code: FreeMapErrorDetail["code"], cause: unknown, retryable: boolean) {
    const detail: FreeMapErrorDetail = { code, message: cause instanceof Error ? cause.message : String(cause), cause, retryable };
    this.phase = "error";
    this.failure = detail;
    this.dispatchEvent(new CustomEvent("free-map-error", { bubbles: true, composed: true, detail }));
  }

  private async createRenderer(): Promise<MapRenderer> {
    const factory = this.config.rendererFactory ?? (async () => (await import("../maplibre")).createMapLibreRenderer());
    return await factory();
  }

  private async syncRenderer() {
    const dataset = this.activeDataset;
    if (!dataset || !this.mapHost || !this.activated) return;
    const state = { dataset, points: toRenderablePoints(this.filtered, dataset, this.selectedId, this.config.validPoint ?? pointIsMappable), selectedId: this.selectedId, config: this.config };
    try {
      if (!this.rendererMountPromise) {
        this.rendererMountPromise = (async () => {
          this.rendererPromise ??= this.createRenderer();
          this.renderer = await this.rendererPromise;
          await this.renderer.mount(this.mapHost!, state, (id) => this.select(id));
        })();
        await this.rendererMountPromise;
      } else {
        await this.rendererMountPromise;
        await this.renderer?.update(state);
      }
      if (!this.readyEmitted) {
        this.readyEmitted = true;
        this.dispatchEvent(new CustomEvent("free-map-ready", { bubbles: true, composed: true, detail: { datasetId: dataset.id, pointCount: dataset.points.length, mappedCount: state.points.length } }));
      }
    } catch (cause) {
      this.renderer?.destroy();
      this.renderer = undefined;
      this.rendererPromise = undefined;
      this.rendererMountPromise = undefined;
      this.reportError("renderer", cause, true);
    }
  }

  private onScroll(event: Event) {
    const host = event.currentTarget as HTMLDivElement;
    this.listScrollTop = host.scrollTop;
    this.viewportHeight = host.clientHeight;
  }

  private score(point: FreeMapPoint) {
    if (this.config.formatScore) return this.config.formatScore(point);
    if (point.score != null) return `${point.score.toFixed(1)}`;
    if (point.rank != null) return `#${point.rank}`;
    return "Unranked";
  }

  private renderRows(rows: FreeMapPoint[], dataset: FreeMapDataset) {
    if (!rows.length) return html`<div class="empty" part="empty">${this.effectiveLabels.empty}</div>`;
    const start = Math.max(0, Math.floor(this.listScrollTop / ROW_HEIGHT) - OVERSCAN);
    const count = Math.ceil(this.viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const visible = rows.slice(start, Math.min(rows.length, start + count));
    return html`<div class="virtual" style=${`height:${rows.length * ROW_HEIGHT}px`}>
      ${visible.map((point, offset) => {
        const mappable = (this.config.validPoint ?? pointIsMappable)(point, dataset);
        return html`<div class="row" part="result-row" style=${`transform:translateY(${(start + offset) * ROW_HEIGHT}px)`}>
          <button type="button" aria-current=${this.selectedId === point.id ? "true" : nothing} @click=${() => this.select(point.id)}>
            <div class="title"><span>${point.title}</span><span class="score">${this.score(point)}</span></div>
            <div class="meta">${[point.area, point.branchLabel, point.priceLabel].filter(Boolean).join(" · ")} ${!mappable ? html`<span class="unavailable"> · Map unavailable</span>` : nothing}</div>
            ${point.summary ? html`<div class="summary">${point.summary}</div>` : nothing}
          </button>
        </div>`;
      })}
    </div>`;
  }

  private renderDetails(point: FreeMapPoint, dataset: FreeMapDataset) {
    const detailUrl = this.config.detailLinkBuilder?.(point) ?? point.detailsUrl;
    const external = this.config.externalMapLinkBuilder?.(point);
    const branchCount = dataset.points.filter((row) => row.groupId && row.groupId === point.groupId).length;
    return html`<section class="details" part="details" aria-label="Selected place">
      <div class="details-meta">${this.filtered.length} in list${branchCount > 1 ? ` · 1 of ${branchCount} locations` : ""}</div>
      <h2>${point.title}</h2>
      ${point.summary ? html`<p>${point.summary}</p>` : nothing}
      ${!pointIsMappable(point, dataset) ? html`<p class="unavailable">Map unavailable — this place remains available in the list.</p>` : nothing}
      <div class="links">
        ${external ? html`<a href=${external} target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>` : nothing}
        ${detailUrl ? html`<a class="primary" href=${detailUrl}>${this.effectiveLabels.details}</a>` : nothing}
      </div>
    </section>`;
  }

  render() {
    if (this.phase === "error") return html`<div class="error" part="error" role="alert"><h1>${this.effectiveLabels.mapUnavailable}</h1><p>${this.failure?.message}</p>${this.failure?.retryable ? html`<button type="button" @click=${() => this.reload()}>${this.effectiveLabels.retry}</button>` : nothing}</div>`;
    const dataset = this.activeDataset;
    if (!dataset || this.phase === "loading") return html`<div class="shell" part="shell" aria-busy="true"><div class="map" part="map"><div class="map-state" role="status">Loading map…</div></div></div>`;
    const rows = this.filtered;
    const selected = dataset.points.find((point) => point.id === this.selectedId);
    const mapped = toRenderablePoints(rows, dataset, this.selectedId, this.config.validPoint ?? pointIsMappable);
    return html`<div class="shell" part="shell">
      ${this.hintVisible && !this.compact ? html`<div class="tip" part="hint" role="status"><span><strong>Interactive map</strong> — Pan, zoom, or choose a place. List and pins stay in sync.</span><button type="button" aria-label="Dismiss map tips" @click=${() => { this.hintVisible = false; }}>×</button></div>` : nothing}
      <div class="layout">
        <section class="controls" part="controls">
          <h1>${this.effectiveLabels.explorerTitle}</h1><p class="lede">${dataset.label} — filter the list and map together.</p>
          <label class="search"><span class="sr-only">Search places</span><input part="search-input" type="search" .value=${this.query} placeholder=${this.effectiveLabels.searchPlaceholder} @input=${(event: InputEvent) => { this.query = (event.target as HTMLInputElement).value; }} /></label>
          <div class="fields">
            <label class="field"><span>${this.effectiveLabels.categoryLabel}</span><select part="category-select" .value=${this.category} @change=${(event: Event) => { this.category = (event.target as HTMLSelectElement).value; }}><option value="all">${this.effectiveLabels.allCategories}</option>${dataset.categories.map((category) => html`<option value=${category.id}>${category.parentId ? "↳ " : ""}${category.label}</option>`)}</select></label>
            <label class="field"><span>${this.effectiveLabels.sortLabel}</span><select part="sort-select" .value=${this.sort} @change=${(event: Event) => { this.sort = (event.target as HTMLSelectElement).value as FreeMapSort; }}><option value="ranking">Ranking</option><option value="score">Score</option><option value="name">Name (A–Z)</option></select></label>
          </div>
        </section>
        <section class="map" part="map" aria-label=${`Map, ${mapped.length} locations`}>
          <div class="map-actions"><button class="action" part="fit-button" type="button" @click=${() => this.fitAll()}>${this.effectiveLabels.showAll} ${mapped.length} pin${mapped.length === 1 ? "" : "s"}</button><button class="action" part="reset-button" type="button" @click=${() => this.resetView()}>${this.effectiveLabels.resetView}</button></div>
          <div class="map-host"></div><div class="map-state" ?hidden=${this.activated}>Map loads when visible.</div>
        </section>
        <h2 class="sr-only" id="free-map-results">Place results</h2>
        <div class="results" part="results" role="region" aria-label="Place results" @scroll=${this.onScroll}>${this.renderRows(rows, dataset)}</div>
        ${selected ? this.renderDetails(selected, dataset) : nothing}
      </div>
    </div>`;
  }
}

export type FreeMapExplorerPublicElement = Omit<FreeMapExplorerElement, "dataset"> & { dataset?: FreeMapDataset };
declare global { interface HTMLElementTagNameMap { "free-map-explorer": FreeMapExplorerElement } }
