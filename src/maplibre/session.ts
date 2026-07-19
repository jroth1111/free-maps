export interface TileSessionOptions {
  endpoint: string;
  protectedUrlPrefix: string;
}

export type TileHeaders = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

interface SharedSession {
  token?: string;
  expiresAt?: number;
  pending?: Promise<{ token: string; expiresAt: number }>;
}

const sessions = new Map<string, SharedSession>();
const REFRESH_WINDOW_MS = 60_000;

const abortError = () => new DOMException("Map activation was cancelled", "AbortError");

async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();
  return await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true })),
  ]);
}

const parseExpiry = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("Tile session response did not include a valid expiry");
};

export function resolveProtectedPrefix(options: TileSessionOptions, baseUrl = location.href): URL {
  const prefix = new URL(options.protectedUrlPrefix, baseUrl);
  if (!prefix.pathname.endsWith("/")) prefix.pathname += "/";
  prefix.search = "";
  prefix.hash = "";
  return prefix;
}

export function matchesProtectedUrl(requestUrl: string, prefix: URL, baseUrl = location.href): boolean {
  let url: URL;
  try { url = new URL(requestUrl, baseUrl); }
  catch { return false; }
  return url.origin === prefix.origin && url.pathname.startsWith(prefix.pathname);
}

export async function getSharedTileSession(options: TileSessionOptions, signal?: AbortSignal, now = Date.now()): Promise<string> {
  const endpoint = new URL(options.endpoint, location.href).href;
  const prefix = resolveProtectedPrefix(options).href;
  const key = `${endpoint}\n${prefix}`;
  let session = sessions.get(key);
  if (!session) { session = {}; sessions.set(key, session); }
  if (session.token && session.expiresAt && session.expiresAt - now > REFRESH_WINDOW_MS) return session.token;
  if (!session.pending) {
    const pending = (async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Tile session failed with ${response.status}`);
      const body = await response.json() as { token?: unknown; expiresAt?: unknown };
      if (typeof body.token !== "string" || !body.token) throw new Error("Tile session response did not include a token");
      return { token: body.token, expiresAt: parseExpiry(body.expiresAt) };
    })();
    session.pending = pending;
    void pending.then((value) => {
      session!.token = value.token;
      session!.expiresAt = value.expiresAt;
      session!.pending = undefined;
    }, () => {
      if (sessions.get(key) === session) sessions.delete(key);
    });
  }
  return (await raceAbort(session.pending, signal)).token;
}

export async function resolveTileHeaders(headers: TileHeaders | undefined): Promise<Record<string, string>> {
  const value = typeof headers === "function" ? await headers() : headers;
  return Object.fromEntries(new Headers(value));
}

export function scopedRequestHeaders(
  requestUrl: string,
  prefix: URL,
  token: string,
  tileHeaders: Record<string, string>,
  baseUrl = location.href,
): Record<string, string> | undefined {
  if (!matchesProtectedUrl(requestUrl, prefix, baseUrl)) return undefined;
  return { ...tileHeaders, authorization: `Bearer ${token}` };
}

export function clearSharedTileSessionsForTests(): void {
  sessions.clear();
}
