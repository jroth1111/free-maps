import { describe, expect, it } from "vitest";
import { applyUrlState, calculateBounds, filterAndSortPoints, indexPoints, normalizeSearchText, openStreetMapUrl, parseFreeMapDataset, parseUrlState, pointIsMappable, resolveCategoryMembers } from "../../src/core";
import type { FreeMapDataset } from "../../src/core";

export const dataset: FreeMapDataset = {
  schemaVersion: 1,
  id: "test",
  label: "Test places",
  center: { lat: -37.8136, lng: 144.9631 },
  defaultZoom: 12,
  validBounds: [144, -39, 146, -37],
  categories: [
    { id: "all-food", label: "All food", memberCategoryIds: ["asian"] },
    { id: "asian", label: "Asian", memberCategoryIds: ["japanese"] },
    { id: "japanese", label: "Japanese" },
  ],
  points: [
    { id: "a", title: "Café Áster", area: "CBD", categoryIds: ["japanese"], position: { lat: -37.81, lng: 144.96 }, rank: 2, score: 90 },
    { id: "b", title: "Bravo", categoryIds: ["japanese"], rank: 1, score: null },
    { id: "c", title: "Charlie", categoryIds: ["japanese"], score: 95 },
    { id: "d", title: "Distant", categoryIds: ["japanese"], position: { lat: -33.86, lng: 151.2 } },
  ],
};

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
  it("keeps missing and out-of-bounds points out of map bounds", () => {
    expect(pointIsMappable(dataset.points[0]!, dataset)).toBe(true);
    expect(pointIsMappable(dataset.points[1]!, dataset)).toBe(false);
    expect(pointIsMappable(dataset.points[3]!, dataset)).toBe(false);
    expect(calculateBounds([{ lat: -1, lng: 2 }, { lat: 3, lng: 4 }])).toEqual([2, -1, 4, 3]);
  });
  it("round-trips supported URL state and creates OSM links", () => {
    const state = parseUrlState("/?q=ramen&category=asian&sort=name&point=a");
    expect(state).toEqual({ query: "ramen", category: "asian", sort: "name", point: "a" });
    expect(applyUrlState(new URL("https://example.test/?view=full"), state).search).toContain("view=full");
    expect(openStreetMapUrl(-37.81, 144.96)).toBe("https://www.openstreetmap.org/?mlat=-37.81&mlon=144.96#map=17/-37.81/144.96");
  });
});
