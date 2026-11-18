// helicopter.js — the SBPD helicopter. It joins at three stars, orbits Marco at a
// respectful distance, and puts its searchlight on him — which also means the wanted system
// counts him as seen while the light is on him. At five stars a door gunner opens up in
// bursts. When the heat drops, it peels off and goes home.

import { clamp, dist2D } from './math3d.js';
import { raycast } from './weapons.js';

export function makeHeliState() {
  return {
    active: false, leaving: false, x: 0, y: 60, z: 0, yaw: 0,
    vx: 0, vz: 0, rotor: 0, orbitPhase: 0, gunCd: 2, burstLeft: 0, burstTimer: 0,
    spotX: 0, spotZ: 0,
  };
}

function heliFire(world, heli, dt) {
  const p = world.player;
  heli.gunCd -= dt;
  const d = dist2D(heli.x, heli.z, p.x, p.z);
  const los = d < 75 && !world.lineBlocked(heli.x, heli.z, p.x, p.z);
  if (heli.burstLeft > 0) {
    heli.burstTimer -= dt;
    if (heli.burstTimer <= 0) {
      heli.burstTimer = 0.11;
      heli.burstLeft -= 1;
      // One tracer from the door gun to near Marco; the roll decides if it bites.
      const ty = p.inCar ? 0.9 : 1.2;
      const res = raycast(world, heli.x + 1.2, heli.y - 0.4, heli.z, (p.x - heli.x) / (d || 1), (ty - heli.y) / 40, (p.z - heli.z) / (d || 1), 90);
      const lands = los && world.rng.next() < 0.34;
      const ex = lands ? p.x : res.x, ey = lands ? ty : res.y, ez = lands ? p.z : res.z;
      world.addTracer(heli.x + 1.2, heli.y - 0.4, heli.z, ex, ey, ez, 0xffc0a0);
      world.sound.shot('heli');
      if (lands) world.damagePlayer(world.rng.range(5, 11), heli.x, heli.z);
    }
  } else if (heli.gunCd <= 0 && los && world.wanted.stars >= 5) {
    heli.burstLeft = 5;
    heli.burstTimer = 0;
    heli.gunCd = world.rng.range(2.2, 3.2);
  }
}

export function updateHelicopter(world, dt) {
  const heli = world.heli;
  const p = world.player;
  const stars = world.wanted.stars;
  heli.rotor += dt * 28;
  if (!heli.active) {
    world.police.heliSees = false;
    if (stars >= 3) {
      heli.active = true;
      heli.leaving = false;
      heli.x = p.x + 240; heli.z = p.z - 180; heli.y = 46;
      heli.vx = 0; heli.vz = 0;
      if (world.ui.toast) world.ui.toast('SBPD helicopter on you — break line of sight!');
    }
    return;
  }
  if (stars < 3 && !heli.leaving) heli.leaving = true;
  heli.orbitPhase += dt * 0.22;
  let tx, tz, ty;
  if (heli.leaving) {
    tx = p.x + 420; tz = p.z - 420; ty = 70;
    if (dist2D(heli.x, heli.z, p.x, p.z) > 420) { heli.active = false; world.police.heliSees = false; return; }
  } else {
    const a = heli.orbitPhase;
    tx = p.x + Math.cos(a) * 27;
    tz = p.z + Math.sin(a) * 27;
    ty = 35;
  }
  // Springy flight toward the orbit point, nose into the velocity.
  const ax = (tx - heli.x) * 0.55 - heli.vx * 0.9;
  const az = (tz - heli.z) * 0.55 - heli.vz * 0.9;
  heli.vx = clamp(heli.vx + ax * dt * 3, -30, 30);
  heli.vz = clamp(heli.vz + az * dt * 3, -30, 30);
  heli.x += heli.vx * dt;
  heli.z += heli.vz * dt;
  heli.y += (ty - heli.y) * Math.min(1, dt * 1.6);
  if (Math.hypot(heli.vx, heli.vz) > 2) {
    const want = Math.atan2(heli.vx, heli.vz);
    let diff = want - heli.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    heli.yaw += clamp(diff, -1.6 * dt, 1.6 * dt);
  }
  heli.spotX = p.x; heli.spotZ = p.z;
  const d = dist2D(heli.x, heli.z, p.x, p.z);
  world.police.heliSees = !heli.leaving && d < 120 && !world.lineBlocked(heli.x, heli.z, p.x, p.z);
  if (!heli.leaving) heliFire(world, heli, dt);
}
