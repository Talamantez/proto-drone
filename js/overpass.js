// Overpass API client with mirror fallback.
export const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
export async function overpass(q, ms = 30000) {
  let err;
  for (let round = 0; round < 2; round++) for (const url of OVERPASS) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      clearTimeout(to);
      if (r.ok) return (await r.json()).elements;
      err = `${new URL(url).host} HTTP ${r.status}`;
    } catch (e) { err = `${new URL(url).host} ${e.name === 'AbortError' ? 'timed out' : e.message}`; }
    await new Promise(res => setTimeout(res, 800 * (round + 1)));
  }
  throw new Error(err);
}
