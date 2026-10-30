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

// Douglas–Peucker on [x, y] points (pixels): keeps the corners of a hand-drawn stroke and drops the jitter between them.
export function simplifyPath(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  let imax = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
    if (d > dmax) { dmax = d; imax = i; }
  }
  if (dmax <= tol) return [a, b];
  return simplifyPath(pts.slice(0, imax + 1), tol).slice(0, -1).concat(simplifyPath(pts.slice(imax), tol));
}

// Standard survey shapes as unit outlines (x east, y north, within ±1). First vertex becomes the launch base.
const ngon = (n, r = 1, a0 = 0) => Array.from({ length: n }, (_, i) => [r * Math.cos(a0 + 2 * Math.PI * i / n), r * Math.sin(a0 + 2 * Math.PI * i / n)]);
export const SHAPES = {
  square: { label: 'Square', pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
  wide: { label: 'Wide rectangle', pts: [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]] },
  strip: { label: 'Long strip (road, river)', pts: [[-1, -0.2], [1, -0.2], [1, 0.2], [-1, 0.2]] },
  triangle: { label: 'Triangle', pts: ngon(3, 1, -Math.PI / 2) },
  hexagon: { label: 'Hexagon', pts: ngon(6) },
  circle: { label: 'Circle', pts: ngon(24) },
  lshape: { label: 'L-shape', pts: [[-1, -1], [1, -1], [1, -0.2], [-0.2, -0.2], [-0.2, 1], [-1, 1]] },
};
// A shape `sizeM` metres across, centred on [lat, lng]; returns [[lat, lng], ...].
export function shapePoly(key, [lat, lng], sizeM) {
  const k = SHAPES[key], half = sizeM / 2, mLat = 111320, mLng = 111320 * Math.cos(lat * Math.PI / 180);
  return k.pts.map(([x, y]) => [lat + y * half / mLat, lng + x * half / mLng]);
}
