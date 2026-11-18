// missions.js — the story runner. A mission is offered at a meeting place (the gold marker
// on the minimap), starts when Marco walks in, and then walks its stage list: drive here,
// steal that, clear them out, lose the heat. Dialogue stages play their lines on a timer.
// Fail — wasted, busted, or the target car destroyed — and the mission is offered again at
// the same corner. Gunners are peds with a grudge; their combat brain lives here too.

import { MISSIONS } from './story.js';
import { parkCar } from './traffic.js';
import { makePed, movePed } from './pedestrians.js';
import { npcFire } from './weapons.js';
import { setWanted } from './wanted.js';
import { dist2D } from './math3d.js';

export class MissionRunner {
  constructor(world) {
    this.world = world;
    this.index = 0;
    this.done = false;
    this.state = 'offered'; // 'offered' | 'active'
    this.active = null;
    this.stageIndex = 0;
    this.stageState = {};
    this.missionCar = null;
    this.dialogueTimer = 0;
  }

  get stage() { return this.active ? this.active.stages[this.stageIndex] : null; }

  /** The marker the HUD and minimap draw right now, or null. */
  currentObjective() {
    if (this.done) return null;
    const mission = this.active || MISSIONS[this.index];
    if (!mission) return null;
    if (this.state === 'offered') return { x: mission.meet.x, z: mission.meet.z, label: mission.meet.label };
    const stage = this.stage;
    if (!stage) return null;
    if (stage.kind === 'dialogue') return null;
    if (stage.kind === 'steal' && this.stageState.car) {
      return { x: this.stageState.car.x, z: this.stageState.car.z, label: stage.label };
    }
    return { x: stage.x, z: stage.z, label: stage.label };
  }

  beginMission() {
    const world = this.world;
    this.active = MISSIONS[this.index];
    this.state = 'active';
    this.stageIndex = 0;
    this.missionCar = null;
    if (world.ui.banner) world.ui.banner(this.active.title, `Story mission ${this.index + 1} of ${MISSIONS.length}`);
    world.sound.phone();
    this.setupStage();
  }

  setupStage() {
    const world = this.world;
    const stage = this.stage;
    this.stageState = {};
    world.dialogue = null;
    if (!stage) { this.completeMission(); return; }
    if (stage.kind === 'dialogue') {
      this.stageState.lines = stage.lines;
      this.stageState.lineIndex = 0;
      this.dialogueTimer = 0;
      const [who, text] = stage.lines[0];
      world.dialogue = { who, text };
    } else if (stage.kind === 'steal') {
      const car = parkCar(world, stage.carType, stage.color, stage.x, stage.z, stage.yaw || 0);
      car.marked = true;
      this.stageState.car = car;
      this.missionCar = car;
    } else if (stage.kind === 'fight') {
      this.stageState.gunners = [];
      for (let k = 0; k < stage.count; k += 1) {
        const a = (k / stage.count) * Math.PI * 2 + world.rng.range(-0.3, 0.3);
        const gx = stage.x + Math.cos(a) * world.rng.range(5, 11);
        const gz = stage.z + Math.sin(a) * world.rng.range(5, 11);
        const gunner = makePed(world, gx, gz, 'gunner');
        gunner.postX = gx; gunner.postZ = gz;
        gunner.weapon = world.rng.chance(0.35) ? 'smg' : 'pistol';
        gunner.shirt = 0x3a3f45; gunner.pants = 0x24262c;
        if (stage.boss && k === 0) {
          gunner.name = 'Tito Marín';
          gunner.health = 300;
          gunner.shirt = 0x8c2f39;
          gunner.weapon = 'smg';
        }
        this.stageState.gunners.push(gunner);
      }
      if (world.ui.toast) world.ui.toast('Hostiles — weapons free');
    }
  }

  advanceStage() {
    const world = this.world;
    const leaving = this.stage;
    if (leaving && leaving.kind === 'fight' && leaving.heatAfter) setWanted(world, leaving.heatAfter);
    this.stageIndex += 1;
    if (this.stageIndex >= this.active.stages.length) { this.completeMission(); return; }
    world.sound.sting(true);
    this.setupStage();
  }

  completeMission() {
    const world = this.world;
    const mission = this.active;
    world.player.money += mission.reward;
    world.sound.cash();
    world.sound.sting(true);
    if (world.ui.banner) world.ui.banner('Mission Complete', `${mission.title} — +$${mission.reward}`);
    if (this.missionCar) this.missionCar.marked = false;
    this.missionCar = null;
    this.active = null;
    this.index += 1;
    this.done = this.index >= MISSIONS.length;
    this.state = 'offered';
    world.requestSave = true;
    if (this.done && world.ui.toast) world.ui.toast('Story complete — Sirena Bay is yours. The bay stays open: drive, shop, cause trouble.');
  }

  fail(reason) {
    const world = this.world;
    if (!this.active) return;
    if (world.ui.banner) world.ui.banner('Mission Failed', reason);
    world.sound.sting(false);
    // Clean up the stage's actors; the mission is offered again at the meet point.
    if (this.stageState.gunners) {
      for (const g of this.stageState.gunners) g.state = 'gone';
    }
    if (this.missionCar) this.missionCar.marked = false;
    this.missionCar = null;
    this.active = null;
    this.state = 'offered';
    world.dialogue = null;
  }

  onEnterCar(car) {
    if (this.state !== 'active') return;
    const stage = this.stage;
    if (stage && stage.kind === 'steal' && this.stageState.car === car) {
      if (stage.heatOnSteal) setWanted(this.world, stage.heatOnSteal);
      if (this.world.ui.toast) this.world.ui.toast('Got it — now move!');
      this.advanceStage();
    }
  }

  onCarDestroyed(car) {
    if (this.state === 'active' && this.missionCar === car) {
      this.fail('The car was destroyed');
    }
  }

  update(dt) {
    const world = this.world;
    const p = world.player;
    world.objective = this.currentObjective();
    if (this.done || p.dead) return;
    if (this.state === 'offered') {
      const mission = MISSIONS[this.index];
      if (mission && dist2D(p.x, p.z, mission.meet.x, mission.meet.z) < 5 && !p.inCar) this.beginMission();
      return;
    }
    const stage = this.stage;
    if (!stage) return;
    if (stage.kind === 'dialogue') {
      this.dialogueTimer += dt;
      if (this.dialogueTimer > 3.6) {
        this.dialogueTimer = 0;
        this.stageState.lineIndex += 1;
        const lines = this.stageState.lines;
        if (this.stageState.lineIndex >= lines.length) {
          world.dialogue = null;
          this.advanceStage();
        } else {
          const [who, text] = lines[this.stageState.lineIndex];
          world.dialogue = { who, text };
        }
      }
    } else if (stage.kind === 'goto') {
      if (dist2D(p.x, p.z, stage.x, stage.z) < stage.r) this.advanceStage();
    } else if (stage.kind === 'pickup') {
      if (!p.inCar && dist2D(p.x, p.z, stage.x, stage.z) < stage.r) {
        if (world.ui.toast) world.ui.toast('Package secured');
        world.sound.cash();
        this.advanceStage();
      }
    } else if (stage.kind === 'deliver') {
      if (p.inCar && p.inCar === this.missionCar && dist2D(p.x, p.z, stage.x, stage.z) < stage.r) this.advanceStage();
    } else if (stage.kind === 'fight') {
      const left = this.stageState.gunners.filter((g) => g.state !== 'down' && g.state !== 'gone').length;
      world.objective = { x: stage.x, z: stage.z, label: `${stage.label} (${left} left)` };
      if (left === 0) this.advanceStage();
    } else if (stage.kind === 'escape') {
      if (dist2D(p.x, p.z, stage.x, stage.z) < stage.r && world.wanted.stars <= stage.needStars) this.advanceStage();
    }
  }
}

/** Gunner combat: hold a rough ring around their post, strafe, fire bursts at Marco. */
export function updateGunners(world, dt) {
  const p = world.player;
  for (const gunner of world.peds) {
    if (gunner.kind !== 'gunner' || gunner.state === 'down' || gunner.state === 'gone') continue;
    gunner.state = 'walk';
    const d = dist2D(gunner.x, gunner.z, p.x, p.z);
    const los = d < 65 && !world.lineBlocked(gunner.x, gunner.z, p.x, p.z);
    if (d > 60) { gunner.aiming = false; continue; } // wait at the post
    if (d > 18 || !los) {
      gunner.aiming = false;
      movePed(world, gunner, dt, p.x, p.z, 5.4);
      continue;
    }
    if (d < 8) {
      // Back off toward the post while firing.
      movePed(world, gunner, dt, gunner.postX ?? gunner.x, gunner.postZ ?? gunner.z, 3.6);
    } else {
      // Strafe sideways around Marco.
      const side = Math.sin(world.time * 0.7 + gunner.id * 2.3) > 0 ? 1 : -1;
      const tx = gunner.x + Math.cos(gunner.yaw) * side * 3;
      const tz = gunner.z - Math.sin(gunner.yaw) * side * 3;
      movePed(world, gunner, dt, tx, tz, 2.2);
    }
    gunner.yaw = Math.atan2(p.x - gunner.x, p.z - gunner.z);
    gunner.aiming = true;
    gunner.shootCd -= dt;
    if (gunner.burstLeft > 0) {
      gunner.burstTimer -= dt;
      if (gunner.burstTimer <= 0) {
        gunner.burstTimer = gunner.weapon === 'smg' ? 0.1 : 0.17;
        gunner.burstLeft -= 1;
        npcFire(world, gunner, p.x, p.inCar ? 1.0 : 1.25, p.z, gunner.weapon, true);
      }
    } else if (gunner.shootCd <= 0) {
      gunner.burstLeft = gunner.weapon === 'smg' ? 6 : 3;
      gunner.burstTimer = 0;
      gunner.shootCd = world.rng.range(1.1, 1.9);
    }
  }
}
