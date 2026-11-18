// renderer.js — geometry building and the sky/lighting model.
// MeshBuilder turns boxes, prisms, cylinders, discs and beams into flat-shaded triangles in a
// Batch (see gl.js). Every face's winding was worked out so its computed normal points
// outward; the cover screenshot is where any mistake would show, and it is checked by eye.
// The lighting model is a keyframed day: sun position, sky colours, fog and the emissive
// boost that brings windows and neon alive after dark all come from computeLighting(hour).

import { Batch } from './gl.js';
import { clamp, lerp } from './math3d.js';

/** 0xRRGGBB to an [r, g, b] array of 0..1 floats. */
export function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function scaleC(color, f) { return [color[0] * f, color[1] * f, color[2] * f]; }

export function mixC(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export class MeshBuilder {
  constructor(batch) { this.batch = batch; }

  /** One triangle; corners must wind counter-clockwise seen from the front (normal side). */
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, color, emissive = 0) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const b = this.batch;
    b.push(ax, ay, az, nx, ny, nz, color[0], color[1], color[2], emissive);
    b.push(bx, by, bz, nx, ny, nz, color[0], color[1], color[2], emissive);
    b.push(cx, cy, cz, nx, ny, nz, color[0], color[1], color[2], emissive);
  }

  /** A planar quad from four corners wound counter-clockwise seen from the front. */
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, color, emissive = 0) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, color, emissive);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, color, emissive);
  }

  /** A flat ground quad (normal +Y) from min/max corners. */
  ground(x0, z0, x1, z1, y, color, emissive = 0) {
    this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, color, emissive);
  }

  /**
   * A box centred at (cx, cy, cz) with size (sx, sy, sz), optionally yawed around its centre.
   * opts: { yaw, emissive, top (colour for the top face), skipBottom }.
   */
  box(cx, cy, cz, sx, sy, sz, color, opts = {}) {
    const yaw = opts.yaw || 0;
    const emissive = opts.emissive || 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const corner = (lx, ly, lz) => [cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos];
    const c = [
      corner(-hx, -hy, -hz), corner(hx, -hy, -hz), corner(hx, -hy, hz), corner(-hx, -hy, hz),
      corner(-hx, hy, -hz), corner(hx, hy, -hz), corner(hx, hy, hz), corner(-hx, hy, hz),
    ];
    const top = opts.top || color;
    const q = (a, b, cc, d, col) => this.quad(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], col, emissive);
    q(c[7], c[6], c[5], c[4], top);            // top (+Y)
    if (!opts.skipBottom) q(c[0], c[1], c[2], c[3], color); // bottom (-Y)
    q(c[3], c[2], c[6], c[7], color);          // south (+Z)
    q(c[1], c[0], c[4], c[5], color);          // north (-Z)
    q(c[2], c[1], c[5], c[6], color);          // east (+X)
    q(c[0], c[3], c[7], c[4], color);          // west (-X)
  }

  /** A gable roof: ridge runs along Z at height h above the base centre line. */
  roofPrism(cx, cy, cz, w, h, d, color, opts = {}) {
    const yaw = opts.yaw || 0;
    const emissive = opts.emissive || 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const hw = w / 2, hd = d / 2;
    const p = (lx, ly, lz) => [cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos];
    const eR0 = p(hw, 0, -hd), eR1 = p(hw, 0, hd), eL0 = p(-hw, 0, -hd), eL1 = p(-hw, 0, hd);
    const r0 = p(0, h, -hd), r1 = p(0, h, hd);
    const q = (a, b, cc, dd) => this.quad(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], dd[0], dd[1], dd[2], color, emissive);
    q(eR1, eR0, r0, r1);   // right slope
    q(eL0, eL1, r1, r0);   // left slope
    this.tri(eL1[0], eL1[1], eL1[2], eR1[0], eR1[1], eR1[2], r1[0], r1[1], r1[2], color, emissive); // south gable
    this.tri(eR0[0], eR0[1], eR0[2], eL0[0], eL0[1], eL0[2], r0[0], r0[1], r0[2], color, emissive); // north gable
  }

  /** A tapered cylinder (rBottom to rTop) with an optional top cap. */
  cylinder(cx, cy, cz, rBottom, rTop, h, segments, color, opts = {}) {
    const emissive = opts.emissive || 0;
    const y0 = cy, y1 = cy + h;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * rBottom, z0 = cz + Math.sin(a0) * rBottom;
      const x1 = cx + Math.cos(a1) * rBottom, z1 = cz + Math.sin(a1) * rBottom;
      const x2 = cx + Math.cos(a1) * rTop, z2 = cz + Math.sin(a1) * rTop;
      const x3 = cx + Math.cos(a0) * rTop, z3 = cz + Math.sin(a0) * rTop;
      this.quad(x1, y0, z1, x0, y0, z0, x3, y1, z3, x2, y1, z2, color, emissive);
    }
    if (opts.cap !== false) this.disc(cx, y1, cz, rTop, color, emissive, segments);
  }

  /** A flat disc facing up. */
  disc(cx, cy, cz, r, color, emissive = 0, segments = 14) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.tri(
        cx, cy, cz,
        cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r,
        cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r,
        color, emissive,
      );
    }
  }

  /**
   * A square beam from point A to point B with the given thickness — leaning palm trunks,
   * fronds, crane arms, tracer fire, light shafts. End caps included.
   */
  beam(ax, ay, az, bx, by, bz, thickness, color, emissive = 0) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let ux = -dz, uy = 0, uz = dx; // cross(d, up) fallback axis
    if (Math.hypot(ux, uy, uz) < 0.01) { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux; // v = d x u
    const s = thickness / 2;
    const ring = (px, py, pz) => [
      [px + (ux + vx) * s, py + (uy + vy) * s, pz + (uz + vz) * s],
      [px + (-ux + vx) * s, py + (-uy + vy) * s, pz + (-uz + vz) * s],
      [px + (-ux - vx) * s, py + (-uy - vy) * s, pz + (-uz - vz) * s],
      [px + (ux - vx) * s, py + (uy - vy) * s, pz + (uz - vz) * s],
    ];
    const A = ring(ax, ay, az), B = ring(bx, by, bz);
    const q = (a, b, c, d) => this.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], color, emissive);
    q(A[1], B[1], B[0], A[0]); // +v side
    q(A[0], B[0], B[3], A[3]); // +u side
    q(A[3], B[3], B[2], A[2]); // -v side
    q(A[2], B[2], B[1], A[1]); // -u side
    q(B[0], B[1], B[2], B[3]); // far cap
    q(A[3], A[2], A[1], A[0]); // near cap
  }
}

// ---- Sky -------------------------------------------------------------------------------

const SKY_VERTEX = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
varying vec3 vColor;
varying vec3 vDir;
void main() {
  vColor = aColor;
  vDir = aPos;
  vec4 p = uProj * uView * vec4(aPos + uCamPos, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = `
precision highp float;
varying vec3 vColor;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uSunTint;
void main() {
  vec3 dir = normalize(vDir);
  float sunAmount = max(dot(dir, uSunDir), 0.0);
  vec3 col = vColor + uSunTint * (pow(sunAmount, 350.0) * 1.6 + pow(sunAmount, 18.0) * 0.28);
  gl_FragColor = vec4(col, 1.0);
}`;

function linkSkyProgram(gl) {
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('sky shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, sh(gl.VERTEX_SHADER, SKY_VERTEX));
  gl.attachShader(program, sh(gl.FRAGMENT_SHADER, SKY_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('sky program: ' + gl.getProgramInfoLog(program));
  return program;
}

/** A gradient dome (a cube around the camera, drawn with depth at the far plane). */
export class SkyDome {
  constructor(gl) {
    this.program = linkSkyProgram(gl);
    this.uProj = gl.getUniformLocation(this.program, 'uProj');
    this.uView = gl.getUniformLocation(this.program, 'uView');
    this.uCamPos = gl.getUniformLocation(this.program, 'uCamPos');
    this.uSunDir = gl.getUniformLocation(this.program, 'uSunDir');
    this.uSunTint = gl.getUniformLocation(this.program, 'uSunTint');
    this.batch = new Batch(gl, 36, true);
  }

  draw(gl, proj, view, camPos, palette) {
    const b = this.batch;
    b.reset();
    const R = 900;
    const zen = palette.zenith, hor = palette.horizon;
    // Cube corners are camera-local: the shader adds the camera position back, and the
    // direction varying stays a true direction, so the sun disc lands where the sun is.
    const corner = (lx, ly, lz) => {
      const col = ly > 0 ? zen : [hor[0] * 0.55, hor[1] * 0.5, hor[2] * 0.6];
      return { p: [lx * R, ly * R, lz * R], c: col };
    };
    const cs = [
      corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1),
      corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1),
    ];
    const push = (c) => b.push(c.p[0], c.p[1], c.p[2], 0, 1, 0, c.c[0], c.c[1], c.c[2], 0);
    const quad = (a, bb, c, d) => { push(a); push(bb); push(c); push(a); push(c); push(d); };
    quad(cs[7], cs[6], cs[5], cs[4]); // top
    quad(cs[0], cs[1], cs[2], cs[3]); // bottom
    quad(cs[3], cs[2], cs[6], cs[7]); // south
    quad(cs[1], cs[0], cs[4], cs[5]); // north
    quad(cs[2], cs[1], cs[5], cs[6]); // east
    quad(cs[0], cs[3], cs[7], cs[4]); // west
    b.upload();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniform3fv(this.uCamPos, camPos);
    gl.uniform3fv(this.uSunDir, palette.sunDir);
    gl.uniform3fv(this.uSunTint, palette.sunTint);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
    const stride = 10 * 4;
    const posLoc = gl.getAttribLocation(this.program, 'aPos');
    const colLoc = gl.getAttribLocation(this.program, 'aColor');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, b.count);
    gl.depthMask(true);
  }
}

// ---- Lighting keyframes ------------------------------------------------------------------

const KEYS = [
  // hour, zenith, horizon, sunTint, sunScale, skyAmb, groundAmb, fog, fogNear, fogFar, emissiveBoost
  [0.0, 0x050914, 0x0c1424, 0x8fa8cc, 0.16, 0.17, 0.09, 0x0c1424, 120, 800, 1.8],
  [5.0, 0x060b1a, 0x101a2e, 0x8fa8cc, 0.16, 0.18, 0.09, 0x101a2e, 130, 850, 1.8],
  [6.6, 0x2c4a74, 0xe88a5e, 0xff9550, 0.85, 0.30, 0.14, 0x9a7a72, 170, 1050, 1.15],
  [8.5, 0x3a76c4, 0xbcd9e8, 0xfff2d8, 1.0, 0.46, 0.22, 0xbcd2de, 260, 1500, 0.25],
  [13.0, 0x2e6cd2, 0xcfe8f2, 0xfff6e8, 1.08, 0.52, 0.25, 0xc4dde8, 300, 1700, 0.12],
  [16.8, 0x3572ba, 0xdfe8da, 0xffe9c4, 1.02, 0.46, 0.22, 0xc2d4d2, 270, 1550, 0.3],
  [18.4, 0x3a5f9e, 0xffa347, 0xffab52, 1.05, 0.37, 0.17, 0xd9a37e, 230, 1350, 0.85],
  [19.3, 0x2c4470, 0xff7a45, 0xff8040, 0.7, 0.29, 0.14, 0xa87a72, 200, 1150, 1.35],
  [20.3, 0x111d3a, 0x584a72, 0x9a86b8, 0.22, 0.21, 0.11, 0x3c3450, 150, 950, 1.7],
  [22.0, 0x050914, 0x0c1424, 0x8fa8cc, 0.16, 0.17, 0.09, 0x0c1424, 120, 800, 1.8],
  [24.0, 0x050914, 0x0c1424, 0x8fa8cc, 0.16, 0.17, 0.09, 0x0c1424, 120, 800, 1.8],
];

function keyToPalette(k, sunDir) {
  return {
    zenith: k[1], horizon: k[2], sunTint: k[3],
    sunColor: scaleC(k[3], k[4]),
    skyAmbient: scaleC([1, 1, 1], k[5]), groundAmbient: scaleC([0.9, 0.85, 0.8], k[6]),
    fogColor: k[7], fogNear: k[8], fogFar: k[9], emissiveBoost: k[10],
    sunDir,
  };
}

/** A keyframe with its hex colours expanded to [r, g, b] so channels can be lerped cleanly. */
function expandKey(k) {
  return [k[0], rgb(k[1]), rgb(k[2]), rgb(k[3]), k[4], k[5], k[6], rgb(k[7]), k[8], k[9], k[10]];
}

function mixKeys(a, b, t) {
  const out = [];
  for (let i = 0; i < a.length; i += 1) {
    if (Array.isArray(a[i])) out.push(mixC(a[i], b[i], t));
    else out.push(lerp(a[i], b[i], t));
  }
  return out;
}

/**
 * The full lighting state for an hour of the game day (0..24). The sun crosses from east (+X)
 * to west (-X) with a southern bias — Sirena Bay is tropical — and after dark a cool moon
 * takes over at a fixed angle.
 */
export function computeLighting(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i += 1;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((hour - a[0]) / Math.max(0.0001, b[0] - a[0]), 0, 1);
  const mixed = mixKeys(expandKey(a), expandKey(b), t);
  const dayT = (hour - 6.3) / 12.8;
  let sunDir;
  if (dayT >= 0 && dayT <= 1) {
    const az = Math.PI * dayT;
    sunDir = [Math.cos(az), Math.sin(az) * 0.88 + 0.04, 0.34 + 0.18 * Math.sin(az)];
  } else {
    sunDir = [-0.42, 0.6, -0.38]; // the moon
  }
  const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
  sunDir = [sunDir[0] / len, sunDir[1] / len, sunDir[2] / len];
  const palette = keyToPalette(mixed, sunDir);
  palette.daylight = clamp(sunDir[1] * 1.7, 0, 1);
  palette.darkness = 1 - palette.daylight;
  return palette;
}
