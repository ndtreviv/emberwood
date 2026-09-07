/* ============================================================
   audio.js — Web Audio synthesizer.
   Sound effects, three music tracks and forest ambience.
   No external files: every sound is generated.
   ============================================================ */
'use strict';

const Snd = {
  ac: null, master: null, mus: null, sfx: null, amb: null,
  musVol: null, sfxVol: null,
  /* what the player chose in settings, kept even before the audio starts */
  musicVolume: 0.7, sfxVolume: 0.8,
  ready: false, muted: false,
  noiseBuf: null,
  track: null, nextNote: 0, seqStep: 0, timer: null,
  windSrc: null, birdTimer: 0,

  init() {
    if (this.ready || this.failed) return;
    try { this._init(); } catch (e) { this.failed = true; this.ready = false; this.ac = null; }
  },
  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.failed = true; return; }
    this.ac = new AC();
    this.master = this.ac.createGain(); this.master.gain.value = 0.85;
    this.master.connect(this.ac.destination);

    /* gentle limiter keeps the mix from clipping */
    const comp = this.ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.18;
    comp.connect(this.master);
    this.bus = comp;

    /* two stages per bus: the game fades the inner gain, the player sets the outer one */
    this.musVol = this.ac.createGain(); this.musVol.gain.value = this.musicVolume; this.musVol.connect(this.bus);
    this.sfxVol = this.ac.createGain(); this.sfxVol.gain.value = this.sfxVolume; this.sfxVol.connect(this.bus);
    this.mus = this.ac.createGain(); this.mus.gain.value = 0.34; this.mus.connect(this.musVol);
    this.sfx = this.ac.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.sfxVol);
    this.amb = this.ac.createGain(); this.amb.gain.value = 0.0; this.amb.connect(this.sfxVol);

    /* shared reverb-ish delay for music */
    const dl = this.ac.createDelay(1.0); dl.delayTime.value = 0.26;
    const fb = this.ac.createGain(); fb.gain.value = 0.28;
    const lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    dl.connect(lp); lp.connect(fb); fb.connect(dl); dl.connect(this.musVol);
    this.echo = dl;

    /* one second of white noise, reused everywhere */
    const n = this.ac.sampleRate;
    this.noiseBuf = this.ac.createBuffer(1, n, n);
    const dat = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) dat[i] = Math.random() * 2 - 1;

    this.ready = true;
    this.startScheduler();
  },
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
  t() { return this.ac ? this.ac.currentTime : 0; },   /* safe before init, or with no audio support */

  /* ---------- primitives ---------- */
  tone(o) {
    if (!this.ready || this.muted) return;
    const ac = this.ac, t0 = o.t || this.t();
    const osc = ac.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) {
      if (o.exp !== false) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.d || 0.2));
      else osc.frequency.linearRampToValueAtTime(o.f2, t0 + (o.d || 0.2));
    }
    const g = ac.createGain();
    const v = (o.v === undefined ? 0.3 : o.v);
    const at = o.a === undefined ? 0.005 : o.a, d = o.d === undefined ? 0.2 : o.d;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + at);
    if (o.hold) g.gain.setValueAtTime(v, t0 + at + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + (o.hold || 0) + d);
    let node = osc;
    if (o.filt) {
      const bq = ac.createBiquadFilter();
      bq.type = o.filt; bq.frequency.setValueAtTime(o.fc || 1200, t0);
      if (o.fc2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.fc2), t0 + at + d);
      bq.Q.value = o.q || 1;
      node.connect(bq); node = bq;
    }
    node.connect(g);
    g.connect(o.dest || this.sfx);
    if (o.echo) g.connect(this.echo);
    osc.start(t0); osc.stop(t0 + at + (o.hold || 0) + d + 0.05);
    return osc;
  },
  noise(o) {
    if (!this.ready || this.muted) return;
    const ac = this.ac, t0 = o.t || this.t();
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const bq = ac.createBiquadFilter();
    bq.type = o.filt || 'bandpass';
    bq.frequency.setValueAtTime(o.fc || 1000, t0);
    if (o.fc2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.fc2), t0 + (o.d || 0.2));
    bq.Q.value = o.q === undefined ? 1.2 : o.q;
    const g = ac.createGain();
    const v = o.v === undefined ? 0.25 : o.v, at = o.a === undefined ? 0.004 : o.a, d = o.d || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    s.connect(bq); bq.connect(g); g.connect(o.dest || this.sfx);
    s.start(t0); s.stop(t0 + at + d + 0.05);
    return s;
  },

  /* ---------- sound effects ---------- */
  coin() {
    const t = this.t();
    this.tone({ f: 1046, d: 0.06, v: 0.22, type: 'square', t: t });
    this.tone({ f: 1568, d: 0.16, v: 0.20, type: 'square', t: t + 0.055, echo: true });
    this.tone({ f: 2093, d: 0.12, v: 0.07, type: 'triangle', t: t + 0.055 });
  },
  swing() {
    const t = this.t();
    this.noise({ fc: 700, fc2: 3400, d: 0.14, v: 0.20, q: 0.9, t: t });
    this.noise({ fc: 2600, fc2: 500, d: 0.13, v: 0.13, q: 1.6, t: t + 0.03 });
    this.tone({ f: 320, f2: 120, d: 0.09, v: 0.05, type: 'triangle', t: t });
  },
  hitFlesh() {
    const t = this.t();
    this.noise({ fc: 320, fc2: 90, d: 0.16, v: 0.30, q: 0.7, filt: 'lowpass', t: t });
    this.tone({ f: 180, f2: 60, d: 0.12, v: 0.16, type: 'square', t: t });
  },
  parry() {
    const t = this.t();
    this.tone({ f: 2200, f2: 3600, d: 0.09, v: 0.20, type: 'square', t: t });
    this.tone({ f: 3200, f2: 1400, d: 0.22, v: 0.12, type: 'triangle', t: t + 0.02, echo: true });
    this.noise({ fc: 5200, fc2: 1600, d: 0.14, v: 0.16, q: 2.2, filt: 'bandpass', t: t });
  },
  hitHard() {
    const t = this.t();
    this.noise({ fc: 1800, fc2: 400, d: 0.1, v: 0.22, q: 1.0, t: t });
    this.tone({ f: 900, f2: 300, d: 0.08, v: 0.12, type: 'square', t: t });
  },
  jump() {
    const t = this.t();
    this.tone({ f: 300, f2: 720, d: 0.13, v: 0.16, type: 'square', t: t });
    this.tone({ f: 600, f2: 1440, d: 0.09, v: 0.05, type: 'triangle', t: t });
  },
  land() { this.noise({ fc: 260, fc2: 110, d: 0.1, v: 0.16, filt: 'lowpass', q: 0.6 }); },
  step(v) {
    this.noise({ fc: 420 + Math.random() * 260, fc2: 180, d: 0.055, v: (v || 1) * 0.075, q: 0.8, filt: 'lowpass' });
  },
  splash() {
    const t = this.t();
    this.noise({ fc: 900, fc2: 3200, d: 0.22, v: 0.16, q: 0.6, t: t });
    this.noise({ fc: 2400, fc2: 700, d: 0.3, v: 0.09, q: 0.9, t: t + 0.05 });
  },
  dash() {
    const t = this.t();
    this.noise({ fc: 260, fc2: 3000, d: 0.16, v: 0.24, q: 0.8, t: t });
    this.tone({ f: 180, f2: 900, d: 0.16, v: 0.10, type: 'sawtooth', t: t });
    this.tone({ f: 1400, f2: 400, d: 0.2, v: 0.06, type: 'triangle', t: t + 0.04 });
  },
  stroke() {
    const t = this.t();
    this.noise({ fc: 620, fc2: 1700, d: 0.16, v: 0.085, q: 0.7, t: t });
    this.noise({ fc: 1500, fc2: 480, d: 0.20, v: 0.05, q: 0.9, t: t + 0.05 });
  },
  pierce() {
    const t = this.t();
    this.noise({ fc: 2600, fc2: 420, d: 0.26, v: 0.20, q: 1.4, t: t });
    this.tone({ f: 1200, f2: 210, d: 0.24, v: 0.12, type: 'sawtooth', t: t });
    this.tone({ f: 600, f2: 120, d: 0.2, v: 0.07, type: 'square', t: t + 0.03 });
  },
  pierceHit() {
    const t = this.t();
    this.noise({ fc: 400, fc2: 110, d: 0.2, v: 0.32, q: 0.6, filt: 'lowpass', t: t });
    this.tone({ f: 240, f2: 70, d: 0.16, v: 0.18, type: 'square', t: t });
    this.tone({ f: 1568, d: 0.12, v: 0.14, type: 'square', t: t + 0.05, echo: true });
    this.tone({ f: 2093, d: 0.16, v: 0.10, type: 'square', t: t + 0.11, echo: true });
  },
  dashReady() {
    const t = this.t();
    this.tone({ f: 1320, d: 0.05, v: 0.07, type: 'triangle', t: t });
    this.tone({ f: 1980, d: 0.09, v: 0.05, type: 'triangle', t: t + 0.04 });
  },
  hurt() {
    const t = this.t();
    this.tone({ f: 420, f2: 90, d: 0.3, v: 0.26, type: 'sawtooth', t: t });
    this.noise({ fc: 800, fc2: 200, d: 0.2, v: 0.15, t: t });
  },
  die() {
    const t = this.t();
    [523, 440, 349, 261, 174].forEach((f, i) =>
      this.tone({ f: f, d: 0.22, v: 0.2, type: 'square', t: t + i * 0.13, echo: true }));
  },
  enemyDie() {
    const t = this.t();
    this.noise({ fc: 1400, fc2: 180, d: 0.3, v: 0.22, q: 0.7, t: t });
    this.tone({ f: 520, f2: 110, d: 0.26, v: 0.13, type: 'square', t: t });
  },
  bounce() {
    const t = this.t();
    this.tone({ f: 220, f2: 880, d: 0.16, v: 0.20, type: 'sine', t: t });
    this.tone({ f: 440, f2: 1320, d: 0.13, v: 0.10, type: 'triangle', t: t + 0.02 });
    this.noise({ fc: 900, fc2: 2600, d: 0.12, v: 0.08, q: 0.9, t: t });
  },
  hopSoft() { this.tone({ f: 320, f2: 620, d: 0.09, v: 0.07, type: 'sine' }); },
  thunder() {
    const t = this.t();
    this.noise({ fc: 1800, fc2: 60, d: 1.1, v: 0.40, q: 0.4, filt: 'lowpass', t: t });
    this.noise({ fc: 300, fc2: 40, d: 1.6, v: 0.26, q: 0.3, filt: 'lowpass', t: t + 0.06 });
    this.tone({ f: 70, f2: 30, d: 1.2, v: 0.22, type: 'sawtooth', t: t });
  },
  zap() {
    const t = this.t();
    this.noise({ fc: 5200, fc2: 900, d: 0.16, v: 0.20, q: 1.6, filt: 'bandpass', t: t });
    this.tone({ f: 2400, f2: 300, d: 0.14, v: 0.12, type: 'square', t: t });
    this.tone({ f: 1200, f2: 180, d: 0.18, v: 0.07, type: 'sawtooth', t: t + 0.02 });
  },
  spore() {
    const t = this.t();
    this.noise({ fc: 1400, fc2: 380, d: 0.34, v: 0.14, q: 0.6, filt: 'lowpass', t: t });
    this.tone({ f: 380, f2: 140, d: 0.28, v: 0.06, type: 'triangle', t: t });
  },
  bellow() {
    const t = this.t();
    this.tone({ f: 120, f2: 52, d: 1.1, v: 0.28, type: 'sawtooth', filt: 'lowpass', fc: 700, fc2: 160, t: t, echo: true });
    this.noise({ fc: 500, fc2: 110, d: 1.2, v: 0.20, q: 0.4, filt: 'lowpass', t: t });
  },
  click() {
    const t = this.t();
    for (let i = 0; i < 3; i++) this.noise({ fc: 2400, fc2: 900, d: 0.04, v: 0.11, q: 3, filt: 'bandpass', t: t + i * 0.06 });
  },
  gulp() {
    const t = this.t();
    this.tone({ f: 160, f2: 520, d: 0.2, v: 0.14, type: 'sine', t: t });
    this.noise({ fc: 500, fc2: 1600, d: 0.22, v: 0.10, q: 0.7, t: t });
  },
  slam() {
    const t = this.t();
    this.noise({ fc: 900, fc2: 50, d: 0.7, v: 0.38, q: 0.4, filt: 'lowpass', t: t });
    this.tone({ f: 110, f2: 34, d: 0.6, v: 0.26, type: 'sawtooth', t: t });
    this.noise({ fc: 3200, fc2: 800, d: 0.18, v: 0.12, q: 1.2, t: t });
  },
  screech() {
    const t = this.t();
    this.tone({ f: 2400, f2: 1500, d: 0.12, v: 0.09, type: 'sawtooth', t: t });
    this.tone({ f: 3100, f2: 1900, d: 0.10, v: 0.06, type: 'square', t: t + 0.06 });
  },
  wings() {
    const t = this.t();
    this.noise({ fc: 700, fc2: 2400, d: 0.18, v: 0.14, q: 0.8, t: t });
    this.tone({ f: 480, f2: 980, d: 0.16, v: 0.10, type: 'triangle', t: t });
    this.noise({ fc: 1800, fc2: 600, d: 0.22, v: 0.07, q: 1.1, t: t + 0.06 });
  },
  unlock() {
    const t = this.t();
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
      this.tone({ f: f, d: 0.42, v: 0.16, type: 'triangle', t: t + i * 0.12, echo: true }));
    this.noise({ fc: 3000, fc2: 400, d: 0.9, v: 0.10, q: 0.6, t: t });
    this.tone({ f: 130, f2: 65, d: 1.1, v: 0.16, type: 'sawtooth', t: t });
  },
  comboUp() {
    const t = this.t();
    [880, 1174, 1568].forEach((f, i) => this.tone({ f: f, d: 0.1, v: 0.08, type: 'square', t: t + i * 0.05, echo: true }));
  },
  spider() {
    const t = this.t();
    for (let i = 0; i < 4; i++)
      this.noise({ fc: 3200 + Math.random() * 2200, d: 0.035, v: 0.06, q: 2.4,
                   filt: 'bandpass', t: t + i * 0.045 });
  },
  snakeHiss() { this.noise({ fc: 4200, fc2: 2600, d: 0.42, v: 0.10, q: 0.6, filt: 'highpass' }); },
  bearRoar() {
    const t = this.t();
    this.tone({ f: 150, f2: 70, d: 0.55, v: 0.24, type: 'sawtooth', filt: 'lowpass', fc: 700, fc2: 260, t: t });
    this.noise({ fc: 300, fc2: 120, d: 0.6, v: 0.16, q: 0.5, filt: 'lowpass', t: t });
  },
  dragonRoar() {
    const t = this.t();
    this.tone({ f: 110, f2: 46, d: 1.3, v: 0.30, type: 'sawtooth', filt: 'lowpass', fc: 900, fc2: 180, t: t, echo: true });
    this.tone({ f: 164, f2: 68, d: 1.2, v: 0.16, type: 'square', filt: 'lowpass', fc: 600, fc2: 150, t: t + 0.05 });
    this.noise({ fc: 420, fc2: 90, d: 1.4, v: 0.22, q: 0.4, filt: 'lowpass', t: t });
  },
  fire() { this.noise({ fc: 620, fc2: 2200, d: 0.5, v: 0.15, q: 0.5, filt: 'lowpass' }); },
  fireball() {
    const t = this.t();
    this.noise({ fc: 900, fc2: 300, d: 0.3, v: 0.14, q: 0.7, t: t });
    this.tone({ f: 260, f2: 90, d: 0.28, v: 0.10, type: 'sawtooth', t: t });
  },
  boom() {
    const t = this.t();
    this.noise({ fc: 700, fc2: 60, d: 0.75, v: 0.4, q: 0.4, filt: 'lowpass', t: t });
    this.tone({ f: 90, f2: 35, d: 0.7, v: 0.26, type: 'sawtooth', t: t });
  },
  ui() { this.tone({ f: 880, d: 0.07, v: 0.13, type: 'square' }); },
  /* the sliders. The blip is pitched to where the handle sits, so you hear the
     value climb and fall under your finger. A volume slider sends its blip
     through the very bus it sets, so you also hear how loud that bus will be. */
  sliderBus(which) { return which === 'music' ? this.musVol : this.sfx; },
  sliderTick(v, which) {
    const f = 300 + clamp(v, 0, 1) * 900, dest = this.sliderBus(which);
    this.tone({ f: f, d: 0.05, v: 0.09, a: 0.002, type: 'square', dest: dest });
    this.tone({ f: f * 2, d: 0.035, v: 0.03, a: 0.002, type: 'triangle', dest: dest });
  },
  /* letting go rings a small two note chime off the value you settled on */
  sliderSet(v, which) {
    const t = this.t(), f = 300 + clamp(v, 0, 1) * 900, dest = this.sliderBus(which);
    this.tone({ f: f, d: 0.09, v: 0.10, type: 'square', t: t, dest: dest, echo: true });
    this.tone({ f: f * 1.5, d: 0.16, v: 0.08, type: 'triangle', t: t + 0.055, dest: dest, echo: true });
  },
  uiBad() { this.tone({ f: 220, f2: 150, d: 0.16, v: 0.16, type: 'square' }); },
  buy() {
    const t = this.t();
    [659, 880, 1318].forEach((f, i) => this.tone({ f: f, d: 0.16, v: 0.16, type: 'square', t: t + i * 0.07, echo: true }));
  },
  door() {
    const t = this.t();
    this.noise({ fc: 200, fc2: 700, d: 0.5, v: 0.16, q: 0.5, filt: 'lowpass', t: t });
    this.tone({ f: 120, f2: 200, d: 0.45, v: 0.08, type: 'triangle', t: t });
  },
  keyGet() {
    const t = this.t();
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ f: f, d: 0.3, v: 0.18, type: 'triangle', t: t + i * 0.09, echo: true }));
  },
  charge() {
    const t = this.t();
    this.tone({ f: 200, f2: 1600, d: 1.0, v: 0.10, type: 'sawtooth', filt: 'lowpass', fc: 400, fc2: 4000, t: t });
  },
  explode() {
    const t = this.t();
    this.noise({ fc: 1200, fc2: 40, d: 1.1, v: 0.45, q: 0.4, filt: 'lowpass', t: t });
    this.tone({ f: 160, f2: 28, d: 0.9, v: 0.3, type: 'sawtooth', t: t });
    this.tone({ f: 1200, f2: 100, d: 0.5, v: 0.12, type: 'square', t: t });
  },

  /* ---------- ambience ---------- */
  startAmbience() {
    if (!this.ready || this.windSrc) return;
    const ac = this.ac;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.4;
    const g = ac.createGain(); g.gain.value = 0.5;
    /* slow gusts */
    const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lg = ac.createGain(); lg.gain.value = 0.34;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = ac.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.021;
    const lg2 = ac.createGain(); lg2.gain.value = 220;
    lfo2.connect(lg2); lg2.connect(lp.frequency);
    s.connect(lp); lp.connect(g); g.connect(this.amb);
    s.start(); lfo.start(); lfo2.start();
    this.windSrc = s;
  },
  ambienceLevel(v, time) {
    if (!this.ready) return;
    this.amb.gain.cancelScheduledValues(this.t());
    this.amb.gain.setValueAtTime(this.amb.gain.value, this.t());
    this.amb.gain.linearRampToValueAtTime(v, this.t() + (time || 1.2));
  },
  bird() {
    if (!this.ready || this.muted) return;
    const t = this.t();
    const base = 1500 + Math.random() * 1400;
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const f = base * (1 + (Math.random() - 0.4) * 0.25);
      this.tone({ f: f, f2: f * (1.3 + Math.random() * 0.5), d: 0.05 + Math.random() * 0.05,
                  v: 0.045, type: 'sine', t: t + i * (0.07 + Math.random() * 0.05), echo: true });
    }
  },
  drip() {
    const t = this.t();
    const f = 900 + Math.random() * 700;
    this.tone({ f: f, f2: f * 0.45, d: 0.22, v: 0.07, type: 'sine', t: t, echo: true });
  },

  /* ---------- music ---------- */
  MUSIC: {
    title: {
      bpm: 74, swing: 0,
      /* dreamy, calm; scale is D major pentatonic-ish */
      chords: [[293.66, 440.00, 587.33], [246.94, 392.00, 493.88],
               [329.63, 493.88, 659.25], [220.00, 329.63, 440.00]],
      lead: [587.33, 659.25, 880.00, 987.77, 880.00, 659.25, 587.33, 493.88,
             440.00, 493.88, 587.33, 659.25, 880.00, 659.25, 587.33, 493.88],
      padGain: 0.10, leadGain: 0.085, bassGain: 0.10, drums: false, leadType: 'triangle'
    },
    forest: {
      bpm: 108,
      chords: [[329.63, 415.30, 493.88], [293.66, 349.23, 440.00],
               [261.63, 329.63, 392.00], [246.94, 329.63, 415.30]],
      lead: [659.25, 830.61, 987.77, 830.61, 880.00, 659.25, 587.33, 659.25,
             523.25, 659.25, 783.99, 659.25, 493.88, 587.33, 659.25, 830.61],
      padGain: 0.075, leadGain: 0.075, bassGain: 0.11, drums: true, leadType: 'square'
    },
    cave: {
      bpm: 86,
      chords: [[220.00, 261.63, 329.63], [196.00, 233.08, 293.66],
               [174.61, 220.00, 261.63], [164.81, 207.65, 246.94]],
      lead: [523.25, 0, 466.16, 0, 392.00, 0, 349.23, 0,
             392.00, 0, 466.16, 0, 523.25, 0, 587.33, 0],
      padGain: 0.10, leadGain: 0.06, bassGain: 0.12, drums: false, leadType: 'triangle'
    },
    boss: {
      bpm: 152,
      chords: [[164.81, 196.00, 246.94], [155.56, 185.00, 233.08],
               [174.61, 207.65, 261.63], [146.83, 174.61, 220.00]],
      lead: [659.25, 659.25, 783.99, 659.25, 622.25, 659.25, 830.61, 659.25,
             587.33, 587.33, 698.46, 587.33, 523.25, 587.33, 698.46, 783.99],
      padGain: 0.07, leadGain: 0.11, bassGain: 0.15, drums: true, leadType: 'sawtooth'
    },
    sky: {
      bpm: 96,
      chords: [[349.23, 440.00, 523.25], [392.00, 493.88, 587.33],
               [329.63, 415.30, 493.88], [293.66, 369.99, 440.00]],
      lead: [880.00, 1046.50, 1174.66, 1046.50, 987.77, 880.00, 783.99, 880.00,
             1046.50, 987.77, 880.00, 783.99, 698.46, 783.99, 880.00, 987.77],
      padGain: 0.11, leadGain: 0.075, bassGain: 0.09, drums: false, leadType: 'triangle'
    },
    spore: {
      bpm: 92,
      chords: [[233.08, 277.18, 349.23], [220.00, 261.63, 329.63],
               [246.94, 311.13, 369.99], [196.00, 246.94, 311.13]],
      lead: [466.16, 0, 554.37, 0, 622.25, 554.37, 466.16, 0,
             415.30, 0, 466.16, 0, 554.37, 0, 415.30, 369.99],
      padGain: 0.10, leadGain: 0.08, bassGain: 0.12, drums: true, leadType: 'triangle'
    },
    victory: {
      bpm: 96,
      chords: [[261.63, 329.63, 392.00], [349.23, 440.00, 523.25],
               [392.00, 493.88, 587.33], [523.25, 659.25, 783.99]],
      lead: [523.25, 659.25, 783.99, 1046.50, 987.77, 783.99, 880.00, 1046.50,
             1174.66, 1046.50, 880.00, 783.99, 659.25, 783.99, 1046.50, 1318.51],
      padGain: 0.10, leadGain: 0.10, bassGain: 0.10, drums: true, leadType: 'square'
    }
  },

  play(name) {
    if (!this.ready) { this.pending = name; return; }
    if (this.trackName === name) return;
    this.trackName = name;
    this.track = this.MUSIC[name] || null;
    this.seqStep = 0;
    this.nextNote = this.t() + 0.1;
  },
  stop() { this.trackName = null; this.track = null; },

  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => this.schedule(), 25);
  },
  schedule() {
    if (!this.ready || !this.track || this.muted) return;
    const tr = this.track;
    const spb = 60 / tr.bpm / 2;            /* eighth notes */
    while (this.nextNote < this.t() + 0.35) {
      this.emitStep(this.seqStep, this.nextNote, tr, spb);
      this.seqStep++;
      this.nextNote += spb;
    }
  },
  emitStep(s, t, tr, spb) {
    const bar = (s >> 3) % tr.chords.length;
    const ch = tr.chords[bar];
    const beat = s % 8;

    /* pad: soft sustained chord at the start of each bar */
    if (beat === 0) {
      for (let i = 0; i < ch.length; i++) {
        this.tone({ f: ch[i] / 2, d: spb * 7.2, a: spb * 1.6, v: tr.padGain * (i === 0 ? 1 : 0.7),
                    type: 'triangle', filt: 'lowpass', fc: 1400, t: t, dest: this.mus });
      }
    }
    /* bass */
    if (beat === 0 || beat === 3 || beat === 6) {
      this.tone({ f: ch[0] / 2, d: spb * 1.6, v: tr.bassGain, type: 'triangle',
                  filt: 'lowpass', fc: 700, t: t, dest: this.mus });
    }
    /* lead */
    const n = tr.lead[s % tr.lead.length];
    if (n) {
      this.tone({ f: n, d: spb * 1.5, a: 0.01, v: tr.leadGain, type: tr.leadType,
                  filt: 'lowpass', fc: 3000, t: t, dest: this.mus, echo: true });
    }
    /* drums */
    if (tr.drums) {
      if (beat === 0 || beat === 4) this.tone({ f: 120, f2: 46, d: 0.14, v: 0.20, type: 'sine', t: t, dest: this.mus });
      if (beat === 2 || beat === 6) this.noise({ fc: 1900, fc2: 900, d: 0.11, v: 0.11, q: 0.8, t: t, dest: this.mus });
      if (beat % 2 === 1) this.noise({ fc: 7000, d: 0.03, v: 0.04, q: 1.5, filt: 'highpass', t: t, dest: this.mus });
    }
  },

  musicLevel(v, time) {
    if (!this.ready) return;
    this.mus.gain.cancelScheduledValues(this.t());
    this.mus.gain.setValueAtTime(this.mus.gain.value, this.t());
    this.mus.gain.linearRampToValueAtTime(v, this.t() + (time || 0.8));
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  },
  /* the two sliders in settings, each 0 to 1 */
  setMusicVolume(v) {
    this.musicVolume = clamp(v, 0, 1);
    if (this.musVol) this.musVol.gain.value = this.musicVolume;
  },
  setSfxVolume(v) {
    this.sfxVolume = clamp(v, 0, 1);
    if (this.sfxVol) this.sfxVol.gain.value = this.sfxVolume;
  }
};
