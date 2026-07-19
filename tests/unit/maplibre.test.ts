import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRendererOptions, classifyViewportCause } from "../../src/maplibre/renderer";
import { clearSharedTileSessionsForTests, getSharedTileSession, matchesProtectedUrl, resolveProtectedPrefix, scopedRequestHeaders } from "../../src/maplibre/session";
import { clearSharedMapStylesForTests, loadMapStyle } from "../../src/maplibre/style";
import { structuralStyles } from "../../src/element/styles";

const inlineStyle = { version: 8 as const, sources: {}, layers: [] };

afterEach(() => {
  clearSharedTileSessionsForTests();
  clearSharedMapStylesForTests();
  vi.unstubAllGlobals();
});

describe("explicit MapLibre configuration", () => {
  it("classifies native viewport gestures without treating programmatic moves as user input", () => {
    expect(classifyViewportCause(undefined)).toBe("programmatic");
    expect(classifyViewportCause({})).toBe("programmatic");
    expect(classifyViewportCause({ originalEvent: new Event("wheel") })).toBe("user");
  });
  it("requires workerUrl and exactly one basemap style source", () => {
    expect(() => assertRendererOptions({ workerUrl: "", style: inlineStyle })).toThrow(/workerUrl is required/);
    expect(() => assertRendererOptions({ workerUrl: "/worker-v1.js" })).toThrow(/exactly one/);
    expect(() => assertRendererOptions({ workerUrl: "/worker-v1.js", style: inlineStyle, styleUrl: "/style-v1.json" })).toThrow(/exactly one/);
    expect(() => assertRendererOptions({ workerUrl: "/worker-v1.js", styleUrl: "/style-v1.json", tileHeaders: { "x-demo": "1" } })).toThrow(/protectedUrlPrefix/);
    expect(() => assertRendererOptions({ workerUrl: "/worker-v1.js", style: inlineStyle })).not.toThrow();
  });

  it("applies tile credentials only to the exact protected origin and path prefix", () => {
    const session = { endpoint: "https://maps.example.test/session", protectedUrlPrefix: "https://tiles.example.test/private/" };
    const prefix = resolveProtectedPrefix(session, "https://app.example.test/");
    expect(matchesProtectedUrl("https://tiles.example.test/private/12/1/2.mvt", prefix)).toBe(true);
    expect(matchesProtectedUrl("https://tiles.example.test/private", prefix)).toBe(false);
    expect(matchesProtectedUrl("https://tiles.example.test/private-evil/12/1/2.mvt", prefix)).toBe(false);
    expect(matchesProtectedUrl("https://evil.example.test/private/12/1/2.mvt", prefix)).toBe(false);
    expect(scopedRequestHeaders("https://tiles.example.test/private/12/1/2.mvt", prefix, "secret", { "x-tile": "yes" })).toEqual({ "x-tile": "yes", authorization: "Bearer secret" });
    expect(scopedRequestHeaders("https://app.example.test/fonts/v3/0-255.pbf", prefix, "secret", { "x-tile": "yes" })).toBeUndefined();
  });
});

describe("shared style and tile-session promises", () => {
  it("shares compatible sessions, refreshes before expiry, and evicts failures for retry", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("temporary", { status: 503 });
      return new Response(JSON.stringify({ token: `token-${calls}`, expiresAt: new Date(Date.now() + 120_000).toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const options = { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" };
    await expect(getSharedTileSession(options)).rejects.toThrow(/503/);
    const [left, right] = await Promise.all([getSharedTileSession(options), getSharedTileSession(options)]);
    expect(left).toBe("token-2"); expect(right).toBe("token-2"); expect(fetchMock).toHaveBeenCalledTimes(2);
    const refreshed = await getSharedTileSession(options, undefined, Date.now() + 70_000);
    expect(refreshed).toBe("token-3"); expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("lets a cancelled consumer leave a shared session request available to another map", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return new Response(JSON.stringify({ token: "shared", expiresAt: new Date(Date.now() + 120_000).toISOString() })); }));
    const options = { endpoint: "/api/tile-session", protectedUrlPrefix: "/tiles/" };
    const controller = new AbortController();
    const cancelled = getSharedTileSession(options, controller.signal);
    const retained = getSharedTileSession(options);
    controller.abort(); release();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await expect(retained).resolves.toBe("shared");
  });

  it("shares style fetches, clones consumer values, and retries failed promises", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("temporary", { status: 502 });
      return new Response(JSON.stringify({ version: 8, glyphs: "/fonts/v3/{range}.pbf", sources: {}, layers: [] }), { status: 200 });
    }));
    await expect(loadMapStyle("/style-v3.json")).rejects.toThrow(/502/);
    const [left, right] = await Promise.all([loadMapStyle("/style-v3.json"), loadMapStyle("/style-v3.json")]);
    expect(calls).toBe(2); expect(left).toEqual(right); expect(left).not.toBe(right);
    expect(left.glyphs).toBe(`${location.origin}/fonts/v3/{range}.pbf`);
  });
});

describe("neutral structural theme fallback", () => {
  it("publishes neutral tokens without exposing layout-critical row dimensions", () => {
    expect(structuralStyles.cssText).toContain("--free-map-surface-canvas");
    expect(structuralStyles.cssText).toContain("--free-map-marker-selected");
    expect(structuralStyles.cssText).toContain("--free-map-shadow-control");
    expect(structuralStyles.cssText).not.toContain("--free-map-row-height");
    expect(structuralStyles.cssText).not.toContain("#8b2635");
  });
});
