import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FreeMapConfig, FreeMapDataset, FreeMapSort } from "../core";
import "../element";
import type { FreeMapExplorerPublicElement } from "../element/explorer";

export interface FreeMapExplorerProps {
  dataset?: FreeMapDataset;
  config?: FreeMapConfig;
  src?: string;
  query?: string;
  category?: string;
  sort?: FreeMapSort;
  selectedId?: string | null;
  compact?: boolean;
  loading?: "visible" | "eager";
  className?: string;
  onReady?: (detail: unknown) => void;
  onSelect?: (detail: { id: string | null; point: unknown }) => void;
  onFilterChange?: (detail: unknown) => void;
  onError?: (detail: unknown) => void;
}

export interface FreeMapExplorerHandle { reload(): void; select(id: string | null): void; fitAll(): void; resetView(): void }

export const FreeMapExplorer = forwardRef<FreeMapExplorerHandle, FreeMapExplorerProps>(function FreeMapExplorer(props, forwardedRef) {
  const ref = useRef<FreeMapExplorerPublicElement>(null);
  useImperativeHandle(forwardedRef, () => ({ reload: () => void ref.current?.reload(), select: (id) => ref.current?.select(id), fitAll: () => ref.current?.fitAll(), resetView: () => ref.current?.resetView() }), []);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset = props.dataset;
    node.config = props.config ?? {};
    node.src = props.src ?? "";
    node.query = props.query ?? "";
    node.category = props.category ?? "all";
    node.sort = props.sort ?? "ranking";
    node.selectedId = props.selectedId ?? null;
    node.compact = props.compact ?? false;
    node.loading = props.loading ?? "visible";
  }, [props.dataset, props.config, props.src, props.query, props.category, props.sort, props.selectedId, props.compact, props.loading]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const bindings: Array<[string, EventListener]> = [
      ["free-map-ready", ((event: CustomEvent) => props.onReady?.(event.detail)) as EventListener],
      ["free-map-select", ((event: CustomEvent) => props.onSelect?.(event.detail)) as EventListener],
      ["free-map-filter-change", ((event: CustomEvent) => props.onFilterChange?.(event.detail)) as EventListener],
      ["free-map-error", ((event: CustomEvent) => props.onError?.(event.detail)) as EventListener],
    ];
    for (const [name, listener] of bindings) node.addEventListener(name, listener);
    return () => { for (const [name, listener] of bindings) node.removeEventListener(name, listener); };
  }, [props.onReady, props.onSelect, props.onFilterChange, props.onError]);
  return createElement("free-map-explorer", { ref, class: props.className });
});
