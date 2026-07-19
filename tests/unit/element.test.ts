import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineFreeMapElements, type FreeMapExplorerElement } from "../../src/element";
import type { FreeMapDataset, MapRenderer, MapRendererMountOptions, MapRendererState, MapViewportDetail } from "../../src/core";
import { dataset } from "./fixtures";
import { SerialMountScheduler } from "../../src/element/scheduler";

class FakeRenderer implements MapRenderer {
  mounts = 0; updates = 0; fits = 0; resets = 0; destroys = 0; state?: MapRendererState;
  viewport?: (detail: MapViewportDetail) => void;
  mount(_container: HTMLElement, state: MapRendererState, _onSelect: (id: string) => void, options?: MapRendererMountOptions) { this.mounts++; this.state = state; this.viewport = options?.onViewportChange; }
  update(state: MapRendererState) { this.updates++; this.state = state; }
  fitBounds() { this.fits++; }
  resetView() { this.resets++; }
  destroy() { this.destroys++; }
}
const settle = async (element: FreeMapExplorerElement) => { await element.updateComplete; await new Promise((resolve) => setTimeout(resolve, 20)); await element.updateComplete; };
const elementWith = (renderer: FakeRenderer, activation: "eager" | "manual" = "eager") => { const element = document.createElement("free-map-explorer"); element.activation = activation; element.renderer = async () => renderer; return element; };

beforeAll(() => defineFreeMapElements());
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("element lifecycle", () => {
  it("defaults to responsive layout while preserving explicit stack and compact modes", async () => {
    const responsive = elementWith(new FakeRenderer(), "manual"); responsive.data = dataset; document.body.append(responsive); await settle(responsive);
    expect(responsive.layout).toBe("responsive"); expect(responsive.getAttribute("layout")).toBe("responsive");
    responsive.layout = "stack"; responsive.compact = true; await settle(responsive);
    expect(responsive.getAttribute("layout")).toBe("stack"); expect(responsive.hasAttribute("compact")).toBe(true);
  });

  it("does not register as an import side effect and supports explicit registration", async () => {
    expect(customElements.get("free-map-explorer")).toBeDefined();
    expect(customElements.get("free-map-surface")).toBeDefined();
  });

  it("mounts once, emits composed events, updates, and disposes", async () => {
    const renderer = new FakeRenderer(); const element = elementWith(renderer); element.data = dataset;
    const ready = vi.fn(); const selection = vi.fn();
    document.body.addEventListener("free-map-ready", ready); document.body.addEventListener("free-map-select", selection);
    document.body.append(element); await element.activate(); await settle(element);
    expect(renderer.mounts).toBe(1); expect(ready).toHaveBeenCalledOnce();
    element.fitAll(); element.resetView(); expect(renderer.fits).toBe(1); expect(renderer.resets).toBe(1);
    element.select("a"); await settle(element); element.query = "Bravo"; await settle(element);
    expect(element.selectedId).toBeNull(); expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ id: null }) }));
    element.remove(); expect(renderer.destroys).toBe(1);
  });

  it("keeps manual dormant until activate and serializes initialization", async () => {
    const renderer = new FakeRenderer(); const factory = vi.fn(async () => renderer); const element = document.createElement("free-map-explorer");
    element.activation = "manual"; element.renderer = factory; element.data = dataset; document.body.append(element); await settle(element);
    expect(factory).not.toHaveBeenCalled();
    await Promise.all([element.activate(), element.activate()]); await settle(element);
    expect(factory).toHaveBeenCalledOnce(); expect(renderer.mounts).toBe(1);
  });

  it("gives data precedence, aborts src, and resumes src after data becomes null", async () => {
    let aborted = false; let calls = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => { calls++; if (calls === 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); })); return Promise.resolve(new Response(JSON.stringify(dataset), { status: 200, headers: { "content-type": "application/json" } })); }));
    const element = elementWith(new FakeRenderer(), "manual"); element.src = "/places.json"; document.body.append(element); await settle(element);
    element.data = dataset; await settle(element); expect(aborted).toBe(true); expect(element.shadowRoot?.textContent).toContain("Test places");
    element.data = null; await settle(element); expect(calls).toBe(2); expect(element.shadowRoot?.textContent).toContain("Test places");
  });

  it("reports standardized configuration, loading, schema, fetch, and runtime errors", async () => {
    const details: Array<{ code: string }> = [];
    const missing = document.createElement("free-map-explorer"); missing.activation = "eager"; missing.data = dataset; missing.addEventListener("free-map-error", (event) => details.push((event as CustomEvent).detail)); document.body.append(missing); await missing.activate(); await settle(missing);
    expect(details.map((detail) => detail.code)).toContain("renderer-configuration");
    const loading = document.createElement("free-map-explorer"); loading.activation = "eager"; loading.renderer = async () => { throw new Error("load"); }; loading.data = dataset; loading.addEventListener("free-map-error", (event) => details.push((event as CustomEvent).detail)); document.body.append(loading); await loading.activate(); await settle(loading);
    expect(details.map((detail) => detail.code)).toContain("renderer-loading");
    const invalid = elementWith(new FakeRenderer(), "manual"); invalid.addEventListener("free-map-error", (event) => details.push((event as CustomEvent).detail)); invalid.data = { ...dataset, schemaVersion: 2 } as unknown as FreeMapDataset; document.body.append(invalid); await settle(invalid);
    expect(details.map((detail) => detail.code)).toContain("dataset-schema");
  });

  it("virtualizes 5,000 results below sixty mounted rows", async () => {
    const many = { ...dataset, id: "many", points: Array.from({ length: 5000 }, (_, index) => ({ ...dataset.points[0]!, id: `p-${index}`, title: `Place ${index}` })) };
    const element = elementWith(new FakeRenderer()); element.data = many; document.body.append(element); await settle(element);
    expect(element.shadowRoot?.querySelectorAll(".row").length).toBeLessThan(60);
  });

  it("exposes the promised stable parts in ready, loading, and error states", async () => {
    const ready = elementWith(new FakeRenderer()); ready.data = dataset; document.body.append(ready); await ready.activate(); await settle(ready);
    for (const part of ["controls", "filter-bar", "results", "result-row", "map", "status", "rail", "rail-toggle", "sheet", "sheet-handle"]) expect(ready.shadowRoot?.querySelector(`[part~="${part}"]`), part).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const loading = elementWith(new FakeRenderer(), "manual"); loading.src = "/pending.json"; document.body.append(loading); await settle(loading);
    expect(loading.shadowRoot?.querySelector('[part~="status"]')).toBeTruthy();
    expect(loading.shadowRoot?.querySelector(".layout > .map")).toBeTruthy();

    const invalid = elementWith(new FakeRenderer(), "manual"); invalid.data = { ...dataset, schemaVersion: 2 } as unknown as FreeMapDataset; document.body.append(invalid); await settle(invalid);
    expect(invalid.shadowRoot?.querySelector('[part~="errors"]')).toBeTruthy();
  });

  it("coalesces same-turn renderer updates", async () => {
    const renderer = new FakeRenderer(); const element = elementWith(renderer); element.data = dataset; document.body.append(element); await element.activate(); await settle(element);
    const before = renderer.updates;
    element.query = "Cafe"; element.category = "japanese"; element.sort = "name";
    await settle(element);
    expect(renderer.updates - before).toBeLessThanOrEqual(2);
  });

  it("normalizes active quick filters, memoizes matches, and includes filters in event detail", async () => {
    const matches = vi.fn((point: { score?: number | null }) => (point.score ?? 0) >= 90);
    const renderer = new FakeRenderer(); const element = elementWith(renderer);
    element.options = { quickFilters: [{ id: "top", label: "Top rated", matches }, { id: "top", label: "Duplicate", matches: () => false }] };
    element.activeFilters = ["unknown", "top", "top"]; element.data = dataset;
    const changes: unknown[] = []; element.addEventListener("free-map-filter-change", (event) => changes.push((event as CustomEvent).detail));
    document.body.append(element); await element.activate(); await settle(element);
    expect(element.activeFilters).toEqual(["top"]); expect(element.shadowRoot?.querySelectorAll('[part~="filter-chip"]')).toHaveLength(1);
    const calls = matches.mock.calls.length; element.select("c"); await settle(element); expect(matches).toHaveBeenCalledTimes(calls);
    expect(changes.at(-1)).toEqual(expect.objectContaining({ filters: ["top"] }));
  });

  it("keeps search-area off by default and dispatches only after an opted-in user viewport change", async () => {
    const renderer = new FakeRenderer(); const element = elementWith(renderer); element.data = dataset; document.body.append(element); await element.activate(); await settle(element);
    const detail: MapViewportDetail = { bounds: [1, 2, 3, 4], center: { lat: 3, lng: 2 }, zoom: 12, cause: "user" };
    renderer.viewport?.(detail); await settle(element); expect(element.shadowRoot?.querySelector('[part~="search-area-button"]')).toBeNull();
    element.options = { searchArea: true }; await settle(element); renderer.viewport?.(detail); await settle(element);
    const search = vi.fn(); element.addEventListener("free-map-search-area", search);
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="search-area-button"]'); expect(button).toBeTruthy(); button!.click(); await settle(element);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ detail })); expect(element.shadowRoot?.querySelector('[part~="search-area-button"]')).toBeNull();
    renderer.viewport?.(detail); await settle(element); renderer.viewport?.({ ...detail, cause: "programmatic" }); await settle(element); expect(element.shadowRoot?.querySelector('[part~="search-area-button"]')).toBeNull();
  });

  it("supports sheet snap keyboard controls", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const element = elementWith(new FakeRenderer(), "manual"); element.data = dataset; document.body.append(element); await settle(element);
    const handle = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="sheet-handle"]'); expect(handle).toBeTruthy();
    expect(element.shadowRoot?.querySelector(".panel")?.getAttribute("data-snap")).toBe("half");
    handle!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); await settle(element); expect(element.shadowRoot?.querySelector(".panel")?.getAttribute("data-snap")).toBe("collapsed");
    handle!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); await settle(element); expect(element.shadowRoot?.querySelector(".panel")?.getAttribute("data-snap")).toBe("expanded");
  });

  it("removes mobile inertness when the responsive layout crosses the desktop breakpoint", async () => {
    let mobile = true;
    const listeners = new Set<() => void>();
    const media = {
      get matches() { return mobile; },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    const element = elementWith(new FakeRenderer(), "manual"); element.data = dataset; document.body.append(element); await settle(element);
    const handle = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="sheet-handle"]');
    handle!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); await settle(element);
    expect(element.shadowRoot?.querySelector(".panel-body")?.hasAttribute("inert")).toBe(true);
    mobile = false; for (const listener of listeners) listener(); await settle(element);
    expect(element.shadowRoot?.querySelector(".panel-body")?.hasAttribute("inert")).toBe(false);
    element.remove(); expect(listeners.size).toBe(0);
  });

  it("restores the snapped sheet transform when a pointer gesture is cancelled", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const frames = new Map<number, FrameRequestCallback>(); let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
    const element = elementWith(new FakeRenderer(), "manual"); element.data = dataset; document.body.append(element); await settle(element);
    const panel = element.shadowRoot?.querySelector<HTMLElement>(".panel");
    const handle = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="sheet-handle"]');
    expect(panel && handle).toBeTruthy();
    vi.spyOn(panel!, "getBoundingClientRect").mockReturnValue({ bottom: 500, height: 400, left: 0, right: 400, top: 100, width: 400, x: 0, y: 100, toJSON: () => ({}) });
    handle!.setPointerCapture = vi.fn();
    const pointer = (type: string, y: number) => { const event = new Event(type, { bubbles: true }); Object.defineProperties(event, { clientY: { value: y }, pointerId: { value: 1 } }); return event; };
    frames.clear();
    handle!.dispatchEvent(pointer("pointerdown", 100));
    window.dispatchEvent(pointer("pointermove", 180));
    expect(frames.size).toBe(1);
    window.dispatchEvent(pointer("pointercancel", 180));
    expect(frames.size).toBe(0);
    expect(panel!.style.transform).toBe("");
    handle!.dispatchEvent(pointer("pointerdown", 100));
    window.dispatchEvent(pointer("pointermove", 180));
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(performance.now()); }
    expect(panel!.style.transform).toContain("translate3d");
    window.dispatchEvent(pointer("pointercancel", 180));
    expect(panel!.style.transform).toBe("");
  });

  it("keeps standalone surfaces inside the shared sized layout", async () => {
    const surface = document.createElement("free-map-surface"); surface.activation = "manual"; surface.renderer = async () => new FakeRenderer(); surface.data = dataset;
    document.body.append(surface); await surface.updateComplete;
    expect(surface.compact).toBe(true);
    expect(surface.shadowRoot?.querySelector(".layout > .map")).toBeTruthy();
  });

  it("holds the scheduler slot through completion and disposes queued work on abort", async () => {
    const scheduler = new SerialMountScheduler(); const events: string[] = [];
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const firstController = new AbortController(); const secondController = new AbortController();
    const first = scheduler.schedule(async () => { events.push("first-start"); await gate; events.push("first-end"); }, firstController.signal);
    const second = scheduler.schedule(async () => { events.push("second-start"); }, secondController.signal);
    secondController.abort(); await Promise.resolve();
    expect(events).toEqual(["first-start"]); release(); await first;
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(events).toEqual(["first-start", "first-end"]); expect(scheduler.pending).toBe(0);
  });
});
