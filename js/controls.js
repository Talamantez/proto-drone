// Reads and writes the parameter inputs; enables and disables buttons.
import { $, esc } from './util.js';
import { BLUR_PX, CAM, MAX_AGL, MIN_STANDOFF, SHUTTER } from './constants.js';
import { DRONES_PER_CREW, quadPower } from './power.js';
import { S } from './state.js';
import { cap } from './planner.js';

export function readParams() {
  return {
    n: +$('pN').value, swath: +$('pSwath').value, heading: +$('pHead').value, speed: +$('pSpeed').value,
    feat: +$('pFeat').value, layer: $('pLayer').checked, seed: +$('pSeed').value || 0,
    lteLat: +$('pLteLat').value, lteLoss: +$('pLteLoss').value, loraLoss: +$('pLoraLoss').value,
    mode: $('pMode').value, wallH: +$('pWallH').value, heritage: $('pHeritage').checked,
    gsd: +$('pGsd').value, fwd: +$('pFwd').value, side: +$('pSide').value,
  };
}
export function writeParams(p) {
  $('pN').value = p.n; $('pSwath').value = p.swath; $('pHead').value = p.heading; $('pSpeed').value = p.speed;
  $('pFeat').value = p.feat; $('pLayer').checked = p.layer; $('pSeed').value = p.seed;
  $('pLteLat').value = p.lteLat; $('pLteLoss').value = p.lteLoss; $('pLoraLoss').value = p.loraLoss;
  $('pMode').value = p.mode || 'area'; $('pWallH').value = p.wallH ?? 58; $('pHeritage').checked = !!p.heritage;
  $('pGsd').value = p.gsd ?? 4; $('pFwd').value = p.fwd ?? 80; $('pSide').value = p.side ?? 70;
  updateModeUi();
}
export function updateModeUi() {
  const fac = $('pMode').value === 'facade';
  ['pSwath', 'pHead', 'pLayer'].forEach(id => $(id).disabled = fac);
  $('pWallH').disabled = !fac;
  $('modeNote').textContent = fac
    ? 'Click two points along the wall foot, left to right as seen from the drone side (wall on your left). Rows are flown at constant standoff for uniform GSD; each drone gets a contiguous height band. Swath, heading and layering come from the planner.'
    : 'Click polygon vertices. Swath and altitude are set by hand unless you apply the planner values.';
  syncLabels();
}
export function updateCap() {
  const p = readParams(), c = cap(p), fac = p.mode === 'facade', w = [];
  if (c.stand < MIN_STANDOFF) w.push(`${fac ? 'standoff' : 'altitude'} ${c.stand.toFixed(1)} m is under the ${MIN_STANDOFF} m minimum`);
  if (p.speed > c.vMax) w.push(`cruise ${p.speed} m/s exceeds ${c.vMax.toFixed(1)} m/s (blur / trigger limit)`);
  if (fac && p.wallH > MAX_AGL) w.push(`wall top above ${MAX_AGL} m AGL: check the local ceiling`);
  const f = x => x.toFixed(1);
  let vBest = 1; for (let v = 1; v <= 20; v += 0.25) if (quadPower(v, hoverW()) / v < quadPower(vBest, hoverW()) / vBest) vBest = v;
  $('capInfo').innerHTML = esc(
    `${fac ? 'Standoff from wall' : 'Altitude AGL'} ${f(c.stand)} m · frame ${f(c.fw)} × ${f(c.fh)} m\n` +
    `${fac ? 'Row spacing' : 'Swath'} ${f(c.lineSp)} m · exposure every ${f(c.photoSp)} m\n` +
    `Max speed: blur ${f(c.vBlur)} m/s (${BLUR_PX} px at 1/${SHUTTER} s) · trigger ${f(c.vTrig)} m/s (${CAM.minTrig} s min)\n` +
    `Energy: best cruise ${f(vBest)} m/s (${f(quadPower(vBest, hoverW()) / vBest)} J/m) · at ${p.speed} m/s ${f(quadPower(p.speed, hoverW()) / p.speed)} J/m`) +
    w.map(t => `<div class="warn">⚠ ${esc(t)}</div>`).join('');
}
export function syncLabels() {
  $('vWallH').textContent = $('pWallH').value; $('vGsd').textContent = $('pGsd').value + ' mm';
  $('vFwd').textContent = $('pFwd').value + '%'; $('vSide').textContent = $('pSide').value + '%';
  updateCap();
  $('vN').textContent = $('pN').value; $('vSwath').textContent = $('pSwath').value;
  $('vHead').textContent = $('pHead').value; $('vSpeed').textContent = $('pSpeed').value;
  $('vFeat').textContent = $('pFeat').value; $('vMult').textContent = $('pMult').value + '×';
  $('vLteLat').textContent = $('pLteLat').value + ' ms'; $('vLteLoss').textContent = $('pLteLoss').value + '%';
  $('vLoraLoss').textContent = $('pLoraLoss').value + '%';
}
export const battUsable = () => +$('eCap').value * (1 - +$('eRes').value / 100);
export const hoverW = () => +$('eHover').value;
export function costs() {
  const wh = S.R.d.reduce((s, d) => s + d.wh, 0), hrs = S.R.d.reduce((s, d) => s + d.flightT, 0) / 3600;
  const fleet = hrs * +$('cDrone').value / +$('cLife').value;
  const packs = wh / (+$('eCap').value * 0.8) * +$('cPack').value / +$('cCycles').value;   // ~80% of a cycle's capacity is used per flight
  const crew = Math.ceil(S.mission.params.n / DRONES_PER_CREW) * S.mission.simT / 3600 * +$('cCrew').value;
  return { wh, fleet, packs, crew, total: fleet + packs + crew, sorties: Math.ceil(wh / (battUsable() || 1)) };
}
export function setControls() {
  const has = !!S.mission;
  ['btnPlan', 'btnReset', 'btnDelete', 'btnCsv', 'btnManifest', 'btnReport'].forEach(id => $(id).disabled = !has);
  const area = has && (S.mission.params.mode || 'area') === 'area';
  $('dbDemo').hidden = has;
  $('drawBar').classList.toggle('has-mission', has);
  $('hudFaults').hidden = !has;
  for (const [id, k] of [['defGnss', 'gnss'], ['defAuth', 'auth'], ['defAudit', 'audit'], ['defDaa', 'daa'], ['defHop', 'hop'], ['defFresh', 'fresh']]) $(id).checked = has && !!(S.mission.def || {})[k]; $('libSave').disabled = !has;
  $('btnEnv').disabled = !has; $('btnPois').disabled = !area; $('btnSnap').disabled = !area || !S.mission.pois.length; $('btnUnsnap').disabled = !area || !S.mission.baseLL;
  $('btnRun').disabled = !has || S.mission.status === 'complete';
  document.querySelectorAll('#checks input').forEach((el, i) => { el.disabled = !has; el.checked = has && !!S.mission.checks[i]; });
}
