import type { FreeMapCategory, FreeMapPoint, FreeMapSort } from "./types";

export const normalizeSearchText = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface IndexedFreeMapPoint { point: FreeMapPoint; searchText: string }

export function indexPoints(points: FreeMapPoint[]): IndexedFreeMapPoint[] {
  return points.map((point) => ({
    point,
    searchText: normalizeSearchText([point.title, point.summary, point.area, point.branchLabel, point.priceLabel].filter(Boolean).join(" ")),
  }));
}

export function resolveCategoryMembers(categories: FreeMapCategory[], id: string): Set<string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const result = new Set<string>();
  const active = new Set<string>();
  const visit = (current: string) => {
    if (active.has(current)) throw new Error(`Category cycle detected at ${current}`);
    const category = byId.get(current);
    if (!category) return;
    active.add(current);
    result.add(current);
    for (const member of category.memberCategoryIds ?? []) visit(member);
    for (const child of categories) if (child.parentId === current) visit(child.id);
    active.delete(current);
  };
  visit(id);
  return result;
}

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const nullableDesc = (a: number | null | undefined, b: number | null | undefined) => {
  const aMissing = a == null || !Number.isFinite(a);
  const bMissing = b == null || !Number.isFinite(b);
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (aMissing) return 0;
  return b! - a!;
};

export function filterAndSortPoints(indexed: IndexedFreeMapPoint[], categories: FreeMapCategory[], query = "", category = "all", sort: FreeMapSort = "ranking"): FreeMapPoint[] {
  const q = normalizeSearchText(query);
  const members = category === "all" ? null : resolveCategoryMembers(categories, category);
  const rows = indexed.filter(({ point, searchText }) => (!q || searchText.includes(q)) && (!members || point.categoryIds.some((id) => members.has(id))));
  rows.sort((left, right) => {
    const a = left.point;
    const b = right.point;
    let primary = 0;
    if (sort === "name") primary = compareText(a.title, b.title);
    else if (sort === "score") primary = nullableDesc(a.score, b.score);
    else {
      const aMissing = a.rank == null || !Number.isFinite(a.rank);
      const bMissing = b.rank == null || !Number.isFinite(b.rank);
      primary = aMissing !== bMissing ? (aMissing ? 1 : -1) : aMissing ? nullableDesc(a.score, b.score) : a.rank! - b.rank!;
    }
    return primary || compareText(a.title, b.title) || compareText(a.id, b.id);
  });
  return rows.map(({ point }) => point);
}
