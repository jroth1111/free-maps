import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../../worker";
import { buildPmtilesCacheKey, clearPmtilesMissesForTests, handlePmtilesRequest, issueTileSession, verifyTileSession, type PmtilesCachePolicy, type R2BucketLike } from "../../src/cloudflare";

const fixture = Uint8Array.from(atob("UE1UaWxlcwN/AAAAAAAAABkAAAAAAAAAmAAAAAAAAAD3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAACPAQAAAAAAAEUAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAICAQAAAAAAAAAAAAB/lpgAgJaYAAAAAAAAAAAAAB+LCAAAAAAAAhNjZGB0ZQQATD+JAAUAAAAfiwgAAAAAAAITfU/LboMwELznK6w9AyWReum1P9B7hZBjFmQJe5G9RCHI/x7bSRv6UI4zOzuPdQdWGoQ3AYye216feXbY7qvJsB7RQ7GDDr1yemJN9rnwhM7fRYeEeZmyNcXDKJdEDWjRSSaXnfQ0oZKWUJwO1WtV/1C0lCN9UlYvG215GURJ4v8eoix7cgpvfVTyidGxWLT5FKsA3f0d8b1B/B6bKKPthchEWCckzxvUaxy75L0GEURTQDZiyZmDHP1Os+UI9wU8qtxvT7qAevwNSAbZLUn+QeMyxHYFSGanjzPjV0K94XJKE5oQrptsCtvlAQAAH4sIAAAAAAACE5PSr2DiEi1JLS6JT8usKCktSo03LMgtycxJLdZoUBASlGBW4uWcpvBCXopBQpSBQZwfAJf6ay0xAAAA"), (char) => char.charCodeAt(0));
const origin = "http://localhost:4173";
const request = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { origin, ...Object.fromEntries(new Headers(init.headers)) } });
const cachePolicy = (cache?: Cache): PmtilesCachePolicy => ({ namespace: "worker-test", version: "v3", encodingRevision: "gzip-v3", tileJsonTtlSeconds: 3600, tileTtlSeconds: 31_536_000, negativeTtlSeconds: 300, browserTileJsonTtlSeconds: 300, browserTileTtlSeconds: 3600, browserNegativeTtlSeconds: 60, cache });

describe("tile sessions", () => {
  it("binds signed sessions to origin and expiry", async () => {
    const session = await issueTileSession("secret", origin, 1_000, 30);
    expect(await verifyTileSession("secret", session.token, origin, 2_000)).toMatchObject({ origin });
    expect(await verifyTileSession("secret", session.token, "http://localhost:9999", 2_000)).toBeNull();
    expect(await verifyTileSession("secret", session.token, origin, 40_000)).toBeNull();
  });
});

describe("Worker endpoints", () => {
  it("serves health, deterministic datasets, methods and ETags", async () => {
    await env.BASEMAP.put("basemaps/greater-melbourne-20260717.pmtiles", fixture);
    const context = createExecutionContext();
    const health = await worker.fetch(request("/api/health"), env as unknown as Env, context);
    expect(health.status).toBe(200); expect(await health.json()).toMatchObject({ ok: true, version: "0.3.0-test", basemapVersion: "20260717" });
    const first = await worker.fetch(request("/api/v1/demo-dataset?size=250"), env as unknown as Env, context);
    expect(first.status).toBe(200); expect((await first.json() as { points: unknown[] }).points).toHaveLength(250);
    const cached = await worker.fetch(request("/api/v1/demo-dataset?size=250", { headers: { "if-none-match": first.headers.get("etag")! } }), env as unknown as Env, context);
    expect(cached.status).toBe(304);
    expect((await worker.fetch(request("/api/v1/demo-dataset?size=7"), env as unknown as Env, context)).status).toBe(400);
    expect((await worker.fetch(request("/api/health", { method: "POST" }), env as unknown as Env, context)).status).toBe(405);
  });

  it("enforces origin-bound tokens and serves TileJSON and a vector tile", async () => {
    await env.BASEMAP.put("basemaps/greater-melbourne-20260717.pmtiles", fixture);
    const context = createExecutionContext();
    const denied = await worker.fetch(new Request("http://localhost/api/tile-session", { method: "POST" }), env as unknown as Env, context);
    expect(denied.status).toBe(403);
    const sessionResponse = await worker.fetch(request("/api/tile-session", { method: "POST" }), env as unknown as Env, context);
    const { token } = await sessionResponse.json() as { token: string };
    const headers = { authorization: `Bearer ${token}` };
    const tileJson = await worker.fetch(request("/tiles/melbourne.json", { headers }), env as unknown as Env, context);
    expect(tileJson.status).toBe(200); expect(tileJson.headers.get("access-control-allow-origin")).toBe(origin);
    const tile = await worker.fetch(request("/tiles/20260717/melbourne/0/0/0.mvt", { headers }), env as unknown as Env, context);
    expect(tile.status).toBe(200); expect(tile.headers.get("etag")).toBeTruthy(); expect(tile.headers.get("content-encoding")).toBe("gzip");
    const workerBody = new Uint8Array(await tile.arrayBuffer());
    expect(workerBody.byteLength).toBeGreaterThan(0);
    expect([...workerBody.slice(0, 2)]).not.toEqual([0x1f, 0x8b]);
    expect((await worker.fetch(request("/tiles/20260717/melbourne/25/0/0.mvt", { headers }), env as unknown as Env, context)).status).toBe(400);
    const wrongOrigin = await worker.fetch(new Request("http://localhost/tiles/melbourne.json", { headers: { origin: "http://localhost:9999", authorization: `Bearer ${token}` } }), env as unknown as Env, context);
    expect(wrongOrigin.status).toBe(401);
    expect(wrongOrigin.headers.get("x-free-maps-auth")).toBe("rejected-session");
    expect(wrongOrigin.headers.get("access-control-allow-origin")).toBe("http://localhost:9999");
    const missingCredentials = await worker.fetch(request("/tiles/melbourne.json"), env as unknown as Env, context);
    expect(missingCredentials.status).toBe(401);
    expect(missingCredentials.headers.get("x-free-maps-auth")).toBe("rejected-credentials");
    await waitOnExecutionContext(context);
  });

  it("issues a same-origin browser session when Chromium omits Origin", async () => {
    const context = createExecutionContext();
    const response = await worker.fetch(new Request("http://localhost:4173/api/tile-session", { method: "POST", headers: { referer: "http://localhost:4173/" } }), env as unknown as Env, context);
    expect(response.status).toBe(200);
    expect((await response.json() as { token?: string }).token).toBeTruthy();
  });

  it("accepts a same-origin tile GET when the browser omits Origin", async () => {
    await env.BASEMAP.put("basemaps/greater-melbourne-20260717.pmtiles", fixture);
    const context = createExecutionContext();
    const pageOrigin = "http://localhost:4173";
    const sessionResponse = await worker.fetch(new Request(`${pageOrigin}/api/tile-session`, { method: "POST", headers: { origin: pageOrigin } }), env as unknown as Env, context);
    const { token } = await sessionResponse.json() as { token: string };
    const tileJson = await worker.fetch(new Request(`${pageOrigin}/tiles/melbourne.json`, { headers: { authorization: `Bearer ${token}` } }), env as unknown as Env, context);
    expect(tileJson.status).toBe(200);
    expect(tileJson.headers.get("access-control-allow-origin")).toBe(pageOrigin);
    await waitOnExecutionContext(context);
  });

  it("normalizes the internal HTTP URL used by HTTPS workers.dev previews", async () => {
    await env.BASEMAP.put("basemaps/greater-melbourne-20260717.pmtiles", fixture);
    const context = createExecutionContext();
    const previewOrigin = "https://v0-3-preview-free-maps.example.workers.dev";
    const sessionResponse = await worker.fetch(new Request(`${previewOrigin}/api/tile-session`, { method: "POST", headers: { origin: previewOrigin } }), env as unknown as Env, context);
    const { token } = await sessionResponse.json() as { token: string };
    const tileJson = await worker.fetch(new Request("http://v0-3-preview-free-maps.example.workers.dev/tiles/melbourne.json", { headers: { authorization: `Bearer ${token}` } }), env as unknown as Env, context);
    expect(tileJson.status).toBe(200);
    expect(tileJson.headers.get("access-control-allow-origin")).toBe(previewOrigin);
    await waitOnExecutionContext(context);
  });

  it("uses a normalized cache key and performs no R2 reads after a tile cache hit", async () => {
    let reads = 0;
    const bucket: R2BucketLike = {
      async head() { return null; },
      async get(_key, options) {
        reads++;
        const offset = options?.range?.offset ?? 0; const length = options?.range?.length ?? fixture.length;
        const bytes = fixture.slice(offset, offset + length);
        return { size: fixture.length, etag: "fixture", httpEtag: '"fixture"', body: new ReadableStream(), arrayBuffer: async () => bytes.buffer };
      },
    };
    const entries = new Map<string, Response>();
    const cache = { match: async (key: RequestInfo) => entries.get(typeof key === "string" ? key : key.url)?.clone(), put: async (key: RequestInfo, value: Response) => { entries.set(typeof key === "string" ? key : key.url, value.clone()); }, delete: async () => false, add: async () => {}, addAll: async () => {}, keys: async () => [] } as Cache;
    const context = { waitUntil(promise: Promise<unknown>) { void promise; } };
    const first = await handlePmtilesRequest({ bucket, objectKey: "map.pmtiles", archiveName: "melbourne", version: "20260717", request: request("/tiles/20260717/melbourne/0/0/0.mvt?token=one"), context, corsOrigin: origin, cachePolicy: cachePolicy(cache) });
    expect(first.status).toBe(200); const readsAfterMiss = reads; expect(readsAfterMiss).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve));
    const second = await handlePmtilesRequest({ bucket, objectKey: "map.pmtiles", archiveName: "melbourne", version: "20260717", request: request("/tiles/20260717/melbourne/0/0/0.mvt?token=two"), context, corsOrigin: origin, cachePolicy: cachePolicy(cache) });
    expect(second.status).toBe(200); expect(reads).toBe(readsAfterMiss);
  });

  it("keeps cache identities token-free and versioned by archive, encoding, and coordinates", () => {
    const key = buildPmtilesCacheKey({ archiveName: "melbourne", objectKey: "basemaps/archive.pmtiles", version: "20260717", cachePolicy: cachePolicy() }, { kind: "tile", z: 12, x: 3210, y: 2048 });
    expect(key.url).toContain("worker-test/v3/20260717/basemaps%2Farchive.pmtiles/gzip-v3/12/3210/2048.mvt");
    expect(key.url).not.toContain("token");
    expect(key.url).not.toContain("Bearer");
  });

  it("authenticates before consulting a warm shared tile cache", async () => {
    await env.BASEMAP.put("basemaps/greater-melbourne-20260717.pmtiles", fixture);
    const context = createExecutionContext();
    const sessionResponse = await worker.fetch(request("/api/tile-session", { method: "POST" }), env as unknown as Env, context);
    const { token } = await sessionResponse.json() as { token: string };
    const path = "/tiles/20260717/melbourne/0/0/0.mvt";
    expect((await worker.fetch(request(path, { headers: { authorization: `Bearer ${token}` } }), env as unknown as Env, context)).status).toBe(200);
    await waitOnExecutionContext(context);
    const unauthenticated = await worker.fetch(request(path), env as unknown as Env, createExecutionContext());
    const invalid = await worker.fetch(request(path, { headers: { authorization: "Bearer invalid" } }), env as unknown as Env, createExecutionContext());
    expect(unauthenticated.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a non-cacheable response when R2 fails", async () => {
    const broken = {
      ...env,
      BASEMAP_KEY: "basemaps/unavailable.pmtiles",
      TILE_CACHE_VERSION: "v3-r2-failure",
      BASEMAP: {
        async head() { return null; },
        async get() { throw new Error("R2 unavailable"); },
      },
    } as unknown as Env;
    const context = createExecutionContext();
    const sessionResponse = await worker.fetch(request("/api/tile-session", { method: "POST" }), broken, context);
    const { token } = await sessionResponse.json() as { token: string };
    const response = await worker.fetch(request("/tiles/melbourne.json", { headers: { authorization: `Bearer ${token}` } }), broken, context);
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("caches bounded 204 misses and coalesces concurrent cold reads", async () => {
    clearPmtilesMissesForTests();
    let reads = 0;
    const bucket: R2BucketLike = {
      async head() { return null; },
      async get(_key, options) {
        reads++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        const offset = options?.range?.offset ?? 0; const length = options?.range?.length ?? fixture.length;
        const bytes = fixture.slice(offset, offset + length);
        return { size: fixture.length, etag: "fixture-coalesce", httpEtag: '"fixture-coalesce"', body: new ReadableStream(), arrayBuffer: async () => bytes.buffer };
      },
    };
    const entries = new Map<string, Response>();
    const cache = { match: async (key: RequestInfo) => entries.get(typeof key === "string" ? key : key.url)?.clone(), put: async (key: RequestInfo, value: Response) => { entries.set(typeof key === "string" ? key : key.url, value.clone()); }, delete: async () => false, add: async () => {}, addAll: async () => {}, keys: async () => [] } as Cache;
    const context = { waitUntil(promise: Promise<unknown>) { void promise; } };
    const options = { bucket, objectKey: "coalesce.pmtiles", archiveName: "melbourne", version: "20260717", context, corsOrigin: origin, cachePolicy: cachePolicy(cache) };
    const path = "/tiles/20260717/melbourne/1/0/0.mvt";
    const [left, right] = await Promise.all([
      handlePmtilesRequest({ ...options, request: request(path) }),
      handlePmtilesRequest({ ...options, request: request(path) }),
    ]);
    expect(left.status).toBe(204); expect(right.status).toBe(204);
    expect([left.headers.get("x-free-maps-cache"), right.headers.get("x-free-maps-cache")]).toContain("coalesced");
    const readsAfterCold = reads;
    const warm = await handlePmtilesRequest({ ...options, request: request(path) });
    expect(warm.status).toBe(204); expect(warm.headers.get("x-free-maps-cache")).toBe("hit"); expect(reads).toBe(readsAfterCold);
    expect(warm.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("honors conditional hits, cancellation, and retry after an R2 failure", async () => {
    clearPmtilesMissesForTests();
    let attempts = 0;
    const bucket: R2BucketLike = {
      async head() { return null; },
      async get(_key, options) {
        attempts++;
        if (attempts === 1) throw new Error("temporary R2 failure");
        const offset = options?.range?.offset ?? 0; const length = options?.range?.length ?? fixture.length;
        const bytes = fixture.slice(offset, offset + length);
        return { size: fixture.length, etag: "fixture-retry", httpEtag: '"fixture-retry"', body: new ReadableStream(), arrayBuffer: async () => bytes.buffer };
      },
    };
    const entries = new Map<string, Response>();
    const cache = { match: async (key: RequestInfo) => entries.get(typeof key === "string" ? key : key.url)?.clone(), put: async (key: RequestInfo, value: Response) => { entries.set(typeof key === "string" ? key : key.url, value.clone()); }, delete: async () => false, add: async () => {}, addAll: async () => {}, keys: async () => [] } as Cache;
    const context = { waitUntil(promise: Promise<unknown>) { void promise; } };
    const base = { bucket, objectKey: "retry.pmtiles", archiveName: "melbourne", version: "20260717", context, corsOrigin: origin, cachePolicy: cachePolicy(cache) };
    await expect(handlePmtilesRequest({ ...base, request: request("/tiles/melbourne.json") })).rejects.toThrow("temporary R2 failure");
    const response = await handlePmtilesRequest({ ...base, request: request("/tiles/melbourne.json") });
    const etag = response.headers.get("etag")!;
    const conditional = await handlePmtilesRequest({ ...base, request: request("/tiles/melbourne.json", { headers: { "if-none-match": etag } }) });
    expect(conditional.status).toBe(304);
    const controller = new AbortController(); controller.abort();
    await expect(handlePmtilesRequest({ ...base, request: request("/tiles/20260717/melbourne/0/0/0.mvt", { signal: controller.signal }) })).rejects.toMatchObject({ name: "AbortError" });
  });
});
