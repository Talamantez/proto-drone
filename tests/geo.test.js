import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCoord, formatHash, parseHash, parseLatLng, shapePoly, SHAPES, simplifyPath } from '../js/geo.js';

const close = (got, want, msg) => { assert.ok(got, msg); assert.ok(Math.abs(got.lat - want[0]) < 1e-4 && Math.abs(got.lng - want[1]) < 1e-4, `${msg}: ${JSON.stringify(got)}`); };

test('parseLatLng: decimal degrees in the usual spellings', () => {
  close(parseLatLng('40.7508, 14.4869'), [40.7508, 14.4869], 'comma');
  close(parseLatLng('40.7508 14.4869'), [40.7508, 14.4869], 'space');
  close(parseLatLng('  -33.8688 ; 151.2093 '), [-33.8688, 151.2093], 'semicolon, southern hemisphere');
  close(parseLatLng('@51.5007,-0.1246,17z'), [51.5007, -0.1246], 'Google Maps @ form');
  close(parseLatLng('data=!3d27.65!4d30.901'), [27.65, 30.901], 'Google data fragment');
});

test('parseLatLng: degrees, minutes, seconds and hemisphere letters', () => {
  close(parseLatLng('40°45\'03"N 14°29\'10"E'), [40.75083, 14.48611], 'DMS');
  close(parseLatLng('33.8688 S, 151.2093 E'), [-33.8688, 151.2093], 'trailing hemisphere letters');
  close(parseLatLng('E 14.4869, N 40.7508'), [40.7508, 14.4869], 'longitude first is detected from the letters');
  close(parseLatLng('40 45 3 N, 14 29 10 E'), [40.75083, 14.48611], 'spaces as separators');
});

test('parseLatLng rejects things that are not coordinates', () => {
  for (const bad of ['', null, undefined, 'Pompeii', 'big ben london', '91, 10', '10, 181', '1,2,3', '12', 'NaN, 4', '40.7 abc']) {
    assert.equal(parseLatLng(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('hash round-trips and rejects junk', () => {
  const h = formatHash({ lat: 40.7508, lng: 14.4869, zoom: 17 });
  assert.equal(h, '#map=17/40.75080/14.48690');
  assert.deepEqual(parseHash(h), { lat: 40.7508, lng: 14.4869, zoom: 17 });
  assert.deepEqual(parseHash('map=15.5/-33.8/151.2'), { lat: -33.8, lng: 151.2, zoom: 15.5 }, 'leading # is optional, fractional zoom is kept');
  for (const bad of ['', '#', '#map=', '#map=99/0/0', '#map=10/100/0', '#map=10/0/200', '#foo=1/2/3', null]) assert.equal(parseHash(bad), null, String(bad));
});

test('formatCoord', () => assert.equal(formatCoord(40.75, -14.4), '40.75000, -14.40000'));

test('simplifyPath: a noisy square stroke collapses to its corners', () => {
  const stroke = [];
  for (let i = 0; i <= 20; i++) stroke.push([i * 5, (i % 2) * 1]);
  for (let i = 1; i <= 20; i++) stroke.push([100 + (i % 2), i * 5]);
  for (let i = 1; i <= 20; i++) stroke.push([100 - i * 5, 100 + (i % 2)]);
  const out = simplifyPath(stroke, 4);
  assert.ok(out.length >= 3 && out.length <= 5, `got ${out.length} points`);
  assert.deepEqual(simplifyPath([[0, 0], [5, 5]], 3), [[0, 0], [5, 5]]);
});

test('shapePoly: scales to the requested size around the centre', () => {
  const sq = shapePoly('square', [40, 14], 200);
  const h = Math.abs(sq[2][0] - sq[0][0]) * 111320;
  assert.ok(Math.abs(h - 200) < 0.5, `height ${h}`);
  assert.ok(Math.abs((sq[0][0] + sq[2][0]) / 2 - 40) < 1e-9);
  Object.keys(SHAPES).forEach(k => assert.ok(shapePoly(k, [0, 0], 100).length >= 3, k));
});
