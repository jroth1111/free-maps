import type { FreeMapExplorerElement } from "../src/element";
import { options, register } from "./shared";

register();
document.querySelector<FreeMapExplorerElement>("free-map-explorer")!.options = options;
