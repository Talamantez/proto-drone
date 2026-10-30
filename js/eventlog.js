// Persisted event log.
import { $, esc, fmtT } from './util.js';
import { DB } from './db.js';
import { S } from './state.js';

export async function logEvent(text, type) {
  if (!S.mission) return;
  await DB.addEvent({ missionId: S.mission.id, t: S.mission.simT, ts: Date.now(), type, text });
  renderEventLog();
}
let evBusy = false;
export async function renderEventLog() {
  if (evBusy || !S.mission) return;
  evBusy = true;
  try {
    const evs = await DB.events(S.mission.id);
    $('log').innerHTML = evs.slice(-60).reverse().map(e => `<div>${fmtT(e.t)} ${esc(e.text)}</div>`).join('');
  } finally { evBusy = false; }
}
