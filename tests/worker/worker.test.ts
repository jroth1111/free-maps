import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../../worker";
import { handlePmtilesRequest, issueTileSession, verifyTileSession, type R2BucketLike } from "../../src/cloudflare";

const fixture = Uint8Array.from(atob("UE1UaWxlcwN/AAAAAAAAABkAAAAAAAAAmAAAAAAAAAD3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAACPAQAAAAAAAEUAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAICAQAAAAAAAAAAAAB/lpgAgJaYAAAAAAAAAAAAAB+LCAAAAAAAAhNjZGB0ZQQATD+JAAUAAAAfiwgAAAAAAAITfU/LboMwELznK6w9AyWReum1P9B7hZBjFmQJe5G9RCHI/x7bSRv6UI4zOzuPdQdWGoQ3AYye216feXbY7qvJsB7RQ7GDDr1yemJN9rnwhM7fRYeEeZmyNcXDKJdEDWjRSSaXnfQ0oZKWUJwO1WtV/1C0lCN9UlYvG215GURJ4v8eoix7cgpvfVTyidGxWLT5FKsA3f0d8b1B/B6bKKPthchEWCckzxvUaxy75L0GEURTQDZiyZmDHP1Os+UI9wU8qtxvT7qAevwNSAbZLUn+QeMyxHYFSGanjzPjV0K94XJKE5oQrptsCtvlAQAAH4sIAAAAAAACE5PSr2DiEi1JLS6JT8usKCktSo03LMgtycxJLdZoUBASlGBW4uWcpvBCXopBQpSBQZwfAJf6ay0xAAAA"), (char) => char.charCodeAt(0));
const origin = "http://localhost:4173";
const request = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { origin, ...Object.fromEntries(new Headers(init.headers)) } });

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
    expect(health.status).toBe(200); expect(await health.json()).toMatchObject({ ok: true, version: "0.2.0-test", basemapVersion: "20260717" });
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
    expect((await worker.fetch(new Request("http://localhost/tiles/melbourne.json", { headers: { origin: "http://localhost:9999", authorization: `Bearer ${token}` } }), env as unknown as Env, context)).status).toBe(401);
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
    const first = await handlePmtilesRequest({ bucket, objectKey: "map.pmtiles", archiveName: "melbourne", version: "20260717", request: request("/tiles/20260717/melbourne/0/0/0.mvt?token=one"), context, corsOrigin: origin, cache });
    expect(first.status).toBe(200); const readsAfterMiss = reads; expect(readsAfterMiss).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve));
    const second = await handlePmtilesRequest({ bucket, objectKey: "map.pmtiles", archiveName: "melbourne", version: "20260717", request: request("/tiles/20260717/melbourne/0/0/0.mvt?token=two"), context, corsOrigin: origin, cache });
    expect(second.status).toBe(200); expect(reads).toBe(readsAfterMiss);
  });
});
