// Headless simulation: the real sim core with the UI hooks left as no-ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../js/state.js';
import { hooks, step } from '../js/sim.js';
import { makeMission, rect, run } from './helpers.js';

const cells = () => S.P.cells.length;
const gcsPct = () => 100 * S.R.gcsCov.size / cells();
const truthPct = () => 100 * S.R.cov.size / cells();

test('a clean run covers the area, confirms it at the GCS and finds the anomalies', () => {
  const m = makeMission();
  run();
  assert.ok(truthPct() > 95, `ground-truth coverage ${truthPct().toFixed(1)}%`);
  assert.ok(gcsPct() > 95, `GCS-confirmed coverage ${gcsPct().toFixed(1)}%`);
  assert.ok(m.found.length >= Math.ceil(m.hidden.length * 0.8), `${m.found.length}/${m.hidden.length} anomalies confirmed`);
  assert.equal(m.alerts, 0, 'altitude layering keeps drones separated');
  assert.ok(S.R.d.every(d => d.landed || m.dist[d.i] >= d.total - 0.01), 'every drone finished its path or landed');
});

test('the same seed gives the same run; a different seed does not', () => {
  const sig = seed => { makeMission({ params: { seed } }); run(120); return JSON.stringify([S.mission.stats, S.mission.hidden.map(h => h.ll), [...S.R.gcsCov].length]); };
  assert.equal(sig(5), sig(5));
  assert.notEqual(sig(5), sig(6));
});

test('message accounting balances', () => {
  const m = makeMission({ params: { lteLoss: 20, loraLoss: 20 } });
  run(300);
  const st = m.stats, inflight = S.R.queue.length;
  assert.equal(st.sent, st.delivered + st.dropLoss + st.dropDown + inflight, 'every message is delivered, dropped or still in flight');
  assert.ok(st.dropLoss > 0, 'a 20% loss link drops something');
  assert.ok(st.lat.lte.n > 0 && st.lat.lte.sum / st.lat.lte.n > 20, 'LTE latency near its configured 80 ms');
});

test('losing both links triggers failsafe RTL and the GCS reassigns the remaining work', () => {
  const m = makeMission();
  run(60);
  m.faults[1].lte = m.faults[1].lora = false;
  run(400);
  const d2 = S.R.d[1];
  assert.ok(d2.rtl || d2.landed, 'D2 returned to base');
  assert.ok(m.assignN > 0, 'work was reassigned to another drone');
  assert.ok(gcsPct() > 80, `coverage still ${gcsPct().toFixed(1)}% after losing a drone`);
});

test('LoRa alone still carries detections to the GCS', () => {
  const m = makeMission();
  m.faults.forEach(f => { f.lte = false; });
  run();
  assert.ok(m.found.length > 0, 'anomalies confirmed over LoRa only');
  assert.equal(m.stats.lat.lte.n, 0, 'nothing was delivered over the cut LTE links');
  assert.ok(m.stats.dropDown > 0, 'attempts on the cut links are counted as link-down drops');
});

test('with every link cut for the whole run, the GCS confirms nothing', () => {
  const m = makeMission();
  m.faults.forEach(f => { f.lte = f.lora = false; });
  run(200);
  assert.equal(S.R.gcsCov.size, 0); assert.equal(m.found.length, 0);
});

test('a low battery sends a drone home', () => {
  const orig = hooks.battUsable;
  hooks.battUsable = () => 0.5;   // Wh: exhausted within seconds
  try {
    makeMission(); run(120);
    assert.ok(S.R.d.every(d => d.rtl || d.landed));
  } finally { hooks.battUsable = orig; }
});

test('hooks receive paint, find and log events', () => {
  const seen = { paint: 0, find: 0, log: 0 }, saved = { ...hooks };
  Object.assign(hooks, { paintCell: () => seen.paint++, addFind: () => seen.find++, log: () => seen.log++ });
  try { makeMission(); run(); } finally { Object.assign(hooks, saved); }
  assert.ok(seen.paint > 0 && seen.find > 0 && seen.log > 0, JSON.stringify(seen));
});

test('more drones finish sooner', () => {
  const finishTime = n => { makeMission({ poly: rect(400, 240), params: { n } }); run(); return S.R.t; };
  assert.ok(finishTime(4) < finishTime(2));
});

test('step() reports completion', () => {
  makeMission({ poly: rect(80, 60) });
  let n = 0; while (step() && n++ < 100000);
  assert.ok(n < 100000 && n > 10, 'a tiny site finishes in a bounded number of steps');
});

test('facade (wall) missions run too', () => {
  const m = makeMission({ poly: [[40.75, 14.48], [40.75, 14.4809]], params: { mode: 'facade', wallH: 40, gsd: 5, n: 2, heritage: false } });
  run();
  assert.ok(S.P.fac && gcsPct() > 80, `wall coverage ${gcsPct().toFixed(1)}%`);
  assert.ok(m.found.length > 0);
});
