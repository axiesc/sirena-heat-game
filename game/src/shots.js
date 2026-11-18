// shots.js — the four staged screenshot scenes behind ?shot=cover|chase|mission|night.
// Each one builds the real world with the scene's seed, places Marco and the cast, runs the
// actual simulation forward a fixed number of steps (with a simple autopilot where the
// scene moves), then freezes on the composed frame. Nothing is faked: the chase really is
// four stars of SBPD behind a coupe, the mission scene really is the pier at golden hour.

import { idleControl } from './input.js';
import { makeCar } from './vehicles.js';
import { parkCar, spawnTrafficCar } from './traffic.js';
import { makePed } from './pedestrians.js';
import { spawnUnitAt } from './police.js';
import { setWanted } from './wanted.js';
import { angleDelta, clamp } from './math3d.js';

const STEP = 1 / 60;

function runSteps(world, steps, controlFor) {
  for (let s = 0; s < steps; s += 1) {
    world.step(STEP, controlFor ? controlFor(s) : idleControl());
  }
}

function setCamera(world, x, y, z, tx, ty, tz) {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const len = Math.hypot(dx, dy, dz) || 1;
  world.camera = { x, y, z, fx: dx / len, fy: dy / len, fz: dz / len, tx, ty, tz };
}

/** Cover: the title over the beachfront avenue at sunset, looking west to the lighthouse. */
function stageCover(world) {
  world.hour = 18.38;
  const p = world.player;
  p.x = 252; p.z = 441; p.yaw = -Math.PI / 2; p.camYaw = -Math.PI / 2;
  parkCar(world, 'coupe', 0xd94f3d, 240, 446.5, -Math.PI / 2 + 0.3);
  runSteps(world, 200);
  setCamera(world, 334, 6.5, 439, 40, 2.5, 452);
}

/** Chase: four stars, three interceptors and the helicopter, westbound at pace. */
function stageChase(world) {
  world.hour = 18.45;
  world.police.roadblockCd = 9999; // the frame is the chase, not the crash at the end of it
  const p = world.player;
  const car = makeCar('coupe', 0x2a6db0, 302, 314.9, -Math.PI / 2);
  car.driver = 'player';
  car.speed = 20;
  car.vx = -20; car.vz = 0;
  world.cars.push(car);
  p.inCar = car;
  p.x = car.x; p.z = car.z;
  p.camYaw = -Math.PI / 2; p.camPitch = 0.22;
  spawnUnitAt(world, 326, 314.9, -Math.PI / 2);
  spawnUnitAt(world, 340, 321.1, -Math.PI / 2);
  spawnUnitAt(world, 354, 314.9, -Math.PI / 2);
  spawnTrafficCar(world, 200, 318, 'x', 318, -1);
  world.heli.active = true;
  world.heli.x = 288; world.heli.y = 35; world.heli.z = 296;
  setWanted(world, 4);
  world.missions.index = 5;
  const drive = () => {
    const c = idleControl();
    c.fwd = 1;
    const steer = clamp(angleDelta(car.yaw, -Math.PI / 2) * 1.7, -1, 1);
    c.strafe = -steer;
    return c;
  };
  runSteps(world, 235, drive);
  // Compose the frozen frame: the pack is real, but two units and the helicopter are
  // placed where the camera can see them — an interceptor head-on in the far lane, one
  // ahead in Marco's, and the helicopter quartering in with its light on him.
  const units = world.cars.filter((c) => c.driver === 'police');
  if (units[0]) { units[0].x = p.x - 30; units[0].z = 321.1; units[0].yaw = Math.PI / 2; units[0].vx = 0; units[0].vz = 0; }
  if (units[1]) { units[1].x = p.x - 52; units[1].z = 314.9; units[1].yaw = -Math.PI / 2; units[1].vx = 0; units[1].vz = 0; }
  world.heli.x = p.x - 36; world.heli.y = 15; world.heli.z = p.z + 10;
  world.heli.yaw = 2.35; world.heli.rotor = 0.7;
  world.objective = { x: -40, z: 315, label: 'Escape to the Blue Hour at Marina Pier' };
  world.heli.spotX = p.x; world.heli.spotZ = p.z;
}

/** Mission: on the pier at golden hour, Lucia talking, the bay behind her. */
function stageMission(world) {
  world.hour = 17.55;
  const p = world.player;
  p.x = -14.5; p.z = 315.5; p.y = 0.73;
  p.yaw = -1.95; p.camYaw = -1.95; p.camPitch = 0.22;
  const lucia = makePed(world, -18.5, 313.8, 'friend');
  lucia.state = 'stand';
  lucia.name = 'Lucia Reyes';
  lucia.shirt = 0x2a9db0; lucia.pants = 0xf2ead8;
  lucia.yaw = Math.atan2(p.x - lucia.x, p.z - lucia.z);
  const deac = makePed(world, -33, 317.5, 'friend');
  deac.state = 'stand';
  deac.name = 'Deacon "Deac" Cole';
  deac.shirt = 0x3fae8a;
  deac.yaw = 1.2;
  world.missions.index = 2;
  runSteps(world, 90);
  world.dialogue = { who: 'lucia', text: "The boat's loaded, Marco. One last run and the bay breathes again." };
  world.objective = { x: 225, z: 436, label: 'Deliver the package to Hotel Rey' };
}

/** Night: Old Town neon, lamplight, a parked cruiser and two stars of trouble. */
function stageNight(world) {
  world.hour = 21.7;
  const p = world.player;
  p.x = 350; p.z = 250.5;
  p.yaw = Math.PI / 2 - 0.12; p.camYaw = Math.PI / 2 - 0.12; p.camPitch = 0.16;
  const coupe = parkCar(world, 'coupe', 0xb04a7a, 344.5, 246.5, Math.PI / 2 - 0.25);
  coupe.health = 92;
  runSteps(world, 120);
  const cruiser = makeCar('police', 0xf0f2f4, 372, 252.5, -Math.PI / 2 + 0.45);
  cruiser.driver = 'police';
  cruiser.ai = { mode: 'block', officersSpawned: true, stuckTime: 0, reverseTime: 0 };
  world.cars.push(cruiser);
  setWanted(world, 2);
  world.objective = null;
  world.missions.index = 3;
}

/**
 * Stages the named scene in an already-built world and freezes it. Returns the scene name
 * actually staged (unknown names fall back to cover).
 */
export function stageShot(world, name) {
  world.mode = 'play';
  if (name === 'chase') stageChase(world);
  else if (name === 'mission') stageMission(world);
  else if (name === 'night') stageNight(world);
  else { stageCover(world); name = 'cover'; }
  world.frozen = true;
  return name;
}
