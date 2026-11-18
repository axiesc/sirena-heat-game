// police.js — the SBPD. Pursuit cars that steer for where Marco will be, not where he is;
// officers who get out and fight on foot when he runs; roadblocks across the road ahead at
// four stars. Unit counts scale with the wanted level, spawns happen on streets out of
// sight, and every unit continuously answers the wanted system's one question: can anyone
// see him right now?

import { STREET_CENTERS } from './citygen.js';
import { makeCar, stepCar, forwardSpeed } from './vehicles.js';
import { makePed, movePed } from './pedestrians.js';
import { npcFire } from './weapons.js';
import { angleDelta, clamp, dist2D } from './math3d.js';

export const UNITS_BY_STARS = [0, 2, 3, 4, 5, 6];

export function makePoliceState() {
  return {
    seesPlayer: false, nearestUnitDist: 999, nearestOfficerDist: 999,
    spawnCd: 0, roadblockCd: 0, roadblock: null,
  };
}

/** Places one pursuit unit at a spot — used by the spawner and by the staged scenes. */
export function spawnUnitAt(world, x, z, yaw) {
  const car = makeCar('police', 0xf0f2f4, x, z, yaw);
  car.driver = 'police';
  car.ai = { mode: 'pursue', officersSpawned: false, stuckTime: 0, reverseTime: 0 };
  world.cars.push(car);
  return car;
}

function spawnUnit(world) {
  const p = world.player;
  const rng = world.rng;
  // A street intersection 130–190 m away, preferably not in front of the player's eyes.
  for (let tries = 0; tries < 8; tries += 1) {
    const sx = rng.pick(STREET_CENTERS), sz = rng.pick(STREET_CENTERS);
    const x = sx + rng.range(-3, 3), z = sz + rng.range(-3, 3);
    const d = dist2D(x, z, p.x, p.z);
    if (d < 120 || d > 200) continue;
    return spawnUnitAt(world, x, z, rng.range(0, Math.PI * 2));
  }
  return null;
}

function spawnOfficer(world, car) {
  const side = world.rng.chance(0.5) ? 1 : -1;
  const ox = car.x + Math.sin(car.yaw + side * 1.4) * 1.7;
  const oz = car.z + Math.cos(car.yaw + side * 1.4) * 1.7;
  const officer = makePed(world, ox, oz, 'officer');
  officer.shirt = 0x1d3a5f; officer.pants = 0x1a2432; officer.hat = null;
  officer.homeCar = car;
  officer.weapon = world.wanted.stars >= 5 && world.rng.chance(0.4) ? 'smg' : 'pistol';
  return officer;
}

function unitInput(world, car, dt) {
  const ai = car.ai;
  const p = world.player;
  const target = p.inCar || p;
  const lead = clamp(dist2D(car.x, car.z, target.x, target.z) / 40, 0, 1.1);
  let tx = target.x + (target.vx || 0) * lead, tz = target.z + (target.vz || 0) * lead;
  // Ram geometry: when close behind a fleeing car, aim at its rear quarter, not its centre.
  if (p.inCar && dist2D(car.x, car.z, target.x, target.z) < 9) {
    const side = Math.sin(car.id) > 0 ? 1 : -1;
    tx = target.x + Math.sin(target.yaw - Math.PI / 2) * side * 1.1 - Math.sin(target.yaw) * 1.5;
    tz = target.z + Math.cos(target.yaw - Math.PI / 2) * side * 1.1 - Math.cos(target.yaw) * 1.5;
  }
  const desiredYaw = Math.atan2(tx - car.x, tz - car.z);
  const steer = clamp(angleDelta(car.yaw, desiredYaw) * 1.9, -1, 1);
  const dist = dist2D(car.x, car.z, target.x, target.z);
  let throttle = 1;
  if (!p.inCar && dist < 8) throttle = 0; // stop and get out instead of running him down
  if (ai.reverseTime > 0) { ai.reverseTime -= dt; throttle = -1; }
  if (Math.abs(car.speed) < 0.5 && throttle > 0 && dist > 6) {
    ai.stuckTime += dt;
    if (ai.stuckTime > 2.2) { ai.reverseTime = 0.9; ai.stuckTime = 0; }
  } else ai.stuckTime = 0;
  return { throttle, steer, handbrake: dist < 14 && Math.abs(car.speed) > 12 };
}

function updateOfficer(world, officer, dt) {
  const p = world.player;
  const d = dist2D(officer.x, officer.z, p.x, p.z);
  officer.state = 'walk';
  const los = d < 60 && !world.lineBlocked(officer.x, officer.z, p.x, p.z);
  if (p.inCar && Math.abs(p.inCar.speed) > 7) {
    // No point chasing a moving car on foot: get back in, or shoot if it is close.
    if (officer.homeCar && !officer.homeCar.dead && officer.homeCar.driver !== 'player') {
      const cd = dist2D(officer.x, officer.z, officer.homeCar.x, officer.homeCar.z);
      if (cd > 2.2) { movePed(world, officer, dt, officer.homeCar.x, officer.homeCar.z, 6); return; }
      // Back in the car: the ped despawn and the unit drives again.
      officer.state = 'gone';
      if (officer.homeCar.ai) officer.homeCar.ai.officersSpawned = false;
      return;
    }
  }
  if (d > 17 || !los) {
    movePed(world, officer, dt, p.x, p.z, 6.3);
    officer.aiming = false;
    return;
  }
  // In range with line of sight: plant, aim, fire bursts.
  officer.speed = 0;
  officer.yaw = Math.atan2(p.x - officer.x, p.z - officer.z);
  officer.aiming = true;
  officer.shootCd -= dt;
  if (officer.burstLeft > 0) {
    officer.burstTimer -= dt;
    if (officer.burstTimer <= 0) {
      officer.burstTimer = officer.weapon === 'smg' ? 0.1 : 0.16;
      officer.burstLeft -= 1;
      const ty = p.inCar ? 1.0 : 1.25;
      npcFire(world, officer, p.x, ty, p.z, officer.weapon, true);
    }
  } else if (officer.shootCd <= 0) {
    officer.burstLeft = officer.weapon === 'smg' ? 5 : 3;
    officer.burstTimer = 0;
    officer.shootCd = world.rng.range(1.2, 2.1);
  }
}

function maybeRoadblock(world, dt) {
  const st = world.police;
  st.roadblockCd -= dt;
  const p = world.player;
  if (world.wanted.stars < 4 || !p.inCar || Math.abs(p.inCar.speed) < 6) return;
  if (st.roadblock || st.roadblockCd > 0) return;
  const car = p.inCar;
  const vx = car.vx, vz = car.vz;
  const aheadX = car.x + vx * 4.2, aheadZ = car.z + vz * 4.2;
  // The crossing the player is driving toward.
  let bx, bz, yaw;
  if (Math.abs(vx) > Math.abs(vz)) {
    bx = STREET_CENTERS.reduce((best, c) => (Math.abs(c - aheadX) < Math.abs(best - aheadX) ? c : best), STREET_CENTERS[0]);
    bz = car.z; yaw = 0.5; // cars parked nose-across the east-west road
  } else {
    bz = STREET_CENTERS.reduce((best, c) => (Math.abs(c - aheadZ) < Math.abs(best - aheadZ) ? c : best), STREET_CENTERS[0]);
    bx = car.x; yaw = Math.PI / 2 + 0.5;
  }
  if (dist2D(bx, bz, car.x, car.z) < 45) return;
  const cars = [];
  for (const off of [-3.4, 3.4]) {
    const px = Math.abs(vx) > Math.abs(vz) ? bx : bx + off;
    const pz = Math.abs(vx) > Math.abs(vz) ? bz + off : bz;
    const unit = makeCar('police', 0xf0f2f4, px, pz, yaw + world.rng.range(-0.15, 0.15));
    unit.driver = 'police';
    unit.ai = { mode: 'block', officersSpawned: true, stuckTime: 0, reverseTime: 0 };
    world.cars.push(unit);
    cars.push(unit);
    const officer = spawnOfficer(world, unit);
    officer.x = px + 2.4; officer.z = pz + (off > 0 ? 2 : -2);
  }
  st.roadblock = { cars, x: bx, z: bz };
  st.roadblockCd = 40;
  if (world.ui.toast) world.ui.toast('Roadblock ahead!');
}

export function updatePolice(world, dt) {
  const st = world.police;
  const p = world.player;
  const stars = world.wanted.stars;
  st.spawnCd -= dt;

  // Retire the roadblock once Marco is well past it or the heat dies down.
  if (st.roadblock) {
    const d = dist2D(st.roadblock.x, st.roadblock.z, p.x, p.z);
    if (d > 190 || stars < 3) {
      for (const unit of st.roadblock.cars) if (unit.ai) unit.ai.mode = 'pursue';
      st.roadblock = null;
    }
  }
  maybeRoadblock(world, dt);

  // Population control.
  const units = world.cars.filter((c) => c.driver === 'police');
  const wanted = UNITS_BY_STARS[stars];
  if (units.length < wanted && st.spawnCd <= 0) {
    if (spawnUnit(world)) st.spawnCd = 1.1;
    else st.spawnCd = 0.5;
  }
  for (let i = world.cars.length - 1; i >= 0; i -= 1) {
    const car = world.cars[i];
    if (car.driver !== 'police') continue;
    if (dist2D(car.x, car.z, p.x, p.z) > 330 && stars === 0) world.cars.splice(i, 1);
  }

  // Vision and distances — the wanted system's inputs.
  let sees = false;
  let nearestUnit = 999;
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    const d = dist2D(car.x, car.z, p.x, p.z);
    nearestUnit = Math.min(nearestUnit, d);
    if (d < 95 && !world.lineBlocked(car.x, car.z, p.x, p.z)) sees = true;
  }
  let nearestOfficer = 999;
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    if (ped.kind !== 'officer') continue;
    if (ped.state === 'gone' || (ped.state === 'down' && ped.downTime > 30)) { world.peds.splice(i, 1); continue; }
    if (ped.state === 'down') continue;
    const d = dist2D(ped.x, ped.z, p.x, p.z);
    nearestOfficer = Math.min(nearestOfficer, d);
    if (d < 80 && !world.lineBlocked(ped.x, ped.z, p.x, p.z)) sees = true;
    if (d > 300 && stars === 0) { world.peds.splice(i, 1); continue; }
    updateOfficer(world, ped, dt);
  }
  st.seesPlayer = sees || st.heliSees === true;
  st.nearestUnitDist = nearestUnit;
  st.nearestOfficerDist = nearestOfficer;

  // Drive the units; drop officers when Marco is on foot and close.
  for (const car of world.cars) {
    if (car.driver !== 'police' || !car.ai) continue;
    if (car.ai.mode === 'block') continue;
    if (car.dead) {
      if (!car.ai.officersSpawned) {
        car.ai.officersSpawned = true;
        spawnOfficer(world, car);
        spawnOfficer(world, car);
      }
      continue;
    }
    const impact = stepCar(world, car, unitInput(world, car, dt), dt);
    if (impact > 6) world.onCarCrash(car, impact);
    const d = dist2D(car.x, car.z, p.x, p.z);
    if (!p.inCar && d < 10 && Math.abs(car.speed) < 2 && !car.ai.officersSpawned) {
      car.ai.officersSpawned = true;
      spawnOfficer(world, car);
      if (world.wanted.stars >= 2) spawnOfficer(world, car);
    }
    void forwardSpeed;
  }
}
