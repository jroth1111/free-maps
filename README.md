# Free Maps

Free Maps is an ESM-only, renderer-neutral map explorer for modern browsers. v0.2.0 combines explicitly registered Lit custom elements, an explicitly injected asynchronous renderer, protected Cloudflare R2 PMTiles helpers, and static progressively enhanced demo pages. The hosted demo uses deterministic fictional Melbourne data; it contains no Fork & Flag venue records or private data.

Demo: [free-maps.forkandflag.com](https://free-maps.forkandflag.com)

## Under the hood

- Map data: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Basemap schema/style/assets: [Protomaps](https://protomaps.com)
- Tile archive: [PMTiles](https://docs.protomaps.com/pmtiles/) containing vector MVT tiles
- Browser renderer: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- Hosting: [Cloudflare Worker](https://developers.cloudflare.com/workers/static-assets/) + R2 range reads
- Demo markers: synthetic GeoJSON data clustered by MapLibre

No Google Maps components or requests are involved.

## Install

Registry publication remains deferred. Install the release tarball:

```bash
npm install ./free-maps-0.2.0.tgz
```

## Custom elements

Nothing registers or loads MapLibre as an import side effect. Wire both explicitly:

```ts
import { defineFreeMapElements } from "free-maps/element";
import { createMapLibreRenderer } from "free-maps/maplibre";

const renderer = createMapLibreRenderer({
  tileJsonUrl: "/tiles/melbourne.json",
  tileSessionEndpoint: "/api/tile-session",
  workerUrl: "/assets/maplibre-gl-csp-worker-v5.7.1.js",
});
defineFreeMapElements({ renderer });

const explorer = document.createElement("free-map-explorer");
explorer.data = myDataset;
explorer.options = { labels: { explorerTitle: "Places" } };
document.body.append(explorer);
```

`data` takes precedence over `src`. Assigning non-null `data` cancels an active dataset request; assigning `null` lets `src` load again. `activation` is `visible`, `eager`, or `manual`; manual elements load their renderer only after `activate()`.

Public methods are `activate()`, `reload()`, `select(id | null)`, `fitAll()`, and `resetView()`. Events are `free-map-ready`, `free-map-select`, `free-map-filter-change`, and `free-map-error`. Error codes distinguish dataset fetch/schema failures from renderer configuration/loading/runtime failures.

The default shell uses system fonts. Import `free-maps/heritage.css` to opt into the self-hosted Latin-subset Hanken Grotesk and Literata theme; the fonts use `font-display: optional` and metric-adjusted fallbacks.

## React

React is an optional peer. The wrapper requires the renderer prop and never imports MapLibre:

```tsx
import { FreeMapExplorer } from "free-maps/react";
import { createMapLibreRenderer } from "free-maps/maplibre";

const renderer = createMapLibreRenderer({ tileJsonUrl: "/tiles/city.json" });
export function Places() {
  return <FreeMapExplorer data={data} renderer={renderer} />;
}
```

## Dataset and rendering contracts

`FreeMapDataset` remains schema version 1. Invalid schemas, duplicate point ids, unknown categories and recursive category graphs are rejected before rendering. `MapRendererFactory` is asynchronous; renderer instances implement `mount`, `update`, `fitBounds`, `resetView`, and `destroy`.

MapLibre-specific styles, sessions, request headers, worker URL, pixel-ratio ceiling and fade settings live only in `MapLibreRendererOptions`. Renderer-neutral labels, formatters, link builders and point eligibility live in `FreeMapElementOptions`.

## Demo routes and Cloudflare

The Vite MPA builds `/`, `/embed/`, `/states/`, `/vanilla/`, `/react/`, and `/stress/`. The explorer preserves `q`, `category`, `sort`, and `point`; v0.1 `?view=` URLs are intentionally unsupported. React loads only on `/react/`. Unknown routes use a real `404.html`.

Cloudflare Worker-first routing is restricted to `/api/*` and `/tiles/*`. The protected PMTiles flow issues origin-bound sessions and reads the retained Greater Melbourne archive from R2. See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) and [docs/MIGRATION_v0.2.md](docs/MIGRATION_v0.2.md).

## Development

```bash
npm ci
npm run assets:sync
npm run test:all
npm run check:boundaries
npm run check:budgets
npx playwright install chromium
npm run test:e2e
```

The production Lighthouse matrix uses Lighthouse 13.4.0 with Chrome for Testing 151.0.7922.34. Set `CHROME_PATH` and `LIGHTHOUSE_BASE_URL`, then run `npm run lighthouse:matrix` to generate 45 JSON/HTML reports plus score matrices.
