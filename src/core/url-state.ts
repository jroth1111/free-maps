import type { FreeMapSort } from "./types";

export interface FreeMapUrlState { query: string; category: string; sort: FreeMapSort; point: string | null }

export function parseUrlState(input: string | URL | URLSearchParams): FreeMapUrlState {
  const params = input instanceof URL ? input.searchParams : input instanceof URLSearchParams ? input : new URL(input, "https://free.maps").searchParams;
  const sortValue = params.get("sort");
  return { query: params.get("q") ?? "", category: params.get("category") ?? "all", sort: sortValue === "name" || sortValue === "score" ? sortValue : "ranking", point: params.get("point") };
}

export function applyUrlState(url: URL, state: FreeMapUrlState): URL {
  const next = new URL(url);
  const values: Array<[string, string | null]> = [["q", state.query || null], ["category", state.category === "all" ? null : state.category], ["sort", state.sort === "ranking" ? null : state.sort], ["point", state.point]];
  for (const [key, value] of values) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  return next;
}
