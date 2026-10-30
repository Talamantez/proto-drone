// Simulation core: link model, drone and GCS logic, one simulation step. UI effects go through `hooks`, so it runs headless.
import { ACK_RTO, ALT_BASE, ALT_STEP, DT, FRAME_USE, FS_RTL, GCS_LOST, HB_T, LINK_FRESH, MESH_RANGE, MESH_T, SEP_H, SEP_V, TEL_LORA, TEL_LTE } from './constants.js';
import { PRESETS } from './presets.js';
import { S } from './state.js';
import { altOf, buildCum, cap, hyp, hypH, inside, mulberry32, plan, posAtPath, rot } from './planner.js';
import { fmtT } from './util.js';
import { quadPower } from './power.js';

// Side effects the core asks for. The app swaps in real implementations; headless runs keep the no-ops.
export const hooks = { paintCell: () => {}, addFind: () => {}, log: () => {}, battUsable: () => 112.5, hoverW: () => 190 };

export function freshStats() {
  return {
    sent: 0, delivered: 0, dropLoss: 0, dropDown: 0,
    bytes: { lte: 0, lora: 0, mesh: 0 },
    lat: { lte: { sum: 0, n: 0, max: 0 }, lora: { sum: 0, n: 0, max: 0 }, mesh: { sum: 0, n: 0, max: 0 } },
  };
}
export function resetRun(m) {
  Object.assign(m, {
    dist: [], covered: [], gcsCovered: [], found: [], dr: [], gs: [], simT: 0, alerts: 0, status: 'planned',
    stats: freshStats(), assignN: 0, faults: Array.from({ length: m.params.n }, () => ({ lte: true, lora: true })),
    checks: [], fired: [],
  });
}
export function scatter(m) {
  const rng = mulberry32(m.params.seed + 1000), out = [];
  if (S.P.fac) {
    const { A, t, L, H } = S.P.fac;
    for (let k = 0; k < m.params.feat; k++) {
      const u = rng() * L, z = rng() * H;
      out.push({ id: k + 1, u, z, ll: S.P.f.toLL([A[0] + t[0] * u, A[1] + t[1] * u]) });
    }
    return out;
  }
  const xs = S.P.xy.map(p => p[0]), ys = S.P.xy.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let tries = 0; out.length < m.params.feat && tries < 5000; tries++) {
    const p = [x0 + rng() * (x1 - x0), y0 + rng() * (y1 - y0)];
    if (inside(p, S.P.xy)) out.push({ id: out.length + 1, ll: S.P.f.toLL(p) });
  }
  return out;
}
// Plans the survey and scatters the hidden anomalies. `preserve` keeps existing truth across a re-plan.
export function planMission(m, preserve) {
  S.P = plan(m);
  if (!m.hidden || !preserve) m.hidden = scatter(m);
}

// Creates the live run state (S.R) and one drone and GCS record per path from the mission's saved progress.
export function initRuntime(m) {
  S.R = {
    t: m.simT, acc: 0, queue: [], log: [], seq: {}, d: [], g: [], sepActive: new Set(), idleSince: null,
    rng: mulberry32(m.params.seed * 7919 + Math.floor(m.simT) + 1),
    cov: new Set(m.covered), gcsCov: new Set(m.gcsCovered), lastUi: 0, lastLog: 0,
  };
  m.gcsCovered.forEach(ci => hooks.paintCell(ci, 2));
  m.covered.forEach(ci => { if (!S.R.gcsCov.has(ci)) hooks.paintCell(ci, 1); });
  m.found.forEach(hooks.addFind);

  S.P.paths.forEach((basePath, i) => {
    const sv = m.dr[i] || {}, gv = m.gs[i] || {};
    const path = basePath.slice();
    (sv.extra || []).forEach(p => path.push(p));
    const cum = buildCum(path);
    if (m.dist[i] === undefined) m.dist[i] = 0;
    const d = {
      i, path, cum, total: cum[cum.length - 1], extra: (sv.extra || []).slice(), applied: new Set(sv.applied || []),
      rtl: !!sv.rtl, landed: !!sv.landed, wh: sv.wh || 0, flightT: sv.flightT || 0, detected: new Set(sv.detected || []),
      outbox: (sv.outbox || []).map(it => ({ ...it, sentAt: -1e9 })), newCells: [], oid: sv.oid || 0,
      lastGcs: { lte: S.R.t, lora: S.R.t }, link: 'lte', peers: {}, advAt: {},
      nextHb: S.R.t, nextTel: S.R.t, nextMesh: S.R.t, nextRep: S.R.t,
      alt: (m.params.heritage ? cap(m.params).stand : ALT_BASE) + (m.params.layer ? i * ALT_STEP : 0),
    };
    d.pos = d.rtl ? (sv.rtlPos || S.P.base) : posAtPath(d.path, d.cum, m.dist[i]);
    S.R.d.push(d);
    S.R.g.push({
      lastRx: S.R.t, sampleT: S.R.t, state: 'OK', mode: modeOf(d), pos: S.P.f.toLL(d.pos), prog: m.dist[i], alt: d.alt,
      lastLink: '-', nextHb: S.R.t, total: gv.total || d.total, reassigned: !!gv.reassigned, nextTry: 0,
      assigns: (gv.assigns || []).map(a => ({ ...a, sentAt: -1e9 })),
    });
  });
}

export function cumAt(path, k) { let s = 0; for (let q = 1; q <= k; q++) s += hyp(path[q], path[q - 1]); return s; }
export const modeOf = d => d.landed ? 'LANDED' : d.rtl ? 'RTL' : (S.mission.dist[d.i] >= d.total - 0.01 ? 'DONE' : 'AUTO');
export function linkModel(link) {
  const p = S.mission.params;
  if (link === 'lte') return { lat: p.lteLat, jit: p.lteLat * 0.5, loss: p.lteLoss / 100 };
  if (link === 'lora') return { lat: 450, jit: 150, loss: p.loraLoss / 100 };
  return { lat: 15, jit: 8, loss: 0.01 };
}
export const nm = x => x === 'G' ? 'GCS' : 'D' + (x + 1);
export function send(src, dst, type, link, size, payload) {
  const m = S.mission, di = typeof src === 'number' ? src : dst;
  const msg = { t: S.R.t, src, dst, type, link, size, payload, seq: (S.R.seq[src] = (S.R.seq[src] || 0) + 1) };
  const st = m.stats;
  st.sent++; st.bytes[link] += size;
  let why = null;
  if (link === 'mesh') { if (hyp(S.R.d[src].pos, S.R.d[dst].pos) > MESH_RANGE) why = 'out of range'; }
  else if (!m.faults[di][link]) why = 'link down';
  const lm = linkModel(link);
  if (!why && S.R.rng() < lm.loss) why = 'loss';
  if (why) { st[why === 'loss' ? 'dropLoss' : 'dropDown']++; pushLog(msg, null, why); return; }
  msg.deliverAt = S.R.t + Math.max(1, lm.lat + (S.R.rng() * 2 - 1) * lm.jit) / 1000;
  S.R.queue.push(msg);
}
export function pushLog(msg, lat, why) {
  S.R.log.push({ t: S.R.t, src: msg.src, dst: msg.dst, type: msg.type, link: msg.link, seq: msg.seq, size: msg.size, lat, why });
  if (S.R.log.length > 5000) S.R.log.splice(0, 500);
}
export function deliver() {
  if (!S.R.queue.length) return;
  const due = [], rest = [];
  for (const q of S.R.queue) (q.deliverAt <= S.R.t ? due : rest).push(q);
  S.R.queue = rest;
  due.sort((a, b) => a.deliverAt - b.deliverAt);
  const st = S.mission.stats;
  for (const msg of due) {
    const lat = (msg.deliverAt - msg.t) * 1000, L_ = st.lat[msg.link];
    st.delivered++; L_.sum += lat; L_.n++; L_.max = Math.max(L_.max, lat);
    pushLog(msg, lat, null);
    if (msg.dst === 'G') onGcs(msg); else onDrone(S.R.d[msg.dst], msg);
  }
}
// --- GCS receive ---
export function onGcs(msg) {
  const g = S.R.g[msg.src], m = S.mission;
  g.lastRx = S.R.t; g.lastLink = msg.link;
  if (msg.type === 'POS') {
    Object.assign(g, { pos: msg.payload.ll, prog: msg.payload.prog, sampleT: msg.payload.ts, alt: msg.payload.alt, mode: msg.payload.mode });
  } else if (msg.type === 'HB') {
    g.mode = msg.payload.mode;
  } else if (msg.type === 'REPORT') {
    const ids = [];
    for (const it of msg.payload.items) {
      ids.push(it.id);
      if (it.kind === 'cells') {
        for (const c of it.cells) if (!S.R.gcsCov.has(c)) { S.R.gcsCov.add(c); m.gcsCovered.push(c); hooks.paintCell(c, 2); }
      } else if (it.kind === 'det' && !m.found.some(f => f.id === it.fid)) {
        const h = m.hidden.find(x => x.id === it.fid);
        const fd = { id: it.fid, ll: h.ll, u: h.u, z: h.z, drone: msg.src, t: it.t, tc: S.R.t };
        m.found.push(fd); hooks.addFind(fd);
        hooks.log(`GCS confirmed anomaly #${it.fid} from D${msg.src + 1} (detected ${fmtT(it.t)}, via ${msg.link.toUpperCase()})`, 'detect');
      }
    }
    send('G', msg.src, 'ACK', msg.link, 8 + 2 * ids.length, { ids });
  } else if (msg.type === 'ASSIGN_ACK') {
    g.assignsAcked = (g.assignsAcked || 0) + 1;
    for (const gg of S.R.g) gg.assigns = gg.assigns.filter(a => a.id !== msg.payload.id);
  }
}
// --- Drone receive ---
export function onDrone(d, msg) {
  if (msg.type === 'GCS_HB') {
    d.lastGcs[msg.link] = S.R.t;
  } else if (msg.type === 'ACK') {
    const s = new Set(msg.payload.ids);
    d.outbox = d.outbox.filter(it => !s.has(it.id));
  } else if (msg.type === 'ASSIGN') {
    const a = msg.payload;
    if (!d.applied.has(a.id)) {
      d.applied.add(a.id);
      for (const p of a.pts) { d.path.push(p); d.extra.push(p); }
      d.cum = buildCum(d.path); d.total = d.cum[d.cum.length - 1];
      hooks.log(`D${d.i + 1} accepted ${a.id}: +${a.pts.length} waypoints from D${a.from + 1}`, 'assign');
    }
    send(d.i, 'G', 'ASSIGN_ACK', msg.link, 12, { id: a.id });
  } else if (msg.type === 'MESH_POS') {
    d.peers[msg.src] = msg.payload;
    const p = msg.payload;
    const dh = hypH(S.P.f.toXY(p.ll), d.pos), dv = Math.abs(p.alt - altOf(d));
    if (dh < SEP_H * 2 && dv < SEP_V && S.R.t - (d.advAt[msg.src] || -1e9) > 10) {
      d.advAt[msg.src] = S.R.t;
      hooks.log(`D${d.i + 1} mesh advisory: D${msg.src + 1} ${dh.toFixed(0)} m, Δalt ${dv.toFixed(0)} m (peer data age ${((S.R.t - p.ts) * 1000).toFixed(0)} ms)`, 'advisory');
    }
  }
}
export function droneTick(d) {
  const m = S.mission, i = d.i;
  const age = l => S.R.t - d.lastGcs[l];
  d.link = age('lte') < LINK_FRESH ? 'lte' : age('lora') < LINK_FRESH ? 'lora' : null;
  const mode = modeOf(d);

  // failsafe: no GCS heartbeat on either link
  if (!d.rtl && !d.landed && mode !== 'DONE' && Math.min(age('lte'), age('lora')) > FS_RTL) {
    d.rtl = true;
    hooks.log(`D${i + 1} failsafe: GCS heartbeat lost ${FS_RTL} s on all links, returning to base`, 'failsafe');
  }

  // energy: draw while airborne (not landed, not parked at end of path); low battery forces RTL
  if (!d.landed && mode !== 'DONE') {
    d.wh += quadPower(m.params.speed, hooks.hoverW()) * DT / 3600; d.flightT += DT;
    if (!d.rtl && d.wh >= hooks.battUsable()) {
      d.rtl = true;
      hooks.log(`D${i + 1} low battery: ${d.wh.toFixed(0)} Wh used, returning to base`, 'failsafe');
    }
  }

  // motion + sensing
  if (d.rtl && !d.landed) {
    const step = m.params.speed * DT, dist = hyp(d.pos, S.P.base);
    if (dist <= step) { d.pos = S.P.base; d.landed = true; hooks.log(`D${i + 1} landed at base`, 'failsafe'); }
    else d.pos = d.pos.map((v, k) => v + (S.P.base[k] - v) * step / dist);
  } else if (!d.rtl && m.dist[i] < d.total) {
    m.dist[i] = Math.min(d.total, m.dist[i] + m.params.speed * DT);
    d.pos = posAtPath(d.path, d.cum, m.dist[i]);
    sense(d);
  }

  // timers
  if (S.R.t >= d.nextHb) {
    d.nextHb = S.R.t + HB_T;
    for (const l of ['lte', 'lora']) send(i, 'G', 'HB', l, 25, { mode: modeOf(d) });
  }
  if (d.link && S.R.t >= d.nextTel) {
    d.nextTel = S.R.t + (d.link === 'lte' ? TEL_LTE : TEL_LORA);
    send(i, 'G', 'POS', d.link, 36, { ll: S.P.f.toLL(d.pos), alt: altOf(d), prog: m.dist[i], mode: modeOf(d), ts: S.R.t });
  }
  if (S.R.t >= d.nextMesh) {
    d.nextMesh = S.R.t + MESH_T;
    S.R.d.forEach(o => { if (o.i !== i) send(i, o.i, 'MESH_POS', 'mesh', 28, { ll: S.P.f.toLL(d.pos), alt: altOf(d), ts: S.R.t }); });
  }
  if (S.R.t >= d.nextRep) {
    d.nextRep = S.R.t + 1;
    if (d.newCells.length) d.outbox.push({ id: ++d.oid, kind: 'cells', cells: d.newCells.splice(0), sentAt: -1e9 });
    if (d.link) {
      const items = d.outbox.filter(it => S.R.t - it.sentAt > ACK_RTO && (d.link === 'lte' || it.kind === 'det')).slice(0, 6);
      if (items.length) {
        items.forEach(it => it.sentAt = S.R.t);
        send(i, 'G', 'REPORT', d.link, 12 + items.reduce((s, it) => s + (it.kind === 'cells' ? 2 * it.cells.length : 16), 0), { items });
      }
    }
  }
}
export function reportDetection(d, h) {
  d.detected.add(h.id);
  d.outbox.push({ id: ++d.oid, kind: 'det', fid: h.id, t: S.R.t, sentAt: -1e9 });
  hooks.log(`D${d.i + 1} sensor detection: anomaly #${h.id} queued for report`, 'detect');
}
// A cell counts as captured when its centre is in the central part of the frame and the drone is at standoff.
export function senseFacade(d) {
  const m = S.mission, F = S.P.fac, rx = FRAME_USE * F.c.fw, rz = FRAME_USE * F.c.fh;
  const u = (d.pos[0] - F.A[0]) * F.t[0] + (d.pos[1] - F.A[1]) * F.t[1], z = d.pos[2];
  const s = (d.pos[0] - F.A[0]) * F.nr[0] + (d.pos[1] - F.A[1]) * F.nr[1];
  if (Math.abs(s - F.c.stand) > Math.max(1, 0.15 * F.c.stand)) return;
  const j0 = Math.max(0, Math.floor((u - rx) / F.cs)), j1 = Math.min(F.cols - 1, Math.floor((u + rx) / F.cs));
  const i0 = Math.max(0, Math.floor((z - rz) / F.cs)), i1 = Math.min(F.rows - 1, Math.floor((z + rz) / F.cs));
  for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
    const ci = a * F.cols + b;
    if (S.R.cov.has(ci)) continue;
    const [uc, zc] = S.P.cells[ci].c;
    if (Math.abs(uc - u) <= rx && Math.abs(zc - z) <= rz) {
      S.R.cov.add(ci); m.covered.push(ci); d.newCells.push(ci);
      if (!S.R.gcsCov.has(ci)) hooks.paintCell(ci, 1);
    }
  }
  for (const h of m.hidden) if (!d.detected.has(h.id) && Math.abs(h.u - u) <= rx && Math.abs(h.z - z) <= rz) reportDetection(d, h);
}
export function sense(d) {
  if (S.P.fac) return senseFacade(d);
  const m = S.mission, sw = m.params.swath, reach = sw * 0.6;
  const [u, v] = rot(d.pos, S.P.th);
  const j0 = Math.floor((u - S.P.umin) / sw), i0 = Math.floor((v - S.P.vmin) / sw);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const ci = S.P.cellAt.get((i0 + a) * S.P.cols + (j0 + b));
    if (ci === undefined || S.R.cov.has(ci)) continue;
    if (hyp(S.P.cells[ci].c, d.pos) <= reach) {
      S.R.cov.add(ci); m.covered.push(ci); d.newCells.push(ci);
      if (!S.R.gcsCov.has(ci)) hooks.paintCell(ci, 1);
    }
  }
  for (const h of m.hidden) {
    if (d.detected.has(h.id)) continue;
    if (hyp(S.P.f.toXY(h.ll), d.pos) <= sw / 2) reportDetection(d, h);
  }
}
export function gcsTick() {
  S.R.g.forEach((g, i) => {
    if (S.R.t >= g.nextHb) { g.nextHb = S.R.t + HB_T; for (const l of ['lte', 'lora']) send('G', i, 'GCS_HB', l, 21, {}); }
    const age = S.R.t - g.lastRx, st = age < LINK_FRESH ? 'OK' : age < GCS_LOST ? 'DEGRADED' : 'LOST';
    if (st !== g.state) { hooks.log(`GCS: D${i + 1} ${g.state} → ${st} (silent ${age.toFixed(1)} s)`, 'link'); g.state = st; }
    if ((st === 'LOST' || g.mode === 'RTL' || g.mode === 'LANDED') && !g.reassigned && S.R.t >= g.nextTry) tryReassign(i);
    for (const a of g.assigns) if (S.R.t - a.sentAt > ACK_RTO) {
      a.sentAt = S.R.t;
      for (const l of ['lte', 'lora']) send('G', a.to, 'ASSIGN', l, 12 + 8 * a.pts.length, a);
    }
  });
}
export function tryReassign(i) {
  const g = S.R.g[i], d = S.R.d[i];
  if (g.total - g.prog < 5) { g.reassigned = true; return; }
  const cands = S.R.g.map((x, k) => k).filter(k => k !== i && S.R.g[k].state === 'OK' && (S.R.g[k].mode === 'AUTO' || S.R.g[k].mode === 'DONE'));
  if (!cands.length) { g.nextTry = S.R.t + 5; return; }
  const k = cands.reduce((a, b) => (S.R.g[a].total - S.R.g[a].prog <= S.R.g[b].total - S.R.g[b].prog ? a : b));
  const start = posAtPath(d.path, d.cum, g.prog);
  let idx = d.cum.findIndex(c => c > g.prog);
  if (idx < 0) idx = d.path.length - 1;
  const pts = [start, ...d.path.slice(idx)];
  const len = hyp(S.P.base, pts[0]) + pts.slice(1).reduce((s, p, q) => s + hyp(p, pts[q]), 0);
  const a = { id: `A${i + 1}.${++S.mission.assignN}`, from: i, to: k, pts, sentAt: -1e9 };
  S.R.g[k].assigns.push(a); S.R.g[k].total += len; g.reassigned = true;
  hooks.log(`GCS reassigns D${i + 1} remaining work (${Math.round(g.total - g.prog)} m from reported progress) to D${k + 1} as ${a.id}`, 'assign');
}
export function separationCheck() {
  const ds = S.R.d, m = S.mission;
  for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) {
    if (ds[a].landed || ds[b].landed) continue;
    // launch / recovery share one pad column; real crews sequence these, which the sim does not model
    if (S.P.fac && hypH(ds[a].pos, S.P.base) < 8 && hypH(ds[b].pos, S.P.base) < 8) continue;
    const key = a + '-' + b;
    const bad = hypH(ds[a].pos, ds[b].pos) < SEP_H && Math.abs(altOf(ds[a]) - altOf(ds[b])) < SEP_V;
    if (bad && !S.R.sepActive.has(key)) { S.R.sepActive.add(key); m.alerts++; hooks.log(`Separation violation D${a + 1}/D${b + 1}`, 'sep'); }
    else if (!bad) S.R.sepActive.delete(key);
  }
}
export function step() {
  const m = S.mission;
  S.R.t += DT; m.simT = S.R.t;
  const ch = PRESETS[m.challenge];
  if (ch) ch.events.forEach((e, k) => {
    if (m.fired.includes(k) || S.R.t < e.t) return;
    m.fired.push(k);
    for (const l of e.links) if (m.faults[e.d]) m.faults[e.d][l] = e.up;
    hooks.log(`Scripted incident: ${e.text}`, 'fault');
  });
  deliver();
  S.R.d.forEach(droneTick);
  gcsTick();
  separationCheck();
  const idle = S.R.d.every(d => { const md = modeOf(d); return md === 'DONE' || md === 'LANDED'; }) && S.R.g.every(g => !g.assigns.length);
  if (!idle) { S.R.idleSince = null; return true; }
  if (S.R.idleSince === null) S.R.idleSince = S.R.t;
  const drained = S.R.d.every(d => !d.outbox.length && !d.newCells.length);
  return !(drained || S.R.t - S.R.idleSince > 60);
}
