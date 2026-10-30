import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, covGoal, findGoal, presetPoly, sepGoal, timeGoal } from '../js/presets.js';
import { M_LAT } from '../js/constants.js';
import { plan } from '../js/planner.js';
import { BASE, makeMission, run } from './helpers.js';

const metres = (a, b) => Math.hypot((b[1] - a[1]) * M_LAT * Math.cos(a[0] * Math.PI / 180), (b[0] - a[0]) * M_LAT);

for (const [key, p] of Object.entries(PRESETS)) {
  test(`preset ${key}: geometry matches its stated size`, () => {
    const poly = presetPoly(p);
    if (p.shape === 'line') { assert.equal(poly.length, 2); assert.ok(Math.abs(metres(poly[0], poly[1]) - p.w) < 1); }
    else { assert.equal(poly.length, 4); assert.ok(Math.abs(metres(poly[0], poly[1]) - p.w) < 1 && Math.abs(metres(poly[1], poly[2]) - p.h) < 1); }
    assert.ok(poly.every(([la, lo]) => Math.abs(la) <= 90 && Math.abs(lo) <= 180));
  });

  test(`preset ${key}: plans and survives a minute of simulation`, () => {
    const params = { ...BASE, ...p.params };
    const P = plan({ poly: presetPoly(p), params });
    assert.equal(P.paths.length, params.n); assert.ok(P.cells.length > 0);
    const m = makeMission({ poly: presetPoly(p), params, challenge: key });
    run(60);
    assert.ok(m.simT >= 0 && m.stats.sent > 0, 'messages flowed');
  });

  test(`preset ${key}: goals evaluate`, () => {
    const x = { cov: 100, truth: 100, found: 12, total: 12, alerts: 0, t: 60, rtl: 0 };
    for (const g of p.goals) { assert.equal(typeof g.label, 'string'); assert.equal(typeof g.ok(x), 'boolean'); assert.ok(['string', 'number'].includes(typeof g.val(x))); }
  });
}

test('goal factories', () => {
  const x = { cov: 91, found: 8, total: 10, alerts: 0, t: 599 };
  assert.ok(covGoal(90).ok(x) && !covGoal(95).ok(x));
  assert.ok(findGoal(0.8).ok(x) && !findGoal(0.9).ok(x), 'ceil(0.8 * 10) = 8 needed');
  assert.ok(sepGoal.ok(x) && !sepGoal.ok({ ...x, alerts: 1 }));
  assert.ok(timeGoal(10).ok(x) && !timeGoal(9).ok(x));
  assert.equal(timeGoal(10).val(x), '9:59');
});
