import { FreeMapExplorerElement } from "./explorer";
import { FreeMapSurfaceElement } from "./surface";
import type { MapRendererFactory } from "../core";
import { setRegisteredRenderer } from "./controller";

export function defineFreeMapElements(options: { renderer?: MapRendererFactory | null } = {}) {
  if ("renderer" in options) setRegisteredRenderer(options.renderer ?? null);
  if (!customElements.get("free-map-explorer")) customElements.define("free-map-explorer", FreeMapExplorerElement);
  if (!customElements.get("free-map-surface")) customElements.define("free-map-surface", FreeMapSurfaceElement);
}

export { FreeMapExplorerElement, FreeMapSurfaceElement };
export { heritageLightStyles } from "./styles";
