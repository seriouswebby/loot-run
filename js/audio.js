'use strict';
/* Loot Run — synthesized audio. Everything is generated with WebAudio (no sound files):
   a master bus with compression + reverb, positional one-shot effects (pan + distance falloff),
   looping sirens / engine / helicopter rotor, city and forest ambience, and adaptive chase music. */

const Sfx = {
  ctx: null, ready: false, muted: false,
  L: { x: 0, z: 0, rx: 1, rz: 0 },
  init(ctxOverride) {
    if (this.ctx && !ctxOverride) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let c = ctxOverride;
    if (!c) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { c = new AC(); } catch (e) { return; }
    }
    this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    const warm = c.createBiquadFilter(); warm.type = 'highshelf'; warm.frequency.value = 7000; warm.gain.value = -5;
    this.master.connect(warm); warm.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    // shared reverb (synthetic impulse = decaying stereo noise)
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.3, 3);
    this.verbIn = c.createGain();
    const vOut = c.createGain(); vOut.gain.value = 0.3;
    const vLow = c.createBiquadFilter(); vLow.type = 'lowpass'; vLow.frequency.value = 4500;
    this.verbIn.connect(vLow); vLow.connect(this.verb); this.verb.connect(vOut); vOut.connect(this.master);
    this.musicSend = c.createGain(); this.musicSend.gain.value = 0.18; this.music.connect(this.musicSend); this.musicSend.connect(this.verbIn);
    this.white = this.makeNoise('white', 2.5); this.brown = this.makeNoise('brown', 4); this.pink = this.makeNoise('pink', 3);
    this.buildLoops();
    this.mus = { on: false, step: 0, next: 0, heat: 1 };
    this.birdT = 2;
    this.ready = true;
  },
  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  },
  makeNoise(kind, sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    }
    return b;
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05); },

  /* ---------- building blocks ---------- */
  place(x, z, range) {
    if (x == null) return { g: 1, pan: 0, d: 0 };
    const L = this.L, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    return { g: Math.pow(clamp(1 - d / (range || 90), 0, 1), 1.6), pan: clamp((dx * L.rx + dz * L.rz) / 28, -0.85, 0.85), d };
  },
  out(x, z, vol, verb, range) {
    if (!this.ready) return null;
    const p = this.place(x, z, range); if (p.g < 0.01) return null;
    const c = this.ctx, g = c.createGain(); g.gain.value = vol * p.g;
    let node = g;
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = p.pan; g.connect(pn); node = pn; }
    node.connect(this.sfx);
    const send = (verb || 0) + Math.min(0.35, p.d / 180);
    if (send > 0.01) { const s = c.createGain(); s.gain.value = send; node.connect(s); s.connect(this.verbIn); }
    return g;
  },
  env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  },
  filt(dest, type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; b.connect(dest); return b; },
  nz(dest, t, type, freq, q, peak, decay, sweepTo, buf, rate) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = buf || this.white; src.playbackRate.value = rate || 1;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    const g = c.createGain(); this.env(g.gain, t, peak, 0.002, decay);
    src.connect(f); f.connect(g); g.connect(dest);
    const len = src.buffer.duration;
    src.start(t, Math.random() * Math.max(0, len - decay - 0.2)); src.stop(t + decay + 0.1);
  },
  osc(dest, t, type, f0, f1, peak, attack, decay, glide) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || attack + decay));
    const g = c.createGain(); this.env(g.gain, t, peak, attack, decay);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + attack + decay + 0.05);
    return o;
  },
  now() { return this.ctx.currentTime; },

  /* ---------- one-shot effects (x, z optional = positional) ---------- */
  shot(kind, x, z) {
    const o = this.out(x, z, kind === 'shotgun' ? 1 : kind === 'smg' ? 0.5 : 0.7, 0.3, 150); if (!o) return;
    const t = this.now(), r = 0.92 + Math.random() * 0.16;
    if (kind === 'shotgun') {
      this.nz(o, t, 'highpass', 2600, 0.7, 0.9, 0.05, null, null, r);
      this.nz(o, t, 'lowpass', 2600, 0.6, 1.0, 0.45, 280, null, r);
      this.osc(o, t, 'sine', 120, 36, 1.0, 0.002, 0.3);
    } else if (kind === 'smg') {
      this.nz(o, t, 'highpass', 3200, 0.7, 0.7, 0.025, null, null, r);
      this.nz(o, t, 'bandpass', 1800 * r, 0.9, 0.8, 0.07, 700);
      this.osc(o, t, 'sine', 180, 60, 0.45, 0.001, 0.06);
    } else {
      this.nz(o, t, 'highpass', 2900, 0.7, 0.85, 0.03, null, null, r);
      this.nz(o, t, 'bandpass', 1300 * r, 0.8, 0.9, 0.16, 450);
      this.osc(o, t, 'sine', 155, 46, 0.65, 0.001, 0.13);
    }
  },
  heliGun(x, z) {
    const o = this.out(x, z, 0.55, 0.45, 170); if (!o) return;
    const t = this.now();
    this.nz(o, t, 'highpass', 2400, 0.7, 0.6, 0.03);
    this.nz(o, t, 'bandpass', 950, 0.8, 0.8, 0.11, 380);
    this.osc(o, t, 'sine', 120, 45, 0.5, 0.001, 0.09);
  },
  impact(x, z) { const o = this.out(x, z, 0.25, 0.05, 50); if (!o) return; this.nz(o, this.now(), 'bandpass', 2600 + Math.random() * 1500, 2, 0.6, 0.05); },
  punch(x, z) {
    const o = this.out(x, z, 0.8, 0.04, 60); if (!o) return;
    const t = this.now(), r = 0.9 + Math.random() * 0.2;
    this.osc(o, t, 'sine', 175 * r, 50, 0.9, 0.002, 0.13);
    this.nz(o, t, 'lowpass', 1500, 0.7, 0.55, 0.06);
    this.nz(o, t, 'highpass', 3600, 0.7, 0.22, 0.015);
  },
  whoosh(x, z) { const o = this.out(x, z, 0.3, 0, 40); if (!o) return; this.nz(o, this.now(), 'bandpass', 450, 1.3, 0.7, 0.16, 2200); },
  hurt(x, z, player) {
    const o = this.out(x, z, player ? 0.45 : 0.3, 0.05, 50); if (!o) return;
    const t = this.now(), f0 = player ? 185 : 150 + Math.random() * 130;
    const a = this.filt(o, 'bandpass', 720, 5), b = this.filt(o, 'bandpass', 1180, 6);
    for (const dt of [0, 0.004]) {
      const s = this.ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(f0 * (1 + dt * 3), t); s.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + 0.2);
      const g = this.ctx.createGain(); this.env(g.gain, t, 0.9, 0.012, 0.2);
      s.connect(g); g.connect(a); g.connect(b); s.start(t); s.stop(t + 0.3);
    }
  },
  cash() {
    const o = this.out(null, null, 0.42, 0.3); if (!o) return;
    const t = this.now();
    [[1318.5, 0], [1975.5, 0.07]].forEach(([f, d]) => {
      this.osc(o, t + d, 'triangle', f, null, 0.55, 0.003, 0.4);
      this.osc(o, t + d, 'sine', f * 2.76, null, 0.12, 0.002, 0.2);
      this.osc(o, t + d, 'sine', f * 5.4, null, 0.04, 0.002, 0.1);
    });
  },
  buy() {
    const o = this.out(null, null, 0.45, 0.25); if (!o) return;
    const t = this.now();
    this.nz(o, t, 'bandpass', 2400, 9, 0.5, 0.35);
    [880, 1108.7, 1318.5].forEach((f, i) => this.osc(o, t + 0.06 + i * 0.06, 'triangle', f, null, 0.4, 0.003, 0.25));
  },
  error() { const o = this.out(null, null, 0.3, 0); if (!o) return; const t = this.now(); this.osc(o, t, 'triangle', 233, null, 0.6, 0.005, 0.1); this.osc(o, t + 0.11, 'triangle', 185, null, 0.6, 0.005, 0.16); },
  click() { const o = this.out(null, null, 0.18, 0); if (!o) return; this.osc(o, this.now(), 'sine', 1900, 1300, 0.6, 0.001, 0.04); },
  tick() { const o = this.out(null, null, 0.1, 0); if (!o) return; this.osc(o, this.now(), 'square', 1050, null, 0.4, 0.001, 0.03); },
  explode(x, z) {
    const o = this.out(x, z, 1.25, 0.55, 240); if (!o) return;
    const t = this.now();
    this.osc(o, t, 'sine', 85, 24, 1.0, 0.004, 1.5);
    this.nz(o, t, 'lowpass', 3200, 0.5, 1.0, 1.6, 70, this.brown);
    this.nz(o, t, 'lowpass', 5000, 0.5, 0.6, 0.5, 300);
    for (let i = 0; i < 10; i++) this.nz(o, t + 0.05 + Math.random() * 0.8, 'highpass', 1800 + Math.random() * 3000, 0.7, 0.12 + Math.random() * 0.2, 0.03);
  },
  crash(power, x, z) {
    const o = this.out(x, z, clamp(power, 0.25, 1), 0.2, 90); if (!o) return;
    const t = this.now();
    this.nz(o, t, 'bandpass', 850, 0.8, 0.9, 0.24);
    this.osc(o, t, 'sine', 95, 40, 0.8, 0.002, 0.2);
    for (const f of [310, 487, 731, 1063, 1460]) this.osc(o, t, 'triangle', f * (0.95 + Math.random() * 0.1), null, 0.12, 0.002, 0.25 + Math.random() * 0.4);
  },
  glass(x, z) {
    const o = this.out(x, z, 0.5, 0.2, 70); if (!o) return;
    const t = this.now();
    this.nz(o, t, 'highpass', 3600, 0.7, 0.7, 0.2);
    for (let i = 0; i < 8; i++) this.osc(o, t + Math.random() * 0.28, 'sine', 2600 + Math.random() * 4200, null, 0.1, 0.001, 0.07 + Math.random() * 0.08);
  },
  pop(x, z) { const o = this.out(x, z, 0.8, 0.2, 90); if (!o) return; const t = this.now(); this.nz(o, t, 'lowpass', 650, 0.7, 1, 0.13); this.nz(o, t + 0.02, 'highpass', 3600, 0.7, 0.25, 0.9); },
  alarm(x, z) {
    const o = this.out(x, z, 0.3, 0.2, 110); if (!o) return;
    const t = this.now();
    for (let i = 0; i < 7; i++) { this.osc(o, t + i * 0.085, 'triangle', 1040, null, 0.7, 0.002, 0.07); this.osc(o, t + i * 0.085, 'square', 2080, null, 0.06, 0.002, 0.05); }
  },
  honk(x, z) {
    const o = this.out(x, z, 0.32, 0.15, 70); if (!o) return;
    const t = this.now(), lp = this.filt(o, 'lowpass', 1700, 1);
    for (const f of [370, 466]) {
      const s = this.ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.setValueAtTime(0.5, t + 0.26); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      s.connect(g); g.connect(lp); s.start(t); s.stop(t + 0.35);
    }
  },
  smoke(x, z) { const o = this.out(x, z, 0.5, 0.2, 60); if (!o) return; const t = this.now(); this.nz(o, t, 'lowpass', 300, 0.7, 0.8, 0.12); this.nz(o, t, 'bandpass', 900, 0.5, 0.6, 1.4, 260); },
  land(x, z) { const o = this.out(x, z, 0.35, 0, 40); if (!o) return; const t = this.now(); this.osc(o, t, 'sine', 120, 55, 0.6, 0.002, 0.08); this.nz(o, t, 'lowpass', 900, 0.7, 0.3, 0.05); },
  jump(x, z) { const o = this.out(x, z, 0.25, 0, 40); if (!o) return; this.nz(o, this.now(), 'bandpass', 700, 1.2, 0.5, 0.1, 1600); },
  thunder() {
    const o = this.out(null, null, 0.9, 0.6); if (!o) return;
    const t = this.now();
    this.nz(o, t, 'lowpass', 900, 0.5, 0.9, 0.25, 200);
    this.nz(o, t + 0.05, 'lowpass', 260, 0.6, 1.0, 2.6, 60, this.brown);
    this.osc(o, t, 'sine', 60, 30, 0.6, 0.02, 2.2);
  },
  chirp(x, z) {
    const o = this.out(x, z, 0.07, 0.3, 70); if (!o) return;
    const t = this.now(), base = 2600 + Math.random() * 1600, n = randi(2, 5);
    for (let i = 0; i < n; i++) this.osc(o, t + i * 0.09, 'sine', base, base * (1.25 + Math.random() * 0.3), 0.8, 0.005, 0.06, 0.05);
  },
  sting(kind) {
    const o = this.out(null, null, 0.4, 0.35); if (!o) return;
    const t = this.now(), N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (kind === 'heat') {
      const lp = this.filt(o, 'lowpass', 900, 1);
      for (const m of [45, 52, 57]) this.osc(lp, t, 'sawtooth', N(m), null, 0.35, 0.01, 0.55);
      this.osc(o, t, 'sine', 110, 50, 0.8, 0.002, 0.25);
    } else if (kind === 'lost') {
      [72, 76, 79, 84].forEach((m, i) => this.osc(o, t + i * 0.08, 'triangle', N(m), null, 0.35, 0.01, 0.6));
    } else if (kind === 'done') {
      [72, 76, 79, 84, 88].forEach((m, i) => { this.osc(o, t + i * 0.09, 'triangle', N(m), null, 0.4, 0.005, 0.5); this.osc(o, t + i * 0.09, 'sine', N(m) * 2, null, 0.08, 0.005, 0.3); });
    } else if (kind === 'fail') {
      [64, 60, 57].forEach((m, i) => this.osc(o, t + i * 0.16, 'triangle', N(m), null, 0.4, 0.01, 0.4));
    } else if (kind === 'cuffs') {
      for (const d of [0, 0.16]) { this.nz(o, t + d, 'bandpass', 4200, 12, 0.8, 0.05); this.osc(o, t + d, 'triangle', 2400, null, 0.15, 0.001, 0.08); }
      this.osc(o, t + 0.3, 'triangle', N(57), N(45), 0.4, 0.01, 0.8);
    } else if (kind === 'ko') {
      this.osc(o, t, 'sine', 120, 35, 1, 0.003, 0.4);
      this.osc(o, t + 0.1, 'triangle', N(62), N(50), 0.35, 0.01, 1.0);
    } else if (kind === 'step') {
      this.osc(o, t, 'triangle', N(81), null, 0.3, 0.004, 0.12); this.osc(o, t + 0.09, 'triangle', N(88), null, 0.3, 0.004, 0.2);
    } else if (kind === 'chopper') {
      const lp = this.filt(o, 'lowpass', 1200, 1);
      for (const m of [40, 47, 52]) this.osc(lp, t, 'sawtooth', N(m), null, 0.3, 0.02, 0.9);
    }
  },
  // compatibility helpers used elsewhere
  tone(freq, dur, type, gain) { const o = this.out(null, null, gain || 0.2, 0); if (o) this.osc(o, this.now(), type || 'sine', freq, null, 0.8, 0.003, dur); },
  noise(dur, freq, q, gain, type) { const o = this.out(null, null, gain || 0.3, 0); if (o) this.nz(o, this.now(), type || 'bandpass', freq, q, 0.8, dur); },

  /* ---------- loops ---------- */
  buildLoops() {
    const c = this.ctx;
    const pan = () => (c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    const setPan = (p, v, t) => { if (p.pan) p.pan.setTargetAtTime(v, t, 0.05); };
    this.setPan = setPan;
    // two sirens: one wails, one yelps, so a pack of cruisers sounds like a pack
    this.sirens = [0, 1].map((i) => {
      const o1 = c.createOscillator(); o1.type = 'triangle';
      const o2 = c.createOscillator(); o2.type = 'square';
      const g2 = c.createGain(); g2.gain.value = 0.16;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
      const g = c.createGain(); g.gain.value = 0;
      const p = pan();
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(p); p.connect(this.sfx);
      const s = c.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(this.verbIn);
      o1.start(); o2.start();
      return { o1, o2, f, g, p, ph: i * 1.3 };
    });
    // engine: detuned saw + sub square through a soft clipper and an rpm-driven lowpass, plus road rumble
    const e = { rpm: 900 };
    e.o1 = c.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator(); e.o2.type = 'square';
    e.o3 = c.createOscillator(); e.o3.type = 'sawtooth';
    e.f = c.createBiquadFilter(); e.f.type = 'lowpass'; e.f.frequency.value = 400; e.f.Q.value = 2;
    const shp = c.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    shp.curve = curve;
    const m2 = c.createGain(); m2.gain.value = 0.5;
    e.g = c.createGain(); e.g.gain.value = 0;
    e.o1.connect(e.f); e.o2.connect(m2); m2.connect(e.f); e.o3.connect(e.f); e.f.connect(shp); shp.connect(e.g); e.g.connect(this.sfx);
    e.rum = c.createBufferSource(); e.rum.buffer = this.brown; e.rum.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 180;
    e.rg = c.createGain(); e.rg.gain.value = 0;
    e.rum.connect(rf); rf.connect(e.rg); e.rg.connect(this.sfx);
    e.o1.start(); e.o2.start(); e.o3.start(); e.rum.start();
    this.engine = e;
    // tire screech for handbrake slides and drifts
    const sc = {};
    sc.src = c.createBufferSource(); sc.src.buffer = this.white; sc.src.loop = true;
    sc.f = c.createBiquadFilter(); sc.f.type = 'bandpass'; sc.f.frequency.value = 2300; sc.f.Q.value = 5;
    sc.g = c.createGain(); sc.g.gain.value = 0;
    sc.src.connect(sc.f); sc.f.connect(sc.g); sc.g.connect(this.sfx); sc.src.start();
    this.screech = sc;
    // helicopter: noise chopped by a blade-rate LFO, plus a low throb
    const h = {};
    h.src = c.createBufferSource(); h.src.buffer = this.pink; h.src.loop = true;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 700;
    h.am = c.createGain(); h.am.gain.value = 0.45;
    h.lfo = c.createOscillator(); h.lfo.type = 'sine'; h.lfo.frequency.value = 11.5;
    const depth = c.createGain(); depth.gain.value = 0.45;
    h.lfo.connect(depth); depth.connect(h.am.gain);
    h.thump = c.createOscillator(); h.thump.type = 'sine'; h.thump.frequency.value = 52;
    const tg = c.createGain(); tg.gain.value = 0.8;
    h.whine = c.createOscillator(); h.whine.type = 'sawtooth'; h.whine.frequency.value = 1450;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1450; wf.Q.value = 8;
    const wg = c.createGain(); wg.gain.value = 0.05;
    h.g = c.createGain(); h.g.gain.value = 0; h.p = pan();
    h.src.connect(hf); hf.connect(h.am); h.thump.connect(tg); tg.connect(h.am); h.am.connect(h.g);
    h.whine.connect(wf); wf.connect(wg); wg.connect(h.g);
    h.g.connect(h.p); h.p.connect(this.sfx);
    const hs = c.createGain(); hs.gain.value = 0.25; h.g.connect(hs); hs.connect(this.verbIn);
    h.src.start(); h.lfo.start(); h.thump.start(); h.whine.start();
    this.heli = h;
    // ambience: city hum (brown) and wind (pink, slowly swelling)
    const a = {};
    a.city = c.createBufferSource(); a.city.buffer = this.brown; a.city.loop = true;
    const cf = c.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 320;
    a.cg = c.createGain(); a.cg.gain.value = 0;
    a.city.connect(cf); cf.connect(a.cg); a.cg.connect(this.amb);
    a.wind = c.createBufferSource(); a.wind.buffer = this.pink; a.wind.loop = true;
    a.wf = c.createBiquadFilter(); a.wf.type = 'bandpass'; a.wf.frequency.value = 520; a.wf.Q.value = 0.6;
    a.wg = c.createGain(); a.wg.gain.value = 0;
    a.wind.connect(a.wf); a.wf.connect(a.wg); a.wg.connect(this.amb);
    a.rain = c.createBufferSource(); a.rain.buffer = this.white; a.rain.loop = true;
    const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 900;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 6500;
    a.rg = c.createGain(); a.rg.gain.value = 0;
    a.rain.connect(rh); rh.connect(rl); rl.connect(a.rg); a.rg.connect(this.amb);
    a.city.start(); a.wind.start(); a.rain.start();
    this.ambi = a;
  },

  /* per-frame update: s = { playing, lx, lz, rx, rz, sirens:[{x,z}], engine:{speed, throttle, boost}|null, heli:{x,z}|null, heat, zone } */
  update(dt, s) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    this.L = { x: s.lx, z: s.lz, rx: s.rx, rz: s.rz };
    // sirens
    this.sirens.forEach((sv, i) => {
      const src = s.playing && s.sirens[i];
      let lvl = 0;
      if (src) {
        const p = this.place(src.x, src.z, 170); lvl = p.g;
        this.setPan(sv.p, p.pan, t);
        sv.f.frequency.setTargetAtTime(1400 + p.g * 4500, t, 0.1);
      }
      sv.g.gain.setTargetAtTime(lvl * 0.13, t, 0.12);
      sv.ph += dt;
      let k;
      if (i === 0) { const ph = (sv.ph % 4.4) / 4.4; k = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI / 2) : Math.cos(((ph - 0.42) / 0.58) * Math.PI / 2); }
      else { const ph = (sv.ph % 0.36) / 0.36; k = ph < 0.8 ? ph / 0.8 : 1 - (ph - 0.8) / 0.2; }
      const f = 660 + 800 * k;
      sv.o1.frequency.setTargetAtTime(f, t, 0.015); sv.o2.frequency.setTargetAtTime(f, t, 0.015);
    });
    // engine with gear shifts
    const E = this.engine, en = s.playing && s.engine;
    if (en) {
      const v = Math.abs(en.speed), gears = [0, 9, 17, 25, 33, 42, 70];
      let gi = 0; while (gi < gears.length - 2 && v > gears[gi + 1]) gi++;
      const frac = clamp((v - gears[gi]) / (gears[gi + 1] - gears[gi]), 0, 1);
      const target = 850 + frac * 4400 + (en.throttle > 0 && v < 2 ? 900 : 0) + (en.boost ? 600 : 0);
      E.rpm = damp(E.rpm, target, gi > 0 && target < E.rpm ? 14 : 7, dt);
      const f = E.rpm / 60 * 2 * (en.bike ? 1.8 : 1);
      E.o1.frequency.setTargetAtTime(f, t, 0.03); E.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); E.o3.frequency.setTargetAtTime(f * 1.009, t, 0.03);
      E.f.frequency.setTargetAtTime(200 + E.rpm * 0.28 + (en.throttle > 0 ? 450 : 0), t, 0.05);
      E.g.gain.setTargetAtTime(0.07 + (en.throttle > 0 ? 0.05 : 0) + (en.boost ? 0.04 : 0), t, 0.08);
      E.rg.gain.setTargetAtTime(Math.min(0.5, v / 50) * 0.5, t, 0.2);
    } else { E.g.gain.setTargetAtTime(0, t, 0.12); E.rg.gain.setTargetAtTime(0, t, 0.2); }
    this.screech.g.gain.setTargetAtTime(s.playing ? clamp(s.slip || 0, 0, 1) * 0.16 : 0, t, 0.05);
    this.screech.f.frequency.setTargetAtTime(2000 + Math.random() * 700, t, 0.04);
    // helicopter rotor
    const H = this.heli;
    if (s.playing && s.heli) {
      const p = this.place(s.heli.x, s.heli.z, 230);
      H.g.gain.setTargetAtTime(0.42 * Math.max(p.g, 0.05), t, 0.15);
      this.setPan(H.p, p.pan, t);
    } else H.g.gain.setTargetAtTime(0, t, 0.4);
    // ambience
    const A = this.ambi, z = s.zone;
    const city = !s.playing ? 0.04 : z === 'forest' ? 0.04 : z === 'highway' ? 0.42 : z === 'outskirts' ? 0.14 : 0.24;
    const wind = !s.playing ? 0 : z === 'forest' ? 0.22 : z === 'outskirts' || z === 'highway' ? 0.1 : 0.035;
    A.cg.gain.setTargetAtTime(city, t, 0.8);
    A.rg.gain.setTargetAtTime((s.rain || 0) * 0.16, t, 0.8);
    A.wg.gain.setTargetAtTime(wind * (0.7 + 0.3 * Math.sin(t * 0.37)), t, 0.6);
    A.wf.frequency.setTargetAtTime(420 + 220 * Math.sin(t * 0.21), t, 0.5);
    if (s.playing && z === 'forest') {
      this.birdT -= dt;
      if (this.birdT <= 0) { this.birdT = rand(1.2, 4); const a = rand(0, TAU); this.chirp(s.lx + Math.cos(a) * rand(8, 30), s.lz + Math.sin(a) * rand(8, 30)); }
    }
    // chase music
    this.updateMusic(s.playing ? s.heat : 0, t);
  },
  updateMusic(heat, t) {
    const M = this.mus;
    this.music.gain.setTargetAtTime(heat > 0 ? 0.22 + heat * 0.035 : 0, t, heat > 0 ? 0.5 : 1.6);
    if (heat > 0) { M.heat = heat; if (!M.on) { M.on = true; M.step = 0; M.next = t + 0.05; } }
    if (!M.on) return;
    if (heat === 0 && this.music.gain.value < 0.004) { M.on = false; return; }
    if (M.next < t - 0.25) M.next = t + 0.05;
    const sp = 60 / (104 + M.heat * 9) / 4;
    while (M.next < t + 0.15) { this.musicStep(M.step, M.next, M.heat, sp); M.next += sp; M.step = (M.step + 1) % 32; }
  },
  musicStep(i, t, heat, sp) {
    const M = this.music, s = i % 16, N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (s % 4 === 0 || (heat >= 3 && (s === 10 || s === 14))) this.osc(M, t, 'sine', 150, 42, 0.95, 0.002, 0.22, 0.12);
    if (heat >= 2 && (s === 4 || s === 12)) { this.nz(M, t, 'bandpass', 1900, 0.7, 0.42, 0.14); this.osc(M, t, 'triangle', 200, 150, 0.22, 0.001, 0.08); }
    if (s % 2 === 1 || heat >= 4) this.nz(M, t, 'highpass', 7500, 0.7, s % 2 ? 0.13 : 0.06, s % 4 === 3 ? 0.07 : 0.03);
    const riff = [45, 0, 45, 48, 0, 45, 52, 0, 45, 0, 43, 0, 45, 48, 50, 0, 45, 0, 45, 48, 0, 45, 52, 0, 53, 0, 52, 0, 48, 0, 47, 0];
    const n = riff[i];
    if (n) {
      const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(260 + heat * 140 + 1100, t); f.frequency.exponentialRampToValueAtTime(220 + heat * 90, t + sp * 1.6);
      const g = c.createGain(); this.env(g.gain, t, 0.36, 0.004, sp * 1.9);
      o.connect(f); f.connect(g); g.connect(M); o.start(t); o.stop(t + sp * 2.2);
    }
    if (heat >= 3 && (i === 0 || i === 16 || i === 24)) {
      const lp = this.filt(M, 'lowpass', 1500, 1), chord = i === 24 ? [53, 57, 60] : [57, 60, 64];
      for (const m of chord) this.osc(lp, t, 'square', N(m), null, 0.06, 0.01, 0.42);
    }
    if (heat >= 4 && s % 2 === 0) { const arp = [69, 72, 76, 72, 69, 72, 77, 76]; this.osc(M, t, 'triangle', N(arp[(i / 2) % 8]), null, 0.07, 0.003, 0.09); }
  },
};
