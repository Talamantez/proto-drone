// Headless analytic mission model. Imports the planner (cap, frame, plan) from js/planner.js so the
// sweep can't drift from the app. Reads a JSON array of parameter objects on stdin, writes outputs to stdout.
// `node tools/model.js --check` compares the analytic path lengths against the app's plan() on small sites.
import { cap, plan, buildCum } from '../js/planner.js';
import { M_LAT } from '../js/constants.js';

const app = { cap, plan, buildCum, M_LAT };

const AVIONICS_W = 15, VH = 5, CDA = 0.02, RHO = 1.2, DRONES_PER_CREW = 2, PACK_USE = 0.8, DRONE_LIFE_H = 500, PACK_CYCLES = 300, RESERVE = 0.25;
const power = (v, hover) => {
  const u = v * v / (2 * VH * VH);
  return (hover - AVIONICS_W) * Math.sqrt(Math.sqrt(u * u + 1) - u) + 0.5 * RHO * CDA * v ** 3 + AVIONICS_W;
};

// Per-drone path lengths for a W x H rectangle flown as the app's lawnmower (heading 0, base at the corner).
function pathLengths(W, H, swath, n) {
  const rows = Math.max(1, Math.ceil(H / swath)), lines = [];
  for (let i = 0; i < rows; i++) if ((i + 0.5) * swath < H) lines.push((i + 0.5) * swath);
  const groups = Array.from({ length: n }, () => []);
  lines.forEach((v, k) => groups[Math.min(n - 1, Math.floor((k + 0.5) / lines.length * n))].push(v));
  return groups.map(g => {
    if (!g.length) return 0;
    let len = 0, x = 0, y = 0;
    const go = (px, py) => { len += Math.hypot(px - x, py - y); x = px; y = py; };
    g.forEach((v, k) => { const [u0, u1] = k % 2 ? [W, 0] : [0, W]; go(u0, v); go(u1, v); });
    go(0, 0);
    return len;
  });
}

function evaluate(p) {
  const c = app.cap({ gsd: p.gsd, fwd: p.fwd, side: p.side, mode: 'area' });
  const v = Math.min(p.speed, c.vMax), clamped = p.speed > c.vMax;
  const W = Math.sqrt(p.area * p.aspect), H = p.area / W, n = Math.round(p.n);
  const lens = pathLengths(W, H, c.lineSp, n);
  const pw = power(v, p.hover), usable = p.packWh * (1 - RESERVE);
  let wh = 0, flightH = 0, time = 0, sorties = 0;
  for (const L of lens) {
    const e = L / v * pw / 3600, k = Math.max(1, Math.ceil(e / usable));
    wh += e; flightH += L / v / 3600; sorties += k;
    time = Math.max(time, L / v + (k - 1) * p.swapMin * 60);
  }
  const fleet = flightH * p.dronePrice / DRONE_LIFE_H;
  const packs = wh / (p.packWh * PACK_USE) * p.packPrice / PACK_CYCLES;
  const crew = Math.ceil(n / DRONES_PER_CREW) * time / 3600 * p.crew;
  const cost = fleet + packs + crew;
  return { time, wh, cost, costPerKm2: cost / (p.area / 1e6), sorties, v, clamped: +clamped };
}

if (process.argv.includes('--check')) {
  let worst = 0;
  for (const [W, H, swath, n] of [[120, 80, 7, 1], [200, 90, 11, 3], [150, 150, 6, 4], [90, 300, 13, 5], [60, 40, 5, 2]]) {
    const dLat = H / app.M_LAT, dLng = W / app.M_LAT;   // equator: 1 deg lng ~ 1 deg lat
    const poly = [[0, 0], [0, dLng], [dLat, dLng], [dLat, 0]];
    const P = app.plan({ poly, params: { n, swath, heading: 0, mode: 'area' } });
    const ref = P.paths.map(pt => app.buildCum(pt).slice(-1)[0]), mine = pathLengths(W, H, swath, n);
    ref.forEach((r, i) => { const e = Math.abs(r - mine[i]) / r; worst = Math.max(worst, e); });
    console.log(`${W}x${H} swath ${swath} n=${n}: plan ${ref.map(x => x.toFixed(0))} | model ${mine.map(x => x.toFixed(0))}`);
  }
  console.log(`worst relative error ${(worst * 100).toFixed(3)}%`);
  process.exit(worst < 0.01 ? 0 : 1);
}

let buf = '';
process.stdin.on('data', d => buf += d).on('end', () => {
  const rows = JSON.parse(buf).map(evaluate);
  process.stdout.write(JSON.stringify(rows));
});
