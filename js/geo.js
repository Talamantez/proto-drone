// Coordinate text helpers for map navigation. Pure: no DOM, no Leaflet.
const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Degrees, minutes, seconds with an optional hemisphere letter: 40°45'03"N, 14 29 10 E, -33.8688
function parseAngle(s) {
  const m = s.trim().match(/^([NSEWnsew])?\s*(-?\d+(?:\.\d+)?)\s*(?:[°d\s]\s*(\d+(?:\.\d+)?)\s*(?:['′m\s]\s*(\d+(?:\.\d+)?)\s*(?:["″s]+)?)?)?\s*([NSEWnsew])?$/);
  if (!m) return null;
  const hemi = (m[1] || m[5] || '').toUpperCase();
  const deg = Math.abs(+m[2]) + (m[3] ? +m[3] / 60 : 0) + (m[4] ? +m[4] / 3600 : 0);
  const neg = m[2].startsWith('-') || hemi === 'S' || hemi === 'W';
  return { v: neg ? -deg : deg, hemi };
}

// "40.7508, 14.4869", "40.7508 14.4869", Google-style "@40.75,14.48,17z", or DMS "40°45'03\"N 14°29'10\"E". Returns { lat, lng } or null.
export function parseLatLng(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^@/, '').replace(/,\s*\d+(\.\d+)?z.*$/i, '');
  const g = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);   // a pasted Google Maps data URL fragment
  if (g) t = `${g[1]},${g[2]}`;
  let parts = t.split(/\s*[,;]\s*/);
  if (parts.length !== 2) {
    const dms = t.match(/^(.+?[NSns])\s+(.+[EWew])$/);                // hemisphere letters split the pair without a comma
    parts = dms ? [dms[1], dms[2]] : t.split(/\s+/);
  }
  if (parts.length !== 2) return null;
  const a = parseAngle(parts[0]), b = parseAngle(parts[1]);
  if (!a || !b) return null;
  let lat = a.v, lng = b.v;
  if ((a.hemi === 'E' || a.hemi === 'W') && (b.hemi === 'N' || b.hemi === 'S')) [lat, lng] = [b.v, a.v];
  return inRange(lat, lng) ? { lat, lng } : null;
}

export const formatCoord = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
export const formatHash = ({ lat, lng, zoom }) => `#map=${+zoom.toFixed(1)}/${lat.toFixed(5)}/${lng.toFixed(5)}`;

// "#map=17/40.75080/14.48690" -> { zoom, lat, lng }, or null for anything else.
export function parseHash(h) {
  const m = String(h || '').match(/^#?map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const zoom = +m[1], lat = +m[2], lng = +m[3];
  return inRange(lat, lng) && zoom >= 0 && zoom <= 22 ? { lat, lng, zoom } : null;
}
