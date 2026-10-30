import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AREAS, MAX_POINTS, parseGeoJSON, toGeoJSON } from '../js/geojson.js';

const poly = (ring, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });
const square = [[14.485, 40.75], [14.488, 40.75], [14.488, 40.752], [14.485, 40.752], [14.485, 40.75]];

test('export then import is lossless (to 6 decimals)', () => {
  const list = [
    { name: 'Block', mode: 'area', pts: [[40.75, 14.485], [40.75, 14.488], [40.752, 14.488], [40.752, 14.485]] },
    { name: 'Wall', mode: 'facade', pts: [[34.8319, 67.8262], [34.8319, 67.8272]] },
  ];
  const gj = toGeoJSON(list);
  assert.equal(gj.type, 'FeatureCollection');
  assert.equal(gj.features[0].geometry.type, 'Polygon');
  assert.deepEqual(gj.features[0].geometry.coordinates[0].at(-1), gj.features[0].geometry.coordinates[0][0], 'ring is closed, as GeoJSON requires');
  assert.equal(gj.features[1].geometry.type, 'LineString');
  const back = parseGeoJSON(JSON.parse(JSON.stringify(gj)));
  assert.equal(back.skipped, 0);
  assert.deepEqual(back.areas.map(a => [a.name, a.mode, a.pts.length]), [['Block 1', 'area', 4], ['Wall 2', 'facade', 2]]);
  assert.deepEqual(back.areas[0].pts, list[0].pts);
});

test('coordinates are lng,lat in GeoJSON and lat,lng in the app', () => {
  const { areas } = parseGeoJSON(poly(square, { name: 'A' }));
  assert.deepEqual(areas[0].pts[0], [40.75, 14.485]);
  assert.equal(areas[0].pts.length, 4, 'closing vertex dropped');
  assert.equal(areas[0].name, 'A');
});

test('accepts bare geometries, collections and MultiPolygons; ignores holes', () => {
  assert.equal(parseGeoJSON({ type: 'Polygon', coordinates: [square] }, 'file').areas[0].name, 'file');
  const multi = { type: 'MultiPolygon', coordinates: [[square], [square, [[14.486, 40.751], [14.487, 40.751], [14.487, 40.7515], [14.486, 40.751]]]] };
  const m = parseGeoJSON(multi, 'm');
  assert.equal(m.areas.length, 2); assert.equal(m.areas[1].pts.length, 4, 'hole ring ignored');
  assert.equal(parseGeoJSON({ type: 'GeometryCollection', geometries: [multi.coordinates ? { type: 'Polygon', coordinates: [square] } : null] }).areas.length, 1);
});

test('skips what the planner cannot use', () => {
  const tooMany = Array.from({ length: MAX_POINTS + 1 }, (_, i) => [14 + i * 1e-5, 40 + (i % 2) * 1e-5]);
  const cases = {
    point: { type: 'Point', coordinates: [1, 2] },
    'line of 3': { type: 'LineString', coordinates: [[1, 2], [1, 3], [1, 4]] },
    'two-point polygon': { type: 'Polygon', coordinates: [[[1, 2], [1, 3], [1, 2]]] },
    'too many points': { type: 'Polygon', coordinates: [tooMany] },
    'out of range': { type: 'Polygon', coordinates: [[[200, 10], [201, 10], [201, 11], [200, 10]]] },
  };
  for (const [name, g] of Object.entries(cases)) {
    const r = parseGeoJSON(g);
    assert.equal(r.areas.length, 0, name);
  }
  assert.equal(parseGeoJSON(cases['too many points']).skipped, 1);
  assert.equal(parseGeoJSON(cases['two-point polygon']).skipped, 1);
  assert.deepEqual(parseGeoJSON(null), { areas: [], skipped: 0 });
  assert.deepEqual(parseGeoJSON({ nonsense: true }), { areas: [], skipped: 0 });
});

test('a 2-point LineString is a wall', () => {
  const r = parseGeoJSON({ type: 'LineString', coordinates: [[67.8262, 34.8319], [67.8272, 34.8319]] }, 'cliff');
  assert.deepEqual(r.areas.map(a => [a.mode, a.pts.length]), [['facade', 2]]);
});

test(`imports are capped at ${MAX_AREAS} areas and the overflow is counted as skipped`, () => {
  const fc = { type: 'FeatureCollection', features: Array.from({ length: MAX_AREAS + 5 }, () => poly(square)) };
  const r = parseGeoJSON(fc);
  assert.equal(r.areas.length, MAX_AREAS); assert.equal(r.skipped, 5);
});
