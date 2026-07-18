import type { FreeMapDataset, FreeMapPoint, RenderablePoint } from "./types";

export const MELBOURNE_CBD = { lat: -37.8136, lng: 144.9631 } as const;

export function pointIsMappable(point: FreeMapPoint, dataset: FreeMapDataset): point is FreeMapPoint & { position: { lat: number; lng: number } } {
  const position = point.position;
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return false;
  const bounds = dataset.validBounds;
  return !bounds || (position.lng >= bounds[0] && position.lat >= bounds[1] && position.lng <= bounds[2] && position.lat <= bounds[3]);
}

export function toRenderablePoints(points: FreeMapPoint[], dataset: FreeMapDataset, selectedId: string | null, validate: (point: FreeMapPoint, dataset: FreeMapDataset) => boolean = pointIsMappable): RenderablePoint[] {
  return points.filter((point) => validate(point, dataset)).map((point) => ({ id: point.id, title: point.title, lat: point.position!.lat, lng: point.position!.lng, selected: point.id === selectedId }));
}

export function calculateBounds(points: Array<{ lat: number; lng: number }>): [number, number, number, number] | null {
  if (!points.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const point of points) { west = Math.min(west, point.lng); south = Math.min(south, point.lat); east = Math.max(east, point.lng); north = Math.max(north, point.lat); }
  return [west, south, east, north];
}
