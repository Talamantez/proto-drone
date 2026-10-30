// Polygon library: samples, saved areas, GeoJSON import and export.
import { $, esc, store } from './util.js';
import { PRESETS, presetPoly } from './presets.js';
import { S } from './state.js';
import { adoptPoly } from './missions.js';
import { MAX_POINTS, parseGeoJSON, toGeoJSON } from './geojson.js';
import { layers } from './state.js';

export const libLoad = () => { try { const a = JSON.parse(store.get('polyLib') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
export const libStore = a => store.set('polyLib', JSON.stringify(a));
export const libSamples = () => Object.entries(PRESETS).map(([k, p]) => ({ id: 'b:' + k, name: p.title, pts: presetPoly(p), mode: p.shape === 'line' ? 'facade' : 'area' }));
export const libFind = id => libSamples().concat(libLoad()).find(e => e.id === id);
export function libRender(sel) {
  const el = $('libSel'), opt = e => `<option value="${e.id}">${esc(e.name)} (${e.mode === 'facade' ? 'wall' : e.pts.length + ' pts'})</option>`;
  const mine = libLoad();
  el.innerHTML = '<option value="">Pick a polygon…</option>' + `<optgroup label="Samples">${libSamples().map(opt).join('')}</optgroup>` +
    (mine.length ? `<optgroup label="Saved by you">${mine.map(opt).join('')}</optgroup>` : '');
  el.value = sel || ''; libSelChanged(false);
}
export function libSelChanged(fit) {
  const e = libFind($('libSel').value);
  $('libUse').disabled = !e; $('libDel').disabled = !e || e.id.startsWith('b:');
  if (layers.libPrev) { S.map.removeLayer(layers.libPrev); layers.libPrev = null; }
  if (!e) return;
  const st = { pane: 'p_survey', color: '#4ac8d8', weight: 2, dashArray: '4 4', interactive: false };
  layers.libPrev = (e.mode === 'facade' ? L.polyline(e.pts, st) : L.polygon(e.pts, { ...st, fillOpacity: .08 })).addTo(S.map);
  if (fit) S.map.fitBounds(layers.libPrev.getBounds().pad(0.4), { maxZoom: 17 });
}
$('libSel').onchange = () => libSelChanged(true);
$('libUse').onclick = () => { const e = libFind($('libSel').value); if (e) adoptPoly(e.pts.map(p => p.slice()), e.mode, e.name.replace(/ \(sample\)$/, '')); };
$('libSave').onclick = () => {
  if (!S.mission) return;
  const all = libLoad(), e = { id: 'u' + Date.now(), name: S.mission.name || 'Area', pts: S.mission.poly, mode: S.mission.params.mode || 'area' };
  all.push(e); libStore(all); libRender(e.id);
  $('libNote').textContent = `Saved “${e.name}”. Stored in this browser only; use Export to keep a copy.`;
};
$('libDel').onclick = () => {
  const id = $('libSel').value, e = libFind(id);
  if (!e || id.startsWith('b:') || !confirm(`Delete “${e.name}” from your library?`)) return;
  libStore(libLoad().filter(x => x.id !== id)); libRender('');
};
export const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
$('libExport').onclick = () => {
  const list = libLoad().length ? libLoad() : (S.mission ? [{ name: S.mission.name, pts: S.mission.poly, mode: S.mission.params.mode || 'area' }] : []);
  if (!list.length) { $('libNote').textContent = 'Nothing to export yet: save an area first.'; return; }
  dl('survey-areas.geojson', JSON.stringify(toGeoJSON(list), null, 2), 'application/geo+json');
};
$('libImport').onclick = () => $('libFile').click();
$('libFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const { areas, skipped } = parseGeoJSON(JSON.parse(await f.text()), f.name.replace(/\.[^.]+$/, ''));
    const all = libLoad();
    areas.forEach((a, i) => all.push({ id: 'u' + Date.now() + '_' + i, ...a }));
    libStore(all); libRender(areas.length ? all[all.length - 1].id : ''); if (areas.length) libSelChanged(true);
    const n = areas.length;
    $('libNote').textContent = `Imported ${n} area${n === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (needs 3–${MAX_POINTS} points, or a 2-point line for a wall)` : ''}. Holes and extra Multi-parts are ignored.`;
  } catch (err) { $('libNote').textContent = 'Could not read that file as GeoJSON: ' + err.message; }
};
libRender('');
