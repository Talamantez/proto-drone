// Public data overlays, OSM decay and land-use hints, past-imagery swipe.
import { $, esc, setHint } from './util.js';
import { LDEF, lRender } from './layerpanel.js';
import { S } from './state.js';
import { layers } from './state.js';
import { logEvent } from './eventlog.js';
import { overpass } from './overpass.js';

export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
export const gibsLayer = (id, lvl, time, pane) => L.tileLayer(`${GIBS}${id}/default/${time}/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.png`,
  { maxNativeZoom: lvl, maxZoom: 19, pane, attribution: 'NASA GIBS' });
export const femaFlood = L.TileLayer.extend({
  getTileUrl(c) {   // ArcGIS export for one XYZ tile, in web-mercator metres
    const R = 20037508.342789244, n = 2 ** c.z, sz = 2 * R / n, x0 = -R + c.x * sz, y1 = R - c.y * sz;
    return 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export?' +
      `bbox=${x0},${y1 - sz},${x0 + sz},${y1}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:28&f=image`;
  },
});
export const overlays = {
  ovNdvi: pane => gibsLayer('MODIS_Terra_NDVI_8Day', 9, $('ovDate').value || 'default', pane),
  ovLst: pane => gibsLayer('MODIS_Terra_Land_Surface_Temp_Day', 7, $('ovDate').value || 'default', pane),
  ovNight: pane => gibsLayer('VIIRS_Black_Marble', 8, $('ovNightYr').value, pane),
  ovWater: pane => L.tileLayer('https://storage.googleapis.com/global-surface-water/tiles2021/transitions/{z}/{x}/{y}.png', { maxNativeZoom: 13, maxZoom: 19, pane, attribution: 'EC JRC Global Surface Water' }),
  ovFlood: pane => new femaFlood('', { maxZoom: 19, pane, attribution: 'FEMA NFHL' }),
};
export const ovLive = {};
export function ovSync(id) {
  if (ovLive[id]) { S.map.removeLayer(ovLive[id]); ovLive[id] = null; }
  if (!$(id).checked) return;
  ovLive[id] = overlays[id](LDEF[id].pane).addTo(S.map);
}
Object.keys(overlays).forEach(id => $(id).addEventListener('change', () => { ovSync(id); lRender(); }));
$('ovDate').addEventListener('change', () => ['ovNdvi', 'ovLst'].forEach(ovSync));
$('ovNightYr').addEventListener('change', () => ovSync('ovNight'));
// ---- OSM land use, heritage, decay and renewal hints ----
export const envCanvas = L.canvas({ padding: 0.5, pane: 'p_env' });
export const ENV = { decay: '#d4605a', build: '#4ac8d8', heritage: '#b07fe0', bldg: '#8a949e', green: '#5fae6b', land: '#c9a24a' };
export function envClass(t) {
  const keys = Object.keys(t);
  if (keys.some(k => /^(abandoned|disused|ruins)(:|$)/.test(k)) || t.building === 'ruins' || t.landuse === 'brownfield' || t.historic === 'ruins') return 'decay';
  if (t.landuse === 'construction' || t.building === 'construction' || t.construction || t.proposed || t.highway === 'construction') return 'build';
  if (t.heritage || t.historic) return 'heritage';
  if (t.building) return 'bldg';
  if (/^(grass|forest|meadow|recreation_ground|village_green|orchard|cemetery|allotments)$/.test(t.landuse || '')) return 'green';
  return 'land';
}
export function drawEnv(els) {
  if (layers.env) S.map.removeLayer(layers.env);
  const cnt = { decay: 0, build: 0, heritage: 0, bldg: 0, green: 0, land: 0 }, g = L.layerGroup();
  for (const e of els) {
    const t = e.tags || {}, c = envClass(t); cnt[c]++;
    const tip = Object.entries(t).slice(0, 6).map(([k, v]) => `${esc(k)}=${esc(v)}`).join('<br>');
    const st = { pane: 'p_env', renderer: envCanvas, color: ENV[c], weight: c === 'bldg' || c === 'land' ? 1 : 2, fillColor: ENV[c], fillOpacity: c === 'land' ? .08 : c === 'green' || c === 'heritage' ? .12 : .35 };
    let o;
    if (e.type === 'node') o = L.circleMarker([e.lat, e.lon], { ...st, radius: 4, fillOpacity: .9 });
    else if (e.geometry && e.geometry.length > 1) {
      const pts = e.geometry.filter(Boolean).map(p => [p.lat, p.lon]);
      o = pts.length > 3 && e.geometry[0] && pts[0][0] === pts[pts.length - 1][0] ? L.polygon(pts, st) : L.polyline(pts, st);
    }
    if (o) g.addLayer(o.bindTooltip(`<b>${c}</b><br>${tip}`));
  }
  layers.env = g; g.addTo(S.map);
  return cnt;
}
$('btnEnv').onclick = async () => {
  if (!S.mission) return;
  const ys = S.mission.poly.map(p => p[0]), xs = S.mission.poly.map(p => p[1]), pad = 0.0004;
  const bb = [Math.min(...ys) - pad, Math.min(...xs) - pad, Math.max(...ys) + pad, Math.max(...xs) + pad].map(v => v.toFixed(6)).join(',');
  $('btnEnv').disabled = true; setHint('Querying OpenStreetMap for land use, heritage and decay tags… public servers can take up to a minute.');
  try {
    const els = await overpass(`[out:json][timeout:50];(` +
      `way["building"](${bb});way["landuse"](${bb});way["historic"](${bb});node["historic"](${bb});way["heritage"](${bb});node["heritage"](${bb});` +
      `nwr["abandoned"](${bb});nwr["disused"](${bb});way["ruins"](${bb});way["construction"](${bb});way["highway"="construction"](${bb});` +
      `);out geom tags;`, 60000);
    const cnt = drawEnv(els);
    const bt = cnt.bldg + cnt.decay + cnt.build;
    $('envNote').textContent =
      `${els.length} OSM features in and around the area.\n` +
      `Buildings and structures: ${bt} · abandoned / disused / ruin: ${cnt.decay} · construction / brownfield: ${cnt.build} · heritage: ${cnt.heritage}\n` +
      `Use “Past imagery” to see what changed, and treat zero hits with suspicion: OSM is mapped by volunteers. © OpenStreetMap contributors.`;
    setHint(`${els.length} OSM features drawn. Hover a shape for its tags.`);
    logEvent(`Fetched OSM land-use/decay hints: ${cnt.decay} decay, ${cnt.build} construction, ${cnt.heritage} heritage, ${bt} structures`, 'plan');
  } catch (e) { setHint('Overpass failed: ' + e.message + '. Retry in a moment.'); }
  $('btnEnv').disabled = !S.mission;
};
// ---- past imagery swipe (Esri Wayback) ----
let hwLayer = null, hwFrac = 0.5, hwBar = null, hwDiv = null;
export const WAYBACK_CFG = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
export const hwTitle = t => (t.itemTitle.match(/\d{4}-\d{2}-\d{2}/) || [t.itemTitle])[0];
export function hwClip() {
  if (!hwLayer || !S.map.hasLayer(hwLayer)) return;
  const nw = S.map.containerPointToLayerPoint([0, 0]), se = S.map.containerPointToLayerPoint(S.map.getSize());
  hwLayer.getContainer().style.clip = `rect(${nw.y}px,${se.x}px,${se.y}px,${nw.x + (se.x - nw.x) * hwFrac}px)`;
  hwDiv.style.left = `calc(${hwFrac * 100}% - 1px)`;
}
export function hwBuild() {
  if (hwLayer) { S.map.removeLayer(hwLayer); hwLayer = null; }
  if (!$('hwOn').checked) { if (hwBar) hwBar.hidden = hwDiv.hidden = true; return; }
  const sel = $('hwSel'), date = sel.selectedOptions[0].textContent;
  hwLayer = L.tileLayer(`https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${sel.value}/{z}/{y}/{x}`,
    { maxNativeZoom: 18, maxZoom: 19, pane: 'p_hist', attribution: 'Esri Wayback' }).addTo(S.map);
  if (!hwBar) {
    hwBar = document.createElement('div'); hwBar.id = 'hwBar';
    hwBar.innerHTML = '<span id="hwL">Today</span><input type="range" id="hwPos" min="0" max="100" value="50"><span id="hwR"></span>';
    hwDiv = document.createElement('div'); hwDiv.id = 'hwDiv';
    S.map.getContainer().append(hwBar, hwDiv);
    L.DomEvent.disableClickPropagation(hwBar);
    hwBar.querySelector('input').addEventListener('input', e => { hwFrac = e.target.value / 100; hwClip(); });
    S.map.on('move zoom resize viewreset', hwClip);
  }
  hwBar.hidden = hwDiv.hidden = false; $('hwR').textContent = date;
  hwLayer.on('load', hwClip); hwClip();
  setHint(`Swipe: left = today, right = Esri imagery release ${date}. Drag the slider along the bottom of the map.`);
}
$('hwOn').onchange = () => { hwBuild(); lRender(); }; $('hwSel').onchange = () => { if ($('hwOn').checked) hwBuild(); };
fetch(WAYBACK_CFG).then(r => r.json()).then(cfg => {
  const rel = Object.entries(cfg).map(([id, v]) => ({ id, d: hwTitle(v) })).sort((a, b) => b.d.localeCompare(a.d));
  const want = '2018-01-01', pick = rel.find(r => r.d <= want) || rel[rel.length - 1];
  $('hwSel').textContent = '';
  rel.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.d; $('hwSel').appendChild(o); });
  $('hwSel').value = pick.id; $('hwOn').disabled = false; lRender();
}).catch(() => { $('hwSel').innerHTML = '<option>unavailable offline</option>'; });
