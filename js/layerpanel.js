// GIS-style layer stack: panes, visibility, opacity, blend modes and order.
import { $ } from './util.js';
import { S } from './state.js';
import { hwBuild, ovSync } from './overlays.js';
import { osm, sat } from './map.js';

// ---- GIS-style layer stack: every layer lives in its own pane, so visibility, opacity, blend mode and order are pane CSS ----
export const LDEF = {
  fleet:   { name: 'Fleet & links', pane: 'p_fleet', kind: 'pane' },
  survey:  { name: 'Survey area & coverage', pane: 'p_survey', kind: 'pane' },
  poi:     { name: 'Road POIs', pane: 'p_poi', kind: 'pane' },
  env:     { name: 'Decay / land use (OSM)', pane: 'p_env', kind: 'pane' },
  ovFlood: { name: 'Flood zones (FEMA, US)', pane: 'p_ovFlood', kind: 'tile', o: .7 },
  ovWater: { name: 'Surface-water change (JRC)', pane: 'p_ovWater', kind: 'tile', o: .7 },
  ovNight: { name: 'Night lights (NASA)', pane: 'p_ovNight', kind: 'tile', o: .7 },
  ovLst:   { name: 'Surface heat (NASA)', pane: 'p_ovLst', kind: 'tile', o: .7 },
  ovNdvi:  { name: 'Vegetation greenness (NASA)', pane: 'p_ovNdvi', kind: 'tile', o: .7 },
  hist:    { name: 'Past imagery (swipe)', pane: 'p_hist', kind: 'hist' },
  streets: { name: 'Streets (OSM)', pane: 'p_streets', kind: 'base' },
  sat:     { name: 'Satellite (Esri)', pane: 'p_sat', kind: 'base' },
};
export const LORDER = Object.keys(LDEF);
export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'difference', 'luminosity'];
export const LP = { order: LORDER.slice(), st: {} };
try {
  const j = JSON.parse(localStorage.getItem('layerPanel') || 'null');
  if (j && Array.isArray(j.order) && j.order.length === LORDER.length && LORDER.every(i => j.order.includes(i))) LP.order = j.order;
  if (j && j.st && typeof j.st === 'object') LP.st = j.st;
} catch { /* storage unavailable */ }
export const lSt = id => LP.st[id] = { v: true, o: LDEF[id].o ?? 1, b: 'normal', ...LP.st[id] };
Object.values(LDEF).forEach(d => S.map.createPane(d.pane));
export const lSave = () => { try { localStorage.setItem('layerPanel', JSON.stringify(LP)); } catch { /* ignore */ } };
export function lApply(id) {
  const d = LDEF[id], s = lSt(id), p = S.map.getPane(d.pane);
  p.style.zIndex = 210 + LP.order.length - 1 - LP.order.indexOf(id);
  p.style.opacity = s.o; p.style.mixBlendMode = s.b;
  if (d.kind === 'pane') p.style.display = s.v ? '' : 'none';
}
export const lVisible = id => {
  const k = LDEF[id].kind;
  return k === 'pane' ? lSt(id).v : k === 'tile' ? $(id).checked : k === 'hist' ? $('hwOn').checked : S.map.hasLayer(id === 'sat' ? sat : osm);
};
export function lSetVisible(id, v) {
  const k = LDEF[id].kind;
  if (k === 'pane') lSt(id).v = v;
  else if (k === 'tile') { $(id).checked = v; ovSync(id); }
  else if (k === 'hist') { if ($('hwOn').disabled) return; $('hwOn').checked = v; hwBuild(); }
  else { const l = id === 'sat' ? sat : osm; v ? l.addTo(S.map) : S.map.removeLayer(l); }
  lApply(id); lSave(); lRender();
}
// Shows the given vector layers and brings them to the front when a raster layer sits above them, so a new area is never hidden.
// Returns true if anything had to change.
export function lReveal(ids) {
  let changed = false;
  for (const id of ids) if (!lSt(id).v) { lSt(id).v = true; changed = true; }
  const firstRaster = LP.order.findIndex(i => LDEF[i].kind !== 'pane'), lastOurs = Math.max(...ids.map(id => LP.order.indexOf(id)));
  if (firstRaster !== -1 && firstRaster < lastOurs) { LP.order = [...ids, ...LP.order.filter(i => !ids.includes(i))]; changed = true; }
  if (changed) { LORDER.forEach(lApply); lSave(); lRender(); }
  return changed;
}

// Back to the defaults: original order, satellite only, no overlays, nothing hidden.
export function lReset() {
  LP.order = LORDER.slice(); LP.st = {};
  for (const id of LORDER) if (LDEF[id].kind === 'tile') { $(id).checked = false; ovSync(id); }
  if (!$('hwOn').disabled && $('hwOn').checked) { $('hwOn').checked = false; hwBuild(); }
  S.map.removeLayer(osm); if (!S.map.hasLayer(sat)) sat.addTo(S.map);
  LORDER.forEach(lApply); lSave(); lRender();
}
export const lyr = document.createElement('div'); lyr.id = 'lyr'; S.map.getContainer().appendChild(lyr);
L.DomEvent.disableClickPropagation(lyr); L.DomEvent.disableScrollPropagation(lyr);
let lExp = null;
export function lRender() {
  lyr.style.width = S.lOpen ? '' : 'auto';
  lyr.innerHTML = `<button class="lhead" data-a="toggle">☰ Layers ${S.lOpen ? '▾' : '▸'}</button>` + (!S.lOpen ? '' :
    `<div class="lbody">${LP.order.map((id, i) => {
      const d = LDEF[id], s = lSt(id), on = lVisible(id), dis = d.kind === 'hist' && $('hwOn').disabled;
      return `<div class="lrow" data-id="${id}"><div class="lline">` +
        `<button class="eye" data-a="eye" ${dis ? 'disabled' : ''} title="Show / hide">${on ? '●' : '○'}</button>` +
        `<span class="lname ${on ? '' : 'off'}" data-a="exp" title="Click for opacity and blend">${d.name}</span>` +
        `<button class="mini" data-a="up" ${i === 0 ? 'disabled' : ''} title="Raise">▲</button><button class="mini" data-a="down" ${i === LP.order.length - 1 ? 'disabled' : ''} title="Lower">▼</button></div>` +
        (lExp === id ? `<div class="lctl"><input type="range" data-a="op" min="0" max="100" value="${Math.round(s.o * 100)}" title="Opacity"><select data-a="bl" title="Blend mode">${BLENDS.map(b => `<option${b === s.b ? ' selected' : ''}>${b}</option>`).join('')}</select></div>` : '') +
        '</div>';
    }).join('')}<div class="lrow"><button class="mini" data-a="reset" title="Restore the default order, visibility and settings">↺ Reset layers</button></div></div>`);
}
lyr.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = (b.closest('.lrow') || {}).dataset?.id;
  if (a === 'toggle') { S.lOpen = !S.lOpen; lRender(); }
  else if (a === 'reset') lReset();
  else if (a === 'eye') lSetVisible(id, !lVisible(id));
  else if (a === 'exp') { lExp = lExp === id ? null : id; lRender(); }
  else if (a === 'up' || a === 'down') {
    const i = LP.order.indexOf(id), j = i + (a === 'up' ? -1 : 1);
    if (j >= 0 && j < LP.order.length) { LP.order.splice(i, 1); LP.order.splice(j, 0, id); LORDER.forEach(lApply); lSave(); lRender(); }
  }
});
lyr.addEventListener('input', e => {
  if (e.target.dataset.a !== 'op') return;
  const id = e.target.closest('.lrow').dataset.id; lSt(id).o = e.target.value / 100; lApply(id); lSave();
});
lyr.addEventListener('change', e => {
  if (e.target.dataset.a !== 'bl') return;
  const id = e.target.closest('.lrow').dataset.id; lSt(id).b = e.target.value; lApply(id); lSave();
});
LORDER.forEach(lApply); sat.addTo(S.map); lRender();
