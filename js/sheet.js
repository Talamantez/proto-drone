// Bottom sheet for the settings panel on narrow screens: collapsed by default so the map has the screen.
import { $ } from './util.js';

const STATES = ['min', 'half', 'full'];
let state = 'min';

export function setSheet(next) {
  state = next;
  document.body.dataset.sheet = next;
  $('sheetHandle').setAttribute('aria-expanded', String(next !== 'min'));
  $('sheetLabel').textContent = next === 'min' ? 'Settings & details' : 'Close';
}
export const getSheet = () => state;

// Tap toggles open/closed; swiping the handle up or down moves one step.
let y0 = null;
$('sheetHandle').addEventListener('pointerdown', e => { y0 = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); });
$('sheetHandle').addEventListener('pointerup', e => {
  if (y0 === null) return;
  const dy = e.clientY - y0, i = STATES.indexOf(state); y0 = null;
  if (Math.abs(dy) < 12) setSheet(state === 'min' ? 'half' : 'min');
  else setSheet(STATES[Math.max(0, Math.min(STATES.length - 1, i + (dy < 0 ? 1 : -1)))]);
});
$('sheetHandle').addEventListener('pointercancel', () => { y0 = null; });
setSheet('min');
