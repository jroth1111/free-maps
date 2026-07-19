export interface FreeMapDataset {
  schemaVersion: 1;
  id: string;
  label: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  validBounds?: [west: number, south: number, east: number, north: number];
  categories: FreeMapCategory[];
  points: FreeMapPoint[];
}

export interface FreeMapCategory {
  id: string;
  label: string;
  parentId?: string;
  memberCategoryIds?: string[];
}

export interface FreeMapPoint {
  id: string;
  groupId?: string;
  title: string;
  slug?: string;
  summary?: string;
  area?: string;
  categoryIds: string[];
  primaryCategoryId?: string;
  position?: { lat: number; lng: number };
  rank?: number;
  score?: number | null;
  priceLabel?: string;
  branchLabel?: string;
  detailsUrl?: string;
  metadata?: Record<string, unknown>;
}

export type FreeMapSort = "ranking" | "name" | "score";
export type FreeMapLayout = "responsive" | "stack";

export interface FreeMapQuickFilter {
  id: string;
  label: string;
  matches(point: FreeMapPoint, dataset: FreeMapDataset): boolean;
}

export interface FreeMapLabels {
  explorerTitle?: string;
  searchPlaceholder?: string;
  categoryLabel?: string;
  sortLabel?: string;
  allCategories?: string;
  showAll?: string;
  resetView?: string;
  empty?: string;
  mapUnavailable?: string;
  retry?: string;
  details?: string;
}

export interface FreeMapElementOptions {
  labels?: FreeMapLabels;
  formatScore?: (point: FreeMapPoint) => string;
  formatMeta?: (point: FreeMapPoint) => string;
  detailLinkBuilder?: (point: FreeMapPoint) => string | undefined;
  externalMapLinkBuilder?: (point: FreeMapPoint) => string | undefined;
  validPoint?: (point: FreeMapPoint, dataset: FreeMapDataset) => boolean;
  quickFilters?: FreeMapQuickFilter[];
  searchArea?: boolean;
}

export interface RenderablePoint {
  id: string;
  title: string;
  lat: number;
  lng: number;
  selected: boolean;
}

export interface MapRendererState {
  dataset: FreeMapDataset;
  points: RenderablePoint[];
  selectedId: string | null;
  options: FreeMapElementOptions;
}

export type MapViewportCause = "user" | "programmatic";

export interface MapViewportDetail {
  bounds: [west: number, south: number, east: number, north: number];
  center: { lat: number; lng: number };
  zoom: number;
  cause: MapViewportCause;
}

export interface MapRendererMountOptions {
  onViewportChange?: (detail: MapViewportDetail) => void;
}

export interface MapRenderer {
  mount(container: HTMLElement, state: MapRendererState, onSelect: (id: string) => void, options?: MapRendererMountOptions): void | Promise<void>;
  update(state: MapRendererState): void | Promise<void>;
  fitBounds(bounds: [west: number, south: number, east: number, north: number]): void;
  resetView(): void;
  destroy(): void;
}

export type MapRendererFactory = () => Promise<MapRenderer>;

export type FreeMapActivation = "visible" | "eager" | "manual";

export interface FreeMapErrorDetail {
  code: "dataset-fetch" | "dataset-schema" | "renderer-configuration" | "renderer-loading" | "renderer-runtime";
  message: string;
  cause?: unknown;
  retryable: boolean;
}

export interface FreeMapFilterChangeDetail {
  query: string;
  category: string;
  sort: FreeMapSort;
  filters: string[];
  count: number;
}

export type FreeMapSearchAreaDetail = MapViewportDetail;
