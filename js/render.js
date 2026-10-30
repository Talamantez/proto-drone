// Per-frame UI rendering: status, fleet table, logs.
import { S } from './state.js';
import { $, fmtT, linkColor, pct } from './util.js';
import { COLORS, TEL_BUDGET } from './constants.js';
import { costs } from './controls.js';
import { drawElev } from './mapview.js';
import { layers } from './state.js';
import { ZILLA, modeOf, nm, tp } from './sim.js';
import { renderChallenge } from './challenges.js';
import { renderEventLog } from './eventlog.js';
import { wpct } from './poi-ui.js';

export function renderUi(force) {
  if (!S.mission || !S.R) return;
  S.R.d.forEach((d, i) => {
    const o = layers.d[i], ll = S.P.f.toLL(tp(d)), g = S.R.g[i];
    o.tag.setLatLng(ll); o.trail.addLatLng(ll);
    o.link.setLatLngs([S.P.f.toLL(S.P.base), ll]).setStyle({ color: linkColor(d.link), dashArray: d.link ? null : '4 4' });
    o.belief.setLatLng(g.pos);
  });
  if (S.R.zilla && !layers.zilla) {
    layers.zilla = L.layerGroup([
      L.circle([0, 0], { pane: 'p_survey', radius: ZILLA.jam, color: '#d9a441', weight: 1, dashArray: '4 4', fillOpacity: 0.06, interactive: false }),
      L.circle([0, 0], { pane: 'p_survey', radius: ZILLA.kill, color: '#d4605a', weight: 2, fillOpacity: 0.25, interactive: false }),
      L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="zilla-icon">🦖</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false }),
    ]).addTo(S.map);
  }
  if (layers.zilla) {
    if (S.R.zilla) { const ll = S.P.f.toLL(S.R.zilla.pos); layers.zilla.eachLayer(l => l.setLatLng(ll)); }
    else { S.map.removeLayer(layers.zilla); layers.zilla = null; }
  }
  const now = performance.now();
  if (!force && now - S.R.lastUi < 250) return;
  S.R.lastUi = now;
  if (S.P.fac) drawElev();
  renderChallenge();

  const st = S.mission.stats;
  const avg = l => st.lat[l].n ? `${Math.round(st.lat[l].sum / st.lat[l].n)} / ${Math.round(st.lat[l].max)} ms` : '–';
  $('sTime').textContent = $('qTime').textContent = fmtT(S.mission.simT);
  $('sWCov').textContent = S.P.w ? wpct(S.R.gcsCov) + '%' : '–';
  $('sCov').textContent = pct(S.R.gcsCov) + '%'; $('sTruth').textContent = pct(S.R.cov) + '%';
  const det = new Set(); S.R.d.forEach(d => d.detected.forEach(x => det.add(x)));
  $('sFound').textContent = `${S.mission.found.length} / ${det.size} / ${S.mission.hidden.length}`;
  $('qCov').textContent = $('hCov').textContent = pct(S.R.gcsCov) + '%'; $('qFound').textContent = $('hFound').textContent = `${S.mission.found.length} / ${S.mission.hidden.length}`;
  $('hTime').textContent = fmtT(S.mission.simT);
  $('sSep').textContent = S.mission.alerts;
  $('sMsg').textContent = `${st.sent} / ${st.delivered}`;
  $('sDrop').textContent = `${st.dropLoss} / ${st.dropDown}`;
  $('sLte').textContent = avg('lte'); $('sLora').textContent = avg('lora');
  $('sBytes').textContent = `${st.bytes.lte} / ${st.bytes.lora} / ${st.bytes.mesh}`;

  const c = costs(), usd = x => '$' + x.toFixed(2);
  $('sEnergy').textContent = `${c.wh.toFixed(0)} Wh · ${c.sorties} (${S.R.d.map(d => d.wh.toFixed(0)).join('/')})`;
  $('sCostParts').textContent = `${usd(c.fleet)} / ${usd(c.packs)} / ${usd(c.crew)}`;
  $('sCost').textContent = `${usd(c.total)} · ${S.R.cov.size ? usd(c.total / (100 * S.R.cov.size / S.P.cells.length)) : '–'}`;

  $('drones').innerHTML = S.R.d.map((d, i) => {
    const g = S.R.g[i], age = S.R.t - g.sampleT, f = S.mission.faults[i];
    const sc = g.state === 'OK' ? 'ok' : g.state === 'DEGRADED' ? 'warn' : 'bad';
    const ac = age > TEL_BUDGET ? 'warn' : '';
    return `<tr><td><span style="color:${COLORS[i % COLORS.length]}">■</span> D${i + 1}</td><td>${modeOf(d)}</td>` +
      `<td class="${sc}">${g.state}</td><td style="color:${linkColor(d.link)}">${d.link ? d.link.toUpperCase() : 'NONE'}</td>` +
      `<td class="${ac}">${age.toFixed(1)}s</td><td>${g.total ? Math.round(100 * Math.min(1, g.prog / g.total)) : 0}%</td>` +
      `<td><button data-d="${i}" data-l="lte" class="${f.lte ? '' : 'off'}">LTE</button> <button data-d="${i}" data-l="lora" class="${f.lora ? '' : 'off'}">LoRa</button></td></tr>`;
  }).join('');
  $('hudFaultRows').innerHTML = S.R.d.map((d, i) => {
    const f = S.mission.faults[i];
    return `<div class="fr"><b style="color:${COLORS[i % COLORS.length]}">D${i + 1}</b><button data-d="${i}" data-l="lte" class="${f.lte ? '' : 'off'}">LTE</button><button data-d="${i}" data-l="lora" class="${f.lora ? '' : 'off'}">LoRa</button></div>`;
  }).join('');

  if (force || now - S.R.lastLog > 500) {
    S.R.lastLog = now;
    const flt = $('logFilter').value;
    const rows = S.R.log.filter(e => flt === 'all' || (flt === 'drops' ? e.why : e.link !== 'mesh' && e.type !== 'HB' && e.type !== 'GCS_HB'));
    $('msgLog').innerHTML = rows.slice(-60).reverse().map(e =>
      `<div class="${e.why ? 'bad' : ''}">${e.t.toFixed(1).padStart(6)} ${nm(e.src).padEnd(3)}→${nm(e.dst).padEnd(3)} ${e.type.padEnd(10)} ${e.link.padEnd(4)} #${String(e.seq).padEnd(4)} ${e.why ? 'DROP ' + e.why : (e.lat.toFixed(0) + ' ms')}</div>`).join('');
    renderEventLog();
  }
}
