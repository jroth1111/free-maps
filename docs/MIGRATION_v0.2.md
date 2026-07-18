# Migrating from Free Maps v0.1 to v0.2

v0.2.0 is intentionally incompatible. There are no aliases, shims, redirects, or compatibility query parameters.

## Element properties

| v0.1 | v0.2 |
|---|---|
| `element.dataset = value` | `element.data = value` |
| `loading="visible"` | `activation="visible"` |
| `loading="eager"` | `activation="eager"` |
| no manual mode | `activation="manual"` plus `activate()` |
| `config` | renderer-neutral `options` plus renderer-specific factory options |

`HTMLElement.dataset` is platform-owned and is no longer overridden. `data` is nullable: a non-null value wins over `src` and cancels its fetch; setting `data = null` enables `src` again.

## Renderer and registration

Importing `free-maps/element` no longer registers elements or loads MapLibre. Register explicitly and provide an asynchronous renderer factory:

```ts
import { defineFreeMapElements } from "free-maps/element";
import { createMapLibreRenderer } from "free-maps/maplibre";

defineFreeMapElements({
  renderer: createMapLibreRenderer({
    tileJsonUrl: "/tiles/melbourne.json",
    tileSessionEndpoint: "/api/tile-session",
  }),
});
```

An element-level `renderer` property overrides the registered default. React callers must pass `renderer` explicitly and rename the `dataset` prop to `data`.

## Routes

Replace v0.1 demo query links with static routes:

| v0.1 | v0.2 |
|---|---|
| `/?view=full` | `/` |
| `/?view=compact` | `/embed/` |
| `/?view=states` | `/states/` |
| `/?view=vanilla` | `/vanilla/` |
| `/?view=react` | `/react/` |
| `/?view=stress` | `/stress/` |

Old `?view=` values are ignored; no redirects are provided.
