// Map-side run controls and link fault buttons.
import { $ } from './util.js';
import { S } from './state.js';
import { logEvent } from './eventlog.js';
import { renderUi } from './render.js';
import { tourSignal } from './tour.js';
import { cancelDraw, undoDrawPoint } from './missions.js';

export function faultClick(e) {
  const b = e.target.closest('button[data-d]');
  if (!b || !S.mission) return;
  const i = +b.dataset.d, l = b.dataset.l, f = S.mission.faults[i];
  f[l] = !f[l];
  logEvent(`Fault injection: D${i + 1} ${l.toUpperCase()} ${f[l] ? 'restored' : 'cut'}`, 'fault');
  renderUi(true); tourSignal('fault');
}
$('drones').onclick = faultClick; $('hudFaultRows').onclick = faultClick;
L.DomEvent.disableClickPropagation($('hud')); L.DomEvent.disableClickPropagation($('hudFaults'));
// `next(src)` marks dst as the button the user should press now; it gets a pulsing highlight.
export const mirror = (src, dst, next) => {
  const f = () => { dst.textContent = src.textContent; dst.disabled = src.disabled; if (next) dst.classList.toggle('next', next(src)); };
  new MutationObserver(f).observe(src, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }); f();
};
mirror($('btnRun'), $('hudRun'), b => !b.disabled && b.textContent === 'Start' && !S.drawing); mirror($('btnReset'), $('hudReset'));
$('hudRun').onclick = () => $('btnRun').click(); $('hudReset').onclick = () => $('btnReset').click();

// On-map drawing controls mirror the sidebar ones, so a phone never needs the settings sheet to draw.
L.DomEvent.disableClickPropagation($('drawBar'));
mirror($('btnFinish'), $('dbClose'), b => !b.disabled);
$('dbDraw').onclick = () => $('btnDraw').click();
$('dbClose').onclick = () => $('btnFinish').click();
$('dbDemo').onclick = () => $('btnDemo').click();
$('dbUndo').onclick = undoDrawPoint;
$('dbCancel').onclick = cancelDraw;

// The sidebar hint is out of sight while the sheet is collapsed, so repeat it on the map for a few seconds.
let hintTimer = null;
new MutationObserver(() => {
  const t = $('hint').textContent;
  $('mapHint').textContent = t; $('mapHint').hidden = !t;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => { $('mapHint').hidden = true; }, 12000);
}).observe($('hint'), { childList: true, characterData: true, subtree: true });
$('mapHint').onclick = () => { $('mapHint').hidden = true; };
