# Free Maps

Free Maps is an ESM-only, framework-neutral map explorer for modern browsers. It combines Lit custom elements, a lazy MapLibre renderer, Protomaps/PMTiles basemaps, OpenStreetMap attribution and reusable Cloudflare R2 handlers. The hosted demo uses deterministic fictional Melbourne data; it contains no Fork & Flag venue records or private data.

Demo: [free-maps.forkandflag.com](https://free-maps.forkandflag.com)

## Under the hood

- Map data: © OpenStreetMap contributors
- Basemap schema/style/assets: Protomaps
- Tile archive: PMTiles containing vector MVT tiles
- Browser renderer: MapLibre GL JS
- Hosting: Cloudflare Worker + R2 range reads
- Demo markers: synthetic GeoJSON data clustered by MapLibre

No Google Maps components or requests are involved.

## Install

The v0.1.0 release includes an npm-compatible tarball. Registry publication is intentionally deferred.

```bash
npm install ./free-maps-0.1.0.tgz
```

Import only the entry points you need:

```ts
import { parseFreeMapDataset, openStreetMapUrl } from "free-maps/core";
import "free-maps/fonts.css";
import "free-maps/element";
```

## Custom element

```ts
const explorer = document.createElement("free-map-explorer");
explorer.dataset = myDataset; // takes precedence over src and aborts an active fetch
explorer.config = {
  tileJsonUrl: "https://tiles.example.com/city.json",
  requestHeaders: { authorization: "Bearer …" },
  externalMapLinkBuilder: (point) =>
    point.position ? openStreetMapUrl(point.position.lat, point.position.lng) : undefined,
};
document.body.append(explorer);
```

The platform already defines `HTMLElement.dataset` for `data-*` attributes. Free Maps intentionally installs an own `dataset` property on its element instances to honor the public API. TypeScript callers can use `setDataset(value)` when they want a collision-free typed spelling; both paths have identical behavior.

Declarative attributes are `src`, `query`, `category`, `sort`, `selected-id`, `compact`, and `loading="visible|eager"`. Methods are `reload()`, `select(id | null)`, `fitAll()`, and `resetView()`.

Events bubble across Shadow DOM:

- `free-map-ready` — dataset and mapped counts
- `free-map-select` — selected id and point, or `null`
- `free-map-filter-change` — filter state and result count
- `free-map-error` — structured code, message, cause, and retryability

### Styling

The default `heritageLight` preset uses self-hosted variable Literata and Hanken Grotesk fonts. Override any `--free-map-*` custom property, or target the documented parts: `shell`, `hint`, `controls`, `search-input`, `category-select`, `sort-select`, `map`, `fit-button`, `reset-button`, `results`, `result-row`, `details`, `empty`, and `error`.

## React

React is an optional peer dependency:

```tsx
import { FreeMapExplorer } from "free-maps/react";

export function Places() {
  return <FreeMapExplorer dataset={dataset} config={config} onSelect={console.log} />;
}
```

## Dataset contract

`FreeMapDataset` is the stable schema-version-1 contract described by `free-maps/core`. Invalid schemas, duplicate point ids, unknown point categories, missing category parents and recursive member cycles are rejected before rendering. Points without coordinates or outside `validBounds` stay searchable in the list as “Map unavailable” and never enter clusters or fit calculations.

## Rendering and routing

`MapRendererFactory` makes rendering injectable. v0.1.0 ships one implementation from `free-maps/maplibre`; consumers can provide another factory without changing the element. The default renderer lazy-loads only after visible/eager activation, clusters GeoJSON points, synchronizes selection through feature state, and disposes its MapLibre instance when disconnected.

Routing stays outside the component. The demo maps `q`, `category`, `sort`, and `point` parameters to element state and restores them on `popstate`.

## Cloudflare

`free-maps/cloudflare` exports the HMAC tile-session and direct R2 PMTiles helpers used by the demo Worker. The deployment uses static assets in SPA mode with Worker-first handling limited to `/api/*` and `/tiles/*`, so JS, CSS, fonts and sprites remain on the static asset path.

The hosted tiles are demo-only and origin-bound. Downstream deployments must provide their own archive, tile endpoint and session secret. See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

## Development

```bash
npm ci
npm run assets:sync
npm run test:all
npx playwright install chromium
npm run test:e2e
```

No Fork & Flag dev server or source mutation is required. The source repository is independent and MIT licensed.
