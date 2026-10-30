// One Threats button on the map: a menu of attacks plus a Shields switch (Off / Basic / Full). Fine-tune lives in the sidebar.
import { $, setHint } from './util.js';
import { S } from './state.js';
import { logEvent } from './eventlog.js';
import { renderUi } from './render.js';
import { DEFS, levelDef, shieldLevel } from './defences.js';
import { THREATS } from './threats.js';
import * as sim from './sim.js';

// kind: 'drone' picks a random free drone, 'area' needs none.
const ATTACKS = [
  { icon: '🛰', name: 'GPS spoof', kind: 'drone', fn: sim.attackGps },
  { icon: '🎭', name: 'Forged RTL', kind: 'drone', fn: sim.attackCmd },
  { icon: '⏪', name: 'Replay', kind: 'drone', fn: sim.attackReplay },
  { icon: '📻', name: 'RF jammer', kind: 'area', fn: sim.attackJam },
  { icon: '🛸', name: 'Rogue drone', kind: 'area', fn: sim.unleashRogue },
  { icon: '👂', name: 'Eavesdropper', kind: 'area', fn: sim.attackSnoop },
  { icon: '🔥', name: 'Radio flood', kind: 'drone', fn: sim.attackFlood },
  { icon: '☠', name: 'Bad map data', kind: 'drone', fn: sim.attackPoison },
  { icon: '🎯', name: 'Decoys', kind: 'area', fn: sim.attackDecoy },
  { icon: '🧬', name: 'Bad firmware', kind: 'drone', fn: sim.attackFirmware },
  { icon: '🦖', name: 'Godzilla', kind: 'area', fn: sim.unleashGodzilla },
];

function launch(a) {
  if (!S.mission || !S.R) return;
  if (!S.running) { setHint('Press Start first: threats only act on a live survey.'); return; }
  let ok;
  if (a.kind === 'area') ok = a.fn();
  else {
    const free = S.R.d.filter(d => !d.lost && !d.landed);
    ok = free.length && a.fn(free[Math.floor(S.R.rng() * free.length)].i);
  }
  if (!ok) setHint(`${a.name} could not start (already active, or nothing to target).`);
  else { renderUi(true); $('threatMenu').hidden = true; }
}

export function syncShields() {
  const lvl = shieldLevel(S.mission && S.mission.def);
  document.querySelectorAll('#shieldSeg button').forEach(b => b.classList.toggle('on', b.dataset.lvl === lvl));
  $('shieldCustom').hidden = lvl !== 'custom';
  DEFS.forEach(d => { const c = $('def_' + d.key); if (c) c.checked = !!(S.mission && S.mission.def && S.mission.def[d.key]); });
}
function setDef(key, v) {
  S.mission.def = S.mission.def || {}; S.mission.def[key] = v;
  logEvent(`Defence ${key} ${v ? 'enabled' : 'disabled'}`, 'check'); syncShields();
}

$('threatItems').innerHTML = ATTACKS.map((a, i) => `<button data-i="${i}">${a.icon} ${a.name}</button>`).join('') + '<button data-i="rand">🎲 Surprise me</button>';
$('threatItems').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  launch(b.dataset.i === 'rand' ? ATTACKS[Math.floor(Math.random() * ATTACKS.length)] : ATTACKS[+b.dataset.i]);
};
$('btnThreats').onclick = () => { $('threatMenu').hidden = !$('threatMenu').hidden; };
$('shieldSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b || !S.mission) return;
  S.mission.def = levelDef(b.dataset.lvl);
  logEvent(`Shields set to ${b.dataset.lvl}`, 'check'); syncShields();
};
$('defList').innerHTML = DEFS.map(d => `<label class="chk"><input type="checkbox" id="def_${d.key}"><span><b>${d.label}</b> · ${d.info}</span></label>`).join('');
DEFS.forEach(d => { $('def_' + d.key).onchange = e => S.mission && setDef(d.key, e.target.checked); });
$('threatList').innerHTML = THREATS.map(t => `<details><summary>${t.name}<span class="tag ${t.sim ? 'live' : ''}">${t.sim ? 'simulated' : 'roadmap'}</span></summary><p><b>Threat:</b> ${t.what}<br><b>Defence:</b> ${t.defence}</p></details>`).join('');
L.DomEvent.disableClickPropagation($('threatBox'));
document.addEventListener('shields-sync', syncShields);
