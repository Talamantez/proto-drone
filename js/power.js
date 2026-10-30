// Quad power model. Pure.
// Quad power model (W) at ground speed v: induced power from momentum theory in forward flight,
// parasitic drag, fixed avionics + payload. vh = induced velocity at hover.
export const AVIONICS_W = 15, VH = 5, CDA = 0.02, RHO = 1.2, DRONES_PER_CREW = 2;
export function quadPower(v, hoverW = 190) {
  const hover = hoverW - AVIONICS_W, u = v * v / (2 * VH * VH);
  const induced = hover * Math.sqrt(Math.sqrt(u * u + 1) - u);
  return induced + 0.5 * RHO * CDA * v * v * v + AVIONICS_W;
}
