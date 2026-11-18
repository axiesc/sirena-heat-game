// wanted.js — heat, stars and the busted meter. Crimes add heat when someone sees them (or
// when the police are close enough to hear); stars are just heat read against thresholds.
// Stay out of police sight and the heat bleeds away; stand still next to an officer with a
// star up and the busted meter fills — that is how a chase ends without a shot fired.

import { clamp } from './math3d.js';

export const STAR_THRESHOLDS = [50, 130, 230, 340, 460];

export const CRIME_HEAT = {
  discharge: 25,   // firing a gun in public
  carjack: 55,     // pulling a driver out of their car
  assault: 45,     // hurting a pedestrian
  hitAndRun: 75,   // running someone down and driving on
  killPed: 130,    // killing a pedestrian
  ramPolice: 40,   // hitting a police car
  shootPolice: 90, // wounding an officer or their car
  killOfficer: 170,
  explosion: 120,
};

export function starsFor(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars += 1;
  return stars;
}

/**
 * Records a crime at (x, z). `seen` is forced by the caller when a police unit is right
 * there; otherwise a civilian witness with line of sight inside 22 m makes it count, and
 * gunfire is heard by police within 110 m even unseen. Returns true when it raised heat.
 */
export function reportCrime(world, kind, x, z, seen = false) {
  const w = world.wanted;
  let witnessed = seen;
  if (!witnessed) {
    for (const ped of world.peds) {
      if (ped.kind !== 'civilian' || ped.state === 'down') continue;
      const dx = ped.x - x, dz = ped.z - z;
      if (dx * dx + dz * dz < 22 * 22 && !world.lineBlocked(x, z, ped.x, ped.z)) { witnessed = true; break; }
    }
  }
  if (!witnessed && kind === 'discharge') {
    if (world.police.nearestUnitDist < 110) witnessed = true;
  }
  if (!witnessed) return false;
  const before = w.stars;
  w.heat += CRIME_HEAT[kind] || 30;
  w.stars = starsFor(w.heat);
  w.lastCrimeAt = world.time;
  if (w.stars > before && world.ui.toast) {
    world.ui.toast(w.stars >= 3 ? 'SBPD is throwing everything at you' : 'Witnesses called it in — SBPD incoming');
  }
  return true;
}

/** Scripted heat for missions and the screenshot scenes: set the level, keep the change. */
export function setWanted(world, stars) {
  const w = world.wanted;
  w.heat = stars <= 0 ? 0 : STAR_THRESHOLDS[stars - 1] + 5;
  w.stars = starsFor(w.heat);
  w.lastSeenAt = world.time;
}

export function clearWanted(world) {
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.wanted.busted = 0;
}

export function updateWanted(world, dt) {
  const w = world.wanted;
  const info = world.police;
  if (info.seesPlayer) w.lastSeenAt = world.time;
  if (w.stars > 0 && world.time - w.lastSeenAt > 5 && world.time - w.lastCrimeAt > 2) {
    w.heat -= (9 + w.stars * 3.5) * dt;
    if (w.heat < 0) w.heat = 0;
    w.stars = starsFor(w.heat);
    if (w.stars === 0) {
      w.busted = 0;
      if (world.ui.toast) world.ui.toast('You lost them. Heat is off — for now.');
      world.onWantedCleared();
    }
  }
  // The busted meter: close police + a slow or cornered Marco.
  const p = world.player;
  let filling = false;
  if (w.stars > 0 && !p.dead) {
    if (!p.inCar && info.nearestOfficerDist < 2.6 && p.speed < 1.2) filling = true;
    if (p.inCar && info.nearestUnitDist < 4.2 && Math.abs(p.inCar.speed) < 1.5) filling = true;
  }
  if (filling) {
    w.busted += dt / 2.4;
    if (w.busted >= 1) { w.busted = 0; world.onBusted(); }
  } else {
    w.busted = Math.max(0, w.busted - dt * 0.7);
  }
  void clamp;
}
