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
  PRODUCTION_ORIGIN: string;
  GIT_COMMIT?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

const json = (value: unknown, init: ResponseInit = {}) => { const headers = new Headers(init.headers); headers.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(value), { ...init, headers }); };
const headless = (request: Request, response: Response) => request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
const isLocalOrigin = (origin: string) => { try { const url = new URL(origin); return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && (url.protocol === "http:" || url.protocol === "https:"); } catch { return false; } };
const allowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get("origin") ?? "";
  const requestUrl = new URL(request.url);
  const productionHost = new URL(env.PRODUCTION_ORIGIN).hostname;
  const isProduction = requestUrl.hostname === productionHost;
  if (origin === env.PRODUCTION_ORIGIN || (!isProduction && (isLocalOrigin(origin) || origin === requestUrl.origin))) return origin;
  const referer = request.headers.get("referer");
  if (!origin && referer) {
    const refererOrigin = new URL(referer).origin;
    if (refererOrigin === requestUrl.origin && (requestUrl.origin === env.PRODUCTION_ORIGIN || !isProduction && isLocalOrigin(requestUrl.origin))) return requestUrl.origin;
  }
  return null;
};
const allowedTileOrigin = (request: Request, env: Env) => {
  const supplied = request.headers.get("origin");
  if (supplied) return allowedOrigin(request, env);
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  return requestOrigin === env.PRODUCTION_ORIGIN || requestUrl.hostname !== new URL(env.PRODUCTION_ORIGIN).hostname ? requestOrigin : null;
};
const methodAllowed = (request: Request, methods: string[]) => methods.includes(request.method) ? null : new Response("Method not allowed", { status: 405, headers: { Allow: methods.join(", ") } });

export default {
  async fetch(request: Request, env: Env, context: ExecutionContextLike): Promise<Response> {
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
      const size = Number(rawSize) as 250 | 5000;
      const etag = `W/"demo-${env.APP_VERSION}-${size}"`;
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "public, max-age=300, s-maxage=3600" } });
      return headless(request, json(createDemoDataset(size), { headers: { ETag: etag, "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" } }));
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
      if (!origin || !token || !(await verifyTileSession(env.TILE_SESSION_SECRET, token, origin))) return json({ error: "Valid origin-bound tile session required" }, { status: 401 });
      return handlePmtilesRequest({ bucket: env.BASEMAP, objectKey: env.BASEMAP_KEY, archiveName: "melbourne", version: env.BASEMAP_VERSION, request, context, corsOrigin: origin, publicHostname: url.hostname });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
