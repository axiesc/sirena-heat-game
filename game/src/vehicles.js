// vehicles.js — car objects and their arcade physics: velocity split into forward and
// lateral parts, the lateral part bled off by grip (or kept, when the handbrake is pulled,
// which is what makes a drift a drift). Collision is two circles per car against the city's
// building boxes; hard hits cost health, and a car at zero health is a smoker that will not
// drive again.

import { CAR_TYPES } from './models.js';
import { clamp } from './math3d.js';

let nextCarId = 1;

export function makeCar(type, color, x, z, yaw) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId += 1,
    type, color, x, z, yaw,
    vx: 0, vz: 0, speed: 0, steer: 0,
    driver: null, // null (parked) | 'traffic' | 'player' | 'police'
    health: 100,
    length: spec.length, width: spec.width,
    topSpeed: spec.topSpeed, accel: spec.accel,
    honkCd: 0, smokeAcc: 0, dead: false, marked: false, ai: null,
    brakeLights: false, lightPhase: ((nextCarId * 7919) % 100) / 100,
  };
}

/** Signed forward speed of a car (negative in reverse). */
export function forwardSpeed(car) {
  return car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
}

/**
 * Steps one car. input: { throttle -1..1, steer -1..1, handbrake }.
 * Returns the hardest impact speed this step (for damage and sound), or 0.
 */
export function stepCar(world, car, input, dt) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let fSpeed = car.vx * fx + car.vz * fz;
  let latX = car.vx - fx * fSpeed, latZ = car.vz - fz * fSpeed;

  if (car.dead || car.health <= 0) {
    fSpeed -= fSpeed * Math.min(1, 2.5 * dt);
    input = { throttle: 0, steer: 0, handbrake: true };
  } else {
    const throttle = input.throttle || 0;
    if (throttle >= 0) fSpeed += car.accel * throttle * dt * (1 - Math.max(0, fSpeed) / (car.topSpeed * 1.25));
    else fSpeed += car.accel * 0.7 * throttle * dt * (1 + Math.min(0, fSpeed) / 12);
    if (input.handbrake) fSpeed -= fSpeed * Math.min(1, 1.4 * dt);
    fSpeed -= fSpeed * 0.35 * dt; // rolling drag
    if (Math.abs(fSpeed) < 0.04 && throttle === 0) fSpeed = 0;
    fSpeed = clamp(fSpeed, -11, car.topSpeed);
  }

  // Steering: more lock at low speed, less at pace; the wheel visually follows `steer`.
  const steerTarget = (input.steer || 0) * 0.52 * (1 - Math.min(0.55, Math.abs(fSpeed) / 60));
  car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
  const grip = input.handbrake ? 1.1 : 7.5;
  if (Math.abs(fSpeed) > 0.05) {
    const yawRate = (car.steer * fSpeed / 2.7) * (input.handbrake ? 1.25 : 1);
    car.yaw += yawRate * dt;
  }
  const latDecay = Math.exp(-grip * dt);
  latX *= latDecay; latZ *= latDecay;

  const nfx = Math.sin(car.yaw), nfz = Math.cos(car.yaw);
  car.vx = nfx * fSpeed + latX;
  car.vz = nfz * fSpeed + latZ;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = fSpeed;
  car.brakeLights = (input.throttle || 0) < 0 || !!input.handbrake;

  return collideCar(world, car, dt);
}

/** Pushes a car's two collision circles out of every building box; returns impact speed. */
export function collideCar(world, car, dt) {
  let impact = 0;
  const r = car.width * 0.62;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  for (const off of [-car.length / 4.5, car.length / 4.5]) {
    let cx = car.x + fx * off, cz = car.z + fz * off;
    for (const col of world.colliders) {
      if (col.h < 0.5) continue;
      const nx = clamp(cx, col.x0, col.x1);
      const nz = clamp(cz, col.z0, col.z1);
      let dx = cx - nx, dz = cz - nz;
      let d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 0.0001) {
        // Centre inside the box: leave by the nearest face.
        const left = cx - col.x0, right = col.x1 - cx, top = cz - col.z0, bottom = col.z1 - cz;
        const min = Math.min(left, right, top, bottom);
        if (min === left) { dx = -1; dz = 0; cx = col.x0 - r; }
        else if (min === right) { dx = 1; dz = 0; cx = col.x1 + r; }
        else if (min === top) { dx = 0; dz = -1; cz = col.z0 - r; }
        else { dx = 0; dz = 1; cz = col.z1 + r; }
        d = 1;
      } else {
        dx /= d; dz /= d;
        cx = nx + dx * r; cz = nz + dz * r;
      }
      const into = -(car.vx * dx + car.vz * dz);
      if (into > 0) {
        impact = Math.max(impact, into);
        car.vx += dx * into * 1.4; // small bounce
        car.vz += dz * into * 1.4;
      }
    }
    car.x += cx - (car.x + fx * off);
    car.z += cz - (car.z + fz * off);
  }
  // Keep cars out of the sea and inside the island.
  car.x = clamp(car.x, -70, 500);
  car.z = clamp(car.z, -14, 486);
  if (impact > 3.5) {
    car.health -= (impact - 3) * 5.5;
    if (car.health <= 0 && !car.dead) { car.dead = true; car.health = 0; }
  }
  void dt;
  return impact;
}

/** Separates two cars that overlap (both get pushed, the lighter shove wins). */
export function separateCars(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const minD = 2.5;
  if (d === 0 || d >= minD) return 0;
  const push = (minD - d) / 2;
  const ux = dx / d, uz = dz / d;
  a.x -= ux * push; a.z -= uz * push;
  b.x += ux * push; b.z += uz * push;
  const rel = Math.abs((a.vx - b.vx) * ux + (a.vz - b.vz) * uz);
  const damp = 0.35;
  a.vx -= ux * rel * damp; a.vz -= uz * rel * damp;
  b.vx += ux * rel * damp; b.vz += uz * rel * damp;
  return rel;
}
