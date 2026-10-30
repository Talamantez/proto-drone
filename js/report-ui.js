// Post-run report dialog: summary, coverage mosaic, gaps, recon plan and simulated photo intake.
import { $, esc, fmtT } from './util.js';
import { S } from './state.js';
import { mulberry32 } from './planner.js';
import { buildReport } from './report.js';
import { flyTo } from './nav.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// A stand-in for a drone photo: seeded terrain texture with a circled anomaly. Not real imagery.
function photo(fd, w = 320, h = 240) {
  const cv = el('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), rnd = mulberry32(fd.id * 7717 + 3);
  g.fillStyle = `hsl(${70 + rnd() * 40} 22% ${28 + rnd() * 10}%)`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `hsla(${50 + rnd() * 80} ${15 + rnd() * 20}% ${20 + rnd() * 30}% / .35)`;
    g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 14, 2 + rnd() * 9);
  }
  const x = w * (0.3 + rnd() * 0.4), y = h * (0.3 + rnd() * 0.4);
  g.fillStyle = '#7d6a58'; g.fillRect(x - 12, y - 8, 24, 16);
  g.strokeStyle = '#ff5a52'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 22, 0, 7); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - 16, w, 16);
  g.fillStyle = '#fff'; g.font = '10px monospace';
  g.fillText(`IMG_${String(fd.id).padStart(4, '0')}  D${fd.drone + 1}  ${fmtT(fd.t)}  SIMULATED`, 6, h - 5);
  return cv;
}

// Coverage mosaic: green = confirmed at GCS, amber = flown but unconfirmed, red = gap.
function mosaic(P, R, finds, wr) {
  const W = 360, cv = el('canvas'); const fac = !!P.fac;
  let pts;
  if (fac) { const { cs, cols, rows } = P.fac; pts = P.cells.map(c => [[c.c[0] - cs / 2, c.c[1] - cs / 2], [c.c[0] + cs / 2, c.c[1] + cs / 2]]); cv.width = W; cv.height = Math.round(W * rows / cols); }
  else pts = P.cells.map(c => c.corners);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const cx = fac ? ([u]) => u : ([la, ln]) => ln, cy = fac ? ([, z]) => z : ([la]) => la;
  pts.flat().forEach(p => { x0 = Math.min(x0, cx(p)); x1 = Math.max(x1, cx(p)); y0 = Math.min(y0, cy(p)); y1 = Math.max(y1, cy(p)); });
  const sx = (W - 8) / (x1 - x0 || 1), sy = fac ? sx : sx * Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const X = p => 4 + (cx(p) - x0) * sx, Y = p => 4 + (y1 - cy(p)) * sy;
  cv.width = W; cv.height = Math.round((y1 - y0) * sy + 8);
  const g = cv.getContext('2d'); g.fillStyle = '#0d1114'; g.fillRect(0, 0, cv.width, cv.height);
  P.cells.forEach((c, ci) => {
    g.fillStyle = wr.has(ci) ? '#3a3f45' : R.gcsCov.has(ci) ? '#4f9d62' : R.cov.has(ci) ? '#d9a441' : '#c4524d';
    const q = pts[ci];
    if (fac) g.fillRect(X(q[0]), Y(q[1]), X(q[1]) - X(q[0]) + 1, Y(q[0]) - Y(q[1]) + 1);
    else { g.beginPath(); q.forEach((p, k) => k ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))); g.closePath(); g.fill(); }
  });
  finds.forEach(f => { const p = fac ? [f.u, f.z] : f.ll; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p), Y(p), 3.5, 0, 7); g.fill(); g.strokeStyle = '#c4524d'; g.stroke(); });
  return cv;
}

const mins = s => `${Math.max(1, Math.round(s / 60))} min`;
let root = null;
function close() { if (root) { root.remove(); root = null; } }

export function openReport() {
  if (!S.mission || !S.R) return;
  close();
  const r = buildReport(S.mission, S.P, S.R), m = S.mission;
  const tone = { COMPLETE: 'ok', PARTIAL: 'warn', INCOMPLETE: 'bad' }[r.verdict];
  root = el('div'); root.id = 'report';
  const card = el('div', 'card'); root.append(card);
  card.append(el('div', 'head', `<h3>Survey report · ${esc(m.name)}</h3><span class="verdict ${tone}">${r.verdict}</span><button class="x" aria-label="Close">✕</button>`));
  card.querySelector('.x').onclick = close;
  root.addEventListener('click', e => { if (e.target === root) close(); });

  const stat = (k, v) => `<div><b>${v}</b><span>${k}</span></div>`;
  card.append(el('div', 'stats',
    stat('GCS-confirmed coverage', r.gcsPct.toFixed(0) + '%') + stat('Ground-truth coverage', r.covPct.toFixed(0) + '%') +
    stat('Gaps', r.gaps.length) + (r.written ? stat('Cells written off', r.written) : '') + (r.lost.length ? stat('Drones lost', r.lost.length) : '') + stat('Anomalies confirmed', `${r.found.length}/${r.hiddenTotal}`) +
    stat('Photos captured (est.)', r.photos) + stat('Run time', fmtT(r.simT))));

  const body = el('div', 'cols'); card.append(body);
  const left = el('div'), right = el('div'); body.append(left, right);

  left.append(el('h4', null, 'Coverage'), mosaic(S.P, S.R, r.found, new Set(m.written || [])));
  left.append(el('div', 'legend', '<i style="background:#4f9d62"></i>confirmed <i style="background:#d9a441"></i>flown, unconfirmed <i style="background:#c4524d"></i>gap <i style="background:#3a3f45"></i>written off'));

  right.append(el('h4', null, 'Recon plan'));
  const ul = el('ul');
  if (!r.plan.length) ul.append(el('li', null, 'No follow-up needed: the area is fully covered and confirmed.'));
  r.plan.forEach(p => ul.append(el('li', null, esc(p.text))));
  right.append(ul);
  if (r.gaps.length) right.append(el('div', 'dim', `Estimated recon flight: ${mins(r.reconS)} of flying for ${r.gaps.length} gap${r.gaps.length > 1 ? 's' : ''}, plus transit and battery swaps.`));
  r.gaps.slice(0, 5).forEach((g, k) => {
    if (r.fac) return;
    const b = el('button', 'gapbtn', `Show gap ${k + 1} on map`); b.onclick = () => { close(); flyTo(g.ll[0], g.ll[1], 19, `Gap ${k + 1}`); };
    right.append(b);
  });
  right.append(el('h4', null, 'Fleet'));
  right.append(el('div', 'dim', r.drones.map(d => `D${d.i + 1}: ${d.mode}, ${(d.progress * 100).toFixed(0)}% of path, ${d.flightMin.toFixed(1)} min, ${d.wh.toFixed(0)} Wh`).join('<br>')));
  if (r.alerts) right.append(el('div', 'dim', `${r.alerts} separation alert${r.alerts > 1 ? 's' : ''} logged.`));

  if (r.incidents.length) {
    card.append(el('h4', null, 'Incident timeline'));
    card.append(el('ul', 'timeline', r.incidents.map(x => `<li class="${x.kind}">${fmtT(x.t)} · ${esc(x.text)}</li>`).join('')));
  }
  card.append(el('h4', null, `Photo intake · simulated (${r.found.length} flagged frame${r.found.length === 1 ? '' : 's'})`));
  const gal = el('div', 'gallery');
  if (!r.found.length) gal.append(el('div', 'dim', 'No anomalies confirmed at the GCS, so no frames were flagged for review.'));
  r.found.forEach(f => {
    const fig = el('figure'); fig.append(photo(f, 160, 120), el('figcaption', null, `#${f.id} · D${f.drone + 1} · ${fmtT(f.t)}`));
    fig.onclick = () => view(f); gal.append(fig);
  });
  card.append(gal);
  if (r.heldOnDrone.length) card.append(el('div', 'dim', `${r.heldOnDrone.length} more detection${r.heldOnDrone.length > 1 ? 's are' : ' is'} still on the aircraft; frames arrive after landing.`));
  card.append(el('div', 'dim', 'Frames are generated placeholders to show the review workflow. Real captures need their own manifest and checksums.'));
  document.body.append(root);
}

function view(f) {
  const lb = el('div'); lb.id = 'lightbox';
  const big = photo(f, 640, 480);
  lb.append(big, el('div', 'cap', `Anomaly #${f.id} · detected by D${f.drone + 1} at ${fmtT(f.t)}, confirmed at GCS ${fmtT(f.tc)}${f.ll ? ` · ${f.ll[0].toFixed(5)}, ${f.ll[1].toFixed(5)}` : ''}`));
  lb.onclick = () => lb.remove();
  document.body.append(lb);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { const lb = $('lightbox'); if (lb) lb.remove(); else close(); } });
$('btnReport').onclick = openReport;
