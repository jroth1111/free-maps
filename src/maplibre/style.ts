import type { StyleSpecification } from "maplibre-gl";

const sharedStyles = new Map<string, Promise<StyleSpecification>>();

const cloneStyle = (style: StyleSpecification): StyleSpecification => structuredClone(style);

export async function loadMapStyle(url: string, baseUrl = location.href): Promise<StyleSpecification> {
  const absolute = new URL(url, baseUrl).href;
  let pending = sharedStyles.get(absolute);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(absolute, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Map style request failed with ${response.status}`);
      const style = await response.json() as StyleSpecification;
      const origin = new URL(response.url || absolute).origin;
      if (style.glyphs) style.glyphs = style.glyphs.startsWith("/") ? `${origin}${style.glyphs}` : new URL(style.glyphs, origin).href;
      if (style.sprite && typeof style.sprite === "string") style.sprite = new URL(style.sprite, origin).href;
      for (const source of Object.values(style.sources)) if ("url" in source && source.url) source.url = new URL(source.url, origin).href;
      return style;
    })();
    sharedStyles.set(absolute, pending);
    void pending.catch(() => { if (sharedStyles.get(absolute) === pending) sharedStyles.delete(absolute); });
  }
  return cloneStyle(await pending);
}

export function clearSharedMapStylesForTests(): void {
  sharedStyles.clear();
}
