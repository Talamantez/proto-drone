// Learning catalogue of threats to a survey fleet. `sim` entries have a button on the map; the rest are on the roadmap.
export const THREATS = [
  { name: 'GPS spoofing', sim: true, what: 'A fake satellite signal drags the drone\'s position fix. The drone believes it is on course while it flies somewhere else.', defence: 'Cross-check GNSS against inertial and visual navigation; reject the fix on disagreement.' },
  { name: 'Forged command (RTL)', sim: true, what: 'An attacker sends an unsigned "return home" order that looks like it came from the GCS.', defence: 'Sign and verify every command; audit unexplained mode changes at the GCS.' },
  { name: 'Rogue / hijacker drone', sim: true, what: 'A hostile aircraft approaches, takes over a drone through an unauthenticated radio, or rams it.', defence: 'Authenticated links stop the takeover; detect-and-avoid (remote ID, radar, ADS-B in) stops the collision.' },
  { name: 'Monster / physical hazard', sim: true, what: 'A moving hazard jams comms, destroys aircraft and tramples ground.', defence: 'Hold clear, reassign work, cut losses, report the write-off.' },
  { name: 'RF jamming', sim: false, what: 'Noise on the control and data bands cuts links; drones fall back to failsafe return-to-launch.', defence: 'Frequency hopping, a second link type (LTE plus LoRa), mesh relay, directional antennas.' },
  { name: 'Replay attack', sim: false, what: 'A recorded valid command or heartbeat is played back later.', defence: 'Sequence numbers or timestamps inside the signature.' },
  { name: 'Eavesdropping / data theft', sim: false, what: 'Imagery or telemetry is captured over the air or from a lost aircraft.', defence: 'Link and at-rest encryption; wipe on disarm.' },
  { name: 'Battery-drain / denial of service', sim: false, what: 'Spurious commands or flooding keep the radio busy or force wasteful loiters.', defence: 'Rate limiting, command allow-lists, watchdogs.' },
  { name: 'Data poisoning', sim: false, what: 'Corrupted map data (roads, boundaries) steers drones to wrong places.', defence: 'Check inputs against a trusted source; require operator review of snapped waypoints.' },
  { name: 'Sensor blinding / spoofing', sim: false, what: 'Lasers or decoys blind the camera or create false detections.', defence: 'Multi-sensor confirmation; flag detections that no second sensor sees.' },
  { name: 'Firmware / supply-chain compromise', sim: false, what: 'Malicious code arrives in an update or a component.', defence: 'Signed firmware, secure boot, controlled provisioning.' },
];
