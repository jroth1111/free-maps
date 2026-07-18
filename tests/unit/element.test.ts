import { afterEach, describe, expect, it, vi } from "vitest";
import "../../src/element";
import type { FreeMapDataset, MapRenderer, MapRendererState } from "../../src/core";
import { dataset } from "./core.test";

class FakeRenderer implements MapRenderer {
  mounts = 0; updates = 0; fits = 0; resets = 0; destroys = 0; state?: MapRendererState;
  mount(_container: HTMLElement, state: MapRendererState) { this.mounts++; this.state = state; }
  update(state: MapRendererState) { this.updates++; this.state = state; }
  fitAll() { this.fits++; }
  resetView() { this.resets++; }
  destroy() { this.destroys++; }
}

const settle = async (element: HTMLElement & { updateComplete: Promise<unknown> }) => { await element.updateComplete; await new Promise((resolve) => setTimeout(resolve)); await element.updateComplete; };

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("free-map-explorer lifecycle", () => {
  it("mounts the renderer once, emits composed events, clears filtered selection, and disposes", async () => {
    const renderer = new FakeRenderer();
    const element = document.createElement("free-map-explorer");
    element.loading = "eager";
    element.config = { rendererFactory: () => renderer };
    (element as unknown as { dataset: FreeMapDataset }).dataset = dataset;
    const ready = vi.fn(); const selection = vi.fn();
    document.body.addEventListener("free-map-ready", ready);
    document.body.addEventListener("free-map-select", selection);
    document.body.append(element);
    await settle(element);
    expect(renderer.mounts).toBe(1);
    expect(ready).toHaveBeenCalledOnce();
    element.select("a"); await settle(element);
    element.query = "Bravo"; await settle(element);
    expect(element.selectedId).toBeNull();
    expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ id: null }) }));
    element.fitAll(); element.resetView();
    expect(renderer.fits).toBe(1); expect(renderer.resets).toBe(1);
    element.remove(); expect(renderer.destroys).toBe(1);
  });

  it("serializes asynchronous renderer creation and mounting", async () => {
    const renderer = new FakeRenderer();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    renderer.mount = vi.fn(async (_container: HTMLElement, state: MapRendererState) => {
      renderer.mounts++;
      renderer.state = state;
      await gate;
    });
    const factory = vi.fn(async () => renderer);
    const element = document.createElement("free-map-explorer");
    element.loading = "eager";
    element.config = { rendererFactory: factory };
    (element as unknown as { dataset: FreeMapDataset }).dataset = dataset;
    document.body.append(element);
    await element.updateComplete;
    element.query = "Alpha";
    await element.updateComplete;
    release();
    await settle(element);
    expect(factory).toHaveBeenCalledOnce();
    expect(renderer.mounts).toBe(1);
  });

  it("gives the dataset property precedence and aborts an in-flight src request", async () => {
    let aborted = false;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); });
    })));
    const element = document.createElement("free-map-explorer");
    element.config = { rendererFactory: () => new FakeRenderer() };
    element.src = "/slow.json";
    document.body.append(element);
    await element.updateComplete;
    (element as unknown as { dataset: FreeMapDataset }).dataset = dataset;
    await settle(element);
    expect(aborted).toBe(true);
    expect(element.shadowRoot?.textContent).toContain("Test places");
  });

  it("virtualizes 5,000 results below sixty mounted rows", async () => {
    const many = { ...dataset, id: "many", points: Array.from({ length: 5000 }, (_, index) => ({ ...dataset.points[0]!, id: `p-${index}`, title: `Place ${index}` })) };
    const element = document.createElement("free-map-explorer");
    element.loading = "eager";
    element.config = { rendererFactory: () => new FakeRenderer() };
    (element as unknown as { dataset: FreeMapDataset }).dataset = many;
    document.body.append(element);
    await settle(element);
    expect(element.shadowRoot?.querySelectorAll(".row").length).toBeLessThan(60);
    const layout = element.shadowRoot!.querySelector(".layout")!;
    expect([...layout.children].map((child) => child.className)).toEqual(expect.arrayContaining(["controls", "map", "results"]));
  });
});
