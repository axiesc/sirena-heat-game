// weapons.js — hitscan combat: fists, a pistol and an SMG. A shot is a ray tested against
// pedestrian capsules, car circles and the building boxes; the nearest hit wins, draws a
// tracer and a puff of impact particles, and applies damage with a headshot bonus. NPC fire
// is the same ray with an accuracy roll, so cover genuinely works. Every player shot is also
// a noise event: the crowd scares and the wanted system hears about it.

import { clamp, dist2D } from './math3d.js';
import { reportCrime } from './wanted.js';

export const WEAPONS = {
  fists: { label: 'Fists', damage: 30, range: 2.1, cooldown: 0.38, auto: false, ammoType: null, noise: 6 },
  pistol: { label: 'Pistol', damage: 34, range: 70, cooldown: 0.3, auto: false, ammoType: 'pistol', noise: 46, tracer: 0xd8ecff },
  smg: { label: 'SMG', damage: 17, range: 60, cooldown: 0.095, auto: true, ammoType: 'smg', noise: 46, tracer: 0xffe2a8 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

/** Ray vs the world; returns the nearest hit { kind, target, x, y, z, t } or a far point. */
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, ignorePed = null) {
  let bestT = maxDist;
  let hit = null;
  // Buildings (2D slabs, height-checked).
  for (const col of world.colliders) {
    if (col.h < 0.4) continue;
    let tmin = 0, tmax = bestT;
    if (Math.abs(dx) < 1e-8) { if (ox < col.x0 || ox > col.x1) continue; }
    else {
      let t1 = (col.x0 - ox) / dx, t2 = (col.x1 - ox) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-8) { if (oz < col.z0 || oz > col.z1) continue; }
    else {
      let t1 = (col.z0 - oz) / dz, t2 = (col.z1 - oz) / dz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < 0 || tmin >= bestT) continue;
    const hy = oy + dy * tmin;
    if (hy < 0 || hy > col.h + 0.05) continue;
    bestT = tmin;
    hit = { kind: 'wall', target: null, t: tmin };
  }
  // Cars: two circles each.
  for (const car of world.cars) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const off of [-car.length / 4, car.length / 4]) {
      const cx = car.x + fx * off, cz = car.z + fz * off;
      const r = car.width * 0.78;
      const lx = cx - ox, lz = cz - oz;
      const tca = lx * dx + lz * dz;
      if (tca < 0 || tca > bestT) continue;
      const d2 = lx * lx + lz * lz - tca * tca;
      if (d2 > r * r) continue;
      const t = tca - Math.sqrt(r * r - d2);
      const hy = oy + dy * t;
      if (hy < 0.1 || hy > 1.6) continue;
      if (t < bestT) { bestT = t; hit = { kind: 'car', target: car, t }; }
    }
  }
  // Peds: vertical capsules.
  for (const ped of world.peds) {
    if (ped === ignorePed || ped.state === 'down') continue;
    const lx = ped.x - ox, lz = ped.z - oz;
    const tca = lx * dx + lz * dz;
    if (tca < 0.5 || tca > bestT) continue;
    const d2 = lx * lx + lz * lz - tca * tca;
    if (d2 > 0.45 * 0.45) continue;
    const hy = oy + dy * tca;
    if (hy < 0 || hy > 1.95) continue;
    bestT = tca;
    hit = { kind: 'ped', target: ped, t: tca, head: hy > 1.5 };
  }
  // Ground plane.
  if (dy < -0.001) {
    const t = -oy / dy;
    if (t > 0 && t < bestT) { bestT = t; hit = { kind: 'ground', target: null, t }; }
  }
  const hx = ox + dx * bestT, hy = oy + dy * bestT, hz = oz + dz * bestT;
  if (hit) { hit.x = hx; hit.y = hy; hit.z = hz; }
  return { hit, x: hx, y: hy, z: hz, t: bestT };
}

export function damagePed(world, ped, amount, byPlayer) {
  if (ped.state === 'down') return;
  ped.health -= amount;
  ped.hitFlash = 1;
  world.addParticles(ped.x, 1.3, ped.z, 5, 0xa02318, 0.5, 2.2);
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.dead = true;
    ped.downTime = 0;
    if (byPlayer) {
      if (ped.kind === 'officer') reportCrime(world, 'killOfficer', ped.x, ped.z, true);
      else if (ped.kind === 'civilian') reportCrime(world, 'killPed', ped.x, ped.z);
      else reportCrime(world, 'assault', ped.x, ped.z);
    }
    world.onPedDown(ped);
  } else if (byPlayer && ped.kind === 'civilian') {
    reportCrime(world, 'assault', ped.x, ped.z);
    ped.state = 'flee';
    ped.panicTime = 4;
    ped.fleeFromX = world.player.x; ped.fleeFromZ = world.player.z;
  } else if (byPlayer && ped.kind === 'officer') {
    reportCrime(world, 'shootPolice', ped.x, ped.z, true);
  }
}

export function damageCar(world, car, amount, byPlayer) {
  car.health -= amount * 0.55;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.health = 0;
    world.addParticles(car.x, 1, car.z, 22, 0x2c2c30, 1.1, 3);
    world.sound.collision(0.7);
    if (world.missions) world.missions.onCarDestroyed(car);
  }
  if (byPlayer && car.driver === 'police') reportCrime(world, 'shootPolice', car.x, car.z, true);
}

/** Marco fires (or swings) with his current weapon along the camera's aim ray. */
export function playerFire(world, origin, dir) {
  const p = world.player;
  const spec = WEAPONS[p.weapon];
  if (world.time < p.fireReadyAt) return;
  if (spec.ammoType) {
    if ((p.ammo[spec.ammoType] || 0) <= 0) {
      world.sound.dryFire();
      p.fireReadyAt = world.time + 0.3;
      if (world.ui.toast) world.ui.toast(`No ${spec.ammoType} ammo — Sirena Arms sells more`);
      return;
    }
    p.ammo[spec.ammoType] -= 1;
  }
  p.fireReadyAt = world.time + spec.cooldown;
  const muzzle = { x: p.x + dir.x * 0.5, y: 1.42, z: p.z + dir.z * 0.5 };
  if (p.weapon === 'fists') {
    world.sound.melee();
    p.meleeSwing = 1;
    // Nearest ped or car inside the arc takes the hit.
    let best = null, bestD = spec.range;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = dist2D(ped.x, ped.z, p.x, p.z);
      if (d < bestD) { best = ped; bestD = d; }
    }
    if (best) {
      world.sound.hitFlesh();
      damagePed(world, best, spec.damage, true);
      if (best.state !== 'down') { best.x += dir.x * 0.7; best.z += dir.z * 0.7; }
    }
    return;
  }
  world.sound.shot(p.weapon);
  world.onGunshot(p.x, p.z, true);
  const spread = p.weapon === 'smg' ? 0.016 : 0.006;
  const dx = dir.x + (world.rng.next() - 0.5) * spread;
  const dy = dir.y + (world.rng.next() - 0.5) * spread;
  const dz = dir.z + (world.rng.next() - 0.5) * spread;
  const len = Math.hypot(dx, dy, dz) || 1;
  const res = raycast(world, origin.x, origin.y, origin.z, dx / len, dy / len, dz / len, spec.range);
  world.addTracer(muzzle.x, muzzle.y, muzzle.z, res.x, res.y, res.z, spec.tracer);
  world.addFlash(muzzle.x, muzzle.y, muzzle.z, 0.55, 0xffd9a0);
  p.recoil = Math.min(1, p.recoil + (p.weapon === 'smg' ? 0.25 : 0.5));
  if (res.hit) {
    if (res.hit.kind === 'ped') {
      world.sound.hitFlesh();
      damagePed(world, res.hit.target, spec.damage * (res.hit.head ? 1.9 : 1), true);
    } else if (res.hit.kind === 'car') {
      world.sound.hitMetal();
      world.addParticles(res.x, res.y, res.z, 4, 0xffc873, 0.4, 2.6);
      damageCar(world, res.hit.target, spec.damage, true);
    } else {
      world.addParticles(res.x, res.y, res.z, 3, 0xcfc4ae, 0.35, 1.8);
    }
  }
}

/**
 * An NPC shoots at a target position. Accuracy falls with distance; cover blocks the ray
 * before the roll is even made. Returns true when the shot lands.
 */
export function npcFire(world, ped, tx, ty, tz, weaponKind, targetIsPlayer) {
  const spec = WEAPONS[weaponKind] || WEAPONS.pistol;
  const ox = ped.x, oy = 1.42, oz = ped.z;
  let dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz) || 1;
  dx /= dist; dy /= dist; dz /= dist;
  world.sound.shot(weaponKind === 'smg' ? 'smg' : 'heli');
  const res = raycast(world, ox, oy, oz, dx, dy, dz, spec.range, ped);
  const blocked = res.hit && res.hit.kind === 'wall' && res.t < dist - 1.2;
  const hitChance = clamp(0.72 - dist * 0.011, 0.12, 0.66);
  const lands = !blocked && world.rng.next() < hitChance;
  const endX = lands ? tx : res.x;
  const endY = lands ? ty : res.y;
  const endZ = lands ? tz : res.z;
  world.addTracer(ox + dx * 0.6, oy, oz + dz * 0.6, endX, endY, endZ, 0xffb0a0);
  world.addFlash(ox + dx * 0.6, oy, oz + dz * 0.6, 0.45, 0xffc0a0);
  if (lands && targetIsPlayer) {
    world.damagePlayer(spec.damage * world.rng.range(0.65, 1.15), ped.x, ped.z);
  } else if (!lands && !blocked) {
    world.addParticles(res.x, res.y, res.z, 2, 0xcfc4ae, 0.3, 1.5);
  }
  return lands;
}

export function cycleWeapon(world) {
  const p = world.player;
  const owned = WEAPON_ORDER.filter((w) => w === 'fists' || p.weapons[w]);
  const idx = owned.indexOf(p.weapon);
  p.weapon = owned[(idx + 1) % owned.length];
  if (world.ui.toast) world.ui.toast(WEAPONS[p.weapon].label + (WEAPONS[p.weapon].ammoType ? ` — ${p.ammo[WEAPONS[p.weapon].ammoType]} rounds` : ''));
}
