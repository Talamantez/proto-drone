// Mission lifecycle: create, save, load, draw and adopt a polygon.
import './map.js';
import { $, fmtT, isNarrow, setHint } from './util.js';
import { setSheet } from './sheet.js';
import { lReveal } from './layerpanel.js';
import { DB } from './db.js';
import { S } from './state.js';
import { build, clearMission } from './mapview.js';
import { defaultPoiCfg } from './poi.js';
import { layers } from './state.js';
import { logEvent, renderEventLog } from './eventlog.js';
import { readParams, setControls, updateModeUi, writeParams } from './controls.js';
import { readPoiCfg, readPoiOpts, writePoiUi } from './poi-ui.js';
import { resetRun } from './sim.js';
import { tourSignal } from './tour.js';

export function newMission(poly, challenge) {
  const m = { id: 'm' + Date.now(), name: $('missionName').value || 'Site ' + new Date().toLocaleString(), poly, params: readParams(), hidden: null, challenge: challenge || null, pois: [], poiCfg: readPoiCfg(), poiOpts: readPoiOpts(), baseLL: null };
  resetRun(m);
  return m;
}
export function snapshot() {
  const m = S.mission;
  m.dr = S.R.d.map(d => {
    const outbox = d.outbox.map(({ sentAt, ...rest }) => rest);
    if (d.newCells.length) outbox.push({ id: d.oid + 1, kind: 'cells', cells: d.newCells.slice() });
    return { outbox, oid: d.oid + (d.newCells.length ? 1 : 0), rtl: d.rtl, landed: d.landed, wh: d.wh, flightT: d.flightT, rtlPos: d.rtl ? d.pos : null, extra: d.extra, applied: [...d.applied], detected: [...d.detected] };
  });
  m.gs = S.R.g.map(g => ({ reassigned: g.reassigned, total: g.total, assigns: g.assigns.map(({ sentAt, ...a }) => a) }));
}
export async function saveMission() {
  if (!S.mission) return;
  S.mission.name = $('missionName').value || S.mission.name;
  snapshot();
  await DB.putMission(JSON.parse(JSON.stringify(S.mission)));
}
export async function refreshMissionList(selectId) {
  const all = (await DB.allMissions()).sort((a, b) => b.id.localeCompare(a.id));
  const sel = $('missionSel'); sel.textContent = '';
  const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— none —'; sel.appendChild(o0);
  all.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.name} (${m.status}, ${fmtT(m.simT)})`; sel.appendChild(o); });
  sel.value = selectId || '';
}
export async function loadMission(id) {
  S.running = false; $('btnRun').textContent = 'Start';
  if (!id) {
    S.mission = null; S.R = null; clearMission(); $('drones').innerHTML = ''; $('log').textContent = ''; $('msgLog').textContent = '';
    $('elevWrap').hidden = true; $('chalWrap').hidden = true; ['qTime', 'qCov', 'qFound', 'hTime', 'hCov', 'hFound'].forEach(id => $(id).textContent = '–'); $('hudFaultRows').innerHTML = ''; setControls(); return;
  }
  S.mission = await DB.getMission(id);
  S.mission.checks = S.mission.checks || []; S.mission.fired = S.mission.fired || [];
  S.mission.pois = S.mission.pois || []; S.mission.poiCfg = S.mission.poiCfg || defaultPoiCfg(); S.mission.poiOpts = S.mission.poiOpts || readPoiOpts();
  writePoiUi(S.mission);
  $('missionName').value = S.mission.name;
  writeParams(S.mission.params);
  build(true);
  S.map.fitBounds(layers.poly.getBounds().pad(0.2));
  setControls(); renderEventLog();
  setHint(S.mission.simT ? `Restored from IndexedDB at t=${fmtT(S.mission.simT)}; in-flight messages were not persisted, outboxes were.` : 'Mission loaded.');
}
// ---- drawing ----
let drawMode = 'area';
export const drawNeed = () => drawMode === 'facade' ? 2 : 3;
export function syncDrawBar() {
  $('drawBar').classList.toggle('drawing', S.drawing);
  $('dbUndo').disabled = !S.drawPts.length;
}
export function undoDrawPoint() {
  if (!S.drawing || !S.drawPts.length) return;
  S.drawPts.pop(); layers.draw.setLatLngs(S.drawPts);
  $('btnFinish').disabled = S.drawPts.length < drawNeed(); syncDrawBar();
}
export function cancelDraw() {
  if (!S.drawing) return;
  S.drawing = false; S.drawPts = []; S.map.getContainer().style.cursor = '';
  if (layers.draw) { S.map.removeLayer(layers.draw); layers.draw = null; }
  $('btnFinish').disabled = true; syncDrawBar();
  setHint('Drawing cancelled.');
}
export function startDraw() {
  S.running = false; S.drawing = true; S.drawPts = []; drawMode = $('pMode').value;
  if (layers.draw) S.map.removeLayer(layers.draw);
  layers.draw = L.polyline([], { color: '#d9a441', dashArray: '4 4' }).addTo(S.map);
  S.map.getContainer().style.cursor = 'crosshair'; $('btnFinish').disabled = true;
  $('btnFinish').textContent = drawMode === 'facade' ? 'Finish line' : 'Close polygon';
  setHint(drawMode === 'facade'
    ? 'Click 2 points along the wall foot, left to right as seen from the drone side (wall on your left), then Finish line. First point is the launch side.'
    : 'Tap or click corners of the survey area (min 3), then Close polygon. First corner is the base/GCS.');
  syncDrawBar(); if (isNarrow()) setSheet('min');
}
export function finishDraw() {
  S.drawing = false; S.map.getContainer().style.cursor = '';
  S.map.removeLayer(layers.draw); layers.draw = null; $('btnFinish').disabled = true; syncDrawBar();
  adoptPoly(S.drawPts.slice(), drawMode);
}
export function adoptPoly(poly, mode, label) {
  S.running = false; $('btnRun').textContent = 'Start';
  if ($('pMode').value !== mode) { $('pMode').value = mode; updateModeUi(); }
  if (label) $('missionName').value = label;
  S.mission = newMission(poly);
  S.mission.params.mode = mode;
  build(false);
  const unhid = lReveal(['fleet', 'survey']);   // a layer toggled off or stacked under the imagery would hide the new area
  if (label) S.map.fitBounds(layers.poly.getBounds().pad(0.3));
  saveMission().then(() => refreshMissionList(S.mission.id));
  logEvent(`${mode === 'facade' ? 'Wall' : 'Area'} defined: ${S.P.cells.length} cells, ${S.mission.params.n} drones, seed ${S.mission.params.seed}`, 'plan');
  setControls(); setHint('Plan ready. Press Start on the map; use “Break a link” (top left of the map) to test failover.' + (unhid ? ' The survey layers were hidden or under another layer, so they were brought to the front.' : ''));
  tourSignal('draw');
}
S.map.on('click', e => {
  if (!S.drawing || (drawMode === 'facade' && S.drawPts.length >= 2)) return;
  S.drawPts.push([e.latlng.lat, e.latlng.lng]); layers.draw.setLatLngs(S.drawPts);
  $('btnFinish').disabled = S.drawPts.length < drawNeed(); syncDrawBar();
});
