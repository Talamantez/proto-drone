import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCum, cap, frame, inside, mulberry32, plan, posAtPath } from '../js/planner.js';
import { M_LAT, MIN_STANDOFF } from '../js/constants.js';
import { BASE, rect } from './helpers.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (±${tol})`);

test('capture planner scales sensibly', () => {
  const a = cap({ ...BASE, gsd: 4 }), b = cap({ ...BASE, gsd: 8 });
  near(b.stand / a.stand, 2, 1e-9, 'standoff is proportional to GSD');
  assert.ok(b.vMax > a.vMax, 'coarser GSD allows faster flight');
  assert.ok(cap({ ...BASE, side: 80 }).lineSp < cap({ ...BASE, side: 60 }).lineSp, 'more side overlap = tighter lines');
  assert.ok(cap({ ...BASE, fwd: 90 }).photoSp < cap({ ...BASE, fwd: 70 }).photoSp, 'more forward overlap = shorter exposure spacing');
  assert.ok(cap({ ...BASE, gsd: 1 }).stand < MIN_STANDOFF, 'a fine GSD drops under the heritage standoff');
});

test('local frame round-trips lat/lng', () => {
  const poly = rect(500, 300), f = frame(poly);
  for (const [lat, lng] of poly) { const [x, y] = f.toXY([lat, lng]), [la, lo] = f.toLL([x, y]); near(la, lat, 1e-9); near(lo, lng, 1e-9); }
  const [x, y] = f.toXY(poly[2]);
  const [x0, y0] = f.toXY(poly[0]);
  near(Math.hypot(x - x0, y - y0), Math.hypot(500, 300), 1.5, 'diagonal in metres is right at this latitude');
});

test('point in polygon', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.ok(inside([5, 5], sq)); assert.ok(!inside([11, 5], sq)); assert.ok(!inside([-1, -1], sq));
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.ok(inside([2, 8], L)); assert.ok(!inside([8, 8], L), 'concave notch is outside');
});

test('seeded RNG is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 50 }, a), ys = Array.from({ length: 50 }, b);
  assert.deepEqual(xs, ys);
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, c));
});

test('area plan: one path per drone, cells inside the polygon, lanes cover the area', () => {
  const m = { poly: rect(300, 160), params: { ...BASE, n: 3 } }, P = plan(m);
  assert.equal(P.paths.length, 3);
  assert.ok(P.cells.length > 0 && P.cells.every(c => inside(c.c, P.xy)), 'every cell centre lies in the site');
  const total = P.paths.reduce((s, p) => s + buildCum(p).at(-1), 0);
  assert.ok(total > 300 * 160 / 20 * 0.9, 'total path is at least the lanes needed for the swath');
});

test('more drones shorten the longest path', () => {
  const longest = n => Math.max(...plan({ poly: rect(300, 160), params: { ...BASE, n } }).paths.map(p => buildCum(p).at(-1)));
  assert.ok(longest(4) < longest(2) && longest(2) < longest(1));
});

test('heading rotates the lanes without losing coverage', () => {
  const a = plan({ poly: rect(300, 160), params: { ...BASE, heading: 0 } }), b = plan({ poly: rect(300, 160), params: { ...BASE, heading: 90 } });
  near(b.cells.length / a.cells.length, 1, 0.15, 'cell count is similar at any heading');
});

test('facade plan: a 2-point wall gives cells across its height', () => {
  const m = { poly: [[40.75, 14.48], [40.75, 14.4809]], params: { ...BASE, mode: 'facade', wallH: 58, gsd: 4 } }, P = plan(m);
  assert.ok(P.fac && P.cells.length > 0 && P.paths.length === 3);
});

test('path interpolation', () => {
  const path = [[0, 0], [10, 0], [10, 10]], cum = buildCum(path);
  assert.deepEqual(cum, [0, 10, 20]);
  assert.deepEqual(posAtPath(path, cum, 5).slice(0, 2), [5, 0]);
  assert.deepEqual(posAtPath(path, cum, 15).slice(0, 2), [10, 5]);
  assert.deepEqual(posAtPath(path, cum, 99).slice(0, 2), [10, 10], 'clamps to the end');
});

test('M_LAT is the metres-per-degree used everywhere', () => assert.equal(M_LAT, 111320));
