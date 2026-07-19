# Free Maps v0.3.0

v0.3.0 separates structural UI from opt-in heritage themes, makes every MapLibre resource explicit, scopes tile credentials to an exact origin/path prefix, and adds version-isolated Workers Cache plus authenticated token-free PMTiles caching.

The release includes schema-v1 datasets, a renderer-neutral element lifecycle, static MPA routes, real 404 handling, protected R2 range reads, the Greater Melbourne PMTiles archive, compact OpenStreetMap/Protomaps attribution, and npm-registry publication deferral.

Runtime work now shares expiring tile sessions and style promises, serializes map initialization through first paint, coalesces renderer updates, memoizes explorer transformations, and loads React only on `/react/`. Generated v0.3 styles, glyphs, sprites, fonts, and the CSP worker are versioned before receiving immutable caching.
