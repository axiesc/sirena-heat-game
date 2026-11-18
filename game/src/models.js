// models.js — builds the moving things into the dynamic mesh each frame: cars in seven
// flavours, low-poly people with swinging limbs, and the SBPD helicopter. Everything is
// boxes and beams placed with one shared local-to-world transform, so a car and its wheels
// and light bar can never disagree about where the car is.

import { rgb, scaleC } from './renderer.js';

/** Local (lx forward-ish, lz) to world, matching MeshBuilder.box's yaw convention. */
export function localToWorld(x, z, yaw, lx, lz) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
}

export const CAR_TYPES = {
  sedan: { label: 'Sirena Sedan', length: 4.5, width: 1.85, bodyH: 0.62, cabinH: 0.52, cabinBack: -0.25, topSpeed: 34, accel: 13, seats: 4 },
  hatch: { label: 'Palma Hatch', length: 3.9, width: 1.75, bodyH: 0.66, cabinH: 0.55, cabinBack: -0.55, topSpeed: 30, accel: 12, seats: 4 },
  coupe: { label: 'Vireo Coupe', length: 4.4, width: 1.85, bodyH: 0.55, cabinH: 0.42, cabinBack: -0.5, topSpeed: 43, accel: 19, seats: 2 },
  pickup: { label: 'Bajo Pickup', length: 5.0, width: 1.95, bodyH: 0.78, cabinH: 0.6, cabinBack: 0.55, topSpeed: 31, accel: 12, seats: 2 },
  van: { label: 'Cargo Van', length: 5.1, width: 2.0, bodyH: 1.25, cabinH: 0.5, cabinBack: 0.9, topSpeed: 27, accel: 10, seats: 2 },
  taxi: { label: 'Sol Taxi', length: 4.5, width: 1.85, bodyH: 0.62, cabinH: 0.52, cabinBack: -0.25, topSpeed: 33, accel: 13, seats: 4 },
  police: { label: 'SBPD Interceptor', length: 4.7, width: 1.9, bodyH: 0.6, cabinH: 0.5, cabinBack: -0.2, topSpeed: 42, accel: 18, seats: 4 },
};

export const CAR_COLORS = [0xd94f3d, 0x2a6db0, 0xf2f2f2, 0x2c3136, 0xffb84d, 0x3fae8a, 0xb04a7a, 0x8a94a6, 0xe8e2d2, 0x5b8c5a];

const GLASS = rgb(0x1d2a36);
const TYRE = rgb(0x14161a);
const HUB = rgb(0x9aa0a4);
const HEADLIGHT = rgb(0xfff3c0);
const TAILLIGHT = rgb(0xff2a22);

/**
 * A car at (x, z) facing yaw. opts: { steer, policeLightPhase (-1 off, else 0..1 flash),
 * headlightsOn, brakeOn, damage 0..1 }.
 */
export function pushCar(b, x, z, yaw, type, colorHex, opts = {}) {
  const spec = CAR_TYPES[type];
  const L = spec.length, W = spec.width;
  const body = rgb(colorHex);
  const at = (lx, lz) => localToWorld(x, z, yaw, lx, lz);
  const boxAt = (lx, y, lz, sx, sy, sz, col, extra = {}) => {
    const [wx, wz] = at(lx, lz);
    b.box(wx, y, wz, sx, sy, sz, col, { yaw, skipBottom: true, ...extra });
  };
  // Lower body and nose.
  boxAt(0, 0.32 + spec.bodyH / 2, 0, W, spec.bodyH, L, body, { top: scaleC(body, 1.06) });
  boxAt(0, 0.42, L / 2 - 0.28, W * 0.94, 0.34, 0.55, scaleC(body, 0.92)); // nose slope block
  // Cabin: glass band with painted pillars/roof.
  const cabinZ = spec.cabinBack;
  boxAt(0, 0.32 + spec.bodyH + spec.cabinH / 2, cabinZ, W * 0.86, spec.cabinH, L * 0.44, GLASS);
  boxAt(0, 0.32 + spec.bodyH + spec.cabinH + 0.03, cabinZ, W * 0.9, 0.07, L * 0.48, body);
  if (type === 'pickup') boxAt(0, 0.78, -L / 2 + 0.85, W * 0.92, 0.5, 1.6, scaleC(body, 0.85)); // bed walls block
  if (type === 'van') boxAt(0, 0.32 + spec.bodyH + 0.42, -0.5, W * 0.96, 1.05, L * 0.55, scaleC(body, 1.02));
  // Wheels: dark boxes; front pair turns with the steering.
  const wheelY = 0.34, wheelZ = L / 2 - 0.85, wheelX = W / 2 - 0.05;
  for (const [lx, lz, front] of [[-wheelX, wheelZ, 1], [wheelX, wheelZ, 1], [-wheelX, -wheelZ, 0], [wheelX, -wheelZ, 0]]) {
    const [wx, wz] = at(lx, lz);
    b.box(wx, wheelY, wz, 0.24, 0.68, 0.68, TYRE, { yaw: yaw + (front ? (opts.steer || 0) : 0), skipBottom: true });
    b.box(wx, wheelY, wz, 0.26, 0.3, 0.3, HUB, { yaw: yaw + (front ? (opts.steer || 0) : 0), skipBottom: true });
  }
  // Lights.
  const headE = opts.headlightsOn ? 1.6 : 0.55;
  boxAt(-W / 2 + 0.28, 0.62, L / 2 + 0.02, 0.42, 0.14, 0.06, HEADLIGHT, { emissive: headE });
  boxAt(W / 2 - 0.28, 0.62, L / 2 + 0.02, 0.42, 0.14, 0.06, HEADLIGHT, { emissive: headE });
  const tailE = opts.brakeOn ? 1.8 : 0.7;
  boxAt(-W / 2 + 0.28, 0.66, -L / 2 - 0.02, 0.44, 0.12, 0.06, TAILLIGHT, { emissive: tailE });
  boxAt(W / 2 - 0.28, 0.66, -L / 2 - 0.02, 0.44, 0.12, 0.06, TAILLIGHT, { emissive: tailE });
  if (type === 'taxi') {
    boxAt(0, 0.32 + spec.bodyH + spec.cabinH + 0.18, cabinZ, 0.7, 0.16, 0.3, rgb(0xffe28a), { emissive: 0.9 });
  }
  if (type === 'police') {
    // White doors band + light bar flashing red/blue with the phase.
    boxAt(0, 0.62, 0.1, W + 0.02, 0.34, L * 0.5, rgb(0xf4f6f8));
    const phase = opts.policeLightPhase ?? -1;
    const redOn = phase >= 0 && (phase % 1) < 0.5;
    boxAt(-0.34, 0.32 + spec.bodyH + spec.cabinH + 0.16, cabinZ, 0.6, 0.14, 0.34, rgb(0xff2222), { emissive: redOn ? 2.2 : 0.25 });
    boxAt(0.34, 0.32 + spec.bodyH + spec.cabinH + 0.16, cabinZ, 0.6, 0.14, 0.34, rgb(0x2266ff), { emissive: redOn ? 0.25 : 2.2 });
    boxAt(0, 0.32 + spec.bodyH + spec.cabinH + 0.09, cabinZ, 1.3, 0.06, 0.4, rgb(0x22262c));
  }
  if ((opts.damage || 0) > 0.45) {
    // Crumpled nose: a dark wedge block dropped over the front.
    boxAt(0, 0.5, L / 2 - 0.15, W * 0.8, 0.3, 0.5, rgb(0x24262a));
  }
}

/**
 * A person at (x, z) facing yaw. opts: { walkPhase, run, aim, gun (0 none, 1 pistol, 2 smg),
 * fallen, shirt, pants, skin, hat (hex or null), officer }.
 */
export function pushPerson(b, x, z, yaw, opts = {}) {
  const shirt = rgb(opts.shirt ?? 0x3a7ca5);
  const pants = rgb(opts.pants ?? 0x2e3440);
  const skin = rgb(opts.skin ?? 0xc98d64);
  const phase = opts.walkPhase || 0;
  const yOff = opts.yOff || 0;
  const swing = opts.fallen ? 0 : Math.sin(phase) * (opts.run ? 0.62 : 0.42);
  const at = (lx, lz) => localToWorld(x, z, yaw, lx, lz);
  const part = (lx, y, lz, sx, sy, sz, col, extraYaw = 0) => {
    const [wx, wz] = at(lx, lz);
    b.box(wx, y + yOff, wz, sx, sy, sz, col, { yaw: yaw + extraYaw, skipBottom: true });
  };
  if (opts.fallen) {
    // Knocked flat: torso along the ground, head at the front, legs trailing.
    part(0, 0.22, 0.25, 0.52, 0.3, 0.85, shirt);
    part(0, 0.2, 0.85, 0.3, 0.28, 0.3, skin);
    part(-0.14, 0.14, -0.45, 0.2, 0.2, 0.85, pants);
    part(0.14, 0.14, -0.45, 0.2, 0.2, 0.85, pants);
    part(-0.38, 0.16, 0.3, 0.16, 0.16, 0.6, shirt);
    part(0.38, 0.16, 0.3, 0.16, 0.16, 0.6, shirt);
    return;
  }
  // Legs swing around the hip; feet at stride extremes.
  const legSwing = swing * 0.55;
  part(-0.11, 0.45, Math.sin(phase) * 0.28, 0.19, 0.9, 0.22, pants, legSwing * 0.4);
  part(0.11, 0.45, -Math.sin(phase) * 0.28, 0.19, 0.9, 0.22, pants, -legSwing * 0.4);
  // Torso and head.
  part(0, 1.18, 0, 0.54, 0.62, 0.3, shirt);
  part(0, 1.68, 0, 0.3, 0.34, 0.3, skin);
  part(0, 1.87, 0, 0.33, 0.09, 0.33, rgb(opts.hair ?? 0x2a2019));
  if (opts.hat) part(0, 1.9, 0, 0.44, 0.07, 0.44, rgb(opts.hat));
  if (opts.officer) {
    part(0, 1.32, 0.17, 0.56, 0.3, 0.05, rgb(0x1d3a5f)); // vest panel
    part(0, 1.9, 0, 0.46, 0.08, 0.46, rgb(0x1d3a5f)); // cap
  }
  // Arms: swing at the shoulder, or both forward holding a gun when aiming.
  if (opts.aim) {
    part(-0.12, 1.32, 0.42, 0.15, 0.15, 0.62, shirt);
    part(0.12, 1.32, 0.42, 0.15, 0.15, 0.62, shirt);
    if (opts.gun) {
      const gunCol = rgb(0x17191d);
      const gunLen = opts.gun === 2 ? 0.62 : 0.34;
      part(0, 1.34, 0.72 + gunLen / 2, 0.09, 0.13, gunLen, gunCol);
    }
  } else {
    part(-0.36, 1.16, -Math.sin(phase) * 0.24, 0.15, 0.58, 0.17, shirt, -legSwing * 0.35);
    part(0.36, 1.16, Math.sin(phase) * 0.24, 0.15, 0.58, 0.17, shirt, legSwing * 0.35);
  }
}

/** The SBPD helicopter: body, tail, spinning rotors, skids, and its searchlight housing. */
export function pushHelicopter(b, x, y, z, yaw, rotorAngle, opts = {}) {
  const body = rgb(0xf0f2f4);
  const dark = rgb(0x1d3a5f);
  const at = (lx, lz) => localToWorld(x, z, yaw, lx, lz);
  const boxAt = (lx, ly, lz, sx, sy, sz, col, extra = {}) => {
    const [wx, wz] = at(lx, lz);
    b.box(wx, y + ly, wz, sx, sy, sz, col, { yaw, skipBottom: true, ...extra });
  };
  boxAt(0, 0, 0.2, 2.2, 1.9, 4.6, body, { top: dark }); // main cabin
  boxAt(0, -0.1, 2.6, 1.7, 1.3, 1.2, rgb(0x22303c)); // cockpit glass nose
  boxAt(0, 0.25, -4.6, 0.5, 0.6, 4.6, body); // tail boom
  boxAt(0, 0.9, -6.7, 0.18, 1.5, 0.7, dark); // tail fin
  boxAt(0, -0.5, -6.7, 1.6, 0.16, 0.5, dark); // tail plane
  // Tail rotor: a thin cross of blades on the fin, spun fast around the X axis.
  const tailSpin = rotorAngle * 3;
  const [finX, finZ] = at(0.35, -6.7);
  for (const off of [0, Math.PI / 2]) {
    const a = tailSpin + off;
    b.beam(
      finX, y + 0.9 - Math.cos(a) * 0.8, finZ - Math.sin(a) * 0.8,
      finX, y + 0.9 + Math.cos(a) * 0.8, finZ + Math.sin(a) * 0.8,
      0.07, rgb(0x22262c),
    );
  }
  const bladeLen = 5.6;
  for (const off of [0, Math.PI / 2]) {
    const a = rotorAngle + off;
    const [x1, z1] = at(Math.sin(a) * bladeLen, Math.cos(a) * bladeLen);
    const [x2, z2] = at(-Math.sin(a) * bladeLen, -Math.cos(a) * bladeLen);
    b.beam(x1, y + 1.25, z1, x2, y + 1.25, z2, 0.3, rgb(0x22262c));
  }
  boxAt(0, 1.05, 0.2, 0.4, 0.4, 0.4, dark); // rotor mast head
  // Skids.
  for (const side of [-0.95, 0.95]) {
    const [fx, fz] = at(side, 1.6);
    const [rx, rz] = at(side, -1.6);
    b.beam(fx, y - 1.35, fz, rx, y - 1.35, rz, 0.09, dark);
    const [m1x, m1z] = at(side * 0.7, 0.9);
    b.beam(m1x, y - 0.9, m1z, fx, y - 1.35, fz, 0.07, dark);
    const [m2x, m2z] = at(side * 0.7, -0.9);
    b.beam(m2x, y - 0.9, m2z, rx, y - 1.35, rz, 0.07, dark);
  }
  // Searchlight housing under the nose + the door gunner at five stars.
  boxAt(0.5, -1.05, 1.9, 0.5, 0.4, 0.5, rgb(0x333a42));
  if (opts.gunner) {
    boxAt(1.25, -0.2, 0.6, 0.35, 0.7, 0.35, dark); // gunner torso block
    const [gx, gz] = at(1.7, 1.1);
    b.box(gx, y - 0.15, gz, 0.12, 0.16, 1.1, rgb(0x17191d), { yaw, skipBottom: true });
  }
  if (opts.lightPhase !== undefined) {
    const redOn = (opts.lightPhase % 1) < 0.5;
    boxAt(-0.8, 0.6, -1.8, 0.3, 0.16, 0.3, rgb(0xff2222), { emissive: redOn ? 2 : 0.2 });
    boxAt(0.8, 0.6, -1.8, 0.3, 0.16, 0.3, rgb(0x2266ff), { emissive: redOn ? 0.2 : 2 });
  }
}
