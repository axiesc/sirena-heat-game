// gl.js — WebGL2 plumbing: the context, the two shader programs (lit geometry and additive
// glow sprites) and the vertex Batch both are drawn from. All geometry in Sirena Bay is built
// directly in world coordinates, so the only matrices are the camera's view and projection.
//
// Lit vertex layout (interleaved, 10 floats): position xyz, normal xyz, colour rgb, emissive.
// The emissive channel is a small language of its own: 0 = matte, 0..2.2 = self-lit strength
// (windows, neon, lamps, police light bars — scaled at draw time by the time of day), and
// 4 = open water, whose fragment shading animates. The water marker sits far from every lit
// value on purpose: a varying interpolated in software rasterisers loses precision at
// glancing angles, and a marker anywhere near a real emissive value would flip fragments
// across the water branch in a dithered pattern (seen on neon signs at exactly 1.5).

const LIT_VERTEX = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec3 aColor;
attribute float aEmissive;
uniform mat4 uProj;
uniform mat4 uView;
varying vec3 vWorld;
varying vec3 vNorm;
varying vec3 vColor;
varying float vEmissive;
void main() {
  vWorld = aPos;
  vNorm = aNorm;
  vColor = aColor;
  vEmissive = aEmissive;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

const LIT_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNorm;
varying vec3 vColor;
varying float vEmissive;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissiveBoost;
uniform float uTime;
void main() {
  vec3 n = normalize(vNorm);
  vec3 col;
  if (vEmissive > 3.0) {
    // Open water: two moving sine fields plus a sun glitter streak.
    float w1 = sin(vWorld.x * 0.32 + uTime * 1.1) * sin(vWorld.z * 0.27 - uTime * 0.9);
    float w2 = sin(vWorld.x * 0.09 - uTime * 0.35) * sin(vWorld.z * 0.13 + uTime * 0.5);
    vec3 deep = vec3(0.03, 0.23, 0.33);
    vec3 shallow = vec3(0.09, 0.52, 0.6);
    col = mix(deep, shallow, 0.5 + 0.32 * w1 + 0.18 * w2);
    vec3 viewDir = normalize(uCamPos - vWorld);
    vec3 refl = reflect(-uSunDir, vec3(0.0, 1.0, 0.0));
    float glit = pow(max(dot(viewDir, refl), 0.0), 60.0);
    col += uSunColor * glit * 1.4;
    col *= 0.3 + 0.7 * clamp(uSunColor.r * 1.15, 0.0, 1.0); // the sea sleeps at night too
  } else {
    float diff = max(dot(n, uSunDir), 0.0);
    vec3 ambient = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
    col = vColor * (ambient + uSunColor * diff);
    col += vColor * (vEmissive * uEmissiveBoost);
  }
  float fogDepth = length(vWorld - uCamPos);
  float fogF = smoothstep(uFogNear, uFogFar, fogDepth);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
}`;

const GLOW_VERTEX = `
attribute vec3 aPos;
attribute vec2 aCorner;
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  vColor = aColor;
  vAlpha = aAlpha;
  vec3 world = aPos + (uCamRight * aCorner.x + uCamUp * aCorner.y) * aSize;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const GLOW_FRAGMENT = `
precision highp float;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
uniform sampler2D uTex;
void main() {
  float a = texture2D(uTex, vUv).a * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

function linkProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('program: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

/** A growable interleaved vertex buffer drawn as triangles; `dynamic` re-uploads each frame. */
export class Batch {
  constructor(gl, capacityVertices, dynamic) {
    this.gl = gl;
    this.capacity = capacityVertices;
    this.data = new Float32Array(capacityVertices * 10);
    this.count = 0; // vertices written
    this.buffer = gl.createBuffer();
    this.dynamic = dynamic;
  }

  reset() { this.count = 0; }

  /** Append one vertex; returns false (and drops the vertex) when the batch is full. */
  push(x, y, z, nx, ny, nz, r, g, b, emissive) {
    if (this.count >= this.capacity) return false;
    const o = this.count * 10;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = nx; d[o + 4] = ny; d[o + 5] = nz;
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = b;
    d[o + 9] = emissive;
    this.count += 1;
    return true;
  }

  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * 10), this.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  }
}

function bindLitAttribs(gl, program) {
  const stride = 10 * 4;
  const pos = gl.getAttribLocation(program, 'aPos');
  const norm = gl.getAttribLocation(program, 'aNorm');
  const color = gl.getAttribLocation(program, 'aColor');
  const emissive = gl.getAttribLocation(program, 'aEmissive');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(norm);
  gl.vertexAttribPointer(norm, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(color);
  gl.vertexAttribPointer(color, 3, gl.FLOAT, false, stride, 6 * 4);
  gl.enableVertexAttribArray(emissive);
  gl.vertexAttribPointer(emissive, 1, gl.FLOAT, false, stride, 9 * 4);
}

function bindGlowAttribs(gl, program) {
  const stride = 10 * 4;
  const fields = [['aPos', 3, 0], ['aCorner', 2, 3], ['aColor', 3, 5], ['aSize', 1, 8], ['aAlpha', 1, 9]];
  for (const [name, size, offset] of fields) {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
  }
}

/** Creates the context and both programs; throws a readable error when WebGL2 is missing. */
export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const lit = linkProgram(gl, LIT_VERTEX, LIT_FRAGMENT);
  const glow = linkProgram(gl, GLOW_VERTEX, GLOW_FRAGMENT);
  const litU = {};
  for (const name of ['uProj', 'uView', 'uSunDir', 'uSunColor', 'uSkyAmbient', 'uGroundAmbient', 'uCamPos', 'uFogColor', 'uFogNear', 'uFogFar', 'uEmissiveBoost', 'uTime']) {
    litU[name] = gl.getUniformLocation(lit, name);
  }
  const glowU = {};
  for (const name of ['uProj', 'uView', 'uCamRight', 'uCamUp', 'uTex']) {
    glowU[name] = gl.getUniformLocation(glow, name);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return { gl, lit, glow, litU, glowU, bindLitAttribs, bindGlowAttribs };
}

/** Draws a lit batch with the scene's current lighting uniforms (set by the renderer). */
export function drawBatch(ctx, batch) {
  const gl = ctx.gl;
  gl.useProgram(ctx.lit);
  gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
  bindLitAttribs(gl, ctx.lit);
  gl.drawArrays(gl.TRIANGLES, 0, batch.count);
}

/** Draws the glow batch additively, depth-tested but not depth-writing. */
export function drawGlowBatch(ctx, batch, texture) {
  const gl = ctx.gl;
  gl.useProgram(ctx.glow);
  gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
  bindGlowAttribs(gl, ctx.glow);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(ctx.glowU.uTex, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES, 0, batch.count);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}
