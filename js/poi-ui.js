// Road POI table, Overpass fetch and base snapping.
import { $, esc, setHint } from './util.js';
import { M_LAT } from './constants.js';
import { ROAD_RANK, TIERS, cellWeights, classifyPois, defaultPoiCfg, pickSnap, poiBonus, setBack } from './poi.js';
import { S } from './state.js';
import { build } from './mapview.js';
import { layers } from './state.js';
import { logEvent } from './eventlog.js';
import { overpass } from './overpass.js';
import { resetRun } from './sim.js';
import { saveMission } from './missions.js';
import { setControls } from './controls.js';

// ---- POI UI: tier table, fetch, map layer, snapping, zone weights ----
export function renderPoiTable(cfg) {
  const cnt = {}; (S.mission ? S.mission.pois : []).forEach(p => cnt[p.tier] = (cnt[p.tier] || 0) + 1);
  $('poiTable').tBodies[0].innerHTML = TIERS.map(t => {
    const c = cfg[t.id];
    return `<tr><td><span style="color:${t.color}">●</span> ${esc(t.name)}</td>` +
      `<td><input type="checkbox" data-t="${t.id}" data-k="show"${c.show ? ' checked' : ''}></td>` +
      `<td><input type="checkbox" data-t="${t.id}" data-k="snap"${c.snap ? ' checked' : ''}></td>` +
      `<td><input type="number" data-t="${t.id}" data-k="w" value="${c.w}" min="0" max="10" step="0.5" style="width:52px"></td>` +
      `<td class="dim">${cnt[t.id] || 0}</td></tr>`;
  }).join('');
}
export function readPoiCfg() {
  const cfg = defaultPoiCfg();
  document.querySelectorAll('#poiTable input').forEach(el => {
    const c = cfg[el.dataset.t]; if (!c) return;
    c[el.dataset.k] = el.type === 'checkbox' ? el.checked : Math.max(0, +el.value || 0);
  });
  return cfg;
}
export const readPoiOpts = () => ({ buf: +$('poBuf').value, rad: +$('poRad').value, back: +$('poBack').value, zone: +$('poZone').value, hard: $('poHard').checked });
export function writePoiUi(m) {
  renderPoiTable(m.poiCfg);
  const o = m.poiOpts; $('poBuf').value = o.buf; $('poRad').value = o.rad; $('poBack').value = o.back; $('poZone').value = o.zone; $('poHard').checked = !!o.hard;
}
export function wpct(set) {
  let a = 0, b = 0; S.P.w.forEach(w => b += w); set.forEach(ci => a += S.P.w[ci] || 0);
  return b ? Math.round(100 * a / b) : 0;
}
export function applyWeights() {
  S.P.w = null;
  if (!S.mission || S.P.fac) return;
  S.P.w = cellWeights(S.P.cells, S.mission.pois, S.mission.poiCfg, S.P.f.toXY, S.mission.poiOpts.zone);
  const seen = new Set(S.mission.covered);
  layers.cells.getLayers().forEach((poly, ci) => {
    const w = S.P.w[ci];
    if (w > 1 && !seen.has(ci)) poly.setStyle({ fillColor: '#8e6bd1', fillOpacity: Math.min(.4, .07 + (w - 1) * .08) });
  });
}
export function drawPois() {
  if (layers.pois) { S.map.removeLayer(layers.pois); layers.pois = null; }
  if (!S.mission || S.P.fac) return;
  const cfg = S.mission.poiCfg, col = Object.fromEntries(TIERS.map(t => [t.id, t.color]));
  layers.pois = L.layerGroup(S.mission.pois.filter(p => cfg[p.tier].show).map(p =>
    L.circleMarker(p.ll, { pane: 'p_poi', radius: 3 + 4 * p.flow, color: '#000', weight: 1, fillColor: col[p.tier], fillOpacity: .9 })
      .bindTooltip(`${TIERS.find(t => t.id === p.tier).name} · flow ${p.flow.toFixed(2)} · bonus ${poiBonus(p, cfg).toFixed(2)}`))).addTo(S.map);
}
export function poiSettingsChanged() {
  if (!S.mission) return;
  S.mission.poiCfg = readPoiCfg(); S.mission.poiOpts = readPoiOpts();
  if (S.P && !S.P.fac) { applyWeights(); drawPois(); }
  saveMission();
}
$('poiTable').addEventListener('input', poiSettingsChanged);
['poBuf', 'poRad', 'poBack', 'poZone', 'poHard'].forEach(id => $(id).addEventListener('change', poiSettingsChanged));
$('btnPois').onclick = async () => {
  if (!S.mission) return;
  const buf = +$('poBuf').value || 0, ys = S.mission.poly.map(p => p[0]), xs = S.mission.poly.map(p => p[1]);
  const dLat = buf / M_LAT, dLng = buf / (M_LAT * Math.cos(ys[0] * Math.PI / 180));
  const bb = [Math.min(...ys) - dLat, Math.min(...xs) - dLng, Math.max(...ys) + dLat, Math.max(...xs) + dLng].map(v => v.toFixed(6)).join(',');
  const hw = Object.keys(ROAD_RANK).join('|');
  $('btnPois').disabled = true; setHint('Querying Overpass…');
  try {
    const els = await overpass(`[out:json][timeout:25];(way["highway"~"^(${hw})$"](${bb});node["highway"="motorway_junction"](${bb});node["railway"="level_crossing"](${bb}););out geom tags;`);
    S.mission.pois = classifyPois(els);
    setHint(`${S.mission.pois.length} POIs from ${els.length} OSM elements. © OpenStreetMap contributors.`);
    logEvent(`Fetched ${S.mission.pois.length} road POIs (buffer ${buf} m)`, 'plan');
    renderPoiTable(S.mission.poiCfg); applyWeights(); drawPois(); saveMission();
  } catch (e) { setHint('Overpass failed: ' + e.message + '. Retry in a moment.'); }
  setControls();
};
export function rebuildKeepingTruth() {
  S.running = false; $('btnRun').textContent = 'Start';
  resetRun(S.mission); build(true); setControls(); saveMission();
}
$('btnSnap').onclick = () => {
  if (!S.mission || !S.mission.pois.length) return;
  if (S.mission.simT) { setHint('Snapping moves the base and restarts the run: reset first or accept the restart.'); }
  const o = readPoiOpts(), cfg = readPoiCfg(), f = S.P.f, xy = S.mission.poly.map(f.toXY);
  const from = xy[0], centre = [xy.reduce((s, p) => s + p[0], 0) / xy.length, xy.reduce((s, p) => s + p[1], 0) / xy.length];
  const hit = pickSnap(S.mission.pois, cfg, f.toXY, from, o.rad, o.hard);
  if (!hit) { setHint(`No eligible POI within ${o.rad} m of the first vertex: widen the radius or enable more tiers.`); return; }
  S.mission.baseLL = f.toLL(setBack(hit.xy, centre, o.back));
  const t = TIERS.find(t => t.id === hit.poi.tier).name;
  logEvent(`Base snapped to ${t} (${hit.d.toFixed(0)} m from first vertex, flow ${hit.poi.flow.toFixed(2)}), set back ${o.back} m`, 'plan');
  rebuildKeepingTruth();
};
$('btnUnsnap').onclick = () => { S.mission.baseLL = null; logEvent('Base restored to first vertex', 'plan'); rebuildKeepingTruth(); };
