import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCoord, formatHash, parseHash, parseLatLng } from '../js/geo.js';

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
