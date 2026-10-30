// Simulation constants, camera model and the heritage pre-flight checklist.
export const M_LAT = 111320;
export const COLORS = ['#c9923a', '#3f8fc4', '#c4524d', '#58a066', '#9a62ad', '#b9a73c', '#3fa397', '#c97652'];
export const ALT_BASE = 40, ALT_STEP = 6, SEP_H = 12, SEP_V = 5;
// comms constants (seconds)
export const DT = 0.1, HB_T = 1, TEL_LTE = 0.5, TEL_LORA = 5, MESH_T = 0.5, MESH_RANGE = 400;
export const LINK_FRESH = 3, FS_RTL = 6, GCS_LOST = 8, ACK_RTO = 3, TEL_BUDGET = 2;
// capture planner: camera is a generic 1" 20 MP / 8.8 mm body (edit CAM for the real payload).
// Limits are conservative defaults for the heritage profile, not regulation: set them from the site risk assessment.
export const CAM = { sensW: 13.2, focal: 8.8, w: 5472, h: 3648, minTrig: 2 };   // mm, mm, px, px, s between exposures
export const BLUR_PX = 0.5, SHUTTER = 1000;      // allowed motion blur (px) at 1/SHUTTER s
export const FRAME_USE = 0.4;                    // only the central 80% of a frame counts as captured (edge distortion)
export const MIN_STANDOFF = 10, MIN_AGL = 5, MAX_AGL = 120, LAUNCH_OFF = 20;   // m
export const CHECKS = [
  'Written permission from the site authority, and flight authorisation',
  'UXO / landmine clearance confirmed for launch and recovery areas',
  'Wind inside airframe limit; overcast or diffuse light (no hard shadows)',
  'GCPs / scale bars placed; independent checkpoints surveyed',
  'Standoff at or above site minimum; no downwash over loose fragments',
  'Raw capture: write-once copy, checksums, second backup',
];
