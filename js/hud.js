// Map-side run controls and link fault buttons.
import { $, setHint } from './util.js';
import { attackCmd, attackGps, unleashGodzilla } from './sim.js';
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
const attack = fn => () => {
  if (!S.mission || !S.R) return;
  if (!S.running) { setHint('Press Start first: attacks only work on a live survey.'); return; }
  const live = S.R.d.filter(d => !d.lost && !d.landed && !d.spoof);
  if (!live.length || !fn(live[Math.floor(S.R.rng() * live.length)].i)) setHint('No drone is available to attack.');
  else renderUi(true);
};
$('btnGps').onclick = attack(attackGps); $('btnCmd').onclick = attack(attackCmd);
for (const [id, k] of [['defGnss', 'gnss'], ['defAuth', 'auth'], ['defAudit', 'audit']]) {
  $(id).onchange = e => {
    if (!S.mission) return;
    S.mission.def = S.mission.def || {}; S.mission.def[k] = e.target.checked;
    logEvent(`Defence ${k} ${e.target.checked ? 'enabled' : 'disabled'}`, 'check');
  };
}
$('btnZilla').onclick = () => {
  if (!S.mission || !S.R) return;
  if (!S.running) { setHint('Press Start first: Godzilla only attacks a live survey.'); return; }
  if (!unleashGodzilla()) setHint(S.P.fac ? 'Godzilla only stomps area surveys, not wall inspections.' : 'Godzilla is already on the loose.');
  else renderUi(true);
};
$('drones').onclick = faultClick; $('hudFaultRows').onclick = faultClick;
L.DomEvent.disableClickPropagation($('hud')); L.DomEvent.disableClickPropagation($('hudFaults'));
export const mirror = (src, dst) => {
  const f = () => { dst.textContent = src.textContent; dst.disabled = src.disabled; };
  new MutationObserver(f).observe(src, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }); f();
};
mirror($('btnRun'), $('hudRun')); mirror($('btnReset'), $('hudReset'));
$('hudRun').onclick = () => $('btnRun').click(); $('hudReset').onclick = () => $('btnReset').click();

// On-map drawing controls mirror the sidebar ones, so a phone never needs the settings sheet to draw.
L.DomEvent.disableClickPropagation($('drawBar'));
mirror($('btnFinish'), $('dbClose'));
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
