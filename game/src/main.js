// main.js — boots Sirena Heat: WebGL2 context, the world, the HUD, the loop. The loop steps
// the simulation at a fixed 60 Hz (so the staged scenes and the live game agree), renders
// sky, static city, dynamic world and glows, and routes the menus — title, pause, shops,
// busted/wasted — around the edges. With ?shot=<scene> it stages that scene instead and
// freezes on the frame, for the entry's screenshots.

import { createGL, drawBatch, drawGlowBatch, Batch } from './gl.js';
import { SkyDome, computeLighting, MeshBuilder } from './renderer.js';
import { createGlowTexture } from './textures.js';
import { World } from './world.js';
import { Input, idleControl } from './input.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { Radio } from './radio.js';
import { hasSave, saveGame, loadGame } from './save.js';
import { nearestShop } from './shops.js';
import { parkCar } from './traffic.js';
import { stageShot } from './shots.js';
import { mat4Perspective, mat4LookAt } from './math3d.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = (parseInt(params.get('seed') || '1', 10) || 1) * 100003 + 77;

const canvas = document.getElementById('game');
const ctx = createGL(canvas);
const gl = ctx.gl;

const sound = new SoundEngine();
const radio = new Radio(sound);
const world = new World(seed);
world.sound = sound;
world.radio = radio;

const staticBatch = new Batch(gl, 700000, false);
world.buildStatic(staticBatch);
staticBatch.upload();
const dynBatch = new Batch(gl, 200000, true);
const glowBatch = new Batch(gl, 30000, true);
const dynBuilder = new MeshBuilder(dynBatch);
const sky = new SkyDome(gl);
const glowTexture = createGlowTexture(gl);
const input = new Input(canvas);

let paused = false;
let endShown = false;
let titleOrbit = 0;

const hud = new Hud(world, {
  onNew: () => { sound.unlock(); world.startNewGame(); hud.startGame(); input.requestLock(canvas); },
  onContinue: () => {
    sound.unlock();
    if (loadGame(world)) {
      world.mode = 'play';
      world.endState = null;
      world.player.dead = false;
      if (world.pendingGarage) {
        const g = world.pendingGarage;
        parkCar(world, g.type, g.color, world.player.x + 3, world.player.z + 2, world.player.yaw);
        world.pendingGarage = null;
      }
      hud.startGame();
      input.requestLock(canvas);
      hud.toast('Welcome back to Sirena Bay');
    }
  },
  onResume: () => { paused = false; hud.hidePause(); input.requestLock(canvas); },
  onSave: () => { saveGame(world); hud.toast('Game saved'); paused = false; hud.hidePause(); input.requestLock(canvas); },
  onQuitTitle: () => { paused = false; world.mode = 'title'; hud.showTitle(hasSave()); input.releaseLock(); },
  onRespawn: () => { world.respawn(world.endState); endShown = false; hud.hideEnd(); input.requestLock(canvas); },
});

window.addEventListener('keydown', () => sound.unlock(), { once: false });
canvas.addEventListener('mousedown', () => {
  sound.unlock();
  if (world.mode === 'play' && !paused && !hud.shopOpen && !shotName) input.requestLock(canvas);
});
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && world.mode === 'play' && !paused && !hud.shopOpen && !endShown && !shotName && !world.frozen) {
    paused = true;
    hud.showPause();
  }
});

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

// -- Shot mode: stage, freeze, announce readiness. -----------------------------------------
let shotFrames = 0;
if (shotName) {
  const staged = stageShot(world, shotName);
  if (staged === 'cover') hud.showTitle(false);
  else hud.startGame();
  world.mode = 'play';
} else {
  hud.showTitle(hasSave());
}

// -- The loop --------------------------------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;

  if (!world.frozen && !paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 4) {
      stepOnce();
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 4) accumulator = 0;
  }
  render();
  hud.update();
  radio.update(world.mode === 'play' && !!world.player.inCar && !paused && !world.frozen);
  if (shotName) {
    shotFrames += 1;
    if (shotFrames === 4) window.__shotReady = true;
  }
}

function stepOnce() {
  if (world.mode === 'title') {
    titleOrbit += STEP * 0.016;
    world.step(STEP, idleControl());
    const cx = 225 + Math.cos(titleOrbit) * 128;
    const cz = 300 + Math.sin(titleOrbit) * 128;
    world.camera = {
      x: cx, y: 27, z: cz,
      fx: (225 - cx) / 128, fy: -0.18, fz: (300 - cz) / 128,
      tx: 225, ty: 3, tz: 300,
    };
    return;
  }
  let control = input.control();
  if (world.endState) {
    if (!endShown) {
      endShown = true;
      hud.showEnd(world.endState);
      input.releaseLock();
    }
    world.step(STEP, idleControl());
    input.endFrame();
    return;
  }
  if (hud.shopOpen) {
    if (control.interact || control.pause) {
      hud.closeShop();
      input.requestLock(canvas);
    }
    world.step(STEP, idleControl());
    input.endFrame();
    return;
  }
  if (control.pause) {
    paused = true;
    hud.showPause();
    input.releaseLock();
    input.endFrame();
    return;
  }
  if (control.interact) {
    const zone = nearestShop(world);
    if (zone) {
      hud.openShop(zone);
      input.releaseLock();
      world.step(STEP, idleControl());
      input.endFrame();
      return;
    }
  }
  world.step(STEP, control);
  if (world.requestSave) {
    world.requestSave = false;
    saveGame(world);
  }
  input.endFrame();
}

function render() {
  const palette = computeLighting(world.hour);
  const cam = world.camera;
  let camX = cam.x, camY = cam.y, camZ = cam.z;
  if (world.shake > 0.01) {
    camX += Math.sin(world.time * 61) * world.shake * 0.14;
    camY += Math.cos(world.time * 53) * world.shake * 0.1;
  }
  const aspect = canvas.width / Math.max(1, canvas.height);
  const proj = mat4Perspective(1.06, aspect, 0.4, 2400);
  const view = mat4LookAt([camX, camY, camZ], [cam.tx, cam.ty, cam.tz], [0, 1, 0]);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(palette.fogColor[0], palette.fogColor[1], palette.fogColor[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  sky.draw(gl, proj, view, [camX, camY, camZ], palette);

  // Lit pass uniforms.
  gl.useProgram(ctx.lit);
  gl.uniformMatrix4fv(ctx.litU.uProj, false, proj);
  gl.uniformMatrix4fv(ctx.litU.uView, false, view);
  gl.uniform3fv(ctx.litU.uSunDir, palette.sunDir);
  gl.uniform3fv(ctx.litU.uSunColor, palette.sunColor);
  gl.uniform3fv(ctx.litU.uSkyAmbient, palette.skyAmbient);
  gl.uniform3fv(ctx.litU.uGroundAmbient, palette.groundAmbient);
  gl.uniform3fv(ctx.litU.uCamPos, [camX, camY, camZ]);
  gl.uniform3fv(ctx.litU.uFogColor, palette.fogColor);
  gl.uniform1f(ctx.litU.uFogNear, palette.fogNear);
  gl.uniform1f(ctx.litU.uFogFar, palette.fogFar);
  gl.uniform1f(ctx.litU.uEmissiveBoost, palette.emissiveBoost);
  gl.uniform1f(ctx.litU.uTime, world.time);

  drawBatch(ctx, staticBatch);

  dynBatch.reset();
  glowBatch.reset();
  world.buildDynamic(dynBuilder, glowBatch, palette);
  dynBatch.upload();
  drawBatch(ctx, dynBatch);

  // Glow pass: camera right/up out of the view matrix for the billboards.
  gl.useProgram(ctx.glow);
  gl.uniformMatrix4fv(ctx.glowU.uProj, false, proj);
  gl.uniformMatrix4fv(ctx.glowU.uView, false, view);
  gl.uniform3f(ctx.glowU.uCamRight, view[0], view[4], view[8]);
  gl.uniform3f(ctx.glowU.uCamUp, view[1], view[5], view[9]);
  glowBatch.upload();
  drawGlowBatch(ctx, glowBatch, glowTexture);
}

requestAnimationFrame(frame);
