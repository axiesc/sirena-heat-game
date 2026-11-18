// math3d.js — the small vector/matrix kit every other module shares.
// Matrices are plain Float32Array(16) in column-major order (what WebGL wants), vectors are
// [x, y, z] arrays. Nothing here allocates in hot paths except the constructors.

export function vec3(x = 0, y = 0, z = 0) { return [x, y, z]; }

export function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vLength(a) { return Math.hypot(a[0], a[1], a[2]); }

export function vNormalize(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** Horizontal distance between two points (gameplay mostly lives on the XZ plane). */
export function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

/** Angle of a 2D direction, matching the game's yaw convention: yaw 0 faces +Z, growing clockwise seen from above. */
export function yawOf(dx, dz) { return Math.atan2(dx, dz); }

/** Unit forward vector for a yaw. */
export function forwardOf(yaw) { return [Math.sin(yaw), 0, Math.cos(yaw)]; }

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

/** Smooth 0..1 easing used for camera and UI-ish motion. */
export function smoothstep(t) { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); }

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mat4LookAt(eye, target, up) {
  const zAxis = vNormalize(vSub(eye, target));
  const xAxis = vNormalize(vCross(up, zAxis));
  const yAxis = vCross(zAxis, xAxis);
  const m = new Float32Array(16);
  m[0] = xAxis[0]; m[1] = yAxis[0]; m[2] = zAxis[0];
  m[4] = xAxis[1]; m[5] = yAxis[1]; m[6] = zAxis[1];
  m[8] = xAxis[2]; m[9] = yAxis[2]; m[10] = zAxis[2];
  m[12] = -vDot(xAxis, eye);
  m[13] = -vDot(yAxis, eye);
  m[14] = -vDot(zAxis, eye);
  m[15] = 1;
  return m;
}

/** Rotate a point around the Y axis by yaw (used by the mesh builder for placed props). */
export function rotateY(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}
