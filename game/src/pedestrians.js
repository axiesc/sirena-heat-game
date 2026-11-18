// pedestrians.js — the people of Sirena Bay. Civilians stroll the sidewalk rings around
// each block, the promenade and the pier; they flee gunfire and traffic, fall when hit, and
// — the part that matters — they see things. A witnessed crime is reported by world.js,
// which reads the crowd this module keeps. Officers and mission gunners are peds too, with
// kind set; their brains live in police.js and missions.js, but they move through here.

import { STREET_CENTERS, BLOCK, CITY_SIZE } from './citygen.js';
import { angleDelta, clamp, dist2D } from './math3d.js';

const SHIRTS = [0xe8e2d2, 0xd94f3d, 0x2a9db0, 0xffb84d, 0x3fae8a, 0xff8fab, 0x7a5fb0, 0xf2f2f2, 0x2e3440, 0xe07a3f];
const PANTS = [0x2e3440, 0x5a4632, 0xd8d2c2, 0x33506b, 0x707a68, 0x8c2f39];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b48f, 0x6e4530, 0xdb9f76];
const HAIRS = [0x2a2019, 0x14100c, 0x6e5636, 0xb0a08a, 0x8c2f39, 0x3a3f45];

let nextPedId = 1;

export function makePed(world, x, z, kind = 'civilian') {
  const rng = world.rng;
  const ped = {
    id: nextPedId += 1,
    kind, x, z, yaw: rng.range(0, Math.PI * 2),
    speed: 0, walkPhase: rng.range(0, 6), state: 'walk',
    health: 100, shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS),
    skin: rng.pick(SKINS), hair: rng.pick(HAIRS), hat: rng.chance(0.18) ? rng.pick(SHIRTS) : null,
    targetX: x, targetZ: z, panicTime: 0, downTime: 0, dead: false,
    shootCd: rng.range(0.5, 1.5), burstLeft: 0, reloadTime: 0, name: null,
    route: null, homeCar: null, hitFlash: 0,
  };
  world.peds.push(ped);
  return ped;
}

/** Gives a civilian a block to stroll around: waypoints are the sidewalk ring's corners. */
export function assignBlockRoute(world, ped) {
  const rng = world.rng;
  const i = rng.int(0, 6), j = rng.int(0, 6);
  const x0 = STREET_CENTERS[i] + 8 - 2.2, z0 = STREET_CENTERS[j] + 8 - 2.2;
  const x1 = x0 + BLOCK + 4.4, z1 = z0 + BLOCK + 4.4;
  ped.route = { corners: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], next: rng.int(0, 3) };
  const [tx, tz] = ped.route.corners[ped.route.next];
  ped.targetX = tx; ped.targetZ = tz;
  ped.x = clamp(ped.x, x0, x1); ped.z = clamp(ped.z, z0, z1);
}

/** The boot crowd: block strollers, promenade walkers, a few souls on the pier. */
export function seedCrowd(world) {
  const rng = world.rng;
  for (let k = 0; k < 22; k += 1) {
    const i = rng.int(0, 6), j = rng.int(0, 6);
    const x = STREET_CENTERS[i] + 8 + rng.range(0, BLOCK);
    const z = STREET_CENTERS[j] + 8 - 2.2;
    const ped = makePed(world, x, z);
    assignBlockRoute(world, ped);
  }
  for (let k = 0; k < 5; k += 1) {
    const ped = makePed(world, rng.range(20, 440), 458 + rng.range(-2, 3));
    ped.route = { corners: [[16, 458], [444, 458], [444, 462], [16, 462]], next: rng.int(0, 3) };
    const [tx, tz] = ped.route.corners[ped.route.next];
    ped.targetX = tx; ped.targetZ = tz;
  }
  for (let k = 0; k < 3; k += 1) {
    const ped = makePed(world, rng.range(-66, -14), 315 + rng.range(-3, 3));
    ped.state = 'stand';
  }
}

/** A civilian bursting out of somewhere and running from a point — carjack victims, bail-outs. */
export function spawnFleeingPed(world, x, z, fromX, fromZ) {
  const ped = makePed(world, x, z);
  ped.state = 'flee';
  ped.panicTime = 4;
  ped.fleeFromX = fromX; ped.fleeFromZ = fromZ;
  return ped;
}

/** Steers a ped toward a point at a speed; animates the walk cycle. Returns distance left. */
export function movePed(world, ped, dt, tx, tz, speed) {
  const dx = tx - ped.x, dz = tz - ped.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { ped.speed = 0; return 0; }
  const desiredYaw = Math.atan2(dx, dz);
  ped.yaw += clamp(angleDelta(ped.yaw, desiredYaw), -6 * dt, 6 * dt);
  const step = Math.min(d, speed * dt);
  ped.x += Math.sin(desiredYaw) * step;
  ped.z += Math.cos(desiredYaw) * step;
  ped.speed = speed;
  ped.walkPhase += dt * speed * 2.4;
  const [cx, cz] = world.collideCircle(ped.x, ped.z, 0.4);
  ped.x = cx; ped.z = cz;
  return d;
}

function updateCivilian(world, ped, dt) {
  if (ped.state === 'down') {
    ped.downTime += dt;
    if (!ped.dead && ped.downTime > 5 && ped.health > 25) {
      ped.state = 'flee'; ped.panicTime = 2.5; ped.fleeFromX = world.player.x; ped.fleeFromZ = world.player.z;
    }
    return;
  }
  if (ped.state === 'stand') {
    ped.speed = 0;
    ped.walkPhase += dt * 0.7; // idle sway
    return;
  }
  if (ped.state === 'flee') {
    ped.panicTime -= dt;
    const fx = ped.fleeFromX ?? world.player.x, fz = ped.fleeFromZ ?? world.player.z;
    const away = Math.atan2(ped.x - fx, ped.z - fz);
    const tx = ped.x + Math.sin(away) * 12, tz = ped.z + Math.cos(away) * 12;
    movePed(world, ped, dt, tx, tz, 5.6);
    if (ped.panicTime <= 0) {
      ped.state = 'walk';
      if (!ped.route) assignBlockRoute(world, ped);
    }
    return;
  }
  // Strolling: corner to corner around the block.
  if (!ped.route) assignBlockRoute(world, ped);
  const d = movePed(world, ped, dt, ped.targetX, ped.targetZ, 1.5);
  if (d < 0.8) {
    ped.route.next = (ped.route.next + (world.rng.chance(0.12) ? 2 : 1)) % 4;
    const [tx, tz] = ped.route.corners[ped.route.next];
    ped.targetX = tx; ped.targetZ = tz;
  }
}

/** Scatters every civilian within earshot of a point — gunfire, crashes, near misses. */
export function scareCrowd(world, x, z, radius) {
  for (const ped of world.peds) {
    if (ped.kind !== 'civilian' || ped.state === 'down') continue;
    if (dist2D(ped.x, ped.z, x, z) < radius) {
      ped.state = 'flee';
      ped.panicTime = world.rng.range(2.5, 5);
      ped.fleeFromX = x; ped.fleeFromZ = z;
    }
  }
}

export function updatePedestrians(world, dt) {
  const p = world.player;
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    ped.hitFlash = Math.max(0, ped.hitFlash - dt * 5);
    if (ped.kind === 'civilian') {
      updateCivilian(world, ped, dt);
      // Despawn the far-away strollers and let the seeder replace them near Marco.
      if (dist2D(ped.x, ped.z, p.x, p.z) > 280 && ped.state !== 'down') world.peds.splice(i, 1);
    }
  }
  // Keep the crowd topped up.
  if (world.peds.filter((q) => q.kind === 'civilian').length < 26 && world.spawnCd <= 0) {
    const i = world.rng.int(0, 6), j = world.rng.int(0, 6);
    const x = STREET_CENTERS[i] + 8 + world.rng.range(0, BLOCK);
    const z = STREET_CENTERS[j] + 8 - 2.2;
    if (dist2D(x, z, p.x, p.z) > 90 && dist2D(x, z, p.x, p.z) < 200) {
      const ped = makePed(world, x, z);
      assignBlockRoute(world, ped);
    }
  }
  void CITY_SIZE;
}
