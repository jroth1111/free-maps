import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.CACHE_BASE_URL ?? process.env.LIVE_BASE_URL ?? process.argv[2];
if (!baseUrl) throw new Error("Set CACHE_BASE_URL or pass the deployment origin");
const base = new URL(baseUrl);
const packageVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const strict = process.env.CACHE_STRICT_CLOUDFLARE === "1" || base.hostname === "free-maps.forkandflag.com";
const versionOverrideId = process.env.WORKER_VERSION_OVERRIDE_ID;
const failures = [];
const evidence = { baseUrl: base.origin, strict, versionOverrideId: versionOverrideId ?? null, capturedAt: new Date().toISOString(), requests: {} };

const selectedHeaders = (response) => Object.fromEntries([
  "cache-control", "cloudflare-cdn-cache-control", "cf-cache-status", "age", "etag",
  "x-free-maps-cache", "x-free-maps-invocation", "server-timing", "access-control-allow-origin",
].map((name) => [name, response.headers.get(name)]));
const withVersionOverride = (init = {}) => {
  if (!versionOverrideId) return init;
  const headers = new globalThis.Headers(init.headers);
  headers.set("Cloudflare-Workers-Version-Overrides", `free-maps="${versionOverrideId}"`);
  return { ...init, headers };
};
const capture = async (name, path, init) => {
  const response = await fetch(new URL(path, base), withVersionOverride(init));
  evidence.requests[name] = { url: response.url.replace(/[?&]token=[^&]+/g, ""), status: response.status, headers: selectedHeaders(response) };
  await response.arrayBuffer();
  return response;
};
const expect = (condition, message) => { if (!condition) failures.push(message); };

const htmlCold = await capture("htmlCold", "/");
const htmlWarm = await capture("htmlWarm", "/");
expect(htmlCold.status === 200 && htmlWarm.status === 200, "HTML must be available before and after warming");
expect(htmlWarm.headers.get("cache-control")?.includes("max-age=0"), "HTML must require browser revalidation");

const assetCold = await capture("assetCold", "/map-assets/v0.3.0/atlas-light.json");
const assetWarm = await capture("assetWarm", "/map-assets/v0.3.0/atlas-light.json", { headers: assetCold.headers.get("etag") ? { "if-none-match": assetCold.headers.get("etag") } : {} });
expect(assetCold.headers.get("cache-control")?.includes("immutable"), "Versioned style must be immutable");
expect(assetWarm.status === 200 || assetWarm.status === 304, "Warm immutable asset must return 200 or 304");
if (strict) expect(assetWarm.status === 304 || ["HIT", "REVALIDATED"].includes(assetWarm.headers.get("cf-cache-status") ?? ""), "Warm immutable asset must be a Cloudflare hit or 304");

const datasetCold = await capture("datasetCold", "/api/v1/demo-dataset?size=250");
const datasetWarm = await capture("datasetWarm", "/api/v1/demo-dataset?size=250");
expect(datasetCold.headers.get("cache-control")?.includes("max-age=300"), "Dataset browser TTL must be five minutes");
expect(datasetCold.headers.get("etag")?.includes(`demo-${packageVersion}-250`), `Dataset cache must contain the deployed ${packageVersion} response`);
if (strict) {
  // Cloudflare consumes and strips Cloudflare-CDN-Cache-Control before the
  // response reaches the client; Cf-Cache-Status is the observable proof.
  expect(datasetWarm.headers.get("cf-cache-status") !== "HIT", "Dataset must not be served by the outer zone CDN");
  expect(Boolean(datasetCold.headers.get("x-free-maps-invocation")), "Cold dataset response must expose a non-secret invocation id");
  expect(datasetCold.headers.get("x-free-maps-invocation") === datasetWarm.headers.get("x-free-maps-invocation"), "Warm dataset must preserve the cached invocation id and bypass Worker execution");
}

const session = await fetch(new URL("/api/tile-session", base), withVersionOverride({ method: "POST", headers: { origin: base.origin, accept: "application/json", "content-type": "application/json" }, body: "{}" }));
const body = await session.json();
expect(session.status === 200 && typeof body.token === "string", "Tile session must issue a bearer token");
evidence.requests.session = { url: session.url, status: session.status, headers: selectedHeaders(session) };
const tileHeaders = { origin: base.origin, authorization: `Bearer ${body.token}` };
const tileCold = await capture("tileJsonCold", "/tiles/melbourne.json", { headers: tileHeaders });
const tileWarm = await capture("tileJsonWarm", "/tiles/melbourne.json", { headers: tileHeaders });
expect(tileCold.status === 200 && tileWarm.status === 200, "Authorized TileJSON must succeed");
expect(["hit", "coalesced"].includes(tileWarm.headers.get("x-free-maps-cache") ?? ""), "Warm TileJSON must use the internal cache");
expect(tileWarm.headers.get("cache-control")?.startsWith("private"), "Authenticated TileJSON must be private in the browser");
const unauthorized = await capture("tileJsonUnauthorized", "/tiles/melbourne.json", { headers: { origin: base.origin } });
expect(unauthorized.status === 401, "Unauthenticated TileJSON must stay 401 after warming");

const serialized = JSON.stringify(evidence);
expect(!serialized.includes(body.token), "Evidence must not contain a bearer token");
expect(!Object.values(evidence.requests).some((entry) => entry.url?.includes("token=")), "No request URL may contain a token");
evidence.failures = failures;
mkdirSync(resolve("artifacts/cache"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve("artifacts/cache", `${base.hostname}-${stamp}.json`);
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Cache evidence: ${output}`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
