# Fleet comms survey simulator

A browser simulator for multi-drone survey missions where the radio links misbehave. Draw an area, plan lanes for a small fleet, fly it, and cut LTE or LoRa links to watch the ground station's picture degrade and recover. Heritage-site challenges, public-data overlays, and decay and renewal tools are built in.

Live: https://talamantez.github.io/proto-drone/

## Run it

It is a static site with no build step, but it uses ES modules, so serve it over HTTP (opening `index.html` from disk will not work):

```
npm run serve        # http://localhost:8000
```

## Run behaviour

- **Rejoin:** a drone that returns home on a link failsafe relaunches and rejoins its survey path when GCS heartbeats come back (low-battery returns do not rejoin).
- **Report:** when a run ends (or from Export → Run report) you get coverage, gaps, a recon plan, fleet status, an incident timeline and simulated photo intake with a viewer. The frames are generated placeholders.
- **Godzilla:** the map button sends a monster across a live area survey. It jams comms near it, destroys drones it reaches and tramples ground (written off). Drones hold clear, the GCS hands lost work to the others and cuts losses if nobody is left; all of it lands in the report.
- **Spoofing:** 🛰 GPS spoof drags one drone's real position away from what its navigation believes (the dashed belief ring shows the gap); 🎭 Forged RTL injects an unsigned return-to-launch over LoRa. Three defences can be toggled: GNSS integrity check, signed commands, and a GCS audit that orders a signed resume. The report shows attacks, alarms and rejections.
- **Rogue drone:** 🛸 sends a hostile aircraft after the fleet. Without signed commands it hijacks a drone; with them it rams instead; detect-and-avoid makes drones evade. The sidebar Threat library lists these and the roadmap threats with their defences.
- **Jamming and replay:** 📻 puts a jammer on the map (links inside die, or turn lossy with frequency hopping); ⏪ replays a validly signed RTL, which signatures alone do not stop, only the freshness check does.

## Test it

```
npm install
npm test             # unit tests: planner, POI tiers, GeoJSON, coordinate parsing, headless simulation
npm run lint
npm run e2e          # browser flows (needs: pip install playwright && playwright install chromium)
```

The simulation core runs headless, so the tests fly real missions: determinism for a seed, coverage, failover after losing both links, LoRa-only detections, battery return, message accounting.

## Workflow

`main` is what GitHub Pages serves, so it stays releasable. Work happens on `dev` (or a branch off it) and reaches `main` through a pull request:

```
git checkout dev && git pull
# ...change, then before pushing:
npm run lint && npm test && npm run e2e
git push origin dev
gh pr create --base main --head dev
```

CI (lint, unit tests, browser tests) runs on every push and pull request. Merge once it is green; Pages redeploys from `main` within a minute.

## Layout

| Path | What it holds |
| --- | --- |
| `index.html`, `css/app.css` | Markup and styles |
| `js/planner.js`, `js/geo.js`, `js/poi.js`, `js/geojson.js`, `js/power.js` | Pure logic: planning, coordinates, road POIs, GeoJSON, power model |
| `js/sim.js` | Simulation core (links, drone and GCS logic, one step). UI effects go through `hooks`, so it runs in Node |
| `js/state.js` | Shared mutable state (`S`) and the Leaflet layer registry |
| `js/main.js` | Entry point: wiring and boot |
| `js/missions.js`, `js/mapview.js`, `js/render.js`, `js/controls.js` | Mission lifecycle, map layers, per-frame UI, parameter inputs |
| `js/hud.js`, `js/sheet.js`, `js/layerpanel.js`, `js/nav.js`, `js/tour.js`, `js/library.js`, `js/overlays.js`, `js/poi-ui.js` | Map controls, mobile bottom sheet, GIS-style layer stack, navigation, guided tour, polygon library, public overlays, road POIs |
| `tests/` | `node:test` unit tests and `tests/e2e/e2e.py` |
| `tools/` | Sobol sensitivity sweep over an analytic model (`node tools/model.js --check`, `python3 tools/sweep.py`) |

## Data sources

Map tiles: Esri World Imagery, OpenStreetMap. Overlays: NASA GIBS (MODIS NDVI and surface temperature, VIIRS night lights), EU JRC Global Surface Water, FEMA NFHL (US flood zones), Esri Wayback (past imagery). Place search: OpenStreetMap Nominatim (one request per second, only when you press Go). Roads, land use, heritage and decay tags: OpenStreetMap via Overpass. © OpenStreetMap contributors.

These are context layers, coarse next to a drone survey. OSM tags are volunteer-mapped, so "none found" does not mean "no decay". The site challenges are game-sized arenas near real places, not site boundaries or survey records.

## Notes

- State lives in your browser only (IndexedDB for missions, localStorage for the polygon library, layer settings and the tour flag).
- The power, cost and battery numbers are placeholders.
