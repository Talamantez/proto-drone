// Guided first-run tour, gated on user actions.
import { $, isNarrow, store } from './util.js';
import { setSheet } from './sheet.js';
import { S } from './state.js';
import { lRender } from './layerpanel.js';
import { loadPreset } from './challenges.js';

export const TOUR = [
  { center: true, title: 'Welcome aboard 👋', html: `<p>This simulates a small fleet of survey drones mapping an area while their radio links (LTE, LoRa, Wi-Fi mesh) misbehave. Can the survey still get done?</p><p>In about two minutes you will <b>draw an area</b>, <b>fly it</b>, and <b>break a link</b> to watch the failover.</p>` },
  { sel: '#dbDraw', pos: 'tr', wait: 'draw', title: '1 · Draw your survey area', html: `<p>Press <b>Draw area</b> at the bottom of the map, then click at least 3 corners around somewhere you want surveyed (a few city blocks is ideal). Prefer to sketch? Switch to <b>✏ Pen</b> and drag around the area, or pick a ready-made <b>⬡ Shape</b> and scale it. Press <b>Close polygon</b> to finish.</p><p class="dim">The first corner becomes the launch base. Search for a place at the top to get there first.</p>`,
    m: `<p>Tap <b>Draw area</b>, tap 3+ corners around a place (or use <b>✏ Pen</b> or a <b>⬡ Shape</b>), then <b>Close polygon</b>. Search at the top to go somewhere first.</p>`,
    extra: [{ a: 'sample', label: 'Use a sample area instead' }] },
  { sel: '#btnPlan', title: '2 · The plan', html: `<p>The map now shows the lanes each drone will sweep. Change the drone count, lane width or heading in <b>Fleet &amp; survey plan</b> and press <b>Apply &amp; re-plan</b>. The Power &amp; cost section prices the result.</p>`,
    m: `<p>Lanes now show on the map. Change drones, lane width or heading below, then <b>Apply &amp; re-plan</b>.</p>` },
  { sel: '#hudRun', pos: 'br', wait: 'start', title: '3 · Fly it', html: `<p>Press <b>Start</b> on the map. The speed slider in the left panel skips ahead. <b style="color:#d9a441">Amber</b> cells are photographed; they turn <b style="color:#5fae6b">green</b> once the ground station confirms them.</p>`,
    m: `<p>Tap <b>Start</b> at the top of the map. <b style="color:#d9a441">Amber</b> = photographed, <b style="color:#5fae6b">green</b> = confirmed.</p>` },
  { sel: '#hudFaults', pos: 'br', wait: 'fault', title: '4 · Break a link', html: `<p>Click an <b>LTE</b> or <b>LoRa</b> button to cut it mid-flight. LoRa still carries position and detections; a drone that loses everything returns home and the others pick up its lanes. Click again to restore.</p>`,
    m: `<p>Tap <b>LTE</b> or <b>LoRa</b> to cut that link. A drone that loses all links returns home and the others take over.</p>` },
  { sel: '#hudStat', pos: 'br', desktopOnly: true, title: 'Scoreboard', html: `<p>Sim time, coverage the ground station has <i>confirmed</i>, and hidden anomalies found. The left panel has goals, costs, message logs and more.</p>` },
  { sel: '#lyr', pos: 'br', onShow: () => { S.lOpen = true; lRender(); }, title: 'Layers, GIS style', html: `<p>Every map layer is here. ● / ○ shows or hides it, ▲▼ restack it, and clicking a name opens <b>opacity</b> and a <b>blend mode</b> (multiply, overlay, difference…), as in a GIS or an image editor. Try the satellite and streets layers together.</p>`,
    m: `<p>Tap ☰ <b>Layers</b>: show or hide, reorder, opacity and blend mode for every layer.</p>` },
  { sel: '#libSel', title: 'Polygon library', html: `<p>Save any area you drew, reuse built-in samples, and import or export <b>GeoJSON</b> so areas move between this and your GIS.</p>`,
    m: `<p>Save areas, reuse samples, and import or export GeoJSON.</p>` },
  { sel: '#btnEnv', title: 'Decay, renewal & public data', html: `<p><b>Fetch land use…</b> outlines abandoned or ruined places (red), construction (cyan) and heritage (purple) from OpenStreetMap. Above are NASA and EU overlays; <b>Compare past vs today</b> swipes between current and older imagery.</p>`,
    m: `<p><b>Fetch land use…</b> marks decay (red), construction (cyan) and heritage (purple). Overlays and past-imagery swipe are above it.</p>` },
  { center: true, title: 'You’re set 🚁', html: `<p>Reopen this tour with <b>? Tour</b>, or press <b>▶ Try the demo</b> for a ready-made mission. Everything autosaves in your browser.</p>` },
];
let tourI = -1, tourEl = null;
export function tourClear() { if (tourEl) tourEl.classList.remove('tour-hl'); tourEl = null; }
export function tourEnd() { tourClear(); tourI = -1; $('tour').hidden = true; $('veil').hidden = true; store.set('tourSeen', '1'); }
export function tourSignal(name) {
  const at = tourI;
  if (at >= 0 && TOUR[at].wait === name) setTimeout(() => { if (tourI === at) tourShow(at + 1); }, 800);
}
export function tourShow(i, dir = 1) {
  const narrow = isNarrow(), st = TOUR[i];
  if (narrow && st.desktopOnly) return tourShow(i + dir, dir);
  tourClear(); tourI = i;
  const box = $('tour'), last = i === TOUR.length - 1, html = narrow && st.m ? st.m : st.html;
  if (st.onShow) st.onShow();
  box.className = st.center ? 'center' : '';
  box.innerHTML = `<h3>${st.title}</h3>${html}<div class="nav"><span class="step">${i + 1} / ${TOUR.length}</span>` +
    (i > 0 ? '<button data-a="back">Back</button>' : '') +
    (st.extra || []).map(x => `<button data-a="${x.a}">${x.label}</button>`).join('') +
    (last || st.wait ? '' : '<button data-a="skip">Skip</button>') +
    `<button class="primary" data-a="next">${last ? 'Let’s go' : i === 0 ? 'Start tour' : st.wait ? 'Skip step' : 'Next'}</button></div>`;
  $('veil').hidden = !st.center; box.hidden = false;
  box.style.cssText = '';
  const el = st.center ? null : document.querySelector(st.sel), inSheet = !!(el && el.closest('#side'));
  if (narrow) setSheet(inSheet ? 'half' : 'min');   // only settings steps open the sheet; map steps keep the map clear
  if (st.center) return;
  const ok = el && el.getClientRects().length;
  if (ok) { tourEl = el; el.classList.add('tour-hl'); if (inSheet) el.scrollIntoView({ block: 'center' }); }
  const side = $('side').getBoundingClientRect(), r = ok ? el.getBoundingClientRect() : side;
  if (narrow) {
    // Put the card on the opposite half of the screen from what it points at.
    const targetHigh = ok && !inSheet && r.top + r.height / 2 < window.innerHeight * 0.4;
    if (targetHigh) box.style.bottom = '52px'; else box.style.top = '76px';   // 76px keeps the search box and map buttons clear
  } else if (st.pos === 'br') { box.style.right = '16px'; box.style.bottom = '16px'; box.style.left = 'auto'; box.style.top = 'auto'; }
  else if (st.pos === 'tr') { box.style.right = '16px'; box.style.top = '56px'; box.style.left = 'auto'; }
  else {
    box.style.left = Math.min(window.innerWidth - box.offsetWidth - 12, side.right + 16) + 'px';
    box.style.top = Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, r.top - 10)) + 'px';
  }
}
$('tour').onclick = e => {
  const a = e.target.dataset.a; if (!a) return;
  if (a === 'skip') return tourEnd();
  if (a === 'back') return tourShow(tourI - 1, -1);
  if (a === 'sample') { loadPreset('demo'); return; }
  if (tourI >= TOUR.length - 1) return tourEnd();
  tourShow(tourI + 1);
};
document.addEventListener('keydown', e => { if (tourI >= 0 && e.key === 'Escape') tourEnd(); });
export function startTour() { tourShow(0); }
$('btnHelp').onclick = startTour;
$('btnDemo').onclick = () => { loadPreset('demo'); };
