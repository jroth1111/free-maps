import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FreeMapActivation, FreeMapDataset, FreeMapElementOptions, FreeMapFilterChangeDetail, FreeMapLayout, FreeMapSearchAreaDetail, FreeMapSort, MapRendererFactory } from "../core";
import { defineFreeMapElements, type FreeMapExplorerElement } from "../element";

export interface FreeMapExplorerProps {
  data?: FreeMapDataset | null;
  renderer: MapRendererFactory;
  options?: FreeMapElementOptions;
  src?: string | null;
  query?: string;
  category?: string;
  sort?: FreeMapSort;
  selectedId?: string | null;
  activeFilters?: string[];
  layout?: FreeMapLayout;
  compact?: boolean;
  activation?: FreeMapActivation;
  className?: string;
  onReady?: (detail: unknown) => void;
  onSelect?: (detail: { id: string | null; point: unknown }) => void;
  onFilterChange?: (detail: FreeMapFilterChangeDetail) => void;
  onSearchArea?: (detail: FreeMapSearchAreaDetail) => void;
  onError?: (detail: unknown) => void;
}
export interface FreeMapExplorerHandle { activate(): Promise<void>; reload(): Promise<void>; select(id: string | null): void; fitAll(): void; resetView(): void }

export const FreeMapExplorer = forwardRef<FreeMapExplorerHandle, FreeMapExplorerProps>(function FreeMapExplorer(props, forwardedRef) {
  const ref = useRef<FreeMapExplorerElement>(null);
  useEffect(() => { defineFreeMapElements(); }, []);
  useImperativeHandle(forwardedRef, () => ({ activate: () => ref.current?.activate() ?? Promise.resolve(), reload: () => ref.current?.reload() ?? Promise.resolve(), select: (id) => ref.current?.select(id), fitAll: () => ref.current?.fitAll(), resetView: () => ref.current?.resetView() }), []);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    node.data = props.data ?? null; node.renderer = props.renderer; node.options = props.options ?? {}; node.src = props.src ?? null; node.query = props.query ?? ""; node.category = props.category ?? "all"; node.sort = props.sort ?? "ranking"; node.activeFilters = props.activeFilters ?? []; node.selectedId = props.selectedId ?? null; node.layout = props.layout ?? "responsive"; node.compact = props.compact ?? false; node.activation = props.activation ?? "visible";
  }, [props.data, props.renderer, props.options, props.src, props.query, props.category, props.sort, props.activeFilters, props.selectedId, props.layout, props.compact, props.activation]);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const bindings: Array<[string, EventListener]> = [["free-map-ready", ((event: CustomEvent) => props.onReady?.(event.detail)) as EventListener], ["free-map-select", ((event: CustomEvent) => props.onSelect?.(event.detail)) as EventListener], ["free-map-filter-change", ((event: CustomEvent) => props.onFilterChange?.(event.detail)) as EventListener], ["free-map-search-area", ((event: CustomEvent) => props.onSearchArea?.(event.detail)) as EventListener], ["free-map-error", ((event: CustomEvent) => props.onError?.(event.detail)) as EventListener]];
    for (const [name, listener] of bindings) node.addEventListener(name, listener);
    return () => { for (const [name, listener] of bindings) node.removeEventListener(name, listener); };
  }, [props.onReady, props.onSelect, props.onFilterChange, props.onSearchArea, props.onError]);
  return createElement("free-map-explorer", { ref, className: props.className });
});
