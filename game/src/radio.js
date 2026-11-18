// radio.js — the car radio: four stations, all of them generated live by a step sequencer
// over the shared WebAudio context. Island pop, reggae, synthwave and a salsa montuno — each
// station is a chord loop, a bass pattern and a way of voicing them, scheduled a fraction of
// a second ahead so the beat never stutters. It only sounds while Marco is driving.

function midiHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

export const STATIONS = [
  {
    name: 'Palma 98.1', genre: 'Island Pop', bpm: 104, style: 'pop',
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
    melody: [72, -1, 76, -1, 79, -1, 76, -1, 74, -1, 71, -1, 72, -1, -1, -1],
  },
  {
    name: 'Bajo Reef', genre: 'Reggae', bpm: 74, style: 'reggae',
    chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    melody: [69, -1, -1, 72, -1, -1, 71, -1, 69, -1, -1, -1, -1, -1, -1, -1],
  },
  {
    name: 'Night Circuit', genre: 'Synthwave', bpm: 118, style: 'synth',
    chords: [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55]],
    melody: [74, 77, 81, 77, 74, 77, 81, 84, 74, 77, 81, 77, 76, 74, 72, 74],
  },
  {
    name: 'Radio Bahía', genre: 'Salsa', bpm: 96, style: 'salsa',
    chords: [[53, 57, 60], [53, 57, 60], [48, 52, 55], [46, 50, 53]],
    melody: [77, -1, 81, -1, 79, -1, 77, -1, 76, -1, 74, -1, 72, -1, -1, -1],
  },
];

export class Radio {
  constructor(sound) {
    this.sound = sound;
    this.index = 0;
    this.step = 0;
    this.nextTime = 0;
    this.bus = null;
  }

  get station() { return STATIONS[this.index]; }

  next() {
    this.index = (this.index + 1) % STATIONS.length;
    this.step = 0;
    this.nextTime = 0;
    return this.station;
  }

  ensureBus() {
    const ctx = this.sound.ctx;
    if (!ctx || this.bus) return !!ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.13;
    this.bus.connect(this.sound.master);
    return true;
  }

  tone(midi, time, dur, type, gain, filterFreq) {
    const ctx = this.sound.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiHz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    let node = osc;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      node = filter;
    }
    node.connect(g).connect(this.bus);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  hat(time, gain) {
    const ctx = this.sound.ctx;
    if (!this.sound.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.sound.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(filter).connect(g).connect(this.bus);
    src.start(time);
    src.stop(time + 0.08);
  }

  scheduleStep(step, time) {
    const st = this.station;
    const bar = Math.floor(step / 8) % st.chords.length;
    const chord = st.chords[bar];
    const s8 = step % 8;
    const root = chord[0] - 12;
    if (st.style === 'pop') {
      if (s8 === 0 || s8 === 3 || s8 === 4 || s8 === 6) this.tone(root, time, 0.22, 'triangle', 0.5);
      if (s8 === 0 || s8 === 4) for (const n of chord) this.tone(n, time, 0.3, 'triangle', 0.16, 2400);
      if (s8 % 2 === 1) this.hat(time, 0.05);
      const note = st.melody[step % st.melody.length];
      if (note > 0) this.tone(note, time, 0.2, 'sine', 0.12);
    } else if (st.style === 'reggae') {
      if (s8 === 0 || s8 === 4) this.tone(root, time, 0.4, 'sine', 0.55);
      if (s8 === 2 || s8 === 6) for (const n of chord) this.tone(n, time, 0.09, 'square', 0.07, 1800);
      if (s8 === 4) this.hat(time, 0.04);
    } else if (st.style === 'synth') {
      this.tone(root, time, 0.16, 'sawtooth', 0.3, 900);
      const arpNotes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
      this.tone(arpNotes[s8 % 4], time, 0.14, 'square', 0.09, 3200);
      if (s8 % 2 === 1) this.hat(time, 0.045);
    } else { // salsa montuno
      const montuno = [0, -1, 1, 2, 1, -1, 2, 0];
      if (s8 === 0 || s8 === 3 || s8 === 6) this.tone(root, time, 0.2, 'triangle', 0.5);
      const pick = montuno[s8];
      if (pick >= 0) this.tone(chord[pick] + 12, time, 0.13, 'triangle', 0.16, 3000);
      if (s8 % 2 === 0) this.hat(time, 0.035);
    }
  }

  /** Call every frame; `active` is true only while the player sits in a car. */
  update(active) {
    const ctx = this.sound.ctx;
    if (!active || !ctx || !this.ensureBus()) return;
    const stepDur = 60 / this.station.bpm / 2; // eighth notes
    if (this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
      this.step = 0;
    }
    while (this.nextTime < ctx.currentTime + 0.18) {
      this.scheduleStep(this.step, this.nextTime);
      this.step += 1;
      this.nextTime += stepDur;
    }
  }
}
