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
import { SHAPES, shapePoly, simplifyPath } from './geo.js';
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
    return { outbox, oid: d.oid + (d.newCells.length ? 1 : 0), off: d.off, spoof: d.spoof, gnssAlarm: d.gnssAlarm, lost: d.lost, rtl: d.rtl, rtlWhy: d.rtlWhy, rejoin: d.rejoin, landed: d.landed, wh: d.wh, flightT: d.flightT, rtlPos: d.rtl || d.lost ? d.pos : null, extra: d.extra, applied: [...d.applied], detected: [...d.detected] };
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
// Two tools: tap corners one by one, or sketch the outline with a pen (stylus, finger or mouse drag) and let it snap to corners.
let drawMode = 'area', drawTool = 'points', stroke = null, penDone = false, shapeAt = null;
export const drawNeed = () => drawMode === 'facade' ? 2 : 3;
const penOn = () => S.drawing && drawTool === 'pen' && drawMode === 'area';
function paintDraw() {
  const ll = S.drawPts;
  layers.draw.setLatLngs(penDone ? [...ll, ll[0]] : ll);
  layers.drawDots.clearLayers();
  ll.forEach((p, i) => {
    const first = i === 0;
    const m = L.circleMarker(p, { radius: first ? 9 : 6, color: '#fff', weight: 2, fillColor: first ? '#3ddc84' : '#d9a441', fillOpacity: 1, interactive: false }).addTo(layers.drawDots);
    m.bindTooltip(first ? 'Base' : String(i + 1), { permanent: true, direction: 'top', offset: [0, -6], className: 'drawtip' });
  });
}
const GUIDE = {
  points: n => n === 0 ? ['Tap the map to drop your first corner', 'This one becomes the launch base (green).'] : n < 3 ? [`${n} placed · ${3 - n} more needed`, 'Keep tapping around the edge of the area. Undo removes the last corner.'] : [`${n} corners · ready`, 'Press the green Close polygon button, or keep tapping to add corners.'],
  facade: n => n === 0 ? ['Tap the wall foot, left end first', 'Stand on the drone side: the wall is on your left. This point is the launch side.'] : n < 2 ? ['1 placed · 1 more needed', 'Tap the other end of the wall foot.'] : ['2 points · ready', 'Press the green Finish line button.'],
  shape: n => n ? [`${SHAPES[$('dgShapeSel').value].label} · ${$('dgSize').value} m across`, 'Drag the slider to scale it, tap elsewhere to move it, then press the green Close polygon button.'] : ['Pick a shape, then tap where to put it', 'Tap the map to drop it centred there; the first corner becomes the base.'],
  pen: n => penDone ? [`Outline captured · ${n} corners`, 'Press the green Close polygon button, or draw again to redo it.'] : ['Press and drag to sketch the outline', 'Go all the way around, then lift. It snaps to corners; the start becomes the base.'],
};
export function syncDrawBar() {
  const n = S.drawPts.length, g = GUIDE[drawMode === 'facade' ? 'facade' : drawTool](n), canPen = drawMode === 'area';
  $('drawBar').classList.toggle('drawing', S.drawing);
  $('dbUndo').disabled = !n;
  $('drawGuide').hidden = !S.drawing;
  $('dgTitle').textContent = g[0]; $('dgBody').textContent = g[1];
  $('dgTools').hidden = !canPen; $('dgShape').hidden = !(canPen && drawTool === 'shape'); $('dgSizeV').textContent = $('dgSize').value + ' m';
  $('dgTools').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tool === drawTool));
  $('dgSteps').children[0].className = n >= drawNeed() ? 'done' : 'now';
  $('dgSteps').children[1].className = n >= drawNeed() ? 'now' : '';
  $('map').classList.toggle('pen-mode', penOn());
  $('hudRun').classList.toggle('next', !S.drawing && !$('btnRun').disabled && $('btnRun').textContent === 'Start');   // one highlighted button at a time
}
function setTool(t) {
  drawTool = t; if (!S.drawing) return;
  S.drawPts = []; penDone = false; shapeAt = null; stroke = null; paintDraw();
  if (penOn()) S.map.dragging.disable(); else S.map.dragging.enable();
  $('btnFinish').disabled = true; syncDrawBar();
}
export function undoDrawPoint() {
  if (!S.drawing || !S.drawPts.length) return;
  if (penDone) { S.drawPts = []; penDone = false; } else S.drawPts.pop();
  paintDraw(); $('btnFinish').disabled = S.drawPts.length < drawNeed(); syncDrawBar();
}
function endDraw() {
  S.drawing = false; S.drawPts = []; penDone = false; stroke = null; S.map.dragging.enable();
  S.map.getContainer().style.cursor = '';
  S.map.removeLayer(layers.draw); layers.draw = null; S.map.removeLayer(layers.drawDots); layers.drawDots = null;
  $('btnFinish').disabled = true; syncDrawBar();
}
export function cancelDraw() {
  if (!S.drawing) return;
  endDraw(); setHint('Drawing cancelled.');
}
export function startDraw() {
  if (S.drawing) endDraw();
  S.running = false; S.drawing = true; S.drawPts = []; penDone = false; shapeAt = null; drawMode = $('pMode').value;
  layers.draw = L.polyline([], { color: '#d9a441', weight: 3, dashArray: '6 5' }).addTo(S.map);
  layers.drawDots = L.layerGroup().addTo(S.map);
  S.map.getContainer().style.cursor = 'crosshair'; $('btnFinish').disabled = true;
  $('btnFinish').textContent = drawMode === 'facade' ? 'Finish line' : 'Close polygon';
  if (penOn()) S.map.dragging.disable();
  setHint(drawMode === 'facade'
    ? 'Click 2 points along the wall foot, left to right as seen from the drone side (wall on your left), then Finish line. First point is the launch side.'
    : 'Tap corners of the survey area (min 3), or switch to Pen and sketch it, then Close polygon. First corner is the base/GCS.');
  syncDrawBar(); if (isNarrow()) setSheet('min');
}
export function finishDraw() {
  const pts = S.drawPts.slice(), mode = drawMode;
  endDraw(); adoptPoly(pts, mode);
}
// Pen strokes are tracked in screen pixels so the corner snapping looks the same at any zoom.
function penDown(e) {
  if (!penOn() || e.button > 0 || !e.isPrimary) return;
  if (e.target.closest('#mapBottom, #hud, #hudFaults, #threatBox, #search, #lyr, .leaflet-control')) return;   // buttons on the map are not strokes
  stroke = [S.map.mouseEventToContainerPoint(e)]; penDone = false; S.drawPts = []; paintDraw();
  $('btnFinish').disabled = true; e.target.setPointerCapture?.(e.pointerId);
  layers.draw.setLatLngs([S.map.containerPointToLatLng(stroke[0])]);
}
function penMove(e) {
  if (!stroke) return;
  const p = S.map.mouseEventToContainerPoint(e), q = stroke[stroke.length - 1];
  if (Math.hypot(p.x - q.x, p.y - q.y) < 3) return;
  stroke.push(p); layers.draw.setLatLngs(stroke.map(pt => S.map.containerPointToLatLng(pt)));
}
function penUp() {
  if (!stroke) return;
  const pts = stroke.map(p => [p.x, p.y]); stroke = null;
  const span = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
  const simp = pts.length > 8 && span > 60 ? simplifyPath(pts, 10) : [];
  if (simp.length > 3 && Math.hypot(simp[0][0] - simp[simp.length - 1][0], simp[0][1] - simp[simp.length - 1][1]) < 24) simp.pop();   // stroke ended back at the start
  if (simp.length < 3) { S.drawPts = []; layers.draw.setLatLngs([]); setHint('That stroke was too small or too straight. Draw a loop around the area.'); return syncDrawBar(); }
  S.drawPts = simp.slice(0, 60).map(p => { const ll = S.map.containerPointToLatLng(p); return [ll.lat, ll.lng]; });
  penDone = true; paintDraw(); $('btnFinish').disabled = false; syncDrawBar();
}
function placeShape() {
  if (!shapeAt) return syncDrawBar();
  S.drawPts = shapePoly($('dgShapeSel').value, shapeAt, +$('dgSize').value);
  penDone = true; paintDraw(); $('btnFinish').disabled = false; syncDrawBar();
}
$('dgShapeSel').innerHTML = Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('dgShapeSel').onchange = $('dgSize').oninput = placeShape;
const mapEl = S.map.getContainer();
mapEl.addEventListener('pointerdown', penDown);
mapEl.addEventListener('pointermove', penMove);
mapEl.addEventListener('pointerup', penUp);
mapEl.addEventListener('pointercancel', () => { stroke = null; });   // a second finger (pinch) hands the gesture back to the map
mapEl.addEventListener('pointerdown', e => { if (stroke && !e.isPrimary) { stroke = null; paintDraw(); } });
$('dgTools').onclick = e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); };
L.DomEvent.disableClickPropagation($('drawGuide'));
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
  if (S.drawing && drawTool === 'shape' && drawMode === 'area') { shapeAt = [e.latlng.lat, e.latlng.lng]; return placeShape(); }
  if (!S.drawing || penOn() || (drawMode === 'facade' && S.drawPts.length >= 2)) return;
  S.drawPts.push([e.latlng.lat, e.latlng.lng]); paintDraw();
  $('btnFinish').disabled = S.drawPts.length < drawNeed(); syncDrawBar();
});
