// Site challenge presets, goal factories and preset geometry.
import { M_LAT } from './constants.js';
import { fmtT } from './util.js';

export const covGoal = n => ({ label: `GCS-confirmed coverage ≥ ${n}%`, val: x => x.cov + '%', ok: x => x.cov >= n });
export const findGoal = f => ({ label: `Confirm ≥ ${Math.round(f * 100)}% of anomalies`, val: x => `${x.found}/${x.total}`, ok: x => x.found >= Math.ceil(f * x.total) });
export const sepGoal = { label: 'Zero separation violations', val: x => x.alerts, ok: x => x.alerts === 0, final: true, lost: x => x.alerts > 0 };
export const timeGoal = min => ({ label: `Finish within ${min} min`, val: x => fmtT(x.t), ok: x => x.t <= min * 60, final: true, lost: x => x.t > min * 60 });
// Arenas sit near the real coordinates but are game-sized rectangles, not site boundaries or survey records.
// Coordinates: Bamiyan, Aten Temple and Blick Mead from Wikipedia; Göbekli Tepe is from memory, unverified.
export const PRESETS = {
  demo: {
    title: 'Pompeii Quick Survey (starter)', c: [40.7508, 14.4869], shape: 'rect', w: 420, h: 260, bearing: 0, zoom: 17,
    params: { mode: 'area', n: 3, gsd: 5, fwd: 75, side: 65, swath: 25, speed: 8, feat: 12, heritage: false, layer: true, lteLat: 80, lteLoss: 3, loraLoss: 5 },
    note: 'Starter: three drones sweep a 420 × 260 m block. Press Start. At about 1 minute one drone loses its links and the others pick up its rows. Try cutting a link yourself in the Fleet table.',
    events: [
      { t: 60, d: 1, links: ['lte', 'lora'], up: false, text: 'D2 drops off both links; failsafe RTL expected, then GCS reassigns its remaining rows' },
    ],
    goalsTitle: 'Goals', goals: [covGoal(90), findGoal(0.8), sepGoal, timeGoal(8)],
  },
  bamiyan: {
    title: 'Bamiyan: Cliff Face Cartographer', c: [34.8319, 67.8267], shape: 'line', w: 80, zoom: 16,
    params: { mode: 'facade', wallH: 58, n: 3, gsd: 4, fwd: 80, side: 70, feat: 12, heritage: true, lteLat: 120, lteLoss: 8, loraLoss: 8 },
    note: 'Arena: an 80 m stretch of cliff, 58 m high (the larger niche is about 58 m, the smaller about 38 m). Tick the pre-flight checklist, then Start. Real work needs the site authority and UNESCO partners.',
    events: [{ t: 90, d: 1, links: ['lte', 'lora'], up: false, text: 'D2 loses both links behind the cliff; failsafe RTL expected, then GCS reassigns its remaining rows' }],
    goalsTitle: 'Goals', goals: [covGoal(95), findGoal(0.8), sepGoal, timeGoal(13)],
  },
  gobekli: {
    title: 'Göbekli Tepe: Under the Roof', c: [37.2233, 38.9226], shape: 'rect', w: 70, h: 60, bearing: 0, zoom: 17,
    params: { mode: 'area', n: 2, gsd: 3, fwd: 70, side: 70, swath: 5, feat: 25, heritage: true, layer: true, lteLat: 250, lteLoss: 35, loraLoss: 10 },
    note: 'Arena: about 4,000 m², the size of the steel roof over the dig. The roof wrecks LTE (35% loss), so lean on LoRa. Anomalies stand in for the T-shaped pillars.',
    events: [
      { t: 45, d: 0, links: ['lte'], up: false, text: 'D1 LTE blanked under the roof; detections must go via LoRa' },
      { t: 150, d: 0, links: ['lte'], up: true, text: 'D1 clears the roof edge, LTE back; queued coverage can flush' },
    ],
    goalsTitle: 'Goals', goals: [covGoal(90), findGoal(0.88), sepGoal, timeGoal(10)],
  },
  aten: {
    title: 'Amarna Great Aten Temple: Sun Temple Sprint', c: [27.650, 30.901], shape: 'rect', w: 800, h: 300, bearing: 0, zoom: 16,
    params: { mode: 'area', n: 6, gsd: 10, fwd: 70, side: 60, swath: 22, feat: 30, heritage: true, layer: true, lteLat: 80, lteLoss: 3, loraLoss: 5 },
    note: 'Arena: 800 × 300 m, the enclosure size given by the Amarna Project (other sources say 730 × 230 m or 900 × 300 m). Six drones, two failures mid-flight, fifteen minutes.',
    events: [
      { t: 120, d: 2, links: ['lte', 'lora'], up: false, text: 'D3 drops off both links; failsafe RTL and reassignment' },
      { t: 240, d: 4, links: ['lte'], up: false, text: 'D5 loses LTE, LoRa only (detections still get through)' },
      { t: 330, d: 4, links: ['lte'], up: true, text: 'D5 LTE restored; its queued coverage flushes' },
    ],
    goalsTitle: 'Goals', goals: [covGoal(90), findGoal(0.8), sepGoal, timeGoal(15)],
  },
  blick: {
    title: 'Blick Mead: Canopy & Courtesy', c: [51.1775, -1.7878], shape: 'rect', w: 80, h: 60, bearing: 0, zoom: 18,
    params: { mode: 'area', n: 1, gsd: 3, fwd: 70, side: 70, swath: 5, feat: 8, heritage: true, layer: false, lteLat: 300, lteLoss: 40, loraLoss: 30 },
    note: 'Arena: 80 × 60 m of wet woodland. Canopy kills the links (LTE 40%, LoRa 30% loss) and the grounds are next to a care home, so one drone only. In reality leaf-off survey or LiDAR beats nadir photos under trees.',
    events: [{ t: 60, d: 0, links: ['lte'], up: false, text: 'LTE gone under the canopy' }, { t: 120, d: 0, links: ['lte'], up: true, text: 'LTE back in a clearing' }],
    goalsTitle: 'Goals', goals: [covGoal(85), findGoal(0.75), { label: 'Never trigger failsafe RTL', val: x => x.rtl ? 'RTL' : 'ok', ok: x => x.rtl === 0, final: true, lost: x => x.rtl > 0 }, timeGoal(15)],
  },
};
export const offLL = (c, dx, dy) => [c[0] + dy / M_LAT, c[1] + dx / (M_LAT * Math.cos(c[0] * Math.PI / 180))];
export function presetPoly(s) {
  if (s.shape === 'line') return [offLL(s.c, -s.w / 2, 0), offLL(s.c, s.w / 2, 0)];
  const th = (s.bearing || 0) * Math.PI / 180, r = ([x, y]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const [x, y] = r([a * s.w / 2, b * s.h / 2]); return offLL(s.c, x, y); });
}
