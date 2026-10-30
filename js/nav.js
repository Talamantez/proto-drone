// Google-Maps-style navigation: place search, locate me, fit to area, scale bar, cursor coordinates, shareable URL.
import { S, layers } from './state.js';
import { $, esc, setHint } from './util.js';
import { formatCoord, formatHash, parseHash, parseLatLng } from './geo.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
let pin = null, lastSearch = 0, locMarker = null;

function showPin(lat, lng, label) {
  if (pin) S.map.removeLayer(pin);
  pin = L.marker([lat, lng], { title: label }).addTo(S.map);
  if (label) pin.bindTooltip(label, { direction: 'top', offset: [-15, -28] }).openTooltip();
}

export function flyTo(lat, lng, zoom = 17, label) {
  S.map.flyTo([lat, lng], zoom, { duration: 0.8 });
  showPin(lat, lng, label);
}

async function geocode(q) {
  const wait = lastSearch + 1100 - Date.now();   // Nominatim usage policy: at most one request per second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastSearch = Date.now();
  const r = await fetch(`${NOMINATIM}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function showResults(list) {
  const box = $('searchRes');
  box.hidden = false;
  box.innerHTML = list.length
    ? list.map((p, i) => `<button type="button" data-i="${i}">${esc(p.display_name)}</button>`).join('') + '<div class="dim">© OpenStreetMap contributors · Nominatim</div>'
    : '<div class="dim">No matches. Try a bigger place name, or type coordinates like 40.7508, 14.4869.</div>';
  box.onclick = e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const p = list[+b.dataset.i], bb = p.boundingbox.map(Number);   // [south, north, west, east]
    box.hidden = true;
    S.map.flyToBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 18, duration: 0.8 });
    showPin(+p.lat, +p.lon, p.display_name.split(',')[0]);
  };
}

async function runSearch(q) {
  q = q.trim(); if (!q) return;
  const c = parseLatLng(q);
  if (c) { $('searchRes').hidden = true; flyTo(c.lat, c.lng, 17, formatCoord(c.lat, c.lng)); return; }
  $('searchGo').disabled = true; setHint(`Searching for “${q}”…`);
  try { showResults(await geocode(q)); setHint('Pick a result to fly there.'); }
  catch (e) { setHint('Search failed: ' + e.message + '. Coordinates like 40.7508, 14.4869 always work.'); }
  $('searchGo').disabled = false;
}

function locate() {
  setHint('Finding your location…');
  S.map.locate({ setView: false, enableHighAccuracy: true, timeout: 10000 });
}

function addControls() {
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar navbar');
      bar.innerHTML = '<a href="#" role="button" id="navLoc" title="Show my location" aria-label="Show my location">◎</a><a href="#" role="button" id="navFit" title="Zoom to survey area" aria-label="Zoom to survey area">⤢</a>';
      L.DomEvent.disableClickPropagation(bar);
      bar.querySelector('#navLoc').onclick = e => { e.preventDefault(); locate(); };
      bar.querySelector('#navFit').onclick = e => {
        e.preventDefault();
        if (layers.poly) S.map.flyToBounds(layers.poly.getBounds().pad(0.3), { duration: 0.8 }); else setHint('Draw an area first, then this zooms to it.');
      };
      return bar;
    },
  });
  new Ctl().addTo(S.map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(S.map);

  const Coord = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'coordbox'); el.id = 'coordbox'; el.title = 'Click to copy'; el.textContent = 'move the cursor over the map';
      L.DomEvent.disableClickPropagation(el);
      el.onclick = () => navigator.clipboard?.writeText(el.dataset.ll || '').then(() => { el.textContent = 'copied ' + el.dataset.ll; }, () => {});
      return el;
    },
  });
  new Coord().addTo(S.map);
  S.map.on('mousemove', e => { const el = $('coordbox'); el.dataset.ll = formatCoord(e.latlng.lat, e.latlng.lng); el.textContent = el.dataset.ll; });
}

export function initNav() {
  addControls();
  $('search').addEventListener('submit', e => { e.preventDefault(); runSearch($('searchQ').value); });
  $('searchQ').addEventListener('keydown', e => { if (e.key === 'Escape') { $('searchRes').hidden = true; $('searchQ').blur(); } });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('searchQ').focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) $('searchRes').hidden = true; });

  S.map.on('locationfound', e => {
    if (locMarker) S.map.removeLayer(locMarker);
    locMarker = L.layerGroup([L.circle(e.latlng, { radius: e.accuracy, weight: 1, color: '#4a9fd8', fillOpacity: .12, interactive: false }),
      L.circleMarker(e.latlng, { radius: 7, weight: 2, color: '#fff', fillColor: '#4a9fd8', fillOpacity: 1, interactive: false })]).addTo(S.map);
    S.map.flyTo(e.latlng, Math.min(17, S.map.getBoundsZoom(e.latlng.toBounds(Math.max(60, e.accuracy * 2)))), { duration: 0.8 });
    setHint(`You are within ${Math.round(e.accuracy)} m of the blue dot.`);
  });
  S.map.on('locationerror', e => setHint('Could not get your location: ' + e.message));

  // The URL keeps the current view, so any map position can be bookmarked or shared.
  const start = parseHash(location.hash);
  if (start) S.map.setView([start.lat, start.lng], start.zoom);
  let t = null;
  S.map.on('moveend', () => {
    clearTimeout(t);
    t = setTimeout(() => { try { const c = S.map.getCenter(); history.replaceState(null, '', formatHash({ lat: c.lat, lng: c.lng, zoom: S.map.getZoom() })); } catch { /* sandboxed frame */ } }, 250);
  });
  window.addEventListener('hashchange', () => { const v = parseHash(location.hash); if (v) S.map.setView([v.lat, v.lng], v.zoom); });
  return !!start;
}
