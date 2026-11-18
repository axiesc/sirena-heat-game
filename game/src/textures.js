// textures.js — the game's only texture: a soft radial glow disc, painted on a canvas at boot.
// Everything else in Sirena Bay is vertex colour; this one sprite backs every additive glow —
// the sun's halo, street-lamp pools of light, headlights, muzzle flashes and the helicopter
// searchlight's halo — so they all share the same soft falloff.

export function createGlowTexture(gl) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx2d = canvas.getContext('2d');
  const gradient = ctx2d.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, size, size);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** Adds one billboard glow sprite (two triangles) to a glow batch. */
export function pushGlow(batch, x, y, z, r, g, b, size, alpha) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    const [cx, cy] = corners[index];
    const o = batch.count * 10;
    if (batch.count >= batch.capacity) return;
    const d = batch.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = cx; d[o + 4] = cy;
    d[o + 5] = r; d[o + 6] = g; d[o + 7] = b;
    d[o + 8] = size; d[o + 9] = alpha;
    batch.count += 1;
  }
}
