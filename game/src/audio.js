// audio.js — every sound in Sirena Bay is synthesised with WebAudio; there are no audio
// files. One master chain, a noise buffer, and small voices for gunfire, melee, impacts, the
// cash register, the phone, mission stings, plus two continuous voices (the car engine and
// the nearest police siren) whose pitch and volume the world drives each frame. The context
// stays locked until the first key or click, as browsers require; every call is safe before
// that and simply does nothing.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOscA = null;
    this.sirenOscB = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
  }

  /** Creates the context on the first user gesture; safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      this.startEngine();
      this.startSiren();
    } catch { this.ctx = null; }
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** A filtered noise burst — the base of gunshots, hits and crashes. */
  noiseBurst({ dur = 0.15, freq = 1200, q = 0.8, gain = 0.5, type = 'lowpass', sweepTo = null }) {
    if (!this.ctx) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** A short oscillator blip with a pitch envelope — UI, register, phone, stings. */
  blip({ freq = 660, endFreq = null, dur = 0.12, gain = 0.2, type = 'sine', delay = 0 }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  shot(kind) {
    if (kind === 'smg') {
      this.noiseBurst({ dur: 0.09, freq: 2600, gain: 0.32, sweepTo: 500 });
      this.blip({ freq: 190, endFreq: 60, dur: 0.07, gain: 0.18, type: 'square' });
    } else if (kind === 'heli') {
      this.noiseBurst({ dur: 0.1, freq: 1800, gain: 0.2, sweepTo: 400 });
    } else {
      this.noiseBurst({ dur: 0.16, freq: 2000, gain: 0.5, sweepTo: 300 });
      this.blip({ freq: 150, endFreq: 45, dur: 0.12, gain: 0.3, type: 'square' });
    }
  }

  dryFire() { this.blip({ freq: 1400, dur: 0.04, gain: 0.08, type: 'square' }); }
  melee() { this.noiseBurst({ dur: 0.08, freq: 900, gain: 0.22, type: 'bandpass' }); }
  hitFlesh() { this.noiseBurst({ dur: 0.1, freq: 500, gain: 0.3, sweepTo: 150 }); }
  hitMetal() { this.blip({ freq: 2200, endFreq: 900, dur: 0.09, gain: 0.14, type: 'triangle' }); this.noiseBurst({ dur: 0.06, freq: 3000, gain: 0.12, type: 'highpass' }); }

  collision(strength) {
    const s = Math.min(1, strength);
    this.noiseBurst({ dur: 0.22, freq: 700, gain: 0.15 + 0.5 * s, sweepTo: 90 });
    this.blip({ freq: 110, endFreq: 40, dur: 0.2, gain: 0.25 * s, type: 'sine' });
  }

  cash() {
    this.blip({ freq: 1240, dur: 0.09, gain: 0.16, type: 'square' });
    this.blip({ freq: 1860, dur: 0.16, gain: 0.16, type: 'square', delay: 0.08 });
  }

  phone() {
    for (let i = 0; i < 2; i += 1) {
      this.blip({ freq: 1050, dur: 0.14, gain: 0.1, type: 'sine', delay: i * 0.36 });
      this.blip({ freq: 1320, dur: 0.14, gain: 0.1, type: 'sine', delay: i * 0.36 + 0.16 });
    }
  }

  sting(good) {
    const notes = good ? [523, 659, 784, 1046] : [392, 370, 349, 311];
    notes.forEach((freq, i) => this.blip({ freq, dur: 0.22, gain: 0.14, type: 'triangle', delay: i * 0.09 }));
  }

  honk(long = false) {
    this.blip({ freq: 370, dur: long ? 0.4 : 0.16, gain: 0.12, type: 'sawtooth' });
    this.blip({ freq: 466, dur: long ? 0.4 : 0.16, gain: 0.1, type: 'sawtooth' });
  }

  bustedSting() {
    this.blip({ freq: 660, endFreq: 660, dur: 0.16, gain: 0.14, type: 'square' });
    this.blip({ freq: 520, dur: 0.3, gain: 0.14, type: 'square', delay: 0.18 });
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    sub.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    sub.start();
    this.engineSub = sub;
  }

  /** speedRatio 0..1; silent unless the player is driving. */
  engineUpdate(speedRatio, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.now();
    const target = driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    const rpm = 55 + Math.abs(speedRatio) * 165;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(rpm / 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(240 + Math.abs(speedRatio) * 700, t, 0.1);
  }

  startSiren() {
    const ctx = this.ctx;
    this.sirenOscA = ctx.createOscillator();
    this.sirenOscA.type = 'triangle';
    this.sirenOscA.frequency.value = 700;
    this.sirenOscB = ctx.createOscillator();
    this.sirenOscB.type = 'triangle';
    this.sirenOscB.frequency.value = 950;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOscA.connect(mix);
    this.sirenOscB.connect(mix);
    mix.connect(this.sirenGain).connect(this.master);
    this.sirenOscA.start();
    this.sirenOscB.start();
  }

  /** distance to the nearest police unit; silent when none is close or wanted is zero. */
  sirenUpdate(distance, dt) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenPhase += dt * 1.4;
    const on = Math.sin(this.sirenPhase * Math.PI * 2) > 0;
    const t = this.now();
    const vol = distance > 90 ? 0 : (1 - distance / 90) * 0.075;
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.1);
    const freq = on ? 950 : 700;
    this.sirenOscA.frequency.setTargetAtTime(freq, t, 0.03);
    this.sirenOscB.frequency.setTargetAtTime(freq * 1.01, t, 0.03);
  }
}
