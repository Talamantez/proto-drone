import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtT, linkColor } from '../js/util.js';
import { quadPower } from '../js/power.js';
import { M_LAT } from '../js/constants.js';

test('fmtT formats mm:ss', () => { assert.equal(fmtT(0), '0:00'); assert.equal(fmtT(65.9), '1:05'); assert.equal(fmtT(3600), '60:00'); });
test('esc neutralises markup', () => assert.equal(esc('<b>"a" & b</b>'), '&lt;b&gt;"a" &amp; b&lt;/b&gt;'));
test('link colours', () => { assert.notEqual(linkColor('lte'), linkColor('lora')); assert.equal(linkColor(null), linkColor('none')); });

test('quad power: hover floor, a cruise sweet spot, and drag at high speed', () => {
  const p = v => quadPower(v, 190);
  assert.ok(Math.abs(p(0) - 190) < 1e-9, 'hover power at v = 0');
  assert.ok(p(8) < p(0), 'forward flight is cheaper than hovering (translational lift)');
  const perMetre = v => p(v) / v;
  const best = Array.from({ length: 80 }, (_, i) => 1 + i * 0.25).reduce((a, b) => perMetre(b) < perMetre(a) ? b : a);
  assert.ok(best > 5 && best < 20, `best-range speed ${best} m/s`);
  assert.ok(p(30) > p(20), 'parasitic drag grows with speed');
  assert.ok(quadPower(5, 250) > quadPower(5, 190), 'a heavier airframe burns more');
});

test('metres per degree of latitude', () => assert.ok(Math.abs(M_LAT - 111320) < 1));
