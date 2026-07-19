import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapRendererState } from "../../src/core";
import { clearSharedTileSessionsForTests } from "../../src/maplibre/session";
import { neutralLightBasemap, VectorCanvasRenderer } from "../../src/vector";
import { dataset } from "./fixtures";

const state: MapRendererState = {
  dataset,
  points: dataset.points.flatMap((point) => point.position ? [{ id: point.id, title: point.title, ...point.position, selected: false }] : []),
  selectedId: null,
  options: {},
};

const context = {
  arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(), setTransform: vi.fn(), stroke: vi.fn(),
  fillStyle: "", strokeStyle: "", font: "", lineWidth: 0, textAlign: "start", textBaseline: "alphabetic",
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(performance.now()); return 1; });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
});

afterEach(() => {
  clearSharedTileSessionsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("vector canvas renderer", () => {
  it("requires explicit TileJSON and scoped-header configuration", () => {
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json" } as never)).toThrow(/basemapStyle requires explicit/);
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", basemapStyle: { ...neutralLightBasemap, water: "" } })).toThrow(/basemapStyle requires explicit/);
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "", basemapStyle: neutralLightBasemap })).toThrow(/tileJsonUrl is required/);
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", basemapStyle: neutralLightBasemap, tileHeaders: { "x-client": "test" } })).toThrow(/protectedUrlPrefix/);
  });

  it("paints numeric vector-tile URLs with scoped credentials and disposes cleanly", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    let transientTileFailure = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), location.href);
      const headers = new Headers(init?.headers);
      requests.push({ url: url.href, authorization: headers.get("authorization") });
      if (url.pathname === "/api/tile-session") return new Response(JSON.stringify({ token: "scoped", expiresAt: Date.now() + 300_000 }));
      if (url.pathname === "/tiles/map.json") return new Response(JSON.stringify({ tiles: ["/tiles/data/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 15 }));
      if (transientTileFailure) { transientTileFailure = false; return new Response("temporary", { status: 502 }); }
      return new Response(new Uint8Array(), { status: 200, headers: { "content-type": "application/vnd.mapbox-vector-tile" } });
    }));
    const renderer = new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", basemapStyle: neutralLightBasemap, tileSession: { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" }, tileHeaders: { "x-client": "test" } });
    const container = document.createElement("div"); container.style.position = "absolute"; document.body.append(container);
    const viewports: Array<{ cause: string }> = [];
    await renderer.mount(container, state, vi.fn(), { onViewportChange: (detail) => viewports.push(detail) });
    const canvas = container.querySelector("canvas")!;
    expect(canvas.dataset.tilesPainted).toBe("true");
    expect(canvas.dataset.tileCount).toMatch(/^[1-9]/);
    const tiles = requests.filter(({ url }) => url.endsWith(".mvt"));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every(({ url }) => !/%7B|%7D/.test(url))).toBe(true);
    expect(requests.filter(({ url }) => new URL(url).pathname.startsWith("/tiles/")).every(({ authorization }) => authorization === "Bearer scoped")).toBe(true);
    const basemapPaints = context.fillRect.mock.calls.length;
    await renderer.update({ ...state, points: state.points.slice(0, 1) });
    expect(context.fillRect.mock.calls).toHaveLength(basemapPaints);
    expect(context.drawImage).toHaveBeenCalled();
    const zoomButton = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
    zoomButton.click(); expect(viewports.at(-1)?.cause).toBe("user");
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(basemapPaints);
    expect(requests.filter(({ url }) => new URL(url).pathname === "/tiles/map.json")).toHaveLength(1);
    renderer.resetView(); expect(viewports.at(-1)?.cause).toBe("programmatic");
    const count = viewports.length;
    renderer.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.style.position).toBe("absolute");
    zoomButton.click(); expect(viewports).toHaveLength(count);
  });

  it("coalesces drag work, suppresses the synthetic drag click, and cancels queued work", async () => {
    const frames = new Map<number, FrameRequestCallback>(); let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === "/tiles/map.json") return new Response(JSON.stringify({ tiles: ["/tiles/data/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 15 }));
      return new Response(new Uint8Array());
    }));
    const renderer = new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", basemapStyle: neutralLightBasemap });
    const container = document.createElement("div"); document.body.append(container);
    const viewports: Array<{ cause: string }> = [];
    const mounted = renderer.mount(container, state, vi.fn(), { onViewportChange: (detail) => viewports.push(detail) });
    await vi.waitFor(() => expect(frames.size).toBeGreaterThan(0));
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(performance.now()); }
    await mounted;
    const canvas = container.querySelector("canvas")!;
    canvas.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    canvas.dispatchEvent(pointer("pointerup", 10, 10));
    expect(viewports).toHaveLength(0);
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    canvas.dispatchEvent(pointer("pointermove", 40, 40));
    expect(frames.size).toBe(1);
    canvas.dispatchEvent(pointer("pointercancel", 40, 40));
    expect(frames.size).toBe(0);
    expect(viewports).toHaveLength(0);
    const before = context.fillRect.mock.calls.length;
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    canvas.dispatchEvent(pointer("pointermove", 40, 40));
    canvas.dispatchEvent(pointer("pointermove", 60, 60));
    expect(context.fillRect.mock.calls.length).toBe(before);
    expect(frames.size).toBe(1);
    canvas.dispatchEvent(pointer("pointerup", 60, 60));
    expect(viewports).toEqual([expect.objectContaining({ cause: "user" })]);
    const zoom = canvas.dataset.zoom;
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 60, clientY: 60, bubbles: true }));
    expect(canvas.dataset.zoom).toBe(zoom);
    renderer.destroy();
    expect(container.style.position).toBe("");
    expect(frames.size).toBe(0);
  });
});
