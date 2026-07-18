# Cloudflare deployment

The production topology is one Worker named `free-maps`, one private R2 bucket named `free-maps-basemap`, and one custom domain: `free-maps.forkandflag.com`.

## Archive

- Source build: `https://build.protomaps.com/20260717.pmtiles`
- Extract bounds: `143.8,-38.8,146.3,-37.1`
- R2 key: `basemaps/greater-melbourne-20260717.pmtiles`
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

Record the archive byte size, SHA-256, R2 ETag, new deployment id and previous deployment id in the release evidence. Verify health, dataset 250/5000, token denial/issuance, TileJSON, one non-empty tile, cache miss-to-hit behavior, CSP, attribution and desktop/mobile UI.

Rollback activates the previous Worker deployment. It does not mutate the versioned R2 object.
