import type { StyleSpecification } from "maplibre-gl";

export const DEFAULT_HERITAGE_STYLE_URL = "/map-assets/heritage-light-v0.2.0.json";

export async function loadHeritageLightStyle(url = DEFAULT_HERITAGE_STYLE_URL): Promise<StyleSpecification> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Map style request failed with ${response.status}`);
  const style = await response.json() as StyleSpecification;
  const origin = new URL(response.url).origin;
  if (style.glyphs) style.glyphs = style.glyphs.startsWith("/") ? `${origin}${style.glyphs}` : style.glyphs;
  if (style.sprite && typeof style.sprite === "string") style.sprite = new URL(style.sprite, origin).href;
  for (const source of Object.values(style.sources)) if ("url" in source && source.url) source.url = new URL(source.url, origin).href;
  return style;
}
