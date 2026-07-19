import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapRendererState } from "../../src/core";
import { clearSharedTileSessionsForTests } from "../../src/maplibre/session";
import { VectorCanvasRenderer } from "../../src/vector";
import { dataset } from "./core.test";

const state: MapRendererState = {
  dataset,
  points: dataset.points.flatMap((point) => point.position ? [{ id: point.id, title: point.title, ...point.position, selected: false }] : []),
  selectedId: null,
  options: {},
};

const context = {
  arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(), setTransform: vi.fn(), stroke: vi.fn(),
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
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "" })).toThrow(/tileJsonUrl is required/);
    expect(() => new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", tileHeaders: { "x-client": "test" } })).toThrow(/protectedUrlPrefix/);
  });

  it("paints numeric vector-tile URLs with scoped credentials and disposes cleanly", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), location.href);
      const headers = new Headers(init?.headers);
      requests.push({ url: url.href, authorization: headers.get("authorization") });
      if (url.pathname === "/api/tile-session") return new Response(JSON.stringify({ token: "scoped", expiresAt: Date.now() + 300_000 }));
      if (url.pathname === "/tiles/map.json") return new Response(JSON.stringify({ tiles: ["/tiles/data/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 15 }));
      return new Response(new Uint8Array(), { status: 200, headers: { "content-type": "application/vnd.mapbox-vector-tile" } });
    }));
    const renderer = new VectorCanvasRenderer({ tileJsonUrl: "/tiles/map.json", tileSession: { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" }, tileHeaders: { "x-client": "test" } });
    const container = document.createElement("div"); document.body.append(container);
    await renderer.mount(container, state, vi.fn());
    const canvas = container.querySelector("canvas")!;
    expect(canvas.dataset.tilesPainted).toBe("true");
    expect(canvas.dataset.tileCount).toMatch(/^[1-9]/);
    const tiles = requests.filter(({ url }) => url.endsWith(".mvt"));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every(({ url }) => !/%7B|%7D/.test(url))).toBe(true);
    expect(requests.filter(({ url }) => new URL(url).pathname.startsWith("/tiles/")).every(({ authorization }) => authorization === "Bearer scoped")).toBe(true);
    renderer.destroy();
    expect(container.querySelector("canvas")).toBeNull();
  });
});
