# Cloudflare deployment

The production topology is one Worker named `free-maps`, one private R2 bucket named `free-maps-basemap`, and the custom domain `free-maps.forkandflag.com`. The hostname-specific Worker route prevents the parent-zone wildcard from capturing demo traffic.

## Immutable archive

- Source build: `https://build.protomaps.com/20260717.pmtiles`
- Extract bounds: `143.8,-38.8,146.3,-37.1`
- R2 key: `basemaps/greater-melbourne-20260717.pmtiles`
- Size: `165359677` bytes
- SHA-256: `4f01f7c811e855bd8ff788321aea02b3543be0d20a73d625851bef01e013e400`
- R2 ETag: `"2ed7540f4d2ead6cc0168f973f385e2b"`

The archive is immutable. Deployments and rollbacks must never overwrite, delete, or cache the complete object. The Worker reads only requested PMTiles ranges.

## Cache and authentication

Wrangler enables Workers Cache with `cross_version_cache: false`. The uncached default entrypoint validates dataset requests before forwarding eligible public reads to the cache-enabled `Dataset` entrypoint. Health, tile sessions, errors, authenticated tile requests, and unsupported methods do not enter that lookup path.

Authenticated TileJSON and MVT responses use `caches.default`. Authentication runs before lookup. Internal responses contain no token or caller Origin; client copies add CORS and private browser caching after retrieval. Cache keys include namespace, cache version, basemap version, archive key, encoding revision, and tile coordinates. Versioned missing tiles use bounded 204 entries. Errors and 206 responses are not stored.

Tile sessions last 30 minutes and are HMAC-bound to one exact Origin. Bearer credentials are accepted only in the `Authorization` header.

## Release procedure

Before each deployment, record the active Worker version and deployment, hostname-scoped cache rules, analytics state, and exact rollback command in `artifacts/DEPLOYMENT_EVIDENCE.md`. Upload a preview version first and verify real R2 range reads, denial and issuance, warm and conditional caching, bounded negative caching, CSP, attribution, desktop/mobile UI, and zero analytics or Google requests.

Production promotion requires the complete local and preview gates. Roll back immediately if any cache, authorization, privacy, browser, or Lighthouse hard gate fails. A rollback never mutates the retained PMTiles archive.
