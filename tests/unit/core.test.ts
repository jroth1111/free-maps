import { describe, expect, it } from "vitest";
import { applyUrlState, calculateBounds, filterAndSortPoints, indexPoints, normalizeActiveFilters, normalizeQuickFilters, normalizeSearchText, openStreetMapUrl, parseFreeMapDataset, parseUrlState, pointIsMappable, resolveCategoryMembers } from "../../src/core";
import { dataset } from "./fixtures";

describe("dataset schema and categories", () => {
  it("accepts the stable schema and rejects unsupported versions", () => {
    expect(parseFreeMapDataset(dataset)).toBe(dataset);
    expect(() => parseFreeMapDataset({ ...dataset, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });
  it("resolves recursive category membership", () => {
    expect([...resolveCategoryMembers(dataset.categories, "all-food")]).toEqual(["all-food", "asian", "japanese"]);
  });
  it("detects member cycles", () => {
    expect(() => parseFreeMapDataset({ ...dataset, categories: [{ id: "a", label: "A", memberCategoryIds: ["b"] }, { id: "b", label: "B", memberCategoryIds: ["a"] }], points: [] })).toThrow(/cycle/);
  });
});

describe("search, sorting, bounds and links", () => {
  it("normalizes accents and searches pre-indexed text", () => {
    expect(normalizeSearchText("Café Áster")).toBe("cafe aster");
    expect(filterAndSortPoints(indexPoints(dataset.points), dataset.categories, "cafe", "all", "name").map((point) => point.id)).toEqual(["a"]);
  });
  it("sorts ranking and missing values stably", () => {
    expect(filterAndSortPoints(indexPoints(dataset.points), dataset.categories, "", "all-food", "ranking").map((point) => point.id)).toEqual(["b", "a", "c", "d"]);
    expect(filterAndSortPoints(indexPoints(dataset.points), dataset.categories, "", "all", "score").map((point) => point.id)).toEqual(["c", "a", "b", "d"]);
  });
  it("deduplicates quick filters in declaration order and applies active filters with AND semantics", () => {
    const filters = normalizeQuickFilters([
      { id: "scored", label: "Scored", matches: (point) => point.score != null },
      { id: "scored", label: "Duplicate", matches: () => false },
      { id: "ranked", label: "Ranked", matches: (point) => point.rank != null },
    ]);
    expect(filters.map(({ id }) => id)).toEqual(["scored", "ranked"]);
    expect(normalizeActiveFilters(["unknown", "ranked", "scored", "ranked"], filters)).toEqual(["scored", "ranked"]);
    expect(filterAndSortPoints(indexPoints(dataset.points), dataset.categories, "", "all", "ranking", dataset, filters, ["scored", "ranked"]).map(({ id }) => id)).toEqual(["a"]);
  });
  it("keeps missing and out-of-bounds points out of map bounds", () => {
    expect(pointIsMappable(dataset.points[0]!, dataset)).toBe(true);
    expect(pointIsMappable(dataset.points[1]!, dataset)).toBe(false);
    expect(pointIsMappable(dataset.points[3]!, dataset)).toBe(false);
    expect(calculateBounds([{ lat: -1, lng: 2 }, { lat: 3, lng: 4 }])).toEqual([2, -1, 4, 3]);
  });
  it("round-trips supported URL state and creates OSM links", () => {
    const state = parseUrlState("/?q=ramen&category=asian&sort=name&point=a&filter=open&filter=top&filter=open");
    expect(state).toEqual({ query: "ramen", category: "asian", sort: "name", point: "a", filters: ["open", "top"] });
    expect(applyUrlState(new URL("https://example.test/?campaign=spring"), state).search).toContain("campaign=spring");
    expect(applyUrlState(new URL("https://example.test/"), state).searchParams.getAll("filter")).toEqual(["open", "top"]);
    expect(openStreetMapUrl(-37.81, 144.96)).toBe("https://www.openstreetmap.org/?mlat=-37.81&mlon=144.96#map=17/-37.81/144.96");
  });
  it("filters and sorts 5,000 points under the 100 ms p95 budget", () => {
    const points = Array.from({ length: 5000 }, (_, index) => ({ ...dataset.points[0]!, id: `perf-${index}`, title: `Place ${index}`, rank: index + 1 }));
    const indexed = indexPoints(points); const samples: number[] = [];
    for (let run = 0; run < 30; run++) { const start = performance.now(); filterAndSortPoints(indexed, dataset.categories, run % 2 ? "Place 4" : "", "japanese", run % 3 ? "ranking" : "name"); samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b); expect(samples[Math.floor(samples.length * .95)]).toBeLessThan(100);
  });
});
