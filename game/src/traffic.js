// traffic.js — the city's civilian traffic. Cars follow the street grid on the right-hand
// lane, pick a way at each intersection, brake for whatever is in front of them, honk when
// startled and panic when the shooting starts. Parked cars line the kerbs for Marco to borrow.

import { STREET_CENTERS, CITY_SIZE } from './citygen.js';
import { CAR_TYPES, CAR_COLORS } from './models.js';
import { makeCar, stepCar, forwardSpeed } from './vehicles.js';
import { angleDelta, clamp, dist2D } from './math3d.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'hatch', 'hatch', 'coupe', 'pickup', 'van', 'taxi'];
const MAX_TRAFFIC = 13;
const LANE = 3.1;

/** Lane-centre point for a car travelling `dir` along `street` on `axis`, at `along`. */
export function lanePoint(axis, street, dir, along) {
  if (axis === 'x') return [along, street + (dir > 0 ? LANE : -LANE)];
  return [street + (dir > 0 ? -LANE : LANE), along];
}

function pickRoute(world, car) {
  const rng = world.rng;
  const ai = car.ai;
  // At an intersection: mostly straight on, sometimes a turn, almost never a U-turn.
  const roll = rng.next();
  if (roll < 0.45) {
    // turn left or right: swap axis, keep the crossing street as the new street.
    const crossing = ai.street; // we are crossing the street whose centre is ai.targetCross
    ai.axis = ai.axis === 'x' ? 'z' : 'x';
    ai.street = ai.targetCross;
    ai.dir = rng.chance(0.5) ? 1 : -1;
    ai.crossingFrom = crossing;
  } else if (roll < 0.52) {
    ai.dir = -ai.dir; // U-turn
  }
  // Next crossing ahead on the (possibly new) street.
  const along = ai.axis === 'x' ? car.x : car.z;
  const ahead = STREET_CENTERS.filter((c) => (ai.dir > 0 ? c > along + 4 : c < along - 4));
  ai.targetCross = ahead.length
    ? (ai.dir > 0 ? Math.min(...ahead) : Math.max(...ahead))
    : (ai.dir > 0 ? CITY_SIZE + 40 : -40);
}

export function spawnTrafficCar(world, x, z, axis, street, dir) {
  const rng = world.rng;
  const type = rng.pick(TRAFFIC_TYPES);
  const [lx, lz] = lanePoint(axis, street, dir, axis === 'x' ? x : z);
  const car = makeCar(type, rng.pick(CAR_COLORS), lx, lz, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
  car.driver = 'traffic';
  car.ai = { axis, street, dir, targetCross: 0, speedPref: rng.range(8.5, 13.5), panic: 0, stuckTime: 0 };
  pickRoute(world, car);
  world.cars.push(car);
  return car;
}

/** Keeps the traffic population topped up around the player and removes the far-away. */
export function manageTraffic(world, dt) {
  const p = world.player;
  let count = 0;
  for (let i = world.cars.length - 1; i >= 0; i -= 1) {
    const car = world.cars[i];
    if (car.driver !== 'traffic') continue;
    const d = dist2D(car.x, car.z, p.x, p.z);
    if (d > 260 && !car.marked) { world.cars.splice(i, 1); continue; }
    count += 1;
  }
  if (count >= MAX_TRAFFIC || world.spawnCd > 0) return;
  // Spawn on a street ring around the player, out of immediate sight.
  const rng = world.rng;
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const street = rng.pick(STREET_CENTERS);
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = clamp((axis === 'x' ? p.x : p.z) + dir * rng.range(95, 150), 12, CITY_SIZE - 12);
  const [sx, sz] = lanePoint(axis, street, dir, along);
  if (dist2D(sx, sz, p.x, p.z) < 80) return;
  if (world.cars.some((c) => dist2D(c.x, c.z, sx, sz) < 14)) return;
  spawnTrafficCar(world, sx, sz, axis, street, dir);
  world.spawnCd = 0.7;
}

/** Parks a car at the kerb: used for the city's parked fleet and mission vehicles. */
export function parkCar(world, type, color, x, z, yaw) {
  const car = makeCar(type, color, x, z, yaw);
  car.driver = null;
  world.cars.push(car);
  return car;
}

/** The parked fleet that dresses the streets at boot. */
export function seedParkedCars(world) {
  const rng = world.rng;
  const spots = [
    [40, 60.5, Math.PI / 2], [120, 79.5, -Math.PI / 2], [210, 122.5, Math.PI / 2], [300, 141.5, -Math.PI / 2],
    [390, 60.5, Math.PI / 2], [60, 203.5, -Math.PI / 2], [180, 246.5, Math.PI / 2], [330, 203.5, -Math.PI / 2],
    [420, 265.5, -Math.PI / 2], [90, 327.5, Math.PI / 2], [150, 370.5, -Math.PI / 2], [250, 327.5, Math.PI / 2],
    [370, 389.5, -Math.PI / 2], [430, 327.5, Math.PI / 2], [36, 141.5, -Math.PI / 2], [225, 451.5, 0],
  ];
  for (const [x, z, yaw] of spots) {
    parkCar(world, rng.pick(TRAFFIC_TYPES), rng.pick(CAR_COLORS), x + rng.range(-2, 2), z, yaw);
  }
}

/** One traffic car's brain for a step; returns its physics input. */
function trafficInput(world, car, dt) {
  const ai = car.ai;
  const p = world.player;
  ai.panic = Math.max(0, ai.panic - dt);
  if (world.lastShotAt > world.time - 1.5 && dist2D(car.x, car.z, world.lastShotX, world.lastShotZ) < 30) ai.panic = 2.5;

  const along = ai.axis === 'x' ? car.x : car.z;
  const crossDist = (ai.targetCross - along) * ai.dir;
  if (crossDist < 7 && crossDist > -4) pickRoute(world, car);

  const lookAhead = 16 + Math.abs(car.speed) * 0.7;
  const [tx, tz] = lanePoint(ai.axis, ai.street, ai.dir, along + lookAhead * ai.dir);
  const desiredYaw = Math.atan2(tx - car.x, tz - car.z);
  let steer = clamp(angleDelta(car.yaw, desiredYaw) * 1.7, -1, 1);
  if (ai.panic > 0) steer += Math.sin(world.time * 9 + car.id) * 0.22;

  // Whatever is in front: cars, peds, the player, a roadblock — brake for all of it.
  let throttle = Math.abs(car.speed) < ai.speedPref + (ai.panic > 0 ? 5 : 0) ? 0.75 : 0;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const checkBody = (ox, oz, radius) => {
    const dx = ox - car.x, dz = oz - car.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 11 && side < radius) return ahead;
    return Infinity;
  };
  let nearest = Infinity;
  for (const other of world.cars) {
    if (other === car) continue;
    nearest = Math.min(nearest, checkBody(other.x, other.z, 2.3));
  }
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    nearest = Math.min(nearest, checkBody(ped.x, ped.z, 1.6));
  }
  if (p.inCar) nearest = Math.min(nearest, checkBody(p.inCar.x, p.inCar.z, 2.3));
  else nearest = Math.min(nearest, checkBody(p.x, p.z, 1.6));

  if (nearest < 5) { throttle = -1; }
  else if (nearest < 10) { throttle = Math.min(throttle, 0); }
  if (nearest < 7 && car.honkCd <= 0 && Math.abs(car.speed) > 1) {
    world.sound.honk(world.rng.chance(0.3));
    car.honkCd = world.rng.range(2, 5);
  }
  car.honkCd = Math.max(0, car.honkCd - dt);
  // Unstick: if boxed in for a while, nudge backwards.
  if (Math.abs(car.speed) < 0.4 && throttle > 0) {
    ai.stuckTime += dt;
    if (ai.stuckTime > 2.5) { throttle = -0.7; if (ai.stuckTime > 3.4) ai.stuckTime = 0; }
  } else ai.stuckTime = 0;
  return { throttle, steer, handbrake: false };
}

export function updateTraffic(world, dt) {
  manageTraffic(world, dt);
  for (const car of world.cars) {
    if (car.driver !== 'traffic') continue;
    const input = trafficInput(world, car, dt);
    const impact = stepCar(world, car, input, dt);
    if (impact > 6) world.onCarCrash(car, impact);
    if (car.dead) {
      // The driver bails out and runs.
      car.driver = null;
      world.spawnFleeingPed(car.x + 1.5, car.z, car.x, car.z);
    }
  }
}

export { CAR_TYPES };
