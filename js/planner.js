// Capture planner and survey path planning in a local metre frame. Pure: no DOM, no Leaflet.
import { BLUR_PX, CAM, LAUNCH_OFF, MIN_AGL, M_LAT, SHUTTER } from './constants.js';

// Photo geometry from target GSD. Camera is landscape; area mode flies nadir, facade mode flies horizontal rows.
export function cap(p) {
  const g = p.gsd / 1000, fac = p.mode === 'facade';
  const stand = g * CAM.focal * CAM.w / CAM.sensW, fw = g * CAM.w, fh = g * CAM.h;
  const lineSp = Math.max(1, (fac ? fh : fw) * (1 - p.side / 100));   // new ground between flight lines / rows
  const photoSp = Math.max(0.5, (fac ? fw : fh) * (1 - p.fwd / 100)); // distance between exposures
  const vTrig = photoSp / CAM.minTrig, vBlur = BLUR_PX * g * SHUTTER;
  return { g, stand, fw, fh, lineSp, photoSp, vTrig, vBlur, vMax: Math.min(vTrig, vBlur) };
}
export function frame(poly) {
  const lat0 = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const lng0 = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const mLng = M_LAT * Math.cos(lat0 * Math.PI / 180);
  return {
    toXY: ([la, ln]) => [(ln - lng0) * mLng, (la - lat0) * M_LAT],
    toLL: ([x, y]) => [lat0 + y / M_LAT, lng0 + x / mLng],
  };
}
export const rot = ([x, y], th) => [x * Math.cos(th) + y * Math.sin(th), -x * Math.sin(th) + y * Math.cos(th)];
export const unrot = ([u, v], th) => [u * Math.cos(th) - v * Math.sin(th), u * Math.sin(th) + v * Math.cos(th)];
export const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
export const hypH = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const altOf = d => d.pos[2] ?? d.alt;
export function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Vertical wall: m.poly = [A, B] along the wall foot, drawn so the wall is on the left of A→B.
// Horizontal rows at constant standoff (uniform GSD); each drone gets a contiguous height band.
export function planFacade(m) {
  const { n, wallH: H } = m.params, c = cap(m.params), cs = c.lineSp;
  const f = frame(m.poly), [A, B] = m.poly.map(f.toXY);
  const L = Math.max(1, hyp(A, B)), t = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nr = [t[1], -t[0]];
  const cols = Math.max(1, Math.ceil(L / cs)), rows = Math.max(1, Math.ceil(H / cs));
  const at = (u, z) => [A[0] + t[0] * u + nr[0] * c.stand, A[1] + t[1] * u + nr[1] * c.stand, z];
  const base = [A[0] + nr[0] * (c.stand + LAUNCH_OFF), A[1] + nr[1] * (c.stand + LAUNCH_OFF), 0];
  const zf = r => Math.max(MIN_AGL, (r + 0.5) * cs);
  const groups = Array.from({ length: n }, () => []);
  for (let r = 0; r < rows; r++) groups[Math.min(n - 1, Math.floor(r * n / rows))].push(r);
  const paths = groups.map(g => {
    const pts = [base];
    if (g.length) {
      pts.push([base[0], base[1], zf(g[0])]);   // climb at the launch point, then approach the wall
      g.forEach((r, k) => { const [u0, u1] = k % 2 ? [L, 0] : [0, L]; pts.push(at(u0, zf(r)), at(u1, zf(r))); });
      pts.push([base[0], base[1], zf(g[g.length - 1])], base);
    }
    return pts;
  });
  const cells = Array.from({ length: rows * cols }, (_, ci) => ({ c: [((ci % cols) + 0.5) * cs, (Math.floor(ci / cols) + 0.5) * cs] }));
  return { f, th: 0, xy: [A, B], paths, cells, base, umin: 0, vmin: 0, cols, rows, fac: { A, t, nr, L, H, cs, cols, rows, c } };
}
// Scanline lawnmower, contiguous strips balanced by length (static spatial partition).
export function plan(m) {
  if (m.params.mode === 'facade') return planFacade(m);
  const { n, swath, heading } = m.params;
  const f = frame(m.poly), th = heading * Math.PI / 180;
  const xy = m.poly.map(f.toXY);
  const r = xy.map(p => rot(p, th));
  const umin = Math.min(...r.map(p => p[0])), umax = Math.max(...r.map(p => p[0]));
  const vmin = Math.min(...r.map(p => p[1])), vmax = Math.max(...r.map(p => p[1]));
  const rows = Math.max(1, Math.ceil((vmax - vmin) / swath));
  const cols = Math.max(1, Math.ceil((umax - umin) / swath));

  const lines = [];
  for (let i = 0; i < rows; i++) {
    const v = vmin + (i + 0.5) * swath, xs = [];
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [u1, v1] = r[a], [u2, v2] = r[b];
      if ((v1 > v) !== (v2 > v)) xs.push(u1 + (v - v1) * (u2 - u1) / (v2 - v1));
    }
    xs.sort((p, q) => p - q);
    const segs = [];
    for (let k = 0; k + 1 < xs.length; k += 2) segs.push([xs[k], xs[k + 1]]);
    if (segs.length) lines.push({ v, segs, len: segs.reduce((s, g) => s + g[1] - g[0], 0) });
  }
  const total = lines.reduce((s, l) => s + l.len, 0) || 1;
  const groups = Array.from({ length: n }, () => []);
  let acc = 0;
  for (const l of lines) {
    groups[Math.min(n - 1, Math.floor((acc + l.len / 2) / total * n))].push(l);
    acc += l.len;
  }
  const base = m.baseLL ? f.toXY(m.baseLL) : xy[0];
  const paths = groups.map(g => {
    const pts = [base];
    g.forEach((l, idx) => {
      const segs = idx % 2 ? l.segs.slice().reverse().map(s => [s[1], s[0]]) : l.segs;
      for (const [a, b] of segs) pts.push(unrot([a, l.v], th), unrot([b, l.v], th));
    });
    if (g.length) pts.push(base);
    return pts;
  });

  const cells = [], cellAt = new Map();
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const uc = umin + (j + 0.5) * swath, vc = vmin + (i + 0.5) * swath;
    const c = unrot([uc, vc], th);
    if (!inside(c, xy)) continue;
    const h = swath / 2;
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => f.toLL(unrot([uc + a, vc + b], th)));
    cellAt.set(i * cols + j, cells.length);
    cells.push({ c, corners });
  }
  return { f, th, xy, paths, cells, cellAt, umin, vmin, cols, rows, base };
}
export function buildCum(path) {
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + hyp(path[k], path[k - 1]));
  return cum;
}
export function posAtPath(path, cum, dist) {
  const total = cum[cum.length - 1];
  if (total === 0 || path.length < 2) return path[0];
  dist = Math.max(0, Math.min(dist, total));
  let lo = 0, hi = path.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= dist) lo = mid; else hi = mid - 1; }
  const seg = cum[lo + 1] - cum[lo] || 1, t = (dist - cum[lo]) / seg;
  return path[lo].map((v, k) => v + (path[lo + 1][k] - v) * t);
}
