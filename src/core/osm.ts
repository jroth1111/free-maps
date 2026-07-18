export function openStreetMapUrl(lat: number, lng: number, zoom = 17): string {
  if (![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new TypeError("Invalid map coordinates");
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=${Math.max(0, Math.min(19, zoom))}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
}
