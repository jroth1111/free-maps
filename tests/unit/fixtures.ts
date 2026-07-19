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
