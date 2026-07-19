import type { FreeMapCategory, FreeMapDataset, FreeMapPoint } from "../src/core";

const categories: FreeMapCategory[] = [
  { id: "food", label: "Food" },
  { id: "east-asian", label: "East Asian", parentId: "food", memberCategoryIds: ["japanese", "korean"] },
  { id: "japanese", label: "Japanese", parentId: "east-asian" },
  { id: "korean", label: "Korean", parentId: "east-asian" },
  { id: "mediterranean", label: "Mediterranean", parentId: "food", memberCategoryIds: ["greek", "italian"] },
  { id: "greek", label: "Greek", parentId: "mediterranean" },
  { id: "italian", label: "Italian", parentId: "mediterranean" },
  { id: "fusion", label: "Fusion", parentId: "food", memberCategoryIds: ["japanese", "italian"] },
  { id: "culture", label: "Culture" },
  { id: "gallery", label: "Gallery", parentId: "culture" },
];

function random(seed: number) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
const names = ["Lantern", "Paper Crane", "Golden Fig", "Night Market", "Little Atlas", "Copper Kettle", "Sunday Table", "Blue Wren", "Olive & Rice", "Civic Garden"];
const areas = ["Melbourne CBD", "Carlton", "Fitzroy", "Richmond", "Southbank", "Docklands", "Brunswick", "North Melbourne"];
const categoryCycle = ["japanese", "korean", "greek", "italian", "fusion", "gallery"];

export function createDemoDataset(size: 250 | 5000): FreeMapDataset {
  const rng = random(20260717 + size);
  const points: FreeMapPoint[] = [];
  for (let index = 0; index < size; index++) {
    const group = index < 12 ? `branch-${index % 4}` : undefined;
    const category = categoryCycle[index % categoryCycle.length]!;
    const missing = index === 7 || index === size - 2;
    const outlier = index === size - 1;
    points.push({
      id: `demo-${size}-${index + 1}`,
      ...(group ? { groupId: group } : {}),
      title: `${names[index % names.length]} ${String(index + 1).padStart(3, "0")}`,
      slug: `fictional-place-${index + 1}`,
      summary: `A fictional ${category.replace("-", " ")} place created for the Free Maps demo.`,
      area: areas[index % areas.length],
      categoryIds: category === "fusion" ? ["fusion", "japanese", "italian"] : [category],
      primaryCategoryId: category,
      ...(!missing ? { position: outlier ? { lat: -33.8688, lng: 151.2093 } : { lat: -37.8136 + (rng() - .5) * .18, lng: 144.9631 + (rng() - .5) * .24 } } : {}),
      ...(index % 9 === 0 ? {} : { rank: index % 120 + 1 }),
      score: index % 13 === 0 ? null : Number((62 + rng() * 36).toFixed(1)),
      priceLabel: "$".repeat(index % 3 + 1),
      ...(group ? { branchLabel: `Branch ${index % 3 + 1}` } : {}),
      detailsUrl: `/demo/place/${index + 1}`,
      metadata: { fictional: true, generatedIndex: index, openNow: index % 3 !== 0, topRated: index % 13 !== 0 && index % 5 === 0 },
    });
  }
  return { schemaVersion: 1, id: `fictional-melbourne-${size}`, label: `Fictional Melbourne · ${size.toLocaleString()} places`, center: { lat: -37.8136, lng: 144.9631 }, defaultZoom: 12, validBounds: [143.8, -38.8, 146.3, -37.1], categories, points };
}
