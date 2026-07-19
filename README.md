# Free Maps

Free Maps is an ESM-only, renderer-neutral map explorer for modern browsers. It provides a schema-v1 dataset, structural UI, opt-in themes, a lightweight vector-canvas renderer, an optional MapLibre adapter, scoped tile authorization, and configurable Cloudflare cache policy. The hosted demo uses deterministic fictional Melbourne data; it contains no Fork & Flag venue records or private data.

Demo: [free-maps.forkandflag.com](https://free-maps.forkandflag.com)

## Under the hood

- Map data: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Basemap schema/style/assets: [Protomaps](https://protomaps.com)
- Tile archive: [PMTiles](https://docs.protomaps.com/pmtiles/) containing vector MVT tiles
- Browser renderer: lightweight Free Maps vector canvas; optional [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) adapter
- Hosting: [Cloudflare Worker](https://developers.cloudflare.com/workers/) + R2 range reads
- Demo markers: synthetic GeoJSON data clustered by the vector renderer

No Google Maps or Cloudflare Web Analytics requests are part of the demo runtime.

## Install

Registry publication remains deferred. Install the v0.3.0 release tarball:

```bash
npm install ./free-maps-0.3.0.tgz
```

Install `maplibre-gl` only when using the `free-maps/maplibre` adapter. React and MapLibre are optional peers; `core`, `cloudflare`, `element`, and `vector` do not import either one.

## Lightweight vector renderer

The hosted demo uses the first-party canvas renderer. It fetches the same scoped, authenticated TileJSON and MVT endpoints, incrementally decodes a bounded set of visible vector layers, paints real OpenStreetMap/Protomaps content, and provides pan, zoom, clustering, selection, attribution, cancellation, and responsive redraw without a WebGL startup task.

```ts
import { defineFreeMapElements } from "free-maps/element";
import { createVectorCanvasRenderer } from "free-maps/vector";

defineFreeMapElements({
  renderer: createVectorCanvasRenderer({
    tileJsonUrl: "/tiles/melbourne.json",
    tileSession: {
      endpoint: "/api/tile-session",
      protectedUrlPrefix: "/tiles/",
    },
  }),
});
```

## MapLibre and explicit renderer resources

Nothing registers custom elements, loads MapLibre, selects a basemap, or chooses a theme as an import side effect.

```ts
import { defineFreeMapElements } from "free-maps/element";
import { createMapLibreRenderer } from "free-maps/maplibre";

const renderer = createMapLibreRenderer({
  workerUrl: "/assets/maplibre-gl-csp-worker-v5.24.0.js",
  styleUrl: "/map-assets/v0.3.0/atlas-light.json",
  tileJsonUrl: "/tiles/melbourne.json",
  tileSession: {
    endpoint: "/api/tile-session",
    protectedUrlPrefix: "/tiles/",
  },
  tileHeaders: { "x-map-client": "places" },
});

defineFreeMapElements({ renderer });
const explorer = document.createElement("free-map-explorer");
explorer.data = myDataset;
explorer.options = { labels: { explorerTitle: "Places" } };
document.body.append(explorer);
```

`workerUrl` is required. Configure exactly one of inline `style` or `styleUrl`; basemap selection is independent from the UI theme. Bearer credentials and `tileHeaders` are attached only when a parsed request URL matches the exact origin and path prefix in `tileSession.protectedUrlPrefix`. Style, glyph, sprite, font, worker, and unrelated API requests never receive them.

`data` takes precedence over `src`. Assigning non-null `data` cancels an active dataset request; assigning `null` lets `src` load again. `activation` is `visible`, `eager`, or `manual`; manual elements load their renderer only after `activate()`.

Public methods are `activate()`, `reload()`, `select(id | null)`, `fitAll()`, and `resetView()`. Events are `free-map-ready`, `free-map-select`, `free-map-filter-change`, and `free-map-error`.

## Themes, tokens, and parts

The element bundle contains structural CSS and accessible neutral fallback values. Apply a theme class before activation; runtime theme-object APIs and dynamic theme switching are intentionally outside the contract.

```ts
import "free-maps/themes/atlas.css";
// Or: import "free-maps/themes/atlas-dark.css";

explorer.classList.add("free-map-theme-atlas");
```

Published tokens:

- Typography: `--free-map-font-family`, `--free-map-heading-font-family`
- Surfaces: `--free-map-surface-canvas`, `--free-map-surface`, `--free-map-surface-muted`
- Text and borders: `--free-map-text`, `--free-map-text-muted`, `--free-map-border-color`
- Accent and focus: `--free-map-accent`, `--free-map-accent-hover`, `--free-map-on-accent`, `--free-map-focus`
- Controls: `--free-map-control-surface`, `--free-map-control-text`, `--free-map-control-border`
- Markers and clusters: `--free-map-marker`, `--free-map-marker-selected`, `--free-map-marker-stroke`, `--free-map-cluster`, `--free-map-cluster-medium`, `--free-map-cluster-large`, `--free-map-cluster-text`
- Shape and elevation: `--free-map-radius-small`, `--free-map-radius`, `--free-map-shadow-control`

Virtual-row heights and layout-critical dimensions are private. Stable styling hooks are `::part(controls)`, `::part(results)`, `::part(result-row)`, `::part(map)`, `::part(status)`, and `::part(errors)`. Additional parts may exist but are not part of this stability promise.

When a page contains multiple explorers, give each host a distinct `aria-label`; the element prefixes its map and results landmark names with that label.

Map marker and MapLibre control colors are resolved from these tokens once at renderer mount. Select the theme and set overrides before activation.

## React

```tsx
import { FreeMapExplorer } from "free-maps/react";
import { createMapLibreRenderer } from "free-maps/maplibre";

const renderer = createMapLibreRenderer({
  workerUrl: "/maplibre-worker-v5.24.0.js",
  style: { version: 8, sources: {}, layers: [] },
});

export function Places() {
  return <FreeMapExplorer data={data} renderer={renderer} />;
}
```

## Dataset, rendering, and cache contracts

`FreeMapDataset` uses schema version 1. Invalid schemas, duplicate point ids, unknown categories, and recursive category graphs are rejected before rendering. `MapRendererFactory` is asynchronous; renderer instances implement `mount`, `update`, `fitBounds`, `resetView`, and `destroy`.

Cloudflare PMTiles handlers require an explicit cache policy:

```ts
await handlePmtilesRequest({
  bucket,
  objectKey: "basemaps/city-20260717.pmtiles",
  archiveName: "city",
  version: "20260717",
  request,
  context,
  corsOrigin: origin,
  cachePolicy: {
    namespace: "my-map",
    version: "v3",
    encodingRevision: "mvt-gzip-v1",
    tileJsonTtlSeconds: 3600,
    tileTtlSeconds: 31536000,
    negativeTtlSeconds: 300,
  },
});
```

An injected `cache` is optional. Internal keys include namespace, cache version, basemap version, archive key, encoding revision, and tile coordinates—never a token. Callers must authenticate before invoking the handler. It caches only successful TileJSON, tiles, and bounded 204 misses; errors and 206 responses are not stored. Client copies use private browser caching and add CORS after retrieval.

## Demo routes and performance

The static MPA routes are `/`, `/embed/`, `/states/`, `/vanilla/`, `/react/`, and `/stress/`. The explorer preserves `q`, `category`, `sort`, and `point`; unknown routes use a real `404.html`. React loads only on `/react/`.

The demo does not request MapLibre. It loads the vector renderer only after stable paint and activation eligibility. Compatible maps share expiring tile-session promises, initialization is concurrency-one through first paint, and renderer updates are coalesced. The 5,000-point route keeps fewer than 60 result rows mounted.

### Current Lighthouse results

The most recent pinned Ubuntu acceptance matrix (2026-07-19) uses Lighthouse 13.4.0 and Chrome for Testing 151.0.7922.34: three cold and three primed-warm runs for each of five routes across mobile, iPad, and desktop profiles. Performance medians range from **98 to 100**, the lowest individual run is **96**, and **all 30** route/profile/cache rows meet the ≥98 median floor. Accessibility, Best Practices, SEO, and Agentic Browsing are **100 in every row**.

| Route | Cold Performance medians | Warm Performance medians |
| --- | --- | --- |
| `/` | 98–100 | 99–100 |
| `/embed/` | 98–100 | 98–100 |
| `/states/` | 98–100 | 99–100 |
| `/vanilla/` | 98–100 | 99–100 |
| `/react/` | 98–100 | 99–100 |

Mobile and iPad medians are **100 on every route in both cache modes**. Cold desktop medians are 98; warm desktop medians are 98–99. The remaining desktop variance comes from Lighthouse's simulated paint model despite observed paint near 90 ms and 0–9 ms blocking time on the affected cold runs. Production remains on v0.2.0 until the reviewed candidate is promoted. See [the full candidate evidence](docs/RELEASE_NOTES_v0.3.0.md).

See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) and [docs/UI_VERIFICATION.md](docs/UI_VERIFICATION.md).

## Development

```bash
npm ci
npm run test:all
npm run test:e2e
CACHE_BASE_URL=http://127.0.0.1:4173 npm run cache:verify
```

The release matrix uses Lighthouse 13.4.0 and Chrome for Testing 151.0.7922.34 on serial `ubuntu-24.04`: three cold and three primed warm runs for five routes across three profiles, producing 90 JSON and 90 HTML reports when the canary clears the early hard gate.
