# Cloudflare deployment

The production topology is one Worker named `free-maps`, one private R2 bucket named `free-maps-basemap`, and one custom domain: `free-maps.forkandflag.com`.

The zone already has a `*.forkandflag.com/*` route for the Fork & Flag Worker. Because Worker Routes take precedence over Custom Domains, this project also owns the more-specific `free-maps.forkandflag.com/*` route. Cloudflare selects that route without changing or disabling the existing wildcard.

## Archive

- Source build: `https://build.protomaps.com/20260717.pmtiles`
- Extract bounds: `143.8,-38.8,146.3,-37.1`
- R2 key: `basemaps/greater-melbourne-20260717.pmtiles`
- Size: `165359677` bytes
- SHA-256: `4f01f7c811e855bd8ff788321aea02b3543be0d20a73d625851bef01e013e400`
- R2 ETag: `"2ed7540f4d2ead6cc0168f973f385e2b"`
- The object is immutable and versioned. Never overwrite or delete it during rollback.

```bash
brew install pmtiles
npm run basemap:extract
npm run basemap:verify
npx wrangler r2 bucket create free-maps-basemap
npm run basemap:upload
openssl rand -base64 48 | npx wrangler secret put TILE_SESSION_SECRET
npm run deploy
```

Wrangler currently supports single-object uploads up to 315 MB; the extraction verification refuses a larger archive. The Worker reads only requested PMTiles ranges from R2, caches resolved directories in-process, and stores token-free responses in `caches.default` only after origin/session authentication.

## Cache and authentication

Tile sessions last 30 minutes and are HMAC-bound to one exact Origin. `free-maps.forkandflag.com` accepts only its own HTTPS origin. Non-production Workers and local development accept exact `localhost` or `127.0.0.1` origins. Every TileJSON and vector-tile request requires a valid matching session.

Stable TileJSON caches for five minutes. Versioned tiles cache for one year with `immutable`. CORS is added after cache retrieval, so cached bodies never contain one caller's Origin. ETags support conditional requests.

## Verification and rollback

Record the archive byte size, SHA-256, R2 ETag, new deployment id and previous deployment id in the release evidence. Verify health, dataset 250/5000, token denial/issuance, TileJSON, one non-empty tile, cache miss-to-hit behavior, CSP, attribution and desktop/mobile UI. v0.2 uses static multi-page assets with `not_found_handling = "404-page"`; Worker-first routing remains restricted to `/api/*` and `/tiles/*`.

There was no pre-existing `free-maps` Worker when v0.1.0 provisioning began. The deployment immediately before the final route-specific cutover was `544c4ed2-4248-446b-8e3b-c2166c6be979`; the earlier verified Workers.dev build was `968e059c-1ecd-48ee-a3df-7782eea78fda`.

The production deployment immediately before v0.2 work began was `a46a7d85-de35-478b-a48c-0056f07a4e6e` (Worker version `45f337e9-ea8b-4ffd-a68f-4ac954e1d93a`). Rollback activates that deployment and does not mutate the versioned R2 object.
