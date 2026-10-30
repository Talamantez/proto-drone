// Shared mutable app state (S) and the Leaflet layer registry.
export const S = {
  map: null,
  mission: null,
  P: null,
  R: null,
  running: false,
  drawPts: [],
  drawing: false,
  last: 0,
  saveAt: 0,
  lOpen: false,
};

export const layers = { draw: null, poly: null, cells: null, base: null, finds: null, pois: null, zilla: null, rogue: null, jammer: null, d: [] };
