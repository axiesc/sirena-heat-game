// world.js — Sirena Bay as one object: the player, the cars, the crowd, the police, the
// helicopter, the wanted heat, the mission runner, and the weather of particles and tracers
// that combat leaves behind. step() advances every system in a fixed order at a fixed
// timestep; buildDynamic() turns the state into this frame's dynamic mesh. Collision,
// line-of-sight and ground height live here because everything needs them.

import { buildCity, districtOf } from './citygen.js';
import { makeRng } from './rng.js';
import { rgb } from './renderer.js';
import { pushGlow } from './textures.js';
import { makePlayer, updatePlayer, computeCamera } from './player.js';
import { seedParkedCars, updateTraffic } from './traffic.js';
import { seedCrowd, updatePedestrians, spawnFleeingPed, scareCrowd } from './pedestrians.js';
import { makePoliceState, updatePolice } from './police.js';
import { makeHeliState, updateHelicopter } from './helicopter.js';
import { updateWanted, reportCrime, clearWanted } from './wanted.js';
import { MissionRunner, updateGunners } from './missions.js';
import { pushCar, pushPerson, pushHelicopter, localToWorld } from './models.js';
import { separateCars } from './vehicles.js';
import { clamp, dist2D } from './math3d.js';

const MARCO_LOOK = { shirt: 0xf2ead8, pants: 0x2e3440, skin: 0xc98d64, hair: 0x241a12 };

export class World {
  constructor(seed) {
    this.rng = makeRng(seed);
    this.time = 0;
    this.hour = 17.9;
    this.day = 1;
    this.mode = 'title'; // 'title' | 'play'
    this.colliders = [];
    this.lamps = [];
    this.player = makePlayer();
    this.cars = [];
    this.peds = [];
    this.wanted = { heat: 0, stars: 0, lastSeenAt: -99, lastCrimeAt: -99, busted: 0 };
    this.police = makePoliceState();
    this.heli = makeHeliState();
    this.missions = new MissionRunner(this);
    this.particles = [];
    this.tracers = [];
    this.flashes = [];
    this.camera = { x: 225, y: 14, z: 380, fx: 0, fy: -0.2, fz: -1, tx: 225, ty: 2, tz: 436 };
    this.lastControl = null;
    this.dialogue = null;
    this.objective = null;
    this.sound = null;
    this.radio = null;
    this.ui = {};
    this.lastShotAt = -99; this.lastShotX = 0; this.lastShotZ = 0;
    this.spawnCd = 0; this.ramCd = 0; this.cleanCd = 0;
    this.requestSave = false;
    this.garage = null; this.pendingGarage = null;
    this.endState = null; // null | 'busted' | 'wasted'
    this.damageFlash = 0; this.shake = 0;
    this.frozen = false;
  }

  /** Builds the static city into the given batch and seeds the living population. */
  buildStatic(batch) {
    const { colliders, lamps } = buildCity(batch, this.rng);
    this.colliders = colliders;
    this.lamps = lamps;
    seedParkedCars(this);
    seedCrowd(this);
  }

  startNewGame() {
    const p = this.player;
    p.x = 225; p.z = 436; p.yaw = Math.PI; p.camYaw = Math.PI;
    p.health = 100; p.armor = 0; p.money = 240;
    p.weapons = { pistol: false, smg: false };
    p.ammo = { pistol: 0, smg: 0 };
    p.weapon = 'fists';
    p.inCar = null; p.dead = false;
    this.hour = 10.2;
    this.day = 1;
    this.endState = null;
    clearWanted(this);
    this.mode = 'play';
  }

  // -- Space queries ---------------------------------------------------------------

  groundHeightAt(x, z) {
    if (x > -74 && x < -6 && z > 309 && z < 321) return 0.73; // the pier deck
    if (dist2D(x, z, -20, 462) < 8.5) return 1.7; // the lighthouse rock
    if (x < -6) return 0.02; // marina apron
    return 0.05;
  }

  collideCircle(x, z, r) {
    for (const col of this.colliders) {
      if (col.h < 0.85) continue;
      const nx = clamp(x, col.x0, col.x1);
      const nz = clamp(z, col.z0, col.z1);
      let dx = x - nx, dz = z - nz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 0.0001) {
        const left = x - col.x0, right = col.x1 - x, top = z - col.z0, bottom = col.z1 - z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) x = col.x0 - r;
        else if (min === right) x = col.x1 + r;
        else if (min === top) z = col.z0 - r;
        else z = col.z1 + r;
      } else {
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      }
    }
    const onWestLand = z > 244 && z < 336;
    if (x < -7.5 && !onWestLand) x = -7.5;
    x = clamp(x, -72, 498);
    z = clamp(z, -16, 490);
    return [x, z];
  }

  /** True when a building blocks the straight line between two ground points. */
  lineBlocked(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.floor(d / 2.5));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const col of this.colliders) {
        if (col.h > 1.7 && x > col.x0 && x < col.x1 && z > col.z0 && z < col.z1) return true;
      }
    }
    return false;
  }

  districtAt(x, z) {
    if (x < -6) return 'Marina';
    if (z > 452) return 'Beachfront';
    const i = clamp(Math.floor((x - 16) / 62), 0, 6);
    const j = clamp(Math.floor((z - 16) / 62), 0, 6);
    return districtOf(i, j);
  }

  // -- Events the systems raise ------------------------------------------------------

  spawnFleeingPed(x, z, fromX, fromZ) { return spawnFleeingPed(this, x, z, fromX, fromZ); }

  onGunshot(x, z, byPlayer) {
    this.lastShotAt = this.time;
    this.lastShotX = x; this.lastShotZ = z;
    scareCrowd(this, x, z, 26);
    if (byPlayer) reportCrime(this, 'discharge', x, z);
  }

  onCarCrash(car, impact) {
    const p = this.player;
    if (dist2D(car.x, car.z, p.x, p.z) < 42) this.sound.collision(clamp(impact / 13, 0.1, 1));
    if (impact > 7) scareCrowd(this, car.x, car.z, 13);
    this.addParticles(car.x, 0.7, car.z, Math.floor(impact), 0xffc873, 0.3, 2.4);
  }

  onEnterCar(car) {
    this.missions.onEnterCar(car);
    if (car.marked && this.ui.toast) this.ui.toast('This is the one — drive!');
  }

  onPedDown(ped) { void ped; }

  onWantedCleared() { /* missions and shops read the level directly */ }

  onBusted() {
    if (this.endState) return;
    this.endState = 'busted';
    this.sound.bustedSting();
  }

  damagePlayer(amount, fromX, fromZ) {
    const p = this.player;
    if (p.dead || this.endState) return;
    let remaining = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, amount * 0.65);
      p.armor -= absorbed;
      remaining = amount - absorbed;
    }
    p.health -= remaining;
    this.damageFlash = 1;
    this.shake = Math.min(0.55, this.shake + amount * 0.012);
    void fromX; void fromZ;
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      this.endState = 'wasted';
      this.sound.sting(false);
    }
  }

  /** After a bust or a hospital visit: back on the street, lighter in the wallet. */
  respawn(kind) {
    const p = this.player;
    const starsBefore = this.wanted.stars;
    if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
    if (kind === 'busted') {
      p.money = Math.max(0, p.money - Math.min(p.money, 80 + starsBefore * 40));
      p.x = 86; p.z = 66; p.yaw = 0;
    } else {
      p.money = Math.max(0, p.money - Math.min(p.money, 120));
      p.x = 352; p.z = 372; p.yaw = Math.PI;
    }
    p.health = 100; p.armor = 0; p.dead = false;
    p.camYaw = p.yaw;
    this.endState = null;
    clearWanted(this);
    this.hour = (this.hour + 1.5) % 24;
    if (this.missions.state === 'active') {
      this.missions.fail(kind === 'busted' ? 'Busted — the mission is off' : 'Wasted — the mission is off');
    }
  }

  // -- Effects ------------------------------------------------------------------------

  addParticles(x, y, z, count, colorHex, size, speed) {
    const color = rgb(colorHex);
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length > 420) return;
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(0.3, 1) * speed;
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * v, vy: this.rng.range(0.6, 1.6) * speed * 0.5, vz: Math.sin(a) * v,
        life: this.rng.range(0.35, 0.8), max: 0.8, size, grow: 0, color, kind: 'chip',
      });
    }
  }

  addSmoke(x, y, z) {
    if (this.particles.length > 420) return;
    this.particles.push({
      x: x + this.rng.range(-0.3, 0.3), y, z: z + this.rng.range(-0.3, 0.3),
      vx: this.rng.range(-0.2, 0.2), vy: this.rng.range(1.4, 2.4), vz: this.rng.range(-0.2, 0.2),
      life: this.rng.range(1.1, 1.9), max: 1.9, size: 0.55, grow: 1.5,
      color: rgb(0x2e2e33), kind: 'smoke',
    });
  }

  addTracer(x0, y0, z0, x1, y1, z1, colorHex) {
    this.tracers.push({ x0, y0, z0, x1, y1, z1, life: 0.07, color: rgb(colorHex) });
    if (this.tracers.length > 60) this.tracers.shift();
  }

  addFlash(x, y, z, size, colorHex) {
    this.flashes.push({ x, y, z, size, life: 0.06, color: rgb(colorHex) });
  }

  // -- The step -------------------------------------------------------------------------

  step(dt, control) {
    this.time += dt;
    this.hour = (this.hour + dt / 90) % 24; // a full day lasts 36 real minutes
    this.lastControl = control;
    this.spawnCd = Math.max(0, this.spawnCd - dt);
    this.ramCd = Math.max(0, this.ramCd - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const playing = this.mode === 'play' && !this.endState;

    if (playing) {
      updatePlayer(this, control, dt);
      this.missions.update(dt);
    }
    updateTraffic(this, dt);
    updatePedestrians(this, dt);
    if (playing) {
      updateGunners(this, dt);
      updatePolice(this, dt);
      updateHelicopter(this, dt);
      updateWanted(this, dt);
    }
    this.carInteractions(dt);
    this.updateEffects(dt);
    if (this.mode === 'play') computeCamera(this, dt);

    this.cleanCd -= dt;
    if (this.cleanCd <= 0) {
      this.cleanCd = 1;
      this.peds = this.peds.filter((ped) => ped.state !== 'gone');
    }
  }

  /** Car-to-car shoves, car-to-ped impacts, and the smoke of the dying. */
  carInteractions(dt) {
    const p = this.player;
    for (let i = 0; i < this.cars.length; i += 1) {
      for (let j = i + 1; j < this.cars.length; j += 1) {
        const a = this.cars[i], b = this.cars[j];
        if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
        const rel = separateCars(a, b);
        if (rel > 3.5 && this.ramCd <= 0) {
          const other = a.driver === 'player' ? b : b.driver === 'player' ? a : null;
          if (other && other.driver === 'police') {
            reportCrime(this, 'ramPolice', other.x, other.z, true);
            this.ramCd = 2.5;
          }
        }
      }
    }
    for (const car of this.cars) {
      const speed = Math.abs(car.speed);
      if (speed > 2.5) {
        for (const ped of this.peds) {
          if (ped.state === 'down' || ped.kind === 'officer') continue;
          if (dist2D(ped.x, ped.z, car.x, car.z) < 1.6) {
            ped.state = 'down';
            ped.downTime = 0;
            ped.dead = speed > 9;
            ped.health = ped.dead ? 0 : 35;
            ped.x += car.vx * 0.12; ped.z += car.vz * 0.12;
            if (dist2D(ped.x, ped.z, p.x, p.z) < 30) this.sound.hitFlesh();
            if (car.driver === 'player') {
              reportCrime(this, ped.dead ? 'killPed' : 'hitAndRun', ped.x, ped.z);
              this.damageFlash = Math.max(this.damageFlash, 0.4);
            }
            scareCrowd(this, ped.x, ped.z, 12);
          }
        }
      }
      if (car.health < 45 && car.health > 0) {
        car.smokeAcc += dt * (45 - car.health) / 6;
        while (car.smokeAcc > 1) {
          car.smokeAcc -= 1;
          const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
          this.addSmoke(car.x + fx * car.length * 0.32, 1.1, car.z + fz * car.length * 0.32);
        }
      } else if (car.dead) {
        car.smokeAcc += dt * 2;
        while (car.smokeAcc > 1) { car.smokeAcc -= 1; this.addSmoke(car.x, 1.2, car.z); }
      }
    }
  }

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
      if (pt.kind === 'chip') pt.vy -= 6.5 * dt;
      if (pt.y < 0.05 && pt.kind === 'chip') { pt.y = 0.05; pt.vy = 0; }
    }
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
  }

  // -- Rendering the dynamic world -------------------------------------------------------

  buildDynamic(b, glow, palette) {
    const p = this.player;
    const darkness = palette.darkness;
    const camX = this.camera.x, camZ = this.camera.z;

    // The mission beacon: a pillar of gold light you can see across the bay.
    if (this.objective && this.mode === 'play') {
      const o = this.objective;
      b.cylinder(o.x, 0, o.z, 1.15, 1.15, 30, 10, rgb(0xffc23d), { emissive: 0.95, cap: false });
      b.disc(o.x, 0.12, o.z, 2.3 + Math.sin(this.time * 3) * 0.3, rgb(0xffc23d), 1.1, 18);
      pushGlow(glow, o.x, 1.2, o.z, 1, 0.78, 0.25, 5.5, 0.4);
    }
    if (this.missions.missionCar && this.missions.state === 'active') {
      const car = this.missions.missionCar;
      pushGlow(glow, car.x, 2.8 + Math.sin(this.time * 4) * 0.2, car.z, 1, 0.8, 0.3, 3.4, 0.55);
    }

    // Cars, with blob shadows to ground them.
    for (const car of this.cars) {
      if (Math.abs(car.x - camX) > 260 || Math.abs(car.z - camZ) > 260) continue;
      b.disc(car.x, 0.065, car.z, car.length * 0.42, rgb(0x14161c), 0, 12);
      pushCar(b, car.x, car.z, car.yaw, car.type, car.color, {
        steer: car.steer * 0.7,
        policeLightPhase: car.driver === 'police' ? (this.time * 1.35 + car.lightPhase) % 1 : -1,
        headlightsOn: darkness > 0.3,
        brakeOn: car.brakeLights,
        damage: (100 - car.health) / 100,
      });
      if (darkness > 0.3 && Math.abs(car.x - camX) < 70 && Math.abs(car.z - camZ) < 70) {
        for (const side of [-0.6, 0.6]) {
          const [hx, hz] = localToWorld(car.x, car.z, car.yaw, side, car.length / 2 + 0.3);
          pushGlow(glow, hx, 0.62, hz, 1, 0.93, 0.72, 1.7, 0.5 * darkness);
        }
      }
    }

    // People.
    for (const ped of this.peds) {
      if (ped.state === 'gone') continue;
      if (Math.abs(ped.x - camX) > 190 || Math.abs(ped.z - camZ) > 190) continue;
      const gy = this.groundHeightAt(ped.x, ped.z);
      pushPerson(b, ped.x, ped.z, ped.yaw, {
        walkPhase: ped.walkPhase, run: ped.speed > 3, aim: !!ped.aiming,
        gun: ped.aiming ? (ped.weapon === 'smg' ? 2 : 1) : 0,
        fallen: ped.state === 'down', yOff: gy,
        shirt: ped.hitFlash > 0 ? 0xff5040 : ped.shirt, pants: ped.pants, skin: ped.skin,
        hair: ped.hair, hat: ped.hat, officer: ped.kind === 'officer',
      });
    }

    // Marco himself (the car is his avatar while he drives).
    if (!p.inCar) {
      const aiming = this.lastControl && (this.lastControl.aim || this.lastControl.fire) && p.weapon !== 'fists';
      pushPerson(b, p.x, p.z, p.yaw, {
        walkPhase: p.walkPhase, run: p.speed > 6, aim: aiming,
        gun: aiming ? (p.weapon === 'smg' ? 2 : 1) : 0,
        fallen: p.dead, yOff: p.y,
        shirt: MARCO_LOOK.shirt, pants: MARCO_LOOK.pants, skin: MARCO_LOOK.skin, hair: MARCO_LOOK.hair,
      });
    }

    // The helicopter and its searchlight.
    if (this.heli.active) {
      const h = this.heli;
      pushHelicopter(b, h.x, h.y, h.z, h.yaw, h.rotor, {
        gunner: this.wanted.stars >= 5 && !h.leaving,
        lightPhase: (this.time * 1.35) % 1,
      });
      if (darkness > 0.15 && !h.leaving) {
        b.disc(h.spotX, 0.1, h.spotZ, 5.0, rgb(0x4a4234), 0.55, 18);
        for (const t of [0.3, 0.55, 0.8]) {
          const gx = h.x + (h.spotX - h.x) * t, gz = h.z + (h.spotZ - h.z) * t;
          const gy = h.y + (0.4 - h.y) * t;
          pushGlow(glow, gx, gy, gz, 1, 0.96, 0.82, 2 + t * 8, 0.1 * darkness + 0.04);
        }
      }
    }

    // Street-lamp glows after dark. (Flat light-pool discs were tried here and read as solid
    // rugs on the asphalt — the soft billboard glow alone sells the lamp far better.)
    if (darkness > 0.25) {
      for (const [lx, lz] of this.lamps) {
        if (Math.abs(lx - camX) > 120 || Math.abs(lz - camZ) > 120) continue;
        pushGlow(glow, lx, 5.9, lz, 1, 0.85, 0.55, 5.6, 0.5 * darkness);
      }
    }

    // Tracers, particles, muzzle flashes.
    for (const tr of this.tracers) {
      b.beam(tr.x0, tr.y0, tr.z0, tr.x1, tr.y1, tr.z1, 0.05, tr.color, 1.7);
    }
    for (const pt of this.particles) {
      if (pt.kind === 'smoke') {
        const s = pt.size * (1 + (1 - pt.life / pt.max) * pt.grow);
        b.box(pt.x, pt.y, pt.z, s, s * 0.8, s, pt.color, { skipBottom: true });
      } else {
        b.box(pt.x, pt.y, pt.z, pt.size, pt.size, pt.size, pt.color, { skipBottom: true });
      }
    }
    for (const fl of this.flashes) {
      pushGlow(glow, fl.x, fl.y, fl.z, fl.color[0], fl.color[1], fl.color[2], fl.size * 3, 0.8);
    }
  }
}
