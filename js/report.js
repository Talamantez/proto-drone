// Post-run report data. Pure: no DOM, no Leaflet, so it runs in Node tests.
import { cap } from './planner.js';

const CELL_COVERED = 0.98;   // GCS-confirmed share at which a run counts as complete

// Connected groups (4-neighbour) of cells for which `missing(ci)` is true.
function groups(P, missing) {
  const at = new Map();   // grid key -> cell index
  if (P.cellAt) P.cellAt.forEach((ci, k) => at.set(k, ci)); else P.cells.forEach((_, ci) => at.set(ci, ci));
  const keyOf = new Map(); at.forEach((ci, k) => keyOf.set(ci, k));
  const seen = new Set(), out = [];
  for (let ci = 0; ci < P.cells.length; ci++) {
    if (seen.has(ci) || !missing(ci)) continue;
    const comp = [], stack = [ci]; seen.add(ci);
    while (stack.length) {
      const c = stack.pop(); comp.push(c);
      const k = keyOf.get(c), cc = P.cols;
      const nb = [k - cc, k + cc, k % cc ? k - 1 : -1, (k + 1) % cc ? k + 1 : -1];
      for (const n of nb) {
        const o = at.get(n);
        if (o !== undefined && !seen.has(o) && missing(o)) { seen.add(o); stack.push(o); }
      }
    }
    out.push(comp);
  }
  return out;
}

export function buildReport(m, P, R) {
  const c = cap(m.params), fac = !!P.fac, cs = fac ? P.fac.cs : m.params.swath;
  const wr = new Set(m.written || []);
  const total = P.cells.length - wr.size, cov = [...R.cov].filter(c => !wr.has(c)).length, gcs = [...R.gcsCov].filter(c => !wr.has(c)).length;
  const speed = m.params.speed;

  const gaps = groups(P, ci => !R.cov.has(ci) && !wr.has(ci)).map(comp => {
    let sx = 0, sy = 0; comp.forEach(ci => { sx += P.cells[ci].c[0]; sy += P.cells[ci].c[1]; });
    const mid = [sx / comp.length, sy / comp.length];
    const where = fac ? { along: mid[0], height: mid[1] } : { ll: P.f.toLL(mid) };
    const areaM2 = comp.length * cs * cs, lenM = areaM2 / Math.max(1, c.lineSp);
    return { cells: comp, n: comp.length, areaM2, ...where, flightM: lenM, flightS: lenM / speed };
  }).sort((a, b) => b.n - a.n);

  const unconfirmed = [];
  for (const ci of R.cov) if (!R.gcsCov.has(ci)) unconfirmed.push(ci);

  const found = m.found.map(f => ({ ...f }));
  const confirmed = new Set(m.found.map(f => f.id));
  const heldOnDrone = [];
  R.d.forEach(d => d.detected.forEach(id => { if (!confirmed.has(id)) heldOnDrone.push({ id, drone: d.i }); }));
  const detected = new Set(R.d.flatMap(d => [...d.detected]));
  const undetected = m.hidden.filter(h => !detected.has(h.id));

  const flown = m.dist.reduce((s, x) => s + x, 0);
  const photos = Math.round(flown / c.photoSp);
  const drones = R.d.map(d => ({
    i: d.i, mode: d.landed ? 'LANDED' : d.rtl ? 'RTL' : (m.dist[d.i] >= d.total - 0.01 ? 'DONE' : 'AUTO'),
    progress: d.total ? Math.min(1, m.dist[d.i] / d.total) : 1, wh: d.wh, flightMin: d.flightT / 60,
  }));

  const lost = R.d.filter(d => d.lost).map(d => d.i);
  const incidents = (m.incidents || []).slice();
  const gcsFrac = total ? gcs / total : 1;
  const verdict = gcsFrac >= CELL_COVERED && !undetected.length ? 'COMPLETE' : gcsFrac >= 0.7 ? 'PARTIAL' : 'INCOMPLETE';

  // Recon plan: gaps first (largest first), then recovery of unconfirmed data, then a re-look at anything detected but unconfirmed.
  const plan = [];
  gaps.slice(0, 8).forEach((g, k) => plan.push({
    kind: 'gap', text: `Re-fly gap ${k + 1}: ${g.n} cells (${Math.round(g.areaM2)} m²), about ${Math.ceil(g.flightS / 60)} min of flying`,
  }));
  if (unconfirmed.length) plan.push({ kind: 'recover', text: `Recover imagery for ${unconfirmed.length} cells flown but never confirmed at the GCS: download from the aircraft SD cards on landing` });
  if (heldOnDrone.length) plan.push({ kind: 'verify', text: `Verify ${heldOnDrone.length} detection${heldOnDrone.length > 1 ? 's' : ''} held on drones and not yet confirmed` });
  if (undetected.length && gaps.length) plan.push({ kind: 'note', text: 'Anomalies may still be hiding in the gaps; re-assess after the recon flight' });
  if (lost.length) plan.push({ kind: 'loss', text: `Replace ${lost.map(i => 'D' + (i + 1)).join(', ')} (destroyed); recover or write off the airframe${lost.length > 1 ? 's' : ''}` });
  if (wr.size) plan.push({ kind: 'writeoff', text: `${wr.size} cells were trampled and are written off; re-survey them after the area is cleared and reopened` });
  const reconS = gaps.reduce((s, g) => s + g.flightS, 0);

  return {
    verdict, total, cov, gcs, covPct: 100 * (total ? cov / total : 1), gcsPct: 100 * gcsFrac,
    gaps, unconfirmed, found, heldOnDrone, undetected, hiddenTotal: m.hidden.length,
    lost, incidents, written: wr.size, photos, flownM: flown, drones, plan, reconS, simT: m.simT, alerts: m.alerts, fac, cs,
  };
}
