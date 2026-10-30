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

  const found = m.found.filter(f => !f.decoy).map(f => ({ ...f }));
  const falseAlarms = m.found.filter(f => f.decoy).length;
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

  const phantom = [...R.gcsCov].filter(c => !R.cov.has(c) && !wr.has(c)).length;
  const lost = R.d.filter(d => d.lost).map(d => d.i);
  const incidents = (m.incidents || []).slice();
  const gcsFrac = total ? gcs / total : 1;
  const trueFrac = Math.min(gcsFrac, total ? cov / total : 1);
  const verdict = trueFrac >= CELL_COVERED && !undetected.length ? 'COMPLETE' : trueFrac >= 0.7 ? 'PARTIAL' : 'INCOMPLETE';

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
  const sec = m.sec || { gps: 0, cmd: 0, rejected: 0, alarms: 0, maxErr: 0, resumed: 0 }, def = m.def || {};
  const attacked = sec.gps + sec.cmd + (sec.rogue || 0) + (sec.jam || 0) + (sec.replay || 0) + (sec.snoop || 0) + (sec.flood || 0) + (sec.poison || 0) + (sec.decoys || 0) + (sec.tainted || 0) > 0, defended = Object.values(def).some(Boolean);
  if (sec.hijacked && !def.auth) plan.push({ kind: 'sec', text: `${sec.hijacked} drone(s) were hijacked over an unauthenticated link: require signed commands on every radio, mesh included` });
  if (sec.collisions && !def.daa) plan.push({ kind: 'sec', text: 'Add detect-and-avoid (remote-ID roster, radar or ADS-B in) so drones can evade unknown aircraft' });
  if (phantom) plan.push({ kind: 'sec', text: `Re-fly ${phantom} cells the GCS believes are done but were never imaged (compromised drone); quarantine it and reflash signed firmware` });
  if (sec.leaked && !def.encrypt) plan.push({ kind: 'sec', text: `An eavesdropper read ${sec.leaked} messages including ${sec.leakedDet} anomaly locations: encrypt every link` });
  if (falseAlarms && !def.confirm) plan.push({ kind: 'sec', text: `${falseAlarms} decoy(s) were confirmed as real anomalies: require second-sensor confirmation` });
  if (sec.poison && !def.validate) plan.push({ kind: 'sec', text: 'Poisoned map data sent a drone outside the area: validate waypoints against the survey geofence' });
  if (sec.flood && !def.rate) plan.push({ kind: 'sec', text: 'A junk-frame flood grounded a drone in a hover: add rate limiting and a command allow-list' });
  if (sec.tainted && !def.attest) plan.push({ kind: 'sec', text: 'Tampered firmware ran unchecked: enforce secure boot and attestation' });
  if (sec.jam && !def.hop) plan.push({ kind: 'sec', text: 'RF jamming cut the links: add frequency hopping, a second link type and mesh relay so drones keep contact' });
  if (sec.replay && !def.fresh) plan.push({ kind: 'sec', text: 'A replayed signed command was obeyed: signatures alone do not stop replay, add timestamps or sequence numbers' });
  if (attacked && !def.gnss && sec.gps) plan.push({ kind: 'sec', text: 'Enable the GNSS integrity check: a spoofed fix dragged a drone up to ' + Math.round(sec.maxErr) + ' m off its path unnoticed' });
  if (attacked && !def.auth && sec.cmd) plan.push({ kind: 'sec', text: 'Require signed commands: an unsigned forged order was obeyed' });
  if (attacked && sec.cmd && def.auth && !sec.rejected) plan.push({ kind: 'sec', text: 'Forged command not seen as rejected; check the radio logs' });
  const reconS = gaps.reduce((s, g) => s + g.flightS, 0);

  return {
    verdict, total, cov, gcs, covPct: 100 * (total ? cov / total : 1), gcsPct: 100 * gcsFrac,
    gaps, unconfirmed, found, heldOnDrone, undetected, hiddenTotal: m.hidden.length, falseAlarms, phantom,
    sec, defences: def, attacked, defended, lost, incidents, written: wr.size, photos, flownM: flown, drones, plan, reconS, simT: m.simT, alerts: m.alerts, fac, cs,
  };
}
