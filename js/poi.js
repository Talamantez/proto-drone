// Road POI tiers: OSM classification, base snapping and zone weights. Pure.
// Every tier is user-controllable: show on map, eligible for base snapping, and a weight for its zone.
export const TIERS = [
  { id: 'ramp',  name: 'Ramps / motorway junctions', color: '#e5484d', w: 2 },
  { id: 'choke', name: 'Bridge / tunnel ends',       color: '#f76b15', w: 2 },
  { id: 'major', name: 'Major junctions (≤ secondary)', color: '#f5d90a', w: 1.5 },
  { id: 'minor', name: 'Minor junctions',            color: '#46a758', w: 0.5 },
  { id: 'rail',  name: 'Level crossings',            color: '#8e4ec6', w: 1 },
  { id: 'dead',  name: 'Dead ends / turnarounds',    color: '#3e9bd1', w: 0 },
];
export const ROAD_RANK = { motorway: 1, motorway_link: 1, trunk: .85, trunk_link: .85, primary: .7, primary_link: .7, secondary: .5, secondary_link: .5,
  tertiary: .35, tertiary_link: .35, unclassified: .2, residential: .15, living_street: .1, service: .05 };
export const POI_TIER_ORDER = ['ramp', 'choke', 'major', 'minor', 'rail', 'dead'];   // a node gets its first matching tier
export const defaultPoiCfg = () => Object.fromEntries(TIERS.map(t => [t.id, { show: true, snap: t.w > 0, w: t.w }]));
// Overpass `out geom tags` elements -> [{ id, ll:[lat,lng], tier, flow 0..1 }]
export function classifyPois(els) {
  const nodes = new Map();
  const at = (id, ll) => { let n = nodes.get(id); if (!n) nodes.set(id, n = { id, ll, deg: 0, flow: 0, best: 0, link: false, choke: false, junction: false, rail: false }); return n; };
  const yes = v => v && v !== 'no';
  for (const e of els) {
    const hw = e.tags && e.tags.highway;
    if (e.type === 'way' && ROAD_RANK[hw] !== undefined && e.nodes && e.geometry) {
      const rank = ROAD_RANK[hw], k = e.nodes.length, choke = yes(e.tags.bridge) || yes(e.tags.tunnel);
      e.nodes.forEach((id, j) => {
        const g = e.geometry[j]; if (!g) return;
        const n = at(id, [g.lat, g.lon]), end = j === 0 || j === k - 1;
        n.deg += end ? 1 : 2; n.flow += rank; n.best = Math.max(n.best, rank);
        if (end && hw.endsWith('_link')) n.link = true;
        if (end && choke) n.choke = true;
      });
    } else if (e.type === 'node' && e.tags) {
      if (e.tags.highway === 'motorway_junction') at(e.id, [e.lat, e.lon]).junction = true;
      if (e.tags.railway === 'level_crossing') at(e.id, [e.lat, e.lon]).rail = true;
    }
  }
  const out = [];
  for (const n of nodes.values()) {
    const hit = {
      ramp: n.junction || (n.link && n.deg >= 2), choke: n.choke, major: n.deg >= 3 && n.best >= .5,
      minor: n.deg >= 3, rail: n.rail, dead: n.deg === 1 && n.best >= .15,
    };
    const tier = POI_TIER_ORDER.find(t => hit[t]);
    if (tier) out.push({ id: n.id, ll: n.ll, tier, flow: n.flow ? Math.min(1, n.flow / 2) : .3 });
  }
  return out;
}
export const poiBonus = (p, cfg) => (cfg[p.tier] ? cfg[p.tier].w : 0) * (.25 + .75 * p.flow);
// Score = (bonus + 0.1) / (1 + 4 d / radius); hard mode just takes the nearest eligible node.
export function pickSnap(pois, cfg, xyOf, from, radius, hard) {
  let best = null;
  for (const p of pois) {
    if (!cfg[p.tier] || !cfg[p.tier].snap) continue;
    const q = xyOf(p.ll), dd = Math.hypot(q[0] - from[0], q[1] - from[1]);
    if (dd > radius) continue;
    const score = hard ? -dd : (poiBonus(p, cfg) + .1) / (1 + 4 * dd / radius);
    if (!best || score > best.score) best = { poi: p, d: dd, xy: q, score };
  }
  return best;
}
// Set the launch point back from the node toward the site centre.
export function setBack(nodeXY, toward, back) {
  const dx = toward[0] - nodeXY[0], dy = toward[1] - nodeXY[1], L = Math.hypot(dx, dy) || 1;
  return [nodeXY[0] + dx / L * back, nodeXY[1] + dy / L * back];
}
// Per-cell weight = 1 + strongest nearby POI bonus.
export function cellWeights(cells, pois, cfg, xyOf, zoneR) {
  const z = pois.map(p => ({ xy: xyOf(p.ll), b: poiBonus(p, cfg) })).filter(q => q.b > 0);
  return cells.map(c => {
    let b = 0;
    for (const q of z) if (q.b > b && Math.hypot(q.xy[0] - c.c[0], q.xy[1] - c.c[1]) <= zoneR) b = q.b;
    return 1 + b;
  });
}
