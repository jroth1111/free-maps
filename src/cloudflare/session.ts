export interface TileSessionPayload { origin: string; exp: number }

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const decode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};
const keyFor = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function issueTileSession(secret: string, origin: string, now = Date.now(), lifetimeSeconds = 1800): Promise<{ token: string; expiresAt: string }> {
  const payload: TileSessionPayload = { origin, exp: Math.floor(now / 1000) + lifetimeSeconds };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(encoded)));
  return { token: `${encoded}.${base64url(signature)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export async function verifyTileSession(secret: string, token: string, origin: string, now = Date.now()): Promise<TileSessionPayload | null> {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await keyFor(secret), decode(signature), encoder.encode(encoded));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(encoded))) as TileSessionPayload;
    return payload.origin === origin && payload.exp > Math.floor(now / 1000) ? payload : null;
  } catch { return null; }
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return null;
}
