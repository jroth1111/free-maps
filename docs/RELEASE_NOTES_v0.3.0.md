# Free Maps v0.3.0

v0.3.0 provides a renderer-neutral map explorer with schema-v1 datasets, explicit activation and renderer wiring, protected R2 range reads, and static progressively enhanced demo routes.

## User interface

- `layout="responsive"` defaults to a collapsible left rail on desktop and iPad, and a map-first bottom sheet with collapsed, half, and expanded snap points on mobile.
- `layout="stack"` remains available, while compact maps remain map-only.
- Quick-filter callbacks combine with query and category filters using AND semantics and round-trip as repeated `filter=` URL parameters.
- `searchArea` is developer-controlled and off by default. Opted-in maps dispatch `free-map-search-area` after user viewport movement without fetching or mutating data.
- Atlas and Atlas Dark remain the primary themes. Signal, Signal Dark, and Contrast are independent CSS exports.
- Vector basemap colors are explicit renderer configuration, independent from UI themes.

## Runtime and privacy

- The demo uses the first-party vector-canvas renderer for authenticated MVT content. MapLibre remains an optional peer adapter with explicit worker and style configuration.
- Map activation starts only after stable paint and eligibility. Compatible maps share expiring tile sessions, initialization is concurrency-one through first paint, and updates are coalesced.
- Auth credentials are scoped to the exact protected origin and path prefix. No Google, analytics, telemetry, third-party images, or font services are requested.
- The deterministic demo dataset is fictional. Results remain text-only.

## Acceptance contract

- Core plus element: at most 15 KiB gzip. Each theme: at most 1.5 KiB gzip.
- Fewer than 60 mounted result rows, 5,000-point filter/sort p95 below 100 ms, and UI-to-map updates below 200 ms.
- Browser coverage at 412×823, 768×1024, and 1350×940 includes layout interaction, focus, URL state, filters, viewport actions, clusters, protected tiles, themes, forced colors, axe, CLS, and overflow.
- Lighthouse 13.4.0 uses five routes, three pinned effective profiles, and three cold plus three warm runs. Every Performance median and every non-Performance category score must be 100; no run may fall below 96.
- The accepted live-candidate rerun on 2026-07-20 produced 90 reports at 100 in Performance, Accessibility, Best Practices, SEO, and Agentic Browsing, including every individual run. Its evidence records the effective mobile, iPad, and desktop settings so a profile label cannot silently inherit the wrong throttling or user agent.

npm registry publication remains deferred.
