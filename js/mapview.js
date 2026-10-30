// Builds and clears the Leaflet layers for a mission.
import { $, fmtT } from './util.js';
import { COLORS } from './constants.js';
import { S, layers } from './state.js';
import { applyWeights, drawPois } from './poi-ui.js';
import { cumAt, initRuntime, planMission, tp } from './sim.js';
import { renderUi } from './render.js';

export function clearMission() {
  ['poly', 'cells', 'finds', 'base', 'pois', 'env', 'libPrev'].forEach(k => { if (layers[k]) { S.map.removeLayer(layers[k]); layers[k] = null; } });
  layers.d.forEach(o => ['trail', 'link', 'tag', 'belief'].forEach(k => S.map.removeLayer(o[k]))); layers.d = [];
}
export function paintCell(ci, state) {
  if (S.P.fac) { elevImg.data.set(state === 2 ? [79, 157, 98, 210] : [217, 164, 65, 170], ci * 4); return; }
  const poly = layers.cells.getLayers()[ci];
  if (poly) poly.setStyle(state === 2 ? { fillColor: '#4f9d62', fillOpacity: 0.45 } : { fillColor: '#d9a441', fillOpacity: 0.35 });
}
export function addFindMarker(fd) {
  const at = fd.z === undefined ? '' : ` at ${fd.z.toFixed(0)} m height`;
  L.circleMarker(fd.ll, { pane: 'p_survey', radius: 5, color: '#fff', weight: 1, fillColor: '#c4524d', fillOpacity: 1 })
    .bindTooltip(`Anomaly #${fd.id}${at}: detected by D${fd.drone + 1} at ${fmtT(fd.t)}, confirmed at GCS ${fmtT(fd.tc)}`).addTo(layers.finds);
}
// wall elevation view: one pixel per cell, flipped so height points up
let elevImg = null, elevOff = null;
export function initElev() {
  const F = S.P.fac, cv = $('elev');
  cv.width = 416; cv.height = Math.max(50, Math.min(160, Math.round(416 * F.H / F.L)));
  elevOff = document.createElement('canvas'); elevOff.width = F.cols; elevOff.height = F.rows;
  elevImg = elevOff.getContext('2d').createImageData(F.cols, F.rows);
  for (let k = 0; k < F.cols * F.rows; k++) elevImg.data.set([255, 255, 255, 18], k * 4);
}
export function drawElev() {
  const F = S.P.fac, cv = $('elev'), g = cv.getContext('2d'), sx = cv.width / F.L, sy = cv.height / F.H;
  elevOff.getContext('2d').putImageData(elevImg, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  g.save(); g.translate(0, cv.height); g.scale(1, -1);
  g.drawImage(elevOff, 0, 0, F.cols * F.cs * sx, F.rows * F.cs * sy); g.restore();
  const dot = (u, z, col, r) => { g.beginPath(); g.arc(u * sx, cv.height - z * sy, r, 0, 7); g.fillStyle = col; g.fill(); };
  S.mission.found.forEach(f => dot(f.u, f.z, '#c4524d', 3));
  S.R.d.forEach((d, i) => dot((tp(d)[0] - F.A[0]) * F.t[0] + (tp(d)[1] - F.A[1]) * F.t[1], d.pos[2], COLORS[i % COLORS.length], 4));
}
export function build(preserve) {
  clearMission();
  const m = S.mission;
  planMission(m, preserve);
  // A dark casing under the white dashes keeps the outline readable on pale ground.
  const outline = { pane: 'p_survey', color: '#fff', weight: 2, fill: false, dashArray: '7 5' }, casing = { pane: 'p_survey', color: '#000', weight: 5, opacity: .45, fill: false, interactive: false };
  const shape = o => S.P.fac ? L.polyline(m.poly, o) : L.polygon(m.poly, o);
  layers.poly = L.featureGroup([shape(casing), shape(outline)]).addTo(S.map);
  layers.base = L.marker(S.P.f.toLL(S.P.base), { title: 'Base / GCS', pane: 'p_fleet' }).addTo(S.map);
  if (S.P.fac) {
    const F = S.P.fac, edge = u => S.P.f.toLL([F.A[0] + F.t[0] * u + F.nr[0] * F.c.stand, F.A[1] + F.t[1] * u + F.nr[1] * F.c.stand]);
    layers.cells = L.layerGroup([L.polyline([edge(0), edge(F.L)], { pane: 'p_survey', color: '#d9a441', weight: 1, dashArray: '2 6', interactive: false })]).addTo(S.map);
    initElev();
  } else {
    const canvas = L.canvas({ padding: 0.3, pane: 'p_survey' });
    layers.cells = L.layerGroup(S.P.cells.map(c =>
      L.polygon(c.corners, { pane: 'p_survey', renderer: canvas, stroke: false, fillColor: '#fff', fillOpacity: 0.07, interactive: false }))).addTo(S.map);
  }
  $('elevWrap').hidden = !S.P.fac;
  applyWeights(); drawPois();
  layers.finds = L.layerGroup().addTo(S.map);
  if (layers.zilla) { S.map.removeLayer(layers.zilla); layers.zilla = null; }

  initRuntime(m);
  S.R.d.forEach((d, i) => {
    const color = COLORS[i % COLORS.length], basePath = S.P.paths[i];
    layers.d.push({
      trail: L.polyline(basePath.filter((_, k) => cumAt(basePath, k) <= m.dist[i]).map(S.P.f.toLL).concat([S.P.f.toLL(d.pos)]), { pane: 'p_fleet', color, weight: 2, opacity: 0.7 }).addTo(S.map),
      link: L.polyline([S.P.f.toLL(S.P.base), S.P.f.toLL(d.pos)], { pane: 'p_fleet', weight: 1, opacity: 0.7 }).addTo(S.map),
      belief: L.circleMarker(S.P.f.toLL(d.pos), { pane: 'p_fleet', radius: 8, color, weight: 1.5, fill: false, dashArray: '2 2' }).addTo(S.map),
      tag: L.marker(S.P.f.toLL(d.pos), {
        icon: L.divIcon({ className: '', iconSize: [26, 16], iconAnchor: [13, 8], html: `<div class="tag" style="background:${color}">D${i + 1}</div>` }),
        zIndexOffset: 1000, pane: 'p_fleet',
      }).addTo(S.map),
    });
  });
  renderUi(true);
}
