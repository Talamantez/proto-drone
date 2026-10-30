// Animation frame loop and run completion.
import { $, pct } from './util.js';
import { DT } from './constants.js';
import { PRESETS } from './presets.js';
import { S } from './state.js';
import { goalCtx } from './challenges.js';
import { logEvent } from './eventlog.js';
import { renderUi } from './render.js';
import { saveMission } from './missions.js';
import { step } from './sim.js';
import { openReport } from './report-ui.js';

export function frameLoop(ts) {
  if (!S.running) return;
  S.R.acc += Math.min(0.1, (ts - S.last) / 1000 || 0) * +$('pMult').value; S.last = ts;
  let cont = true, guard = 0;
  while (S.R.acc >= DT && cont && guard++ < 1200) { S.R.acc -= DT; cont = step(); }
  renderUi(false);
  if (!cont) { finish(); return; }
  if (ts - S.saveAt > 2000) { S.saveAt = ts; saveMission(); }
  requestAnimationFrame(frameLoop);
}
export function finish() {
  S.running = false; S.mission.status = 'complete';
  $('btnRun').textContent = 'Start'; $('btnRun').disabled = true;
  logEvent(`Run complete: GCS coverage ${pct(S.R.gcsCov)}%, truth ${pct(S.R.cov)}%, ${S.mission.found.length}/${S.mission.hidden.length} anomalies confirmed`, 'done');
  const s = PRESETS[S.mission.challenge];
  if (s) {
    const x = goalCtx(), won = s.goals.filter(g => g.ok(x)).length, N = s.goals.length;
    logEvent(`Challenge “${s.title}”: ${won}/${N} goals, ${won === N ? 'GOLD' : won === N - 1 ? 'SILVER' : won * 2 >= N ? 'BRONZE' : 'try again'}`, 'done');
  }
  renderUi(true); saveMission();
  openReport();
}
