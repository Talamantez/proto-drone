import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPois, pickSnap, setBack, cellWeights, defaultPoiCfg } from '../js/poi.js';

const g = (lat, lon) => ({ lat, lon });
const way = (id, nodes, geometry, tags) => ({ type: 'way', id, nodes, geometry, tags });
const els = [
  way(1, [1, 2, 3], [g(0, 0), g(0, .001), g(0, .002)], { highway: 'primary' }),                 // E-W primary
  way(2, [4, 2, 5], [g(-.001, .001), g(0, .001), g(.001, .001)], { highway: 'secondary' }),     // crosses at node 2 -> major
  way(3, [6, 3], [g(.0005, .004), g(0, .002)], { highway: 'motorway_link' }),                    // ramp ends on node 3
  way(4, [3, 7], [g(0, .002), g(0, .003)], { highway: 'primary', bridge: 'yes' }),               // bridge: ends 3 and 7
  way(5, [8, 9, 10], [g(.002, 0), g(.002, .001), g(.003, .001)], { highway: 'residential' }),
  way(6, [9, 11], [g(.002, .001), g(.002, .002)], { highway: 'residential' }),                  // minor T at 9
  way(7, [12, 13], [g(.01, 0), g(.01, .001)], { highway: 'footway' }),                           // ignored
  { type: 'node', id: 20, lat: .005, lon: .005, tags: { railway: 'level_crossing' } },
  { type: 'node', id: 21, lat: .006, lon: .006, tags: { highway: 'motorway_junction' } },
];
const pois = classifyPois(els), by = Object.fromEntries(pois.map(p => [p.id, p]));
const xyOf = ([la, lo]) => [lo * 111320, la * 111320];

test('classification assigns tiers', () => {
  assert.equal(by[2].tier, 'major', 'primary x secondary is a major junction');
  assert.equal(by[3].tier, 'ramp', 'link end on a main road is a ramp');
  assert.equal(by[7].tier, 'choke', 'bridge end is a chokepoint');
  assert.equal(by[9].tier, 'minor');
  assert.equal(by[20].tier, 'rail');
  assert.equal(by[21].tier, 'ramp');
  assert.ok(!by[12] && !by[13], 'footways ignored');
  assert.ok(by[2].flow > by[9].flow, 'flow proxy ranks primary above residential');
});

test('snapping honours tier toggles, radius and hard mode', () => {
  const cfg = defaultPoiCfg(), from = xyOf([.0004, .0012]);
  let hit = pickSnap(pois, cfg, xyOf, from, 400, false);
  assert.ok(hit && ['ramp', 'major', 'choke'].includes(hit.poi.tier), 'weighted snap picks a high-value node');
  cfg.ramp.snap = cfg.choke.snap = cfg.major.snap = false;
  hit = pickSnap(pois, cfg, xyOf, from, 400, false);
  assert.equal(hit.poi.tier, 'minor', 'tier snap toggles are honoured');
  cfg.minor.snap = false;
  assert.equal(pickSnap(pois, cfg, xyOf, from, 400, false), null, 'no eligible tier -> null');
  hit = pickSnap(pois, defaultPoiCfg(), xyOf, from, 400, true);
  assert.equal(hit.poi.id, 2, 'hard snap takes the nearest eligible');
});

test('set-back moves the base toward the site', () => {
  const sb = setBack([0, 0], [100, 0], 15);
  assert.ok(Math.abs(sb[0] - 15) < 1e-9 && sb[1] === 0);
});

test('zone weights', () => {
  const cfg = defaultPoiCfg(), cells = [{ c: xyOf([0, .001]) }, { c: xyOf([.02, .02]) }];
  const w = cellWeights(cells, pois, cfg, xyOf, 60);
  assert.ok(w[0] > 1.5 && w[1] === 1, 'cell on a major junction is weighted, a far cell stays at 1');
  for (const t of Object.values(cfg)) t.w = 0;
  assert.deepEqual(cellWeights(cells, pois, cfg, xyOf, 60), [1, 1], 'zero weights = plain observation');
});
