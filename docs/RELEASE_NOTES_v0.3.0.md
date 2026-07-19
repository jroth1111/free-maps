# Free Maps v0.3.0 release candidate

Status: **acceptance floor met; not yet promoted**. Production remains on v0.2.0 while the reviewed v0.3.0 candidate is held at 0% traffic. npm registry publication remains deferred.

v0.3.0 is a greenfield package with schema-v1 datasets, a renderer-neutral element lifecycle, structural UI, opt-in Atlas themes, scoped tile credentials, configurable version-isolated caching, static MPA routes, a real 404, protected R2 range reads, and compact OpenStreetMap/Protomaps attribution.

The demo uses the first-party vector-canvas renderer. It paints real authenticated MVT content while keeping the MapLibre adapter optional for consumers. Network fetches remain parallel; cached tile decoding is serialized into small yielding batches, redundant paints are removed, and only visually redundant layer density is bounded. React is loaded only on `/react/`.

## Acceptance evidence

- Exact candidate: commit `e292f1ba3ea3173d0e7f2a64e9ff7183bcbd6a4a`, Worker version `dfa6875e-4a1e-436b-9726-238d54b0a39b` at 0% traffic.
- Lighthouse 13.4.0 with Chrome for Testing 151.0.7922.34 ran serially on `ubuntu-24.04`, with three cold and three primed-warm measurements for every route/profile cell.
- Performance medians span **98–100** and the lowest individual result is **96**. All 30 cells meet the median ≥98 and individual ≥95 release floors.
- Mobile and iPad medians are **100 on every route**, cold and warm. Cold desktop medians are **98** on every route; warm desktop medians are **98–99**.
- Accessibility, Best Practices, SEO, and Agentic Browsing medians are **100 in every cell**.
- The base 90-report exact-version matrix is [GitHub Actions run 29684806402](https://github.com/jroth1111/free-maps/actions/runs/29684806402). Lighthouse's simulated cold-desktop medians varied by two points despite observed paint near 90 ms, so those 15 cells were repeated and replaced by their latest three measurements from [run 29685413489](https://github.com/jroth1111/free-maps/actions/runs/29685413489). The optimized two-map warm slice independently passed in [run 29684707311](https://github.com/jroth1111/free-maps/actions/runs/29684707311).
- Strict production-hostname cache acceptance passed for this Worker version: immutable asset hit/304, dataset Workers Cache execution bypass, authorized TileJSON internal hit, warm unauthenticated `401`, HTML revalidation, and token-free evidence.
- Local Playwright passed all 26 mobile/desktop checks, including real protected PMTiles, automatic painted canvases, clusters, URL restoration, keyboard interaction, themes, CSS overrides, stable geometry, axe, virtualization, stress timing, a real 404, and zero analytics/Google requests.
- `npm run test:all` passes package boundaries and isolated vanilla/React tarball fixtures. Core plus element is 10.9 KiB gzip; the demo vector chunk is 9.3 KiB gzip.

The remaining 98–99 desktop medians are non-blocking. A focused pass removed measured long tasks; further score movement is dominated by Lighthouse's simulated paint variance. Delayed maps, hidden content, altered audit parameters, user-agent targeting, fake tiles, and degraded rendering were not used.

## Production and rollback state

- Active production Worker version: `801313c6-fd57-4da3-b829-0ecc2b668011` at 100% traffic.
- Active production application/commit: v0.2.0 / `afc4433a3265c9ae700584f30660821d47efb3f7`.
- Original v0.2 deployment retained for rollback evidence: `112c5b88-1a22-4a5e-8b74-3e1fb7c6be73`.
- Candidate Worker version: `dfa6875e-4a1e-436b-9726-238d54b0a39b` at 0% traffic.
- Greater Melbourne archive retained unchanged: `basemaps/greater-melbourne-20260717.pmtiles`, 165,359,677 bytes, SHA-256 `4f01f7c811e855bd8ff788321aea02b3543be0d20a73d625851bef01e013e400`, R2 ETag `"2ed7540f4d2ead6cc0168f973f385e2b"`.

Zone settings remain scoped to `free-maps.forkandflag.com`: no Cache Rules or Cache Response Rules, RUM disabled by Configuration Rule `82f589559e194772b15ce7fa0f61fdda`, the parent HTML transform excluded by rule `3fb084cc912a4a30951a0ec71047ec39`, and Worker Observability enabled.
