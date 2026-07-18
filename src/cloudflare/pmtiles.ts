import { Compression, EtagMismatch, PMTiles, ResolvedValueCache, TileType, type RangeResponse, type Source } from "pmtiles";
import type { ExecutionContextLike, R2BucketLike, R2ObjectLike } from "./types";

export interface PmtilesHandlerOptions {
  bucket: R2BucketLike;
  objectKey: string;
  archiveName: string;
  version: string;
  request: Request;
  context: ExecutionContextLike;
  corsOrigin: string;
  publicHostname?: string;
  cache?: Cache;
}

async function nativeDecompress(buffer: ArrayBuffer, compression: Compression) {
  if (compression === Compression.None || compression === Compression.Unknown) return buffer;
  if (compression !== Compression.Gzip) throw new Error("Unsupported PMTiles directory compression");
  return new Response(new Response(buffer).body?.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

const directories = new ResolvedValueCache(25, undefined, nativeDecompress);

export class R2PmtilesSource implements Source {
  constructor(private bucket: R2BucketLike, private objectKey: string) {}
  getKey() { return this.objectKey; }
  async getBytes(offset: number, length: number, _signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const response = await this.bucket.get(this.objectKey, { range: { offset, length }, onlyIf: etag ? { etagMatches: etag } : undefined });
    if (!response) throw new Error("Archive not found");
    if (!(response as R2ObjectLike).body) throw new EtagMismatch();
    const body = response as R2ObjectLike;
    return { data: await body.arrayBuffer(), etag: body.etag, cacheControl: body.httpMetadata?.cacheControl, expires: body.httpMetadata?.cacheExpiry?.toISOString() };
  }
}

const withCors = (response: Response, origin: string) => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (headers.get("Content-Type") === "application/vnd.mapbox-vector-tile") headers.set("Content-Encoding", "gzip");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export async function handlePmtilesRequest(options: PmtilesHandlerOptions): Promise<Response> {
  const { request, archiveName, version } = options;
  const url = new URL(request.url);
  const tileJsonPath = `/tiles/${archiveName}.json`;
  const match = url.pathname.match(new RegExp(`^/tiles/${version}/${archiveName}/(\\d+)/(\\d+)/(\\d+)\\.mvt$`));
  if (url.pathname !== tileJsonPath && !match) return new Response("Not found", { status: 404 });
  const cache = options.cache ?? (caches as CacheStorage & { default: Cache }).default;
  const cacheKey = new Request(`https://${url.hostname}${url.pathname}?free-maps-encoding=gzip-automatic-v2`, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = withCors(cached, options.corsOrigin);
    if (request.headers.get("if-none-match") === response.headers.get("etag")) return new Response(null, { status: 304, headers: response.headers });
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }

  const archive = new PMTiles(new R2PmtilesSource(options.bucket, options.objectKey), directories, nativeDecompress);
  let response: Response;
  if (url.pathname === tileJsonPath) {
    const hostname = options.publicHostname ?? url.hostname;
    const json = await archive.getTileJson(`https://${hostname}/tiles/${version}/${archiveName}`);
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", ETag: `W/"${version}-tilejson"` });
    response = new Response(JSON.stringify(json), { headers });
  } else {
    const z = Number(match![1]), x = Number(match![2]), y = Number(match![3]);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 24 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new Response("Invalid tile", { status: 400 });
    const header = await archive.getHeader();
    if (header.tileType !== TileType.Mvt) return new Response("Archive is not vector MVT", { status: 500 });
    if (z < header.minZoom || z > header.maxZoom) return new Response(null, { status: 404 });
    const tile = await archive.getZxy(z, x, y);
    if (!tile) return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
    const headers = new Headers({ "Content-Type": "application/vnd.mapbox-vector-tile", "Cache-Control": "public, max-age=31536000, immutable", ETag: `W/"${version}-${z}-${x}-${y}-${tile.data.byteLength}"` });
    response = new Response(tile.data, { headers });
  }
  options.context.waitUntil(cache.put(cacheKey, response.clone()));
  const cors = withCors(response, options.corsOrigin);
  return request.method === "HEAD" ? new Response(null, { status: cors.status, headers: cors.headers }) : cors;
}
