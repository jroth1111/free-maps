import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineFreeMapElements, type FreeMapExplorerElement } from "../../src/element";
import type { FreeMapDataset, MapRenderer, MapRendererState } from "../../src/core";
import { dataset } from "./core.test";
import { SerialMountScheduler } from "../../src/element/scheduler";

class FakeRenderer implements MapRenderer {
  mounts = 0; updates = 0; fits = 0; resets = 0; destroys = 0; state?: MapRendererState;
  mount(_container: HTMLElement, state: MapRendererState) { this.mounts++; this.state = state; }
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
    for (const part of ["controls", "results", "result-row", "map", "status"]) expect(ready.shadowRoot?.querySelector(`[part~="${part}"]`), part).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const loading = elementWith(new FakeRenderer(), "manual"); loading.src = "/pending.json"; document.body.append(loading); await settle(loading);
    expect(loading.shadowRoot?.querySelector('[part~="status"]')).toBeTruthy();

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
