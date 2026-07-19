# Free Maps v0.3.0 release candidate — blocked

Status: **not released**. The candidate is implemented and retained on `main`, but the production release, `v0.3.0` tag, GitHub release, and npm publication are blocked by the authoritative Lighthouse Performance gate.

v0.3.0 separates structural UI from opt-in heritage themes, makes every MapLibre resource explicit, scopes tile credentials to an exact origin/path prefix, and adds version-isolated Workers Cache plus authenticated token-free PMTiles caching.

The candidate includes schema-v1 datasets, a renderer-neutral element lifecycle, static MPA routes, real 404 handling, protected R2 range reads, the Greater Melbourne PMTiles archive, compact OpenStreetMap/Protomaps attribution, and npm-registry publication deferral.

Runtime work now shares expiring tile sessions and style promises, serializes map initialization through first paint, coalesces renderer updates, memoizes explorer transformations, and loads React only on `/react/`. Generated v0.3 styles, glyphs, sprites, fonts, and the CSP worker are versioned before receiving immutable caching.

This is a greenfield package.

## Acceptance evidence

- The most recent complete local diagnostic matrix (2026-07-19) retained 90 JSON and 90 HTML Lighthouse 13.4.0 reports. Performance medians span 96–100, the lowest individual run is 95, and 27 of 30 route/profile/cache rows meet the ≥98 median floor. Accessibility, Best Practices, SEO, and Agentic Browsing are 100 throughout. The evidence is stored in `artifacts/lighthouse-v0.3.0-local-final/`; it is diagnostic rather than authoritative release acceptance.
- Exact merged cache candidate: Worker version `65a401ab-e2d4-4e31-9987-815cf95767c8`, commit `9e577e2a8a41635c56f2f5c0011ab3568cc15d99`.
- Strict cache acceptance passed: immutable asset warm hit/304, dataset Workers Cache execution bypass, authorized TileJSON internal hit, warm unauthenticated `401`, HTML revalidation headers, and token-free evidence.
- Deployed browser acceptance passed all 26 desktop/mobile Playwright checks with painted protected PMTiles, clusters, URL state, themes, axe, stable geometry, and zero analytics/Google requests.
- The serial `ubuntu-24.04` canary used Lighthouse 13.4.0 and Chrome for Testing 151.0.7922.34. Static `/states/` scored 96–98, while automatic real-map routes had Performance medians of 65–66 because MapLibre/WebGL startup produced roughly 3.9–4.6 seconds of total blocking time. Accessibility, Best Practices, SEO, and Agentic Browsing were 100.
- The authoritative run is [GitHub Actions run 29680423382](https://github.com/jroth1111/free-maps/actions/runs/29680423382). It retained 15 cold-desktop JSON reports, 15 HTML reports, and the score matrix. The complete 90-report matrix was correctly stopped because the first hard-gate canary was already below both the median and individual-run floors.

Targeted experiments with a 37-layer style, a smaller internal facade, and alternate MapLibre packaging did not materially reduce the blocking work. Delaying activation, hiding map content, changing audit parameters, user-agent targeting, fake tiles, or degraded rendering remain prohibited and were not used.

## Production and rollback state

- Active production deployment: `813b919e-5eab-4c8d-ac50-ae75bb2338cb`.
- Active Worker version: `801313c6-fd57-4da3-b829-0ecc2b668011` at 100% traffic.
- Active application/commit: v0.2.0 / `afc4433a3265c9ae700584f30660821d47efb3f7`.
- Original v0.2 deployment retained for rollback evidence: `112c5b88-1a22-4a5e-8b74-3e1fb7c6be73`.
- Greater Melbourne archive retained unchanged: `basemaps/greater-melbourne-20260717.pmtiles`, 165,359,677 bytes, SHA-256 `4f01f7c811e855bd8ff788321aea02b3543be0d20a73d625851bef01e013e400`, R2 ETag `"2ed7540f4d2ead6cc0168f973f385e2b"`.

Zone settings rechecked on 2026-07-19:

- No Cache Rules and no Cache Response Rules.
- Active Configuration Rule `82f589559e194772b15ce7fa0f61fdda`, “Disable RUM on free-maps demo”, matches only `free-maps.forkandflag.com`.
- Active Response Header Transform Rule `3fb084cc912a4a30951a0ec71047ec39` applies the parent HTML cache policy only when the hostname is not `free-maps.forkandflag.com`.
- Workers Logs/Observability remain enabled.

No `v0.3.0` release artifact may be published until a fresh candidate passes every required route/profile in both cold and warm matrices.
