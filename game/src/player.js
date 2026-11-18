// player.js — Marco Reyes: on-foot movement and camera-relative walking, driving the car
// he is in, getting in and out of cars (politely or otherwise), and the third-person camera
// that follows him — orbiting with the mouse, tucking in when he aims, swinging behind the
// car when he drives, and never pushing through a building if it can help it.

import { clamp, angleDelta, dist2D } from './math3d.js';
import { stepCar } from './vehicles.js';
import { playerFire, cycleWeapon } from './weapons.js';
import { reportCrime } from './wanted.js';

export function makePlayer() {
  return {
    x: 225, z: 436, y: 0, yaw: Math.PI, camYaw: Math.PI, camPitch: 0.24,
    health: 100, armor: 0, money: 240,
    weapons: { pistol: false, smg: false }, ammo: { pistol: 0, smg: 0 }, weapon: 'fists',
    inCar: null, walkPhase: 0, speed: 0, fireReadyAt: 0, prevFire: false,
    recoil: 0, meleeSwing: 0, dead: false, name: 'Marco Reyes',
  };
}

/** Finds the car whose door Marco could reach, or null. Police cars in use are off-limits. */
export function nearestEnterableCar(world) {
  const p = world.player;
  let best = null, bestD = 3.4;
  for (const car of world.cars) {
    if (car.driver === 'police') continue;
    const d = dist2D(car.x, car.z, p.x, p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(world, car) {
  const p = world.player;
  if (car.dead) {
    if (world.ui.toast) world.ui.toast('This one is wrecked — find another ride');
    return;
  }
  if (car.driver === 'traffic') {
    // Carjacking: the driver comes out fighting mad and running scared.
    world.spawnFleeingPed(car.x + Math.sin(car.yaw + 1.2) * 1.6, car.z + Math.cos(car.yaw + 1.2) * 1.6, p.x, p.z);
    reportCrime(world, 'carjack', car.x, car.z);
    world.sound.honk(true);
  }
  car.driver = 'player';
  p.inCar = car;
  p.x = car.x; p.z = car.z;
  world.onEnterCar(car);
}

function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  const side = Math.PI / 2;
  const dx = Math.sin(car.yaw + side), dz = Math.cos(car.yaw + side);
  const [nx, nz] = world.collideCircle(car.x + dx * 1.9, car.z + dz * 1.9, 0.42);
  p.x = nx; p.z = nz;
  p.yaw = car.yaw;
  p.inCar = null;
}

export function updatePlayer(world, control, dt) {
  const p = world.player;
  if (p.dead) return;
  p.recoil = Math.max(0, p.recoil - dt * 5);
  p.meleeSwing = Math.max(0, p.meleeSwing - dt * 3);

  // Camera orbit from the mouse.
  p.camYaw -= control.mouseDX * 0.0026;
  p.camPitch = clamp(p.camPitch + control.mouseDY * 0.0026, -0.42, 1.05);

  if (control.weaponNext) cycleWeapon(world);
  if (control.radio && p.inCar) {
    const station = world.radio.next();
    if (world.ui.toast) world.ui.toast(`♪ ${station.name} — ${station.genre}`);
  }

  if (p.inCar) {
    const car = p.inCar;
    const input = { throttle: control.fwd, steer: -control.strafe, handbrake: control.handbrake };
    const impact = stepCar(world, car, input, dt);
    if (impact > 5) world.onCarCrash(car, impact);
    p.x = car.x; p.z = car.z;
    p.yaw = car.yaw;
    p.speed = Math.abs(car.speed);
    // The camera drifts back behind a moving car unless the player is orbiting it.
    if (Math.abs(car.speed) > 4 && Math.abs(control.mouseDX) < 1) {
      p.camYaw += angleDelta(p.camYaw, car.yaw) * Math.min(1, dt * 1.4);
    }
    if (control.enter) exitCar(world);
    world.sound.engineUpdate(car.speed / car.topSpeed, true);
  } else {
    world.sound.engineUpdate(0, false);
    updateOnFoot(world, control, dt);
  }
  p.y = world.groundHeightAt(p.x, p.z);
}

function updateOnFoot(world, control, dt) {
  const p = world.player;
  const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
  const rx = -Math.cos(p.camYaw), rz = Math.sin(p.camYaw);
  let mx = fx * control.fwd + rx * control.strafe;
  let mz = fz * control.fwd + rz * control.strafe;
  const mLen = Math.hypot(mx, mz);
  const aiming = control.aim && p.weapon !== 'fists';
  if (mLen > 0.01) {
    mx /= mLen; mz /= mLen;
    const speed = aiming ? 2.7 : control.sprint ? 7.9 : 5.1;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.speed = speed;
    p.walkPhase += dt * speed * 2.1;
    if (!aiming && !control.fire) {
      const moveYaw = Math.atan2(mx, mz);
      p.yaw += clamp(angleDelta(p.yaw, moveYaw), -10 * dt, 10 * dt);
    }
  } else {
    p.speed = 0;
  }
  const [cx, cz] = world.collideCircle(p.x, p.z, 0.42);
  p.x = cx; p.z = cz;
  // Cars are solid too: shoulder past them, never through them.
  for (const car of world.cars) {
    const d = dist2D(car.x, car.z, p.x, p.z);
    if (d < 2.1 && d > 0.001) {
      const push = (2.1 - d);
      p.x += (p.x - car.x) / d * push;
      p.z += (p.z - car.z) / d * push;
    }
  }
  if (aiming || control.fire) p.yaw = p.camYaw;

  if (control.enter) {
    const car = nearestEnterableCar(world);
    if (car) { enterCar(world, car); return; }
  }
  // Combat: semi-auto weapons need a fresh click; the SMG and fists repeat.
  const wantFire = control.fire && (p.weapon === 'smg' || p.weapon === 'fists' || !p.prevFire);
  p.prevFire = control.fire;
  if (wantFire) {
    const cam = world.camera;
    playerFire(world, { x: cam.x, y: cam.y, z: cam.z }, { x: cam.fx, y: cam.fy, z: cam.fz });
  }
  void fx; void fz;
}

/**
 * Positions the camera for this frame: behind Marco (or his car), at a distance that
 * shrinks when he aims, pulled in early when a building would block the view.
 */
export function computeCamera(world, dt) {
  const p = world.player;
  const driving = !!p.inCar;
  const aiming = world.lastControl && world.lastControl.aim && !driving && p.weapon !== 'fists';
  const dist = aiming ? 3.4 : driving ? 10.5 : 6.8;
  const targetY = (driving ? 1.5 : 1.62) + p.y;
  const tx = p.x, tz = p.z;
  const cp = Math.cos(p.camPitch), sp = Math.sin(p.camPitch);
  const fx = Math.sin(p.camYaw) * cp, fy = -sp, fz = Math.cos(p.camYaw) * cp;
  // Note: pitch positive looks down at Marco from above-behind; aim ray uses the same basis.
  let camX = tx - fx * dist, camY = targetY - fy * dist, camZ = tz - fz * dist;
  // Keep the camera out of buildings: walk the ray and stop at the first solid block.
  const steps = 10;
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    const sx = tx - fx * dist * t, sy = targetY - fy * dist * t, sz = tz - fz * dist * t;
    let blocked = false;
    for (const col of world.colliders) {
      if (sx > col.x0 - 0.3 && sx < col.x1 + 0.3 && sz > col.z0 - 0.3 && sz < col.z1 + 0.3 && sy < col.h) { blocked = true; break; }
    }
    if (blocked) {
      const bt = Math.max(0.12, (s - 1) / steps);
      camX = tx - fx * dist * bt; camY = targetY - fy * dist * bt; camZ = tz - fz * dist * bt;
      break;
    }
  }
  camY = Math.max(camY, world.groundHeightAt(camX, camZ) + 0.45);
  const bob = !driving && p.speed > 0.5 ? Math.sin(p.walkPhase * 2) * 0.035 : 0;
  // Aim direction (crosshair ray): from the camera through the view centre, plus recoil.
  const aimPitch = p.camPitch + p.recoil * 0.02;
  const acp = Math.cos(aimPitch);
  world.camera = {
    x: camX, y: camY + bob, z: camZ,
    fx: Math.sin(p.camYaw) * acp, fy: -Math.sin(aimPitch), fz: Math.cos(p.camYaw) * acp,
    tx, ty: targetY, tz,
    dist,
  };
  void dt;
}
