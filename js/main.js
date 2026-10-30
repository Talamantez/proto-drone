// Entry point: wires controls to actions and boots the app.
import { $, pct, setHint, store } from './util.js';
import { CAM, CHECKS } from './constants.js';
import { DB } from './db.js';
import { S } from './state.js';
import { build } from './mapview.js';
import { cap } from './planner.js';
import { defaultPoiCfg } from './poi.js';
import { finishDraw, loadMission, refreshMissionList, saveMission, startDraw } from './missions.js';
import { frameLoop } from './runloop.js';
import { heritageIssues, loadPreset } from './challenges.js';
import { logEvent } from './eventlog.js';
import { hooks, nm, resetRun } from './sim.js';
import { addFindMarker, paintCell } from './mapview.js';
import { battUsable, hoverW, readParams, setControls, syncLabels, updateCap, updateModeUi } from './controls.js';
import { renderPoiTable } from './poi-ui.js';
import { renderUi } from './render.js';
import { startTour, tourSignal } from './tour.js';
// Modules that only register handlers on load.
import { LP } from './layerpanel.js';
import './overlays.js';
import './library.js';
import './hud.js';
import './threatmenu.js';
import './sheet.js';
import { initNav } from './nav.js';

Object.assign(hooks, { paintCell, addFind: addFindMarker, log: logEvent, battUsable, hoverW });

['eCap', 'eRes', 'eHover'].forEach(id => $(id).addEventListener('input', updateCap));
['pN', 'pSwath', 'pHead', 'pSpeed', 'pFeat', 'pMult', 'pLteLat', 'pLteLoss', 'pLoraLoss', 'pWallH', 'pGsd', 'pFwd', 'pSide'].forEach(id => $(id).addEventListener('input', () => {
  syncLabels();
  if (S.mission && ['pLteLat', 'pLteLoss', 'pLoraLoss'].includes(id)) {
    const p = readParams();
    Object.assign(S.mission.params, { lteLat: p.lteLat, lteLoss: p.lteLoss, loraLoss: p.loraLoss });
  }
}));
$('btnDraw').onclick = startDraw;
$('btnFinish').onclick = finishDraw;
$('missionSel').onchange = e => loadMission(e.target.value);
$('logFilter').onchange = () => renderUi(true);
$('pMode').onchange = () => { if ($('pMode').value === 'facade') $('pHeritage').checked = true; updateModeUi(); };
$('pPreset').onchange = e => { loadPreset(e.target.value); e.target.value = ''; };
$('btnCapApply').onclick = () => {
  const p = readParams(), c = cap(p);
  if (p.mode === 'area') $('pSwath').value = Math.min(60, Math.max(5, Math.round(c.lineSp)));
  $('pSpeed').value = Math.max(0.5, Math.min(+$('pSpeed').value, Math.floor(c.vMax * 2) / 2));
  syncLabels();
};
CHECKS.forEach((t, i) => {
  const row = document.createElement('div'); row.className = 'chk';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.chk = i; cb.disabled = true;
  const sp = document.createElement('span'); sp.textContent = t;
  row.append(cb, sp); $('checks').appendChild(row);
});
$('checks').onchange = e => {
  const i = e.target.dataset.chk;
  if (i === undefined || !S.mission) return;
  S.mission.checks[i] = e.target.checked;
  logEvent(`Pre-flight item ${+i + 1} ${e.target.checked ? 'confirmed' : 'cleared'}: ${CHECKS[i]}`, 'check');
  saveMission();
};
$('btnManifest').onclick = async () => {
  const m = S.mission, c = cap(m.params), r2 = x => Math.round(x * 100) / 100;
  const body = {
    generated: new Date().toISOString(),
    note: 'Simulation planning record. It is not flight data; real captures need their own manifest and checksums.',
    mission: { id: m.id, name: m.name, challenge: m.challenge, status: m.status, simT: r2(m.simT), poly: m.poly, params: m.params },
    camera: CAM,
    capture: { standoff_m: r2(c.stand), frame_m: [r2(c.fw), r2(c.fh)], line_spacing_m: r2(c.lineSp), exposure_spacing_m: r2(c.photoSp), max_speed_ms: r2(c.vMax) },
    preflight: CHECKS.map((item, i) => ({ item, confirmed: !!m.checks[i] })),
    result: { gcsCoveragePct: pct(S.R.gcsCov), truthCoveragePct: pct(S.R.cov), anomaliesConfirmed: m.found.length, anomaliesTotal: m.hidden.length, separationViolations: m.alerts },
  };
  const text = JSON.stringify(body, null, 2);
  let sha = 'unavailable (needs a secure context)';
  try { sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { /* no crypto.subtle */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...body, sha256_of_body: sha }, null, 2)], { type: 'application/json' }));
  a.download = `manifest-${m.id}.json`; a.click(); URL.revokeObjectURL(a.href);
};
$('btnPlan').onclick = () => {
  const np = readParams();
  if (np.mode !== (S.mission.params.mode || 'area')) {
    setHint('Mode is fixed per mission: draw a new area to switch.');
    $('pMode').value = S.mission.params.mode || 'area'; updateModeUi(); return;
  }
  S.running = false; $('btnRun').textContent = 'Start';
  S.mission.params = np; S.mission.hidden = null; resetRun(S.mission);
  build(false); setControls(); saveMission();
  logEvent(`Re-planned: ${S.mission.params.n} drones, ${S.mission.params.swath} m swath, ${S.mission.params.heading}°, seed ${S.mission.params.seed}`, 'plan');
};
$('btnRun').onclick = () => {
  if (!S.running && S.mission.params.heritage) {
    const why = heritageIssues();
    if (why.length) { setHint(`Heritage profile blocks Start: ${why[0]}${why.length > 1 ? ` (+${why.length - 1} more)` : ''}`); return; }
  }
  S.running = !S.running;
  $('btnRun').textContent = S.running ? 'Pause' : 'Resume';
  if (S.running) tourSignal('start');
  if (S.running) {
    if (!S.mission.simT) {
      if (S.mission.params.heritage) logEvent(`Heritage pre-flight signed off (${CHECKS.length}/${CHECKS.length}), standoff ${cap(S.mission.params).stand.toFixed(1)} m, ${S.mission.params.gsd} mm/px`, 'start');
      logEvent('Mission start: all drones armed, GCS heartbeats active', 'start');
    }
    S.last = performance.now(); S.saveAt = S.last; requestAnimationFrame(frameLoop);
  } else saveMission();
};
$('btnReset').onclick = () => {
  S.running = false; $('btnRun').textContent = 'Start';
  resetRun(S.mission); build(true); setControls(); saveMission();
  logEvent('Run reset', 'plan');
};
$('btnDelete').onclick = async () => {
  if (!S.mission || !confirm(`Delete “${S.mission.name}” and its event log?`)) return;
  await DB.delMission(S.mission.id); await loadMission(''); await refreshMissionList('');
};
$('btnCsv').onclick = () => {
  const rows = ['t,src,dst,type,link,seq,bytes,latency_ms,drop_reason',
    ...S.R.log.map(e => [e.t.toFixed(2), nm(e.src), nm(e.dst), e.type, e.link, e.seq, e.size, e.lat === null ? '' : e.lat.toFixed(1), e.why || ''].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = `msglog-${S.mission.id}.csv`; a.click(); URL.revokeObjectURL(a.href);
};
window.addEventListener('pagehide', saveMission);
renderPoiTable(defaultPoiCfg());
syncLabels(); setControls();
refreshMissionList('').then(() => {
  if (store.get('tourSeen') || deepLinked) return;   // a shared map link skips the first-run tour
  startTour();      // first visit: walk through drawing an area
}).catch(err => setHint('IndexedDB unavailable: ' + err));

const deepLinked = initNav();

// Handle for e2e tests and console debugging.
window.__app = { S, LP };
