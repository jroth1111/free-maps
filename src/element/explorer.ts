import { LitElement, html, nothing, type PropertyValues } from "lit";
import { property, query as queryElement, state } from "lit/decorators.js";
import {
  indexPoints,
  normalizeActiveFilters,
  normalizeQuickFilters,
  pointIsMappable,
  toRenderablePoints,
  type FreeMapActivation,
  type FreeMapDataset,
  type FreeMapElementOptions,
  type FreeMapLayout,
  type FreeMapPoint,
  type FreeMapQuickFilter,
  type FreeMapSort,
  type IndexedFreeMapPoint,
  type MapRendererFactory,
  type MapRendererState,
  type MapViewportDetail,
} from "../core";
import { filterAndSortPointsMemoized, type IndexedPointSortCache } from "../core/search";
import { FreeMapRuntimeController } from "./controller";
import { structuralStyles } from "./styles";

const labels = { explorerTitle: "Map explorer", searchPlaceholder: "Search area, place…", categoryLabel: "Category", sortLabel: "Sort", allCategories: "All categories", showAll: "Show all", resetView: "Zoom to CBD", empty: "No places match these filters.", mapUnavailable: "Map unavailable", retry: "Try again", details: "View details" };
const ROW_HEIGHT = 88;
const OVERSCAN = 6;
type SheetSnap = "collapsed" | "half" | "expanded";
const SNAP_ORDER: SheetSnap[] = ["collapsed", "half", "expanded"];
const MOBILE_MEDIA = "(max-width: 759px)";
const isMobile = (): boolean => typeof matchMedia === "function" && matchMedia(MOBILE_MEDIA).matches;

export class FreeMapExplorerElement extends LitElement {
  static styles = structuralStyles;
  private runtime = new FreeMapRuntimeController(this);
  private _data: FreeMapDataset | null = null;
  private indexed: IndexedFreeMapPoint[] = [];
  private indexedDataset: FreeMapDataset | null = null;
  private sortedMemo: IndexedPointSortCache = new Map();
  private filteredMemo?: { dataset: FreeMapDataset; query: string; category: string; sort: FreeMapSort; indexed: IndexedFreeMapPoint[]; quickFilters: FreeMapQuickFilter[]; activeFilters: string[]; rows: FreeMapPoint[] };
  private filteredCache = new Map<string, { dataset: FreeMapDataset; indexed: IndexedFreeMapPoint[]; quickFilters: FreeMapQuickFilter[]; rows: FreeMapPoint[] }>();
  private renderableMemo?: { dataset: FreeMapDataset; rows: FreeMapPoint[]; selectedId: string | null; validPoint: NonNullable<FreeMapElementOptions["validPoint"]>; points: MapRendererState["points"] };
  private renderableCache = new Map<FreeMapPoint[], { dataset: FreeMapDataset; selectedId: string | null; validPoint: NonNullable<FreeMapElementOptions["validPoint"]>; points: MapRendererState["points"] }>();
  private normalizedQuickMemo?: { source: FreeMapQuickFilter[] | undefined; filters: FreeMapQuickFilter[] };
  private gesture?: { pointerId: number; startY: number; startOffset: number; height: number };
  private gestureFrame = 0;
  private gestureY = 0;
  private suppressSheetClick = false;
  private removeGestureListeners?: () => void;
  private mobileMedia?: MediaQueryList;
  private removeMobileMediaListener?: () => void;

  @property({ attribute: false }) get data(): FreeMapDataset | null { return this._data; }
  set data(value: FreeMapDataset | null) { const old = this._data; this._data = value; this.runtime.setData(value); this.requestUpdate("data", old); }
  @property({ attribute: false }) renderer: MapRendererFactory | null = null;
  @property({ attribute: false }) options: FreeMapElementOptions = {};
  @property() src: string | null = null;
  @property({ reflect: true }) activation: FreeMapActivation = "visible";
  @property({ reflect: true }) layout: FreeMapLayout = "responsive";
  @property() query = "";
  @property() category = "all";
  @property() sort: FreeMapSort = "ranking";
  @property({ attribute: false }) activeFilters: string[] = [];
  @property({ attribute: "selected-id" }) selectedId: string | null = null;
  @property({ type: Boolean, reflect: true }) compact = false;

  @state() private listScrollTop = 0;
  @state() private viewportHeight = 520;
  @state() private hintVisible = true;
  @state() private railCollapsed = false;
  @state() private sheetSnap: SheetSnap = "half";
  @state() private searchAreaViewport: MapViewportDetail | null = null;
  @queryElement(".map-host") private mapHost?: HTMLDivElement;
  @queryElement(".results") private resultsHost?: HTMLDivElement;
  @queryElement(".panel") private panelHost?: HTMLElement;
  @queryElement(".sheet-handle") private sheetHandle?: HTMLButtonElement;

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof matchMedia !== "function") return;
    const media = matchMedia(MOBILE_MEDIA);
    const changed = () => this.requestUpdate();
    this.mobileMedia = media;
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", changed);
      this.removeMobileMediaListener = () => media.removeEventListener("change", changed);
    } else if (typeof media.addListener === "function") {
      media.addListener(changed);
      this.removeMobileMediaListener = () => media.removeListener(changed);
    }
  }

  disconnectedCallback(): void {
    this.cancelSheetGesture();
    this.removeMobileMediaListener?.();
    this.removeMobileMediaListener = undefined;
    this.mobileMedia = undefined;
    super.disconnectedCallback();
  }

  private get datasetValue(): FreeMapDataset | null { return this.runtime.dataset; }
  private get mobileLayoutActive(): boolean { return this.mobileMedia?.matches ?? isMobile(); }
  private get effectiveLabels() { return { ...labels, ...this.options.labels }; }
  private get quickFilters(): FreeMapQuickFilter[] {
    const source = this.options.quickFilters;
    const memo = this.normalizedQuickMemo;
    if (memo && memo.source === source) return memo.filters;
    const filters = normalizeQuickFilters(source);
    this.normalizedQuickMemo = { source, filters };
    return filters;
  }
  private get normalizedActiveFilters(): string[] { return normalizeActiveFilters(this.activeFilters, this.quickFilters); }
  private get filtered() {
    const dataset = this.datasetValue;
    if (!dataset) return [];
    const quickFilters = this.quickFilters;
    const activeFilters = this.normalizedActiveFilters;
    const cached = this.filteredMemo;
    if (cached && cached.dataset === dataset && cached.indexed === this.indexed && cached.query === this.query && cached.category === this.category && cached.sort === this.sort && cached.quickFilters === quickFilters && cached.activeFilters.length === activeFilters.length && cached.activeFilters.every((id, index) => id === activeFilters[index])) return cached.rows;
    const cacheKey = JSON.stringify([this.query, this.category, this.sort, activeFilters]);
    const reusable = this.filteredCache.get(cacheKey);
    const rows = reusable?.dataset === dataset && reusable.indexed === this.indexed && reusable.quickFilters === quickFilters
      ? reusable.rows
      : filterAndSortPointsMemoized(this.indexed, dataset.categories, this.query, this.category, this.sort, this.sortedMemo, dataset, quickFilters, activeFilters);
    this.filteredCache.delete(cacheKey);
    this.filteredCache.set(cacheKey, { dataset, indexed: this.indexed, quickFilters, rows });
    if (this.filteredCache.size > 8) this.filteredCache.delete(this.filteredCache.keys().next().value!);
    this.filteredMemo = { dataset, indexed: this.indexed, query: this.query, category: this.category, sort: this.sort, quickFilters, activeFilters, rows };
    return rows;
  }
  private renderable(rows: FreeMapPoint[], dataset: FreeMapDataset) {
    const validPoint = this.options.validPoint ?? pointIsMappable;
    const cached = this.renderableMemo;
    if (cached && cached.dataset === dataset && cached.rows === rows && cached.selectedId === this.selectedId && cached.validPoint === validPoint) return cached.points;
    const reusable = this.renderableCache.get(rows);
    const points = reusable?.dataset === dataset && reusable.selectedId === this.selectedId && reusable.validPoint === validPoint ? reusable.points : toRenderablePoints(rows, dataset, this.selectedId, validPoint);
    this.renderableCache.delete(rows);
    this.renderableCache.set(rows, { dataset, selectedId: this.selectedId, validPoint, points });
    if (this.renderableCache.size > 8) this.renderableCache.delete(this.renderableCache.keys().next().value!);
    this.renderableMemo = { dataset, rows, selectedId: this.selectedId, validPoint, points };
    return points;
  }

  async activate(): Promise<void> { await this.runtime.activate(); }
  async reload(): Promise<void> { await this.runtime.reload(); }
  select(id: string | null): void { this.runtimeSelect(id); }
  fitAll(): void { this.select(null); this.searchAreaViewport = null; this.runtime.fitAll(); }
  resetView(): void { this.select(null); this.searchAreaViewport = null; this.runtime.resetView(); }
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
    this.searchAreaViewport = null;
    if (next && this.layout === "responsive" && this.mobileLayoutActive) this.sheetSnap = "expanded";
    this.dispatchEvent(new CustomEvent("free-map-select", { bubbles: true, composed: true, detail: { id: next, point: dataset?.points.find((point) => point.id === next) ?? null } }));
  }
  runtimeViewport(detail: MapViewportDetail): void {
    this.searchAreaViewport = this.options.searchArea && detail.cause === "user" ? detail : null;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("src")) this.runtime.setSrc(this.src);
    if (changed.has("activation")) this.runtime.activationChanged();
    if (changed.has("options")) { this.normalizedQuickMemo = undefined; this.filteredMemo = undefined; this.filteredCache.clear(); this.renderableMemo = undefined; this.renderableCache.clear(); if (!this.options.searchArea) this.searchAreaViewport = null; }
    if (this.datasetValue !== this.indexedDataset) { this.indexedDataset = this.datasetValue; this.indexed = indexPoints(this.datasetValue?.points ?? []); this.sortedMemo.clear(); this.filteredMemo = undefined; this.filteredCache.clear(); this.renderableMemo = undefined; this.renderableCache.clear(); }
    if (changed.has("query") || changed.has("category") || changed.has("sort") || changed.has("activeFilters") || changed.has("options")) {
      const normalized = this.normalizedActiveFilters;
      if (changed.has("activeFilters") && (normalized.length !== this.activeFilters.length || normalized.some((id, index) => id !== this.activeFilters[index]))) this.activeFilters = normalized;
      const rows = this.filtered;
      if (this.datasetValue && this.selectedId && !rows.some((point) => point.id === this.selectedId)) this.runtimeSelect(null);
      this.dispatchEvent(new CustomEvent("free-map-filter-change", { bubbles: true, composed: true, detail: { query: this.query, category: this.category, sort: this.sort, filters: normalized, count: rows.length } }));
      this.listScrollTop = 0;
      if (this.resultsHost) this.resultsHost.scrollTop = 0;
    }
  }

  private onScroll(event: Event): void { const host = event.currentTarget as HTMLDivElement; this.listScrollTop = host.scrollTop; this.viewportHeight = host.clientHeight; }
  private score(point: FreeMapPoint): string { if (this.options.formatScore) return this.options.formatScore(point); if (point.score != null) return point.score.toFixed(1); if (point.rank != null) return `#${point.rank}`; return "Unranked"; }
  private landmarkLabel(label: string): string { const host = this.getAttribute("aria-label")?.trim(); return host ? `${host}: ${label}` : label; }
  private toggleFilter(id: string): void { this.activeFilters = this.normalizedActiveFilters.includes(id) ? this.normalizedActiveFilters.filter((value) => value !== id) : [...this.normalizedActiveFilters, id]; }
  private dispatchSearchArea(): void {
    if (!this.searchAreaViewport) return;
    const detail = this.searchAreaViewport;
    this.searchAreaViewport = null;
    this.dispatchEvent(new CustomEvent("free-map-search-area", { bubbles: true, composed: true, detail }));
  }
  private setSheetSnap(next: SheetSnap, focusHandle = false): void {
    this.sheetSnap = next;
    this.panelHost?.style.removeProperty("transform");
    if (focusHandle) queueMicrotask(() => this.sheetHandle?.focus());
  }
  private onSheetKeydown(event: KeyboardEvent): void {
    const current = SNAP_ORDER.indexOf(this.sheetSnap);
    if (event.key === "ArrowUp") { event.preventDefault(); this.setSheetSnap(SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, current + 1)]!); }
    else if (event.key === "ArrowDown") { event.preventDefault(); this.setSheetSnap(SNAP_ORDER[Math.max(0, current - 1)]!); }
    else if (event.key === "Home") { event.preventDefault(); this.setSheetSnap("collapsed"); }
    else if (event.key === "End") { event.preventDefault(); this.setSheetSnap("expanded"); }
  }
  private onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== "Tab" || this.sheetSnap !== "expanded" || !this.mobileLayoutActive || !this.panelHost) return;
    const focusable = [...this.panelHost.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')].filter((node) => node.offsetParent !== null);
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && this.shadowRoot?.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && this.shadowRoot?.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  private onSheetPointerDown(event: PointerEvent): void {
    if (this.layout !== "responsive" || !this.mobileLayoutActive || !this.panelHost) return;
    const height = this.panelHost.getBoundingClientRect().height;
    const offsets: Record<SheetSnap, number> = { expanded: 0, half: height * .45, collapsed: Math.max(0, height - 72) };
    this.gesture = { pointerId: event.pointerId, startY: event.clientY, startOffset: offsets[this.sheetSnap], height };
    this.gestureY = event.clientY;
    this.sheetHandle?.setPointerCapture?.(event.pointerId);
    const move = (next: PointerEvent) => { if (this.gesture?.pointerId !== next.pointerId) return; this.gestureY = next.clientY; if (!this.gestureFrame) this.gestureFrame = requestAnimationFrame(() => this.paintSheetGesture()); };
    const finish = (next: PointerEvent) => { if (this.gesture?.pointerId !== next.pointerId) return; const moved = Math.abs(next.clientY - this.gesture.startY); const offset = Math.max(0, Math.min(this.gesture.height - 72, this.gesture.startOffset + next.clientY - this.gesture.startY)); const ratios: Array<[SheetSnap, number]> = [["expanded", 0], ["half", .45], ["collapsed", 1]]; ratios.sort((left, right) => Math.abs(offset / this.gesture!.height - left[1]) - Math.abs(offset / this.gesture!.height - right[1])); this.cancelSheetGesture(); this.suppressSheetClick = moved > 5; this.setSheetSnap(ratios[0]![0]); };
    const cancel = (next: PointerEvent) => { if (this.gesture?.pointerId === next.pointerId) this.cancelSheetGesture(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    this.removeGestureListeners = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); };
  }
  private onSheetClick(): void { if (this.suppressSheetClick) { this.suppressSheetClick = false; return; } this.setSheetSnap(this.sheetSnap === "expanded" ? "half" : "expanded"); }
  private paintSheetGesture(): void {
    this.gestureFrame = 0;
    if (!this.gesture || !this.panelHost) return;
    const offset = Math.max(0, Math.min(this.gesture.height - 72, this.gesture.startOffset + this.gestureY - this.gesture.startY));
    this.panelHost.style.transform = `translate3d(0, ${offset}px, 0)`;
  }
  private cancelSheetGesture(): void {
    if (this.gestureFrame) cancelAnimationFrame(this.gestureFrame);
    this.gestureFrame = 0;
    this.gesture = undefined;
    this.panelHost?.style.removeProperty("transform");
    this.removeGestureListeners?.();
    this.removeGestureListeners = undefined;
  }
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
  private renderControls(dataset: FreeMapDataset) {
    return html`<section class="controls" part="controls filter-bar"><h2>${this.effectiveLabels.explorerTitle}</h2><p class="lede">${dataset.label} — filter the list and map together.</p><label class="search"><span class="sr-only">Search places</span><input part="search-input" type="search" .value=${this.query} placeholder=${this.effectiveLabels.searchPlaceholder} @input=${(event: InputEvent) => { this.query = (event.target as HTMLInputElement).value; }} /></label><div class="fields"><label class="field"><span>${this.effectiveLabels.categoryLabel}</span><select part="category-select" .value=${this.category} @change=${(event: Event) => { this.category = (event.target as HTMLSelectElement).value; }}><option value="all">${this.effectiveLabels.allCategories}</option>${dataset.categories.map((category) => html`<option value=${category.id}>${category.parentId ? "↳ " : ""}${category.label}</option>`)}</select></label><label class="field"><span>${this.effectiveLabels.sortLabel}</span><select part="sort-select" .value=${this.sort} @change=${(event: Event) => { this.sort = (event.target as HTMLSelectElement).value as FreeMapSort; }}><option value="ranking">Ranking</option><option value="score">Score</option><option value="name">Name (A–Z)</option></select></label></div>${this.quickFilters.length ? html`<div class="filter-chips" aria-label="Quick filters">${this.quickFilters.map((filter) => html`<button type="button" part="filter-chip" aria-pressed=${this.normalizedActiveFilters.includes(filter.id)} @click=${() => this.toggleFilter(filter.id)}>${filter.label}</button>`)}</div>` : nothing}</section>`;
  }
  render() {
    if (this.runtime.phase === "error") return html`<div class="error" part="errors" role="alert"><h2>${this.effectiveLabels.mapUnavailable}</h2><p>${this.runtime.failure?.message}</p>${this.runtime.failure?.retryable ? html`<button type="button" @click=${() => this.reload()}>${this.effectiveLabels.retry}</button>` : nothing}</div>`;
    const dataset = this.datasetValue;
    if (!dataset || this.runtime.phase === "loading") return html`<div class="shell" part="shell" aria-busy="true"><div class="layout loading-layout"><div class="map" part="map"><div class="map-state" part="status" role="status">Loading map…</div></div></div></div>`;
    const rows = this.filtered;
    const selected = dataset.points.find((point) => point.id === this.selectedId);
    const mapped = this.renderable(rows, dataset);
    const bodyInert = this.layout === "responsive" && this.mobileLayoutActive && this.sheetSnap === "collapsed";
    return html`
      <div class="shell" part="shell">
        ${this.hintVisible && !this.compact ? html`<div class="tip" part="status" role="status"><span><strong>Interactive map</strong> — Pan, zoom, or choose a place. List and pins stay in sync.</span><button type="button" aria-label="Dismiss map tips" @click=${() => { this.hintVisible = false; }}>×</button></div>` : nothing}
        <div class="layout">
          <section class="map" part="map" aria-label=${this.landmarkLabel(`Map, ${mapped.length} locations`)}>
            <div class="map-actions">
              <button class="action" part="fit-button" type="button" @click=${() => this.fitAll()}>${this.effectiveLabels.showAll} ${mapped.length} pin${mapped.length === 1 ? "" : "s"}</button>
              <button class="action" part="reset-button" type="button" @click=${() => this.resetView()}>${this.effectiveLabels.resetView}</button>
              ${this.searchAreaViewport ? html`<button class="action search-area" part="search-area-button" type="button" @click=${this.dispatchSearchArea}>Search this area</button>` : nothing}
            </div>
            <div class="map-host"></div>
            <div class="map-state" part="status" ?hidden=${this.runtime.active}>Map loads when eligible.</div>
          </section>
          <aside class="panel" part="rail sheet" data-snap=${this.sheetSnap} data-collapsed=${this.railCollapsed ? "true" : "false"} @keydown=${this.onPanelKeydown}>
            <button class="rail-toggle" part="rail-toggle" type="button" aria-label=${this.railCollapsed ? "Expand results rail" : "Collapse results rail"} aria-expanded=${!this.railCollapsed} @click=${() => { this.railCollapsed = !this.railCollapsed; }}>‹</button>
            <button class="sheet-handle" part="sheet-handle" type="button" aria-label="Results sheet" aria-expanded=${this.sheetSnap === "expanded"} @keydown=${this.onSheetKeydown} @pointerdown=${this.onSheetPointerDown} @click=${this.onSheetClick}><span aria-hidden="true"></span><strong>${rows.length} places</strong></button>
            <div class="panel-body" ?inert=${bodyInert}>
              ${this.renderControls(dataset)}
              <h2 class="sr-only" id="free-map-results">Place results</h2>
              <div class="results" part="results" role="region" tabindex="0" aria-label=${this.landmarkLabel("Place results")} @scroll=${this.onScroll}>${this.renderRows(rows, dataset)}</div>
              ${selected ? this.renderDetails(selected, dataset) : nothing}
            </div>
          </aside>
        </div>
      </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { "free-map-explorer": FreeMapExplorerElement } }
