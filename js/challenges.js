// Heritage gate, goal scoring and loading site challenges.
import { $, esc, pct, setHint } from './util.js';
import { CHECKS, MIN_STANDOFF } from './constants.js';
import { PRESETS, presetPoly } from './presets.js';
import { S } from './state.js';
import { build } from './mapview.js';
import { cap } from './planner.js';
import { layers } from './state.js';
import { logEvent } from './eventlog.js';
import { newMission, refreshMissionList, saveMission } from './missions.js';
import { readParams, setControls, writeParams } from './controls.js';
import { tourSignal } from './tour.js';

export function heritageIssues() {
  const p = S.mission.params, c = cap(p), out = [];
  if (c.stand < MIN_STANDOFF) out.push(`${p.mode === 'facade' ? 'standoff' : 'altitude'} ${c.stand.toFixed(1)} m is under ${MIN_STANDOFF} m (raise GSD)`);
  if (p.speed > c.vMax) out.push(`cruise ${p.speed} m/s exceeds ${c.vMax.toFixed(1)} m/s blur / trigger limit`);
  CHECKS.forEach((t, i) => { if (!S.mission.checks[i]) out.push('checklist: ' + t); });
  return out;
}
export const goalCtx = () => ({
  cov: pct(S.R.gcsCov), truth: pct(S.R.cov), found: S.mission.found.length, total: S.mission.hidden.length,
  alerts: S.mission.alerts, t: S.mission.simT, rtl: S.R.d.filter(d => d.rtl).length,
});
export function renderChallenge() {
  const s = PRESETS[S.mission.challenge];
  $('chalWrap').hidden = !s;
  if (!s) return;
  const x = goalCtx(), done = S.mission.status === 'complete';
  $('chal').innerHTML = `<div>${esc(s.title)}</div>` + s.goals.map(g => {
    const ok = g.ok(x) && (!g.final || done), bad = !ok && (done || (g.lost && g.lost(x)));
    return `<div class="${ok ? 'ok' : bad ? 'bad' : 'dim'}">${ok ? '✔' : bad ? '✘' : '○'} ${esc(g.label)} (${esc(g.val(x))})</div>`;
  }).join('');
}
export function loadPreset(key) {
  const s = PRESETS[key];
  if (!s) return;
  S.running = false; $('btnRun').textContent = 'Start';
  const p = { ...readParams(), seed: 1, layer: true, ...s.params };
  p.speed = s.params.speed ?? Math.max(0.5, Math.floor(cap(p).vMax * 2) / 2);   // slowest limit wins
  writeParams(p);
  $('missionName').value = s.title;
  const poly = presetPoly(s);
  S.mission = newMission(poly, key);
  build(false);
  S.map.fitBounds(layers.poly.getBounds().pad(0.6), { maxZoom: s.zoom });   // zoom cap: remote sites lack high-zoom imagery
  saveMission().then(() => refreshMissionList(S.mission.id));
  logEvent(`Challenge loaded: ${s.title} (${S.P.cells.length} cells, ${S.mission.params.n} drones, ${S.mission.params.speed} m/s)`, 'plan');
  setControls(); setHint(s.note); tourSignal('draw');
}
