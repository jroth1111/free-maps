import { FreeMapExplorerElement } from "./explorer";
import { FreeMapSurfaceElement } from "./surface";

export function defineFreeMapElements() {
  if (!customElements.get("free-map-explorer")) customElements.define("free-map-explorer", FreeMapExplorerElement);
  if (!customElements.get("free-map-surface")) customElements.define("free-map-surface", FreeMapSurfaceElement);
}

defineFreeMapElements();

export { FreeMapExplorerElement, FreeMapSurfaceElement };
export { heritageLightStyles } from "./styles";
