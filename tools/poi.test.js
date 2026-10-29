// Fixture test for the POI tiering / snapping / zone-weight functions in index.html.  node tools/poi.test.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('<script>').pop().split('</script>')[0];
const a = src.indexOf('const TIERS'), b = src.indexOf('const $ = id =>');
const L = new Function(`${src.slice(a, b)}; return { TIERS, classifyPois, pickSnap, setBack, cellWeights, poiBonus, defaultPoiCfg };`)();

const g = (lat, lon) => ({ lat, lon });
const way = (id, nodes, geom, tags) => ({ type: 'way', id, nodes, geometry: geom, tags });
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
const pois = L.classifyPois(els), by = Object.fromEntries(pois.map(p => [p.id, p]));
assert.equal(by[2].tier, 'major', 'primary x secondary is a major junction');
assert.equal(by[3].tier, 'ramp', 'link end on a main road is a ramp');
assert.equal(by[7].tier, 'choke', 'bridge end is a chokepoint');
assert.equal(by[9].tier, 'minor');
assert.equal(by[20].tier, 'rail'); assert.equal(by[21].tier, 'ramp');
assert.ok(!by[12] && !by[13], 'footways ignored');
assert.ok(by[2].flow > by[9].flow, 'flow proxy ranks primary above residential');

const cfg = L.defaultPoiCfg(), xyOf = ([la, lo]) => [lo * 111320, la * 111320];
const from = xyOf([.0004, .0012]);   // near node 2, a bit nearer to it than to 3
let hit = L.pickSnap(pois, cfg, xyOf, from, 400, false);
assert.ok(hit && ['ramp', 'major', 'choke'].includes(hit.poi.tier), 'weighted snap picks a high-value node');
cfg.ramp.snap = cfg.choke.snap = cfg.major.snap = false;
hit = L.pickSnap(pois, cfg, xyOf, from, 400, false); assert.equal(hit.poi.tier, 'minor', 'tier snap toggles are honoured');
cfg.minor.snap = false; assert.equal(L.pickSnap(pois, cfg, xyOf, from, 400, false), null, 'no eligible tier -> null');
hit = L.pickSnap(pois, L.defaultPoiCfg(), xyOf, from, 400, true); assert.equal(hit.poi.id, 2, 'hard snap takes the nearest eligible');
const sb = L.setBack([0, 0], [100, 0], 15); assert.ok(Math.abs(sb[0] - 15) < 1e-9 && sb[1] === 0, 'set-back moves toward the site');

const c2 = L.defaultPoiCfg();
const cells = [{ c: xyOf([0, .001]) }, { c: xyOf([.02, .02]) }];
const w = L.cellWeights(cells, pois, c2, xyOf, 60);
assert.ok(w[0] > 1.5 && w[1] === 1, 'cell on a major junction is weighted, a far cell stays at 1');
c2.major.w = c2.ramp.w = c2.choke.w = c2.minor.w = 0; c2.rail.w = 0;
assert.deepEqual(L.cellWeights(cells, pois, c2, xyOf, 60), [1, 1], 'zero weights = plain observation');
console.log('poi tests passed:', pois.length, 'POIs,', Object.entries(pois.reduce((m, p) => (m[p.tier] = (m[p.tier] || 0) + 1, m), {})).map(e => e.join('=')).join(' '));
