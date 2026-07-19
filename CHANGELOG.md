# Changelog

## 0.3.0

- Neutral structural element CSS, published `--free-map-*` tokens and stable parts, plus opt-in Atlas light/dark themes.
- Explicit MapLibre worker/style configuration and exact-origin/path tile authorization with shared expiring sessions.
- Configurable, versioned PMTiles Cache API entries with auth-before-cache, negative caching, miss coalescing, private client copies, and diagnostics.
- Workers Cache, fingerprinted demo assets, concurrent activation resources, first-paint scheduling, memoized updates, and a 90-report cold/warm Lighthouse gate.
- Stable progressive-enhancement geometry, unique multi-map landmarks, keyboard/history coverage, and measured renderer-update latency.
- First-party vector-canvas renderer for authenticated MVT basemaps, with bounded incremental decoding and no WebGL startup cost; MapLibre remains an explicit optional adapter.
- Default responsive left rail on desktop/iPad and accessible three-snap bottom sheet on mobile, while `layout="stack"` and compact maps remain explicit alternatives.
- Schema-neutral quick filters, repeated `filter=` URL state, and developer-controlled `free-map-search-area` viewport events.
- Independent Signal, Signal Dark, and Contrast UI themes plus explicit neutral light/dark vector basemap presets.
