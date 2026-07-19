# Cloudflare deployment

The production topology is one Worker named `free-maps`, one private R2 bucket named `free-maps-basemap`, and the custom domain `free-maps.forkandflag.com`. The more-specific Worker route remains in place so the parent zone wildcard does not capture demo traffic.

## Immutable archive

- Source build: `https://build.protomaps.com/20260717.pmtiles`
- Extract bounds: `143.8,-38.8,146.3,-37.1`
- R2 key: `basemaps/greater-melbourne-20260717.pmtiles`
- Size: `165359677` bytes
- SHA-256: `4f01f7c811e855bd8ff788321aea02b3543be0d20a73d625851bef01e013e400`
- R2 ETag: `"2ed7540f4d2ead6cc0168f973f385e2b"`

The archive is versioned and immutable. Never overwrite, delete, or cache the complete object during a deployment or rollback. The Worker reads only the requested PMTiles ranges.

## v0.3 cache and authentication model

Wrangler enables Workers Cache with `cross_version_cache: false`. Deterministic demo datasets use a five-minute browser TTL and one-hour edge TTL with stale-while-revalidate. Health, tile sessions, errors, authenticated requests, and unsupported methods are `no-store`. HTML requires browser revalidation but has a short edge TTL. Only release-versioned or hashed assets receive one-year immutable caching.

Authenticated TileJSON and MVT responses continue to use `caches.default`, which is PoP-local and does not provide tiered caching or Cache API stale-while-revalidate. Authentication runs before cache lookup. Internal responses contain no token or caller Origin; client copies add CORS and private browser caching after retrieval. Cache keys include cache namespace/version, basemap version, archive key, encoding revision, and coordinates. Versioned missing tiles use a bounded 204 entry. Errors and 206 responses are never stored.

Tile sessions last 30 minutes and are HMAC-bound to one exact Origin. v0.3 accepts bearer credentials only in the `Authorization` header.

## Pre-v0.3 production and zone baseline

Captured before v0.3 code or zone changes on 2026-07-19:

- Release deployment: `112c5b88-1a22-4a5e-8b74-3e1fb7c6be73`
- Worker version: `801313c6-fd57-4da3-b829-0ecc2b668011`
- Release commit: `afc4433a3265c9ae700584f30660821d47efb3f7`
- Worker application version: `0.2.0`
- Basemap version/key: `20260717` / `basemaps/greater-melbourne-20260717.pmtiles`
- Zone Cache Rules: none
- Zone Cache Response Rules: none
- Active response-header transform: `3fb084cc912a4a30951a0ec71047ec39`, “Align public HTML Cache-Control at the edge (audit hardening)”, matching every `text/html` response and setting `public, max-age=60, s-maxage=600, stale-while-revalidate=900`
- Web Analytics: parent-zone `forkandflag.com` automatic setup, site tag `706e6c0b44064ff0ac545ca49ad98c43`; the demo hostname was within its automatic injection scope
- Worker Observability: enabled and retained

The v0.3 zone change must be limited to `free-maps.forkandflag.com`: exclude that hostname from the transform rule rather than removing protection from the parent site, and disable automatic Web Analytics injection for only the demo hostname.

## Verification and rollback

Before production, upload a preview version and verify real R2 range reads, tile denial/issuance, internal hit diagnostics, dataset Workers Cache behavior, immutable assets, HTML revalidation, CSP, attribution, desktop/mobile UI, and zero analytics/Google requests.

Rollback code with:

```bash
npx wrangler rollback 801313c6-fd57-4da3-b829-0ecc2b668011
```

Also restore the response-header transform and Web Analytics hostname settings recorded above if the v0.3 zone changes must be reverted. Rollback never mutates the retained PMTiles archive.
