import { Compression, EtagMismatch, PMTiles, ResolvedValueCache, TileType, type RangeResponse, type Source } from "pmtiles";
import type { ExecutionContextLike, R2BucketLike, R2ObjectLike } from "./types";

export interface PmtilesCachePolicy {
  /** Isolates this application from other users of the same Cache API. */
  namespace: string;
  /** Bump when cache semantics or response encoding changes. */
  version: string;
  /** Bump when the MVT content-encoding contract changes. */
  encodingRevision: string;
  tileJsonTtlSeconds: number;
  tileTtlSeconds: number;
  negativeTtlSeconds: number;
  browserTileJsonTtlSeconds?: number;
  browserTileTtlSeconds?: number;
  browserNegativeTtlSeconds?: number;
  cache?: Cache;
}

export interface PmtilesHandlerOptions {
  bucket: R2BucketLike;
  objectKey: string;
  archiveName: string;
  version: string;
  request: Request;
  context: ExecutionContextLike;
  corsOrigin: string;
  cachePolicy: PmtilesCachePolicy;
}

interface ParsedTileRequest {
  kind: "tilejson" | "tile";
  z?: number;
  x?: number;
  y?: number;
}

async function nativeDecompress(buffer: ArrayBuffer, compression: Compression) {
  if (compression === Compression.None || compression === Compression.Unknown) return buffer;
  if (compression !== Compression.Gzip) throw new Error("Unsupported PMTiles directory compression");
  return new Response(new Response(buffer).body?.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

const directories = new ResolvedValueCache(25, undefined, nativeDecompress);
const misses = new Map<string, Promise<Response>>();

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

const boundedTtl = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 31_536_000) throw new Error(`${label} must be between 0 and 31536000 seconds`);
  return Math.floor(value);
};

const parseTileRequest = (pathname: string, archiveName: string, version: string): ParsedTileRequest | null => {
  if (pathname === `/tiles/${archiveName}.json`) return { kind: "tilejson" };
  const match = pathname.match(new RegExp(`^/tiles/${version}/${archiveName}/(\\d+)/(\\d+)/(\\d+)\\.mvt$`));
  if (!match) return null;
  return { kind: "tile", z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
};

export function buildPmtilesCacheKey(options: Pick<PmtilesHandlerOptions, "archiveName" | "objectKey" | "version" | "cachePolicy">, parsed: ParsedTileRequest): Request {
  const policy = options.cachePolicy;
  const identity = [policy.namespace, policy.version, options.version, options.objectKey, policy.encodingRevision].map(encodeURIComponent).join("/");
  const resource = parsed.kind === "tilejson" ? `${encodeURIComponent(options.archiveName)}.json` : `${parsed.z}/${parsed.x}/${parsed.y}.mvt`;
  return new Request(`https://free-maps-cache.invalid/${identity}/${resource}`, { method: "GET" });
}

const cacheControl = (seconds: number) => `public, max-age=${seconds}`;

/** Only complete TileJSON/tile responses and bounded negative results are cacheable. */
export const isCacheablePmtilesStatus = (status: number): boolean => status === 200 || status === 204;

const responseForClient = (stored: Response, request: Request, origin: string, browserTtl: number, diagnostic: "hit" | "miss" | "coalesced") => {
  const headers = new Headers(stored.headers);
  headers.set("Cache-Control", `private, max-age=${browserTtl}`);
  headers.delete("Cloudflare-CDN-Cache-Control");
  headers.delete("CDN-Cache-Control");
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Free-Maps-Cache", diagnostic);
  headers.set("Server-Timing", `free-map-cache;desc="${diagnostic}"`);
  if (headers.get("Content-Type") === "application/vnd.mapbox-vector-tile") headers.set("Content-Encoding", "gzip");
  const condition = request.headers.get("if-none-match");
  if (condition && condition === headers.get("etag")) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { status: stored.status, statusText: stored.statusText, headers });
  return new Response(stored.body, { status: stored.status, statusText: stored.statusText, headers });
};

const abortError = () => new DOMException("Tile request was cancelled", "AbortError");
const raceAbort = async (promise: Promise<Response>, signal: AbortSignal): Promise<Response> => {
  if (signal.aborted) throw abortError();
  return await Promise.race([
    promise,
    new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true })),
  ]);
};

async function createStoredResponse(options: PmtilesHandlerOptions, parsed: ParsedTileRequest): Promise<Response> {
  const archive = new PMTiles(new R2PmtilesSource(options.bucket, options.objectKey), directories, nativeDecompress);
  if (parsed.kind === "tilejson") {
    // Relative templates keep the token-free shared entry valid for local,
    // preview, and production origins. MapLibre resolves them against the
    // TileJSON request URL before applying scoped credentials.
    const json = await archive.getTileJson(`/tiles/${options.version}/${options.archiveName}`);
    return new Response(JSON.stringify(json), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl(boundedTtl(options.cachePolicy.tileJsonTtlSeconds, "tileJsonTtlSeconds")),
      ETag: `W/"${options.version}-${options.cachePolicy.encodingRevision}-tilejson"`,
    } });
  }

  const { z, x, y } = parsed;
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z! < 0 || z! > 24 || x! < 0 || y! < 0 || x! >= 2 ** z! || y! >= 2 ** z!) return new Response("Invalid tile", { status: 400, headers: { "Cache-Control": "no-store" } });
  const header = await archive.getHeader();
  if (header.tileType !== TileType.Mvt) return new Response("Archive is not vector MVT", { status: 500, headers: { "Cache-Control": "no-store" } });
  const negativeTtl = boundedTtl(options.cachePolicy.negativeTtlSeconds, "negativeTtlSeconds");
  if (z! < header.minZoom || z! > header.maxZoom) return new Response(null, { status: 204, headers: { "Cache-Control": cacheControl(negativeTtl), ETag: `W/"${options.version}-${z}-${x}-${y}-missing"` } });
  const tile = await archive.getZxy(z!, x!, y!);
  if (!tile) return new Response(null, { status: 204, headers: { "Cache-Control": cacheControl(negativeTtl), ETag: `W/"${options.version}-${z}-${x}-${y}-missing"` } });
  const tileTtl = boundedTtl(options.cachePolicy.tileTtlSeconds, "tileTtlSeconds");
  return new Response(tile.data, { headers: {
    "Content-Type": "application/vnd.mapbox-vector-tile",
    "Cache-Control": cacheControl(tileTtl),
    ETag: `W/"${options.version}-${options.cachePolicy.encodingRevision}-${z}-${x}-${y}-${tile.data.byteLength}"`,
  } });
}

export async function handlePmtilesRequest(options: PmtilesHandlerOptions): Promise<Response> {
  const parsed = parseTileRequest(new URL(options.request.url).pathname, options.archiveName, options.version);
  if (!parsed) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const policy = options.cachePolicy;
  const cache = policy.cache ?? (caches as CacheStorage & { default: Cache }).default;
  const key = buildPmtilesCacheKey(options, parsed);
  let cached: Response | undefined;
  try { cached = await cache.match(key); }
  catch { cached = undefined; }
  const browserTtl = parsed.kind === "tilejson"
    ? boundedTtl(policy.browserTileJsonTtlSeconds ?? Math.min(policy.tileJsonTtlSeconds, 300), "browserTileJsonTtlSeconds")
    : boundedTtl(policy.browserTileTtlSeconds ?? (policy.tileTtlSeconds >= 31_536_000 ? 31_536_000 : Math.min(policy.tileTtlSeconds, 3600)), "browserTileTtlSeconds");
  if (cached) return responseForClient(cached, options.request, options.corsOrigin, cached.status === 204 ? boundedTtl(policy.browserNegativeTtlSeconds ?? 60, "browserNegativeTtlSeconds") : browserTtl, "hit");

  const id = key.url;
  const existing = misses.get(id);
  let pending = existing;
  if (!pending) {
    pending = (async () => {
      const response = await createStoredResponse(options, parsed);
      if (isCacheablePmtilesStatus(response.status)) {
        const write = cache.put(key, response.clone()).catch(() => undefined);
        options.context.waitUntil(write);
        await write;
      }
      return response;
    })();
    misses.set(id, pending);
    void pending.finally(() => { if (misses.get(id) === pending) misses.delete(id); }).catch(() => undefined);
  }
  const stored = await raceAbort(pending, options.request.signal);
  const clientTtl = stored.status === 204 ? boundedTtl(policy.browserNegativeTtlSeconds ?? 60, "browserNegativeTtlSeconds") : browserTtl;
  return responseForClient(stored.clone(), options.request, options.corsOrigin, clientTtl, existing ? "coalesced" : "miss");
}

export function clearPmtilesMissesForTests(): void {
  misses.clear();
}
