# Free Maps v0.2.0

v0.2.0 is an intentionally incompatible architecture and performance release. It replaces the query-driven SPA with six static progressively enhanced routes, makes registration and renderer injection explicit, renames `dataset` to `data`, replaces `loading` with three activation modes, and isolates renderer-specific configuration in `MapLibreRendererOptions`.

The release retains schema-v1 datasets and the immutable Greater Melbourne PMTiles archive. It adds the MapLibre CSP worker, a generated reduced Protomaps heritage style, one regular glyph face, system-font defaults, an optional heritage theme, static discovery files, real 404 routing, package-boundary and size budgets, production-like browser coverage, and the pinned 45-run Lighthouse gate.

See [MIGRATION_v0.2.md](MIGRATION_v0.2.md) for the complete breaking migration.
