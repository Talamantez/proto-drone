// Defences a mission can switch on. `basic` is the hygiene set; Full turns everything on.
export const DEFS = [
  { key: 'auth', label: 'Signed commands', basic: true, info: 'Drones reject unsigned "GCS" orders and takeover attempts.' },
  { key: 'fresh', label: 'Freshness check', basic: true, info: 'Reject commands with stale timestamps, which stops replay.' },
  { key: 'encrypt', label: 'Link encryption', basic: true, info: 'Eavesdroppers capture only ciphertext.' },
  { key: 'rate', label: 'Rate limiting', basic: true, info: 'Junk-frame floods are dropped instead of saturating the drone.' },
  { key: 'validate', label: 'Input validation', basic: true, info: 'Waypoints outside the survey geofence are rejected.' },
  { key: 'attest', label: 'Secure boot / attestation', basic: true, info: 'Unsigned firmware is refused.' },
  { key: 'gnss', label: 'GNSS integrity check', basic: false, info: 'Cross-check the GPS fix against inertial and visual navigation.' },
  { key: 'audit', label: 'GCS audit', basic: false, info: 'An unexplained return-home on a healthy link triggers a signed resume.' },
  { key: 'daa', label: 'Detect-and-avoid', basic: false, info: 'Sense unknown aircraft nearby and evade.' },
  { key: 'hop', label: 'Frequency hopping', basic: false, info: 'Links survive jamming, degraded.' },
  { key: 'confirm', label: 'Second-sensor confirmation', basic: false, info: 'Camera detections must be confirmed by another sensor; decoys are dismissed.' },
];
export const shieldLevel = def => {
  const on = DEFS.filter(d => (def || {})[d.key]);
  return on.length === 0 ? 'off' : on.length === DEFS.length ? 'full' : DEFS.filter(d => d.basic).every(d => def[d.key]) && on.length === DEFS.filter(d => d.basic).length ? 'basic' : 'custom';
};
export const levelDef = lvl => Object.fromEntries(DEFS.map(d => [d.key, lvl === 'full' || (lvl === 'basic' && d.basic)]));
