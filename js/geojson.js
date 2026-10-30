// GeoJSON parsing helpers. Pure.
function geoPolys(g, name, out) {
  if (!g) return;
  if (g.type === 'FeatureCollection') (g.features || []).forEach(f => geoPolys(f, name, out));
  else if (g.type === 'Feature') geoPolys(g.geometry, (g.properties && g.properties.name) || name, out);
  else if (g.type === 'GeometryCollection') (g.geometries || []).forEach(x => geoPolys(x, name, out));
  else if (g.type === 'Polygon' && g.coordinates[0]) out.push({ name, mode: 'area', ring: g.coordinates[0] });
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(c => c[0] && out.push({ name, mode: 'area', ring: c[0] }));
  else if (g.type === 'LineString' && g.coordinates.length === 2) out.push({ name, mode: 'facade', ring: g.coordinates });
}

export const MAX_AREAS = 50, MAX_POINTS = 200;
const ll = p => [+p[1].toFixed(6), +p[0].toFixed(6)];

// Library entries ({ name, pts: [lat, lng][], mode }) -> FeatureCollection. Walls become 2-point LineStrings.
export function toGeoJSON(list) {
  return {
    type: 'FeatureCollection',
    features: list.map(e => ({
      type: 'Feature', properties: { name: e.name, mode: e.mode },
      geometry: e.mode === 'facade' ? { type: 'LineString', coordinates: e.pts.map(ll) } : { type: 'Polygon', coordinates: [[...e.pts.map(ll), ll(e.pts[0])]] },
    })),
  };
}

// GeoJSON object -> { areas: [{ name, mode, pts: [lat, lng][] }], skipped }. Holes and extra MultiPolygon rings are ignored.
export function parseGeoJSON(obj, baseName = 'Imported') {
  const raw = []; geoPolys(obj, baseName, raw);
  const areas = []; let skipped = Math.max(0, raw.length - MAX_AREAS);
  raw.slice(0, MAX_AREAS).forEach((r, i) => {
    const pts = r.ring.map(c => [+c[1], +c[0]]).filter(p => isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
    const last = pts[pts.length - 1];
    if (r.mode === 'area' && pts.length > 1 && pts[0][0] === last[0] && pts[0][1] === last[1]) pts.pop();
    if (pts.length < (r.mode === 'facade' ? 2 : 3) || pts.length > MAX_POINTS) { skipped++; return; }
    areas.push({ name: raw.length > 1 ? `${r.name} ${i + 1}` : r.name, mode: r.mode, pts });
  });
  return { areas, skipped };
}
