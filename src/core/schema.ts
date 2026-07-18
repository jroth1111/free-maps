import type { FreeMapCategory, FreeMapDataset, FreeMapPoint } from "./types";

export class FreeMapSchemaError extends Error {
  constructor(message: string, readonly path = "dataset") {
    super(`${path}: ${message}`);
    this.name = "FreeMapSchemaError";
  }
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validateCategory(value: unknown, index: number): asserts value is FreeMapCategory {
  if (!value || typeof value !== "object") throw new FreeMapSchemaError("must be an object", `categories[${index}]`);
  const row = value as Record<string, unknown>;
  if (!text(row.id)) throw new FreeMapSchemaError("id must be a non-empty string", `categories[${index}].id`);
  if (!text(row.label)) throw new FreeMapSchemaError("label must be a non-empty string", `categories[${index}].label`);
  if (row.memberCategoryIds !== undefined && (!Array.isArray(row.memberCategoryIds) || !row.memberCategoryIds.every(text))) {
    throw new FreeMapSchemaError("must be an array of category ids", `categories[${index}].memberCategoryIds`);
  }
}

function validatePoint(value: unknown, index: number): asserts value is FreeMapPoint {
  if (!value || typeof value !== "object") throw new FreeMapSchemaError("must be an object", `points[${index}]`);
  const row = value as Record<string, unknown>;
  if (!text(row.id)) throw new FreeMapSchemaError("id must be a non-empty string", `points[${index}].id`);
  if (!text(row.title)) throw new FreeMapSchemaError("title must be a non-empty string", `points[${index}].title`);
  if (!Array.isArray(row.categoryIds) || !row.categoryIds.every(text)) throw new FreeMapSchemaError("must be an array of category ids", `points[${index}].categoryIds`);
  if (row.position !== undefined) {
    const position = row.position as Record<string, unknown>;
    if (!position || !finite(position.lat) || !finite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
      throw new FreeMapSchemaError("must contain valid latitude and longitude", `points[${index}].position`);
    }
  }
}

export function parseFreeMapDataset(value: unknown): FreeMapDataset {
  if (!value || typeof value !== "object") throw new FreeMapSchemaError("must be an object");
  const dataset = value as Record<string, unknown>;
  if (dataset.schemaVersion !== 1) throw new FreeMapSchemaError("schemaVersion must be 1", "schemaVersion");
  if (!text(dataset.id) || !text(dataset.label)) throw new FreeMapSchemaError("id and label must be non-empty strings");
  const center = dataset.center as Record<string, unknown> | undefined;
  if (!center || !finite(center.lat) || !finite(center.lng)) throw new FreeMapSchemaError("center must contain finite lat/lng", "center");
  if (!finite(dataset.defaultZoom) || dataset.defaultZoom < 0 || dataset.defaultZoom > 24) throw new FreeMapSchemaError("defaultZoom must be between 0 and 24", "defaultZoom");
  if (!Array.isArray(dataset.categories) || !Array.isArray(dataset.points)) throw new FreeMapSchemaError("categories and points must be arrays");
  dataset.categories.forEach(validateCategory);
  dataset.points.forEach(validatePoint);

  const categoryIds = new Set((dataset.categories as FreeMapCategory[]).map((row) => row.id));
  const pointIds = new Set<string>();
  for (const [index, point] of (dataset.points as FreeMapPoint[]).entries()) {
    if (pointIds.has(point.id)) throw new FreeMapSchemaError("duplicate point id", `points[${index}].id`);
    pointIds.add(point.id);
    for (const categoryId of point.categoryIds) if (!categoryIds.has(categoryId)) throw new FreeMapSchemaError(`unknown category ${categoryId}`, `points[${index}].categoryIds`);
  }
  const result = dataset as unknown as FreeMapDataset;
  validateCategoryGraph(result.categories);
  return result;
}

export function validateCategoryGraph(categories: FreeMapCategory[]): void {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visit = (id: string, path: string[]) => {
    if (path.includes(id)) throw new FreeMapSchemaError(`category cycle ${[...path, id].join(" -> ")}`, "categories");
    const category = byId.get(id);
    if (!category) throw new FreeMapSchemaError(`unknown category ${id}`, "categories");
    for (const member of category.memberCategoryIds ?? []) visit(member, [...path, id]);
    if (category.parentId && !byId.has(category.parentId)) throw new FreeMapSchemaError(`unknown parent ${category.parentId}`, "categories");
  };
  for (const id of byId.keys()) visit(id, []);
}
