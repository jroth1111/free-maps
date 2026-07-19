import { WorkerEntrypoint } from "cloudflare:workers";
import { bearerToken, handlePmtilesRequest, issueTileSession, verifyTileSession } from "../src/cloudflare";
import type { AssetFetcherLike, ExecutionContextLike, R2BucketLike } from "../src/cloudflare";
import { createDemoDataset } from "./dataset";

export interface Env {
  BASEMAP: R2BucketLike;
  ASSETS: AssetFetcherLike;
  TILE_SESSION_SECRET: string;
  APP_VERSION: string;
  BASEMAP_VERSION: string;
  BASEMAP_KEY: string;
  TILE_CACHE_NAMESPACE: string;
  TILE_CACHE_VERSION: string;
  TILE_ENCODING_REVISION: string;
  PRODUCTION_ORIGIN: string;
  GIT_COMMIT?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

const json = (value: unknown, init: ResponseInit = {}) => { const headers = new Headers(init.headers); headers.set("Content-Type", "application/json; charset=utf-8"); if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store"); return new Response(JSON.stringify(value), { ...init, headers }); };
const headless = (request: Request, response: Response) => request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
const isLocalOrigin = (origin: string) => { try { const url = new URL(origin); return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && (url.protocol === "http:" || url.protocol === "https:"); } catch { return false; } };
const publicRequestOrigin = (request: Request) => {
  const url = new URL(request.url);
  // Cloudflare version previews can expose run_worker_first requests to the
  // isolate as http even though their only public browser origin is HTTPS.
  if (url.protocol === "http:" && url.hostname.endsWith(".workers.dev")) url.protocol = "https:";
  return url.origin;
};
const allowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get("origin") ?? "";
  const requestUrl = new URL(request.url);
  const requestOrigin = publicRequestOrigin(request);
  const productionHost = new URL(env.PRODUCTION_ORIGIN).hostname;
  const isProduction = requestUrl.hostname === productionHost;
  if (origin === env.PRODUCTION_ORIGIN || (!isProduction && (isLocalOrigin(origin) || origin === requestOrigin))) return origin;
  const referer = request.headers.get("referer");
  if (!origin && referer) {
    const refererOrigin = new URL(referer).origin;
    if (refererOrigin === requestOrigin && (requestOrigin === env.PRODUCTION_ORIGIN || !isProduction && isLocalOrigin(requestOrigin))) return requestOrigin;
  }
  return null;
};
const allowedTileOrigin = (request: Request, env: Env) => {
  const supplied = request.headers.get("origin");
  if (supplied) return allowedOrigin(request, env);
  const requestUrl = new URL(request.url);
  const productionHost = new URL(env.PRODUCTION_ORIGIN).hostname;
  // Cloudflare may expose run_worker_first requests to the isolate as HTTP.
  // The hostname is authoritative here; the signed session remains bound to
  // the configured public HTTPS production origin.
  if (requestUrl.hostname === productionHost) return env.PRODUCTION_ORIGIN;
  const requestOrigin = publicRequestOrigin(request);
  return requestOrigin;
};
const methodAllowed = (request: Request, methods: string[]) => methods.includes(request.method) ? null : new Response("Method not allowed", { status: 405, headers: { Allow: methods.join(", "), "Cache-Control": "no-store" } });
const bypassOuterCdn = (response: Response): Response => {
  const headers = new Headers(response.headers);
  // Apply this only after the cached entrypoint has returned. Setting it on
  // Dataset itself also disables the version-aware Workers cache.
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const datasetResponse = (request: Request, env: Env): Response => {
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("size") ?? "250") as 250 | 5000;
  const etag = `W/"demo-${env.APP_VERSION}-${size}"`;
  const cacheHeaders = {
    ETag: etag,
    "Cache-Control": "public, max-age=300",
    "Cache-Tag": `free-maps-dataset,free-maps-dataset-${env.APP_VERSION}`,
    "Access-Control-Allow-Origin": "*",
    "X-Free-Maps-Invocation": crypto.randomUUID(),
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cacheHeaders });
  return headless(request, json(createDemoDataset(size), { headers: cacheHeaders }));
};

/** The only cached entrypoint; the default export remains an uncached gateway. */
export class Dataset extends WorkerEntrypoint<Env> {
  fetch(request: Request): Response { return datasetResponse(request, this.env); }
}

interface GatewayExecutionContext extends ExecutionContextLike {
  exports: { Dataset: { fetch(request: Request): Promise<Response> } };
}

export default {
  async fetch(request: Request, env: Env, context: GatewayExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      const rejected = methodAllowed(request, ["GET", "HEAD"]); if (rejected) return rejected;
      const object = await env.BASEMAP.head(env.BASEMAP_KEY);
      const response = json({ ok: Boolean(object), version: env.APP_VERSION, commit: env.GIT_COMMIT ?? "local", deployment: env.CF_VERSION_METADATA?.id ?? "local", basemapVersion: env.BASEMAP_VERSION, basemap: object ? { ready: true, key: env.BASEMAP_KEY, size: object.size, etag: object.httpEtag } : { ready: false, key: env.BASEMAP_KEY } }, { status: object ? 200 : 503, headers: { "Cache-Control": "no-store" } });
      return headless(request, response);
    }
    if (url.pathname === "/api/v1/demo-dataset") {
      const rejected = methodAllowed(request, ["GET", "HEAD"]); if (rejected) return rejected;
      const rawSize = url.searchParams.get("size") ?? "250";
      if (rawSize !== "250" && rawSize !== "5000") return json({ error: "size must be 250 or 5000" }, { status: 400 });
      // Dataset owns the version-scoped Workers cache. Only the gateway-facing
      // response bypasses the custom-domain zone cache, otherwise the same
      // no-store directive would prevent Dataset itself from warming.
      return bypassOuterCdn(await context.exports.Dataset.fetch(request));
    }
    if (url.pathname === "/api/tile-session") {
      const rejected = methodAllowed(request, ["POST"]); if (rejected) return rejected;
      const origin = allowedOrigin(request, env);
      if (!origin) return json({ error: "Origin is not allowed" }, { status: 403 });
      const session = await issueTileSession(env.TILE_SESSION_SECRET, origin);
      return json(session, { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin, Vary: "Origin" } });
    }
    if (url.pathname.startsWith("/tiles/")) {
      const rejected = methodAllowed(request, ["GET", "HEAD"]); if (rejected) return rejected;
      // Same-origin GET requests do not carry Origin; in that case the request
      // URL itself is the exact browser origin to which the token was bound.
      const origin = allowedTileOrigin(request, env);
      const token = bearerToken(request);
      const session = origin && token ? await verifyTileSession(env.TILE_SESSION_SECRET, token, origin) : null;
      if (!session) {
        const reason = !origin ? "origin" : !token ? "credentials" : "session";
        const headers: Record<string, string> = { "Cache-Control": "private, no-store", "X-Free-Maps-Auth": `rejected-${reason}` };
        if (origin) { headers["Access-Control-Allow-Origin"] = origin; headers.Vary = "Origin"; }
        return json({ error: "Valid origin-bound tile session required" }, { status: 401, headers });
      }
      try {
        return await handlePmtilesRequest({
          bucket: env.BASEMAP,
          objectKey: env.BASEMAP_KEY,
          archiveName: "melbourne",
          version: env.BASEMAP_VERSION,
          request,
          context,
          corsOrigin: session.origin,
          cachePolicy: {
            namespace: env.TILE_CACHE_NAMESPACE,
            version: env.TILE_CACHE_VERSION,
            encodingRevision: env.TILE_ENCODING_REVISION,
            tileJsonTtlSeconds: 3600,
            tileTtlSeconds: 31_536_000,
            negativeTtlSeconds: 300,
            browserTileJsonTtlSeconds: 300,
            browserTileTtlSeconds: 3600,
            browserNegativeTtlSeconds: 60,
          },
        });
      } catch {
        return json({ error: "Tile storage is temporarily unavailable" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
