// Headless mission builder for tests: the same planMission / initRuntime path the app uses, with no DOM or Leaflet.
import { S } from '../js/state.js';
import { defaultPoiCfg } from '../js/poi.js';
import { initRuntime, planMission, resetRun, step } from '../js/sim.js';

export const BASE = { n: 3, swath: 20, heading: 0, speed: 8, feat: 12, layer: true, seed: 1, lteLat: 80, lteLoss: 3, loraLoss: 5, mode: 'area', wallH: 58, heritage: false, gsd: 5, fwd: 75, side: 65 };
const M_LAT = 111320;

// A W x H metre rectangle with its south-west corner at (lat, lng).
export function rect(W, H, lat = 40.75, lng = 14.48) {
  const dLat = H / M_LAT, dLng = W / (M_LAT * Math.cos(lat * Math.PI / 180));
  return [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
}

export function makeMission({ poly = rect(300, 160), params = {}, challenge = null } = {}) {
  const m = { id: 't', name: 'test', poly, params: { ...BASE, ...params }, hidden: null, challenge, pois: [], poiCfg: defaultPoiCfg(), poiOpts: { buf: 300, rad: 250, back: 15, zone: 60, hard: false }, baseLL: null };
  resetRun(m);
  S.mission = m;
  planMission(m, false);
  initRuntime(m);
  return m;
}

// Runs until the sim says it is finished, or `seconds` of sim time pass.
export function run(seconds = 3600) {
  let guard = 0;
  while (S.R.t < seconds && step() && guard++ < 400000);
  return S.mission;
}
