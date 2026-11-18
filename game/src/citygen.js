// citygen.js — builds Sirena Bay into a static mesh: ground, roads, five districts of
// buildings with lit windows, palms, lamps, the marina, the beach and the lighthouse point.
// Also exports the street grid the traffic and police drive on, the building colliders the
// physics pushes against, and the named PLACES the missions and shops hang off.
//
// Layout: a 7x7 grid of 46 m blocks on a 62 m pitch (16 m roads), x east, z south, spanning
// [0, 450]. The beach runs along the south edge, the marina cuts into the west, hills close
// the north. Buildings are axis-aligned, so facade quads are placed with plain arithmetic —
// every window corner is computed from the facade plane, never from rotated geometry.

import { MeshBuilder, rgb, scaleC, mixC } from './renderer.js';
import { hash2 } from './rng.js';

export const PITCH = 62;
export const BLOCK = 46;
export const ROAD_HALF = 8;
export const GRID = 7;
export const CITY_SIZE = 450;
export const STREET_CENTERS = [8, 70, 132, 194, 256, 318, 380, 442];
export const BEACH_Z = 488;

export function districtOf(i, j) {
  if (i === 3 && j === 4) return 'Plaza';
  if (j === 0) return 'Hills';
  if (j === 6) return 'Beachfront';
  if (i <= 1 && j >= 2) return 'Marina';
  if (i >= 5) return 'Old Town';
  if (i >= 2 && i <= 4 && j >= 1 && j <= 3) return 'Downtown';
  return 'Midtown';
}

export const PLACES = [
  { id: 'hotel', name: 'Hotel Rey', x: 225, z: 436, district: 'Beachfront' },
  { id: 'marina', name: 'Marina Pier', x: -34, z: 315, district: 'Marina' },
  { id: 'arms', name: 'Sirena Arms', x: 150, z: 196, district: 'Downtown' },
  { id: 'customs', name: 'Reef Customs', x: 352, z: 254, district: 'Old Town' },
  { id: 'safehouse', name: 'Reyes Safehouse', x: 352, z: 374, district: 'Old Town' },
  { id: 'lighthouse', name: 'El Faro Point', x: -20, z: 446, district: 'Beachfront' },
  { id: 'police', name: 'SBPD HQ', x: 86, z: 68, district: 'Downtown' },
  { id: 'casino', name: 'Casino Solara', x: 288, z: 196, district: 'Downtown' },
  { id: 'market', name: 'Bahía Market', x: 414, z: 196, district: 'Old Town' },
  { id: 'plaza', name: 'Plaza del Sol', x: 225, z: 287, district: 'Plaza' },
];

export function placeById(id) { return PLACES.find((p) => p.id === id); }

/** True when (x, z) is on a road strip (not inside a block). */
export function isOnRoad(x, z) {
  if (x < -70 || x > CITY_SIZE + 20 || z < -10 || z > BEACH_Z) return true; // off-grid counts as open
  for (const c of STREET_CENTERS) {
    if (Math.abs(x - c) <= ROAD_HALF + 1) return true;
    if (Math.abs(z - c) <= ROAD_HALF + 1) return true;
  }
  return false;
}

/** The street centre line coordinate nearest to v along one axis. */
export function nearestStreet(v) {
  let best = STREET_CENTERS[0];
  for (const c of STREET_CENTERS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

const PALETTES = {
  Downtown: [0xdfe6ea, 0xb9c8d4, 0x8fa8bc, 0xe8e2d4, 0x9fb4c8, 0xc7d2da],
  Beachfront: [0xfff4e0, 0xffd9c2, 0xcdeac8, 0xffc9d6, 0xfffdf4, 0xd6ecf5],
  'Old Town': [0xe8b04b, 0xd97b4f, 0xf2e3c6, 0xc95f3d, 0xe9d8a6, 0xdda15e],
  Marina: [0x7d8a96, 0x9aa5a8, 0x6b7f8c, 0xa8574a, 0x8c9a5b, 0xb0a89a],
  Hills: [0xf7f3e8, 0xefe6d0, 0xfbfaf5, 0xe6ddc8],
  Midtown: [0xd8cfc0, 0xbfae94, 0xc9d2cc, 0xe3d7c3, 0xa8bfb2],
};

const ROOF_COLORS = [0x8a4a3a, 0x74584a, 0x9a5a44, 0x5d6a72, 0xa0522d];

/** One window quad on an axis-aligned facade. side: 0 south(+Z), 1 north(-Z), 2 east(+X), 3 west(-X). */
function facadeWindow(b, side, fixed, u, y, w, h, color, emissive) {
  const u0 = u - w / 2, u1 = u + w / 2, y0 = y, y1 = y + h;
  if (side === 0) b.quad(u0, y0, fixed, u1, y0, fixed, u1, y1, fixed, u0, y1, fixed, color, emissive);
  else if (side === 1) b.quad(u1, y0, fixed, u0, y0, fixed, u0, y1, fixed, u1, y1, fixed, color, emissive);
  else if (side === 2) b.quad(fixed, y0, u1, fixed, y0, u0, fixed, y1, u0, fixed, y1, u1, color, emissive);
  else b.quad(fixed, y0, u0, fixed, y0, u1, fixed, y1, u1, fixed, y1, u0, color, emissive);
}

const LIT_WINDOW = rgb(0xffc873);
const WARM_WINDOW = rgb(0xff9e4f);
const GLASS = rgb(0x2a3c4c);
const GLASS_DAY = rgb(0x51748c);

/** Windows over all four facades of a building; lit ones are decided once, by hash, forever. */
function addWindows(b, x0, z0, x1, z1, baseY, h, seed, litRatio) {
  const floors = Math.max(1, Math.floor((h - 2.4) / 3.1));
  const faces = [
    { side: 0, fixed: z1 + 0.04, from: x0, to: x1 },
    { side: 1, fixed: z0 - 0.04, from: x0, to: x1 },
    { side: 2, fixed: x1 + 0.04, from: z0, to: z1 },
    { side: 3, fixed: x0 - 0.04, from: z0, to: z1 },
  ];
  for (const face of faces) {
    const span = face.to - face.from;
    const cols = Math.max(1, Math.floor((span - 2) / 3));
    for (let c = 0; c < cols; c += 1) {
      const u = face.from + 1.6 + c * 3 + 0.75;
      for (let f = 0; f < floors; f += 1) {
        const y = baseY + 1.5 + f * 3.1;
        if (y + 2 > baseY + h - 0.5) continue;
        const roll = hash2(seed + c * 31 + face.side * 7, f * 17 + seed);
        if (roll < litRatio) {
          facadeWindow(b, face.side, face.fixed, u, y, 1.5, 2.0, roll < litRatio * 0.4 ? WARM_WINDOW : LIT_WINDOW, 0.95);
        } else {
          facadeWindow(b, face.side, face.fixed, u, y, 1.5, 2.0, roll < 0.5 ? GLASS : GLASS_DAY, 0.03);
        }
      }
    }
  }
}

/** A palm: two leaning trunk beams and a crown of drooping frond beams. */
export function pushPalm(b, x, z, rng, scale = 1) {
  const trunkColor = rgb(0x8a6f4d);
  const leafColor = rgb(0x2e7d46);
  const leafDark = rgb(0x256b3a);
  const lean = rng.range(-0.7, 0.7);
  const h = rng.range(5.2, 7.4) * scale;
  const topX = x + lean, topZ = z + rng.range(-0.5, 0.5);
  b.beam(x, 0, z, x + lean * 0.5, h * 0.55, z, 0.34 * scale, trunkColor);
  b.beam(x + lean * 0.5, h * 0.55, z, topX, h, topZ, 0.26 * scale, trunkColor);
  const fronds = 8;
  for (let i = 0; i < fronds; i += 1) {
    const a = (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(2.8, 3.9) * scale;
    const tipX = topX + Math.cos(a) * len, tipZ = topZ + Math.sin(a) * len;
    b.beam(topX, h, topZ, tipX, h - rng.range(0.9, 1.5) * scale, tipZ, 0.21 * scale, i % 2 ? leafColor : leafDark);
  }
  b.box(topX, h - 0.1, topZ, 0.4, 0.35, 0.4, rgb(0x6e5636));
}

/** A street lamp; returns nothing — positions are collected by the caller for night glows. */
function pushLamp(b, x, z, armDirX, armDirZ) {
  const pole = rgb(0x3c444c);
  b.cylinder(x, 0, z, 0.09, 0.07, 5.6, 6, pole, { cap: false });
  b.beam(x, 5.6, z, x + armDirX * 1.6, 5.9, z + armDirZ * 1.6, 0.09, pole);
  b.box(x + armDirX * 1.7, 5.85, z + armDirZ * 1.7, 0.55, 0.14, 0.3, rgb(0xfff2c8), { emissive: 1.2 });
}

function pushBench(b, x, z, yaw) {
  const wood = rgb(0x9a6a44);
  const iron = rgb(0x2f363c);
  b.box(x, 0.45, z, 1.9, 0.09, 0.5, wood, { yaw });
  b.box(x, 0.85, z, 1.9, 0.5, 0.08, wood, { yaw });
  b.box(x - 0.7, 0.22, z, 0.12, 0.45, 0.45, iron, { yaw });
  b.box(x + 0.7, 0.22, z, 0.12, 0.45, 0.45, iron, { yaw });
}

/** Builds the whole static city into `batch`; returns colliders, lamp spots and landmarks. */
export function buildCity(batch, rng) {
  const b = new MeshBuilder(batch);
  const colliders = [];
  const lamps = [];
  const addCollider = (x0, z0, x1, z1, h) => colliders.push({ x0, z0, x1, z1, h });

  // -- Ground: one water plane under everything, the land plate, beach sand. ---------------
  b.ground(-700, -700, 1300, 1400, -0.35, rgb(0xffffff), 4); // open water (emissive 4 shades it)
  b.ground(-8, -46, 500, BEACH_Z, 0, rgb(0xb9b2a4)); // land plate
  b.ground(-60, BEACH_Z - 4, 500, 540, 0.02, rgb(0xe8d194)); // beach sand
  b.ground(-70, 250, -8, 400, 0.01, rgb(0xa8a294)); // marina apron
  b.ground(-8, -46, 500, 0, 0.012, rgb(0x7d9b6a)); // hill-foot green strip

  // -- Roads: verticals first, horizontals above them, then dashes and crosswalks. --------
  const asphalt = rgb(0x33373c);
  const asphalt2 = rgb(0x383d42);
  for (const c of STREET_CENTERS) {
    b.ground(c - ROAD_HALF, -6, c + ROAD_HALF, 456, 0.03, asphalt);
    b.ground(-6, c - ROAD_HALF, 456, c + ROAD_HALF, 0.05, asphalt2);
  }
  const dashColor = rgb(0xd8c86a);
  for (const c of STREET_CENTERS) {
    for (let v = 2; v < 450; v += 9) {
      if (STREET_CENTERS.some((s) => Math.abs(v - s) < 11)) continue;
      b.ground(c - 0.14, v, c + 0.14, v + 3.4, 0.07, dashColor);
      b.ground(v, c - 0.14, v + 3.4, c + 0.14, 0.07, dashColor);
    }
  }
  const zebra = rgb(0xd8d8d2);
  for (const cx of STREET_CENTERS) {
    for (const cz of STREET_CENTERS) {
      for (let s = -5; s <= 5; s += 2.5) {
        b.ground(cx + s - 0.7, cz - ROAD_HALF - 2.6, cx + s + 0.7, cz - ROAD_HALF - 0.6, 0.065, zebra);
      }
    }
  }

  // -- Backdrop hills north and east. -------------------------------------------------------
  const hillColor = rgb(0x5d7d54);
  const hillFar = rgb(0x4c6a4c);
  const hillSpots = [[-30, -120, 150, 42], [140, -150, 190, 55], [330, -130, 170, 48], [520, -90, 150, 40], [560, 120, 130, 34], [545, 330, 140, 38]];
  for (const [hx, hz, hr, hh] of hillSpots) {
    b.cylinder(hx, -4, hz, hr, hr * 0.12, hh, 9, hx % 2 ? hillColor : hillFar, { cap: true });
  }

  // -- Blocks: sidewalks, then district buildings. ------------------------------------------
  const sidewalk = rgb(0xcac2b2);
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const x0 = STREET_CENTERS[i] + ROAD_HALF, z0 = STREET_CENTERS[j] + ROAD_HALF;
      const x1 = x0 + BLOCK, z1 = z0 + BLOCK;
      b.ground(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, 0.045, sidewalk);
      const district = districtOf(i, j);
      if (district === 'Plaza') buildPlaza(b, x0, z0, x1, z1, rng, addCollider);
      else buildBlock(b, x0, z0, x1, z1, district, rng, addCollider, i * 7 + j);
    }
  }

  // -- Lamps along every street. -------------------------------------------------------------
  for (const c of STREET_CENTERS) {
    for (let v = 24; v < 448; v += 44) {
      pushLamp(b, c - ROAD_HALF - 0.6, v, 1, 0); lamps.push([c - ROAD_HALF + 1, v]);
      pushLamp(b, v, c + ROAD_HALF + 0.6, 0, -1); lamps.push([v, c + ROAD_HALF - 1]);
    }
  }

  // -- Beach: palms, umbrellas, lifeguard tower. ----------------------------------------------
  for (let x = 6; x < 480; x += 18) {
    if (rng.chance(0.75)) pushPalm(b, x + rng.range(-3, 3), 462 + rng.range(0, 8), rng);
    if (rng.chance(0.5)) {
      const ux = x + 6, uz = 476 + rng.range(-4, 6);
      b.cylinder(ux, 0, uz, 0.06, 0.06, 2.4, 5, rgb(0xe8e2d2), { cap: false });
      b.cylinder(ux, 2.2, uz, 2.3, 0.2, 0.5, 7, rgb(rng.pick([0xff6b5e, 0xffb84d, 0x4fc3d9, 0xff8fab])), { cap: true });
    }
  }
  b.box(120, 1.6, 470, 2.2, 3.2, 2.2, rgb(0xf2ede2));
  b.roofPrism(120, 3.2, 470, 3.2, 1, 3.2, rgb(0xd94f3d));
  addCollider(118.8, 468.8, 121.2, 471.2, 3.4);

  // -- Marina: pier, posts, moored boats. -------------------------------------------------------
  const wood = rgb(0x8a6a48);
  const woodDark = rgb(0x6e543a);
  b.box(-40, 0.55, 315, 66, 0.35, 9, wood);
  for (let px = -70; px <= -8; px += 8) {
    b.cylinder(px, -0.6, 311, 0.22, 0.22, 1.3, 6, woodDark, { cap: false });
    b.cylinder(px, -0.6, 319, 0.22, 0.22, 1.3, 6, woodDark, { cap: false });
  }
  addCollider(-73, 310.2, -7, 311.2, 1); // pier north rail — the east end stays open
  addCollider(-73, 318.8, -7, 319.8, 1); // pier south rail
  const boatColors = [0xf2f2f2, 0xd94f3d, 0x2a6db0, 0xffb84d, 0x3fae8a];
  for (let k = 0; k < 5; k += 1) {
    const bx = -58 + k * 11, bz = 300 - (k % 2) * 4;
    pushBoat(b, bx, bz, rng.range(-0.15, 0.15), rgb(boatColors[k]));
  }
  pushBoat(b, -30, 345, 0.4, rgb(0xf2f2f2));
  pushBoat(b, 60, 520, -0.3, rgb(0xd94f3d));

  // -- El Faro lighthouse on its rock point. ------------------------------------------------------
  const rock = rgb(0x6a6f72);
  b.cylinder(-20, -0.5, 462, 13, 9, 2.2, 9, rock, { cap: true });
  addCollider(-31, 451, -9, 473, 2);
  const lhWhite = rgb(0xf5f2ea), lhRed = rgb(0xd94030);
  b.cylinder(-20, 1.6, 462, 3.1, 2.2, 4.4, 10, lhWhite);
  b.cylinder(-20, 6, 462, 2.55, 2.35, 2.2, 10, lhRed);
  b.cylinder(-20, 8.2, 462, 2.35, 1.9, 4.2, 10, lhWhite);
  b.cylinder(-20, 12.4, 462, 2.6, 2.6, 0.5, 10, rgb(0x2c3136));
  b.box(-20, 13.6, 462, 2.2, 1.7, 2.2, rgb(0xffd98a), { emissive: 1.4 });
  b.cylinder(-20, 14.5, 462, 0.2, 1.6, 1.1, 8, rgb(0x2c3136), { cap: true });
  addCollider(-23.2, 458.8, -16.8, 465.2, 14);

  return { colliders, lamps, builder: b };
}

function pushBoat(b, x, z, yaw, color) {
  const hull = color;
  b.box(x, 0.35, z, 7.6, 0.9, 2.6, hull, { yaw });
  b.box(x, 0.95, z, 5.6, 0.5, 2.0, rgb(0xf7f4ec), { yaw });
  b.box(x + 0.6, 1.6, z, 2.4, 0.9, 1.6, rgb(0xe8e2d2), { yaw });
  b.cylinder(x - 1.4, 1.2, z, 0.05, 0.05, 4.6, 5, rgb(0x9aa0a4), { cap: false });
  b.beam(x - 1.4, 5.6, z, x + 2.4, 1.6, z, 0.05, rgb(0xf0ead8));
}

/** The Plaza del Sol: fountain, palms, benches, café umbrellas — no buildings. */
function buildPlaza(b, x0, z0, x1, z1, rng, addCollider) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.ground(x0 + 2, z0 + 2, x1 - 2, z1 - 2, 0.06, rgb(0xd9c9a8));
  b.cylinder(cx, 0.05, cz, 7, 7.6, 0.8, 16, rgb(0xb8ac94));
  b.disc(cx, 0.8, cz, 6.6, rgb(0xffffff), 4, 16);
  b.cylinder(cx, 0.8, cz, 0.5, 0.8, 1.6, 8, rgb(0xb8ac94));
  addCollider(cx - 7.6, cz - 7.6, cx + 7.6, cz + 7.6, 1);
  for (const [px, pz] of [[x0 + 5, z0 + 5], [x1 - 5, z0 + 5], [x0 + 5, z1 - 5], [x1 - 5, z1 - 5], [cx - 12, cz + 12], [cx + 12, cz - 12]]) {
    pushPalm(b, px, pz, rng);
  }
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    pushBench(b, cx + Math.cos(a) * 11, cz + Math.sin(a) * 11, -a);
  }
}

/** Fills one block with buildings for its district and records their colliders. */
function buildBlock(b, x0, z0, x1, z1, district, rng, addCollider, seed) {
  const palette = PALETTES[district];
  const spots = blockSpots(district, rng);
  for (const spot of spots) {
    const w = spot.w, d = spot.d;
    const bx0 = x0 + spot.x, bz0 = z0 + spot.z;
    const bx1 = bx0 + w, bz1 = bz0 + d;
    const color = rgb(rng.pick(palette));
    let h;
    if (district === 'Downtown') h = rng.range(26, 64);
    else if (district === 'Beachfront') h = rng.range(15, 34);
    else if (district === 'Midtown') h = rng.range(10, 24);
    else if (district === 'Old Town') h = rng.range(7, 15);
    else if (district === 'Marina') h = rng.range(6, 11);
    else h = rng.range(5, 8.5); // Hills villas
    const baseY = 0.05;
    const topColor = district === 'Hills' || (district === 'Old Town' && rng.chance(0.6))
      ? rgb(rng.pick(ROOF_COLORS)) : scaleC(color, 0.82);
    b.box((bx0 + bx1) / 2, baseY + h / 2, (bz0 + bz1) / 2, w, h, d, color, { top: topColor, skipBottom: true });
    if (district === 'Hills' || (district === 'Old Town' && rng.chance(0.6))) {
      b.roofPrism((bx0 + bx1) / 2, baseY + h, (bz0 + bz1) / 2, w + 0.8, rng.range(1.8, 3.2), d + 0.8, rgb(rng.pick(ROOF_COLORS)));
    } else if (district === 'Downtown' || district === 'Beachfront') {
      // Parapet and rooftop clutter.
      b.box((bx0 + bx1) / 2, baseY + h + 0.35, (bz0 + bz1) / 2, w + 0.4, 0.7, d + 0.4, scaleC(color, 0.9), { skipBottom: true });
      if (rng.chance(0.7)) b.box(bx0 + w * rng.range(0.25, 0.7), baseY + h + 1.1, bz0 + d * rng.range(0.3, 0.7), rng.range(3, 6), 2.2, rng.range(3, 5), scaleC(color, 0.75));
      if (district === 'Downtown' && rng.chance(0.4)) {
        const tx = bx0 + w * 0.7, tz = bz0 + d * 0.3;
        b.cylinder(tx, baseY + h, tz, 0.9, 0.9, 2.6, 7, rgb(0x9a8a76));
        b.cylinder(tx, baseY + h + 2.6, tz, 0.2, 1.15, 0.9, 7, rgb(0x84735e), { cap: true });
      }
    }
    const litRatio = district === 'Downtown' ? 0.5 : district === 'Beachfront' ? 0.55 : 0.42;
    if (district !== 'Marina') addWindows(b, bx0, bz0, bx1, bz1, baseY, h, seed * 131 + Math.floor(bx0), litRatio);
    else addWindows(b, bx0, bz0, bx1, bz1, baseY, h, seed * 131 + Math.floor(bx0), 0.12);
    // Ground-floor life: storefront band, awnings, the odd neon sign.
    if (district === 'Downtown' || district === 'Old Town' || district === 'Midtown' || district === 'Beachfront') {
      b.box((bx0 + bx1) / 2, baseY + 1.5, bz1 + 0.15, w * 0.92, 3, 0.3, rgb(0x27313a), { skipBottom: true });
      if (rng.chance(0.65)) {
        b.box((bx0 + bx1) / 2, baseY + 3.3, bz1 + 0.55, w * 0.7, 0.18, 1.3, rgb(rng.pick([0xd94f3d, 0x2a9db0, 0xffb84d, 0x3fae8a])), { skipBottom: true });
      }
      if (rng.chance(0.4)) {
        const neon = rng.pick([0xff4fd8, 0x35e0d0, 0xffa726, 0x7cff4f, 0xff5252]);
        b.box(bx0 + w * rng.range(0.3, 0.7), baseY + rng.range(3.8, 5.2), bz1 + 0.12, rng.range(2.5, 5), 0.9, 0.18, rgb(neon), { emissive: 1.5, skipBottom: true });
      }
    }
    if (district === 'Marina') {
      // Warehouse door and crate stacks in the yard.
      b.box((bx0 + bx1) / 2, baseY + 2.2, bz1 + 0.1, 6, 4.4, 0.2, rgb(0x3a4148), { skipBottom: true });
      for (let k = 0; k < 3; k += 1) {
        if (!rng.chance(0.6)) continue;
        const cxp = bx0 + rng.range(2, w - 2), czp = bz1 + rng.range(2.5, 4.5);
        b.box(cxp, baseY + 0.6, czp, 1.6, 1.2, 1.6, rgb(rng.pick([0xb08954, 0x7d8a96, 0x9aa05a])));
        addCollider(cxp - 0.8, czp - 0.8, cxp + 0.8, czp + 0.8, 1.2);
      }
    }
    if (district === 'Hills' && rng.chance(0.55)) {
      // A villa pool glinting in the yard.
      b.ground(bx0 + 2, bz1 + 1.5, bx0 + 9, bz1 + 5.5, 0.07, rgb(0xffffff), 4);
      b.box(bx0 + 1.6, 0.25, bz1 + 3.5, 0.3, 0.5, 4.6, rgb(0xd8d2c2));
    }
    addCollider(bx0, bz0, bx1, bz1, h);
  }
  // Palms and benches dress the sidewalks of the warmer districts.
  if (district === 'Beachfront' || district === 'Old Town' || district === 'Midtown') {
    for (let k = 0; k < 3; k += 1) {
      if (rng.chance(0.7)) pushPalm(b, x0 + rng.range(2, BLOCK - 2), z1 + 1.2, rng, 0.85);
    }
  }
}

/** Building footprints inside a block, per district density. x/z are offsets within the block. */
function blockSpots(district, rng) {
  if (district === 'Downtown') {
    if (rng.chance(0.45)) return [{ x: 4, z: 4, w: 36, d: 36 }];
    return [
      { x: 3, z: 3, w: 19, d: 19 }, { x: 24, z: 3, w: 19, d: 19 },
      { x: 3, z: 24, w: 19, d: 19 }, { x: 24, z: 24, w: 19, d: 19 },
    ].filter(() => rng.chance(0.8));
  }
  if (district === 'Beachfront') {
    return [{ x: 3, z: 6, w: 40, d: 30 }, ...(rng.chance(0.6) ? [{ x: 8, z: 38, w: 26, d: 6 }] : [])];
  }
  if (district === 'Marina') {
    return [
      { x: 3, z: 4, w: 40, d: 17 }, { x: 3, z: 25, w: 40, d: 16 },
    ].filter(() => rng.chance(0.85));
  }
  if (district === 'Hills') {
    return [
      { x: 4, z: 4, w: 16, d: 13 }, { x: 26, z: 6, w: 15, d: 12 }, { x: 12, z: 26, w: 17, d: 13 },
    ].filter(() => rng.chance(0.8));
  }
  // Old Town and Midtown: a loose row of smaller buildings.
  const spots = [];
  let x = 2;
  while (x < BLOCK - 10) {
    const w = rng.range(10, 16);
    spots.push({ x, z: rng.range(2, 5), w, d: rng.range(12, 18) });
    x += w + rng.range(1.5, 3.5);
  }
  let x2 = 3;
  while (x2 < BLOCK - 10) {
    const w = rng.range(10, 15);
    spots.push({ x: x2, z: rng.range(24, 28), w, d: rng.range(12, 16) });
    x2 += w + rng.range(1.5, 3.5);
  }
  return spots;
}
