'use strict';
/* Voices (rendered with the Kokoro TTS model, see tools/build-voice.py):
   - Vera reads her mission briefings aloud,
   - people and cops shout when things happen around them (positional, with cooldowns so it never turns into a choir),
   - the police radio reports your crimes, where they happened ("Main and Fifth"), and what units are doing about it.
   Clips decode on first use. With no audio (tests, muted, missing data) every call is a harmless no-op, but calls are
   still logged in Voice.log so behaviour can be checked. */

const Voice = {
  bufs: new Map(), loading: new Map(), ctx: null, log: [], cd: 0, radioQ: [], radioBusy: false, dlgSrc: null, dlgKey: null,
  ok() { return typeof VOICE_DATA !== 'undefined' && Sfx.ready && Sfx.ctx; },
  has(key) { return typeof VOICE_DATA !== 'undefined' && !!VOICE_DATA[key]; },
  note(what) { this.log.push({ what, t: G.time }); if (this.log.length > 60) this.log.shift(); },
  /* decode a clip for the current audio context (cached) */
  get(key) {
    if (!this.ok() || !this.has(key)) return Promise.resolve(null);
    if (this.ctx !== Sfx.ctx) { this.ctx = Sfx.ctx; this.bufs.clear(); this.loading.clear(); }
    if (this.bufs.has(key)) return Promise.resolve(this.bufs.get(key));
    if (this.loading.has(key)) return this.loading.get(key);
    const c = this.ctx, p = new Promise((res) => {
      try {
        const bin = atob(VOICE_DATA[key]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const done = (b) => { if (c === this.ctx) this.bufs.set(key, b); res(b); };
        const pr = c.decodeAudioData(u.buffer, done, () => res(null)); if (pr && pr.catch) pr.catch(() => res(null));
      } catch (e) { res(null); }
    });
    this.loading.set(key, p); return p;
  },
  /* keys in a bark group: bark/<group>/0, 1, ... */
  groupKeys(g) {
    this._g = this._g || {};
    if (!this._g[g]) { const out = []; if (typeof VOICE_DATA !== 'undefined') for (let i = 0; VOICE_DATA['bark/' + g + '/' + i]; i++) out.push('bark/' + g + '/' + i); this._g[g] = out; }
    return this._g[g];
  },

  /* ---------- people shouting ---------- */
  bark(group, who, opts) {
    opts = opts || {};
    const x = who ? who.x : null, z = who ? who.z : null;
    if (this.cd > G.time && !opts.force) return false;
    if (who && who.barkT > G.time) return false;
    if (who && x != null && dist(x, z, G.player.x, G.player.z) > 55) return false; // too far away to hear
    const keys = this.groupKeys(group); if (!keys.length) return false;
    // each person keeps the same voice: their take index is fixed by who they are
    const pick2 = who ? (who.voiceSeed = who.voiceSeed != null ? who.voiceSeed : randi(0, 1)) : randi(0, 1);
    const line = randi(0, Math.floor((keys.length - 1) / 2)), key = keys[Math.min(keys.length - 1, line * 2 + pick2)];
    this.cd = G.time + (opts.gap || 1.1); if (who) who.barkT = G.time + (opts.every || 5);
    this.note(group);
    this.get(key).then((b) => {
      if (!b || !Sfx.ready) return;
      const o = Sfx.out(x, z, opts.vol || 0.6, 0.05, 55); if (!o) return;
      const s = Sfx.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = (who && who.kind === 'cop') ? 1 : 0.97 + Math.random() * 0.08; s.connect(o); s.start();
    });
    return true;
  },

  /* ---------- Vera's briefings ---------- */
  dialog(text) {
    this.stopDialog();
    const key = typeof VOICE_TEXT !== 'undefined' && VOICE_TEXT[text]; if (!key) return false;
    this.dlgKey = key; this.note('dialog');
    this.get(key).then((b) => {
      if (!b || this.dlgKey !== key || !Sfx.ready) return;
      const o = Sfx.out(null, null, 0.95, 0.03); if (!o) return;
      const s = Sfx.ctx.createBufferSource(); s.buffer = b; s.connect(o); s.start(); this.dlgSrc = s;
    });
    return true;
  },
  stopDialog() { this.dlgKey = null; if (this.dlgSrc) { try { this.dlgSrc.stop(); } catch (e) { /* done */ } this.dlgSrc = null; } },

  /* ---------- police radio ---------- */
  // a spoken place for a spot on the map: nearest cross streets in the city, else the area or road
  placeKey(x, z) {
    if (W.inAirport && W.inAirport(x, z)) return x < -930 ? 'place/airbase' : 'place/airport';
    if (inRect(x, z, W.FOREST)) return 'place/forest';
    if (W.onHighway(x, z)) { const H = W.HWY; return Math.abs(z) > Math.abs(x) ? (z < 0 ? 'place/ring_n' : 'place/ring_s') : (x < 0 ? 'place/ring_w' : 'place/ring_e'); }
    if (z > W.HWY + W.HWH) return Math.abs(x) < 30 && z > W.SHORE - 10 ? 'place/pier' : 'place/beach';
    if (W.inCounty && W.inCounty(x, z)) {
      let best = null, bd = 60;
      for (const e of W.countyEdges) { const d = segPointDist(x, z, e.ax, e.az, e.bx, e.bz); if (d < bd && e.name) { bd = d; best = e.name; } }
      return best && this.has('road/' + best) ? 'road/' + best : 'place/county';
    }
    const S = VOICE_STREETS, i = clamp(Math.round((x + W.HALF) / 50), 0, 8), j = clamp(Math.round((z + W.HALF) / 50), 0, 8);
    return 'x/' + S.ew[j] + '/' + S.ns[i];
  },
  // queue a transmission: a list of clip keys spoken back to back through the radio
  radio(keys, opts) {
    keys = keys.filter((k) => this.has(k)); if (!keys.length) return false;
    this.note('radio:' + keys.join('+'));
    if (this.radioQ.length >= 3) this.radioQ.shift(); // stale news gets dropped
    this.radioQ.push(keys);
    if (!this.radioBusy) this.nextRadio();
    return true;
  },
  unit(name) { return 'unit/' + name + '/' + randi(0, 1); },
  nextRadio() {
    const keys = this.radioQ.shift(); if (!keys) { this.radioBusy = false; return; }
    this.radioBusy = true;
    if (!this.ok()) { this.radioBusy = false; this.radioQ.length = 0; return; }
    Promise.all(keys.map((k) => this.get(k))).then((bufs) => {
      if (!Sfx.ready) { this.radioBusy = false; return; }
      const c = Sfx.ctx, t0 = c.currentTime + 0.05, chain = this.radioChain();
      let t = t0 + 0.12;
      this.squelch(chain.input, t0);
      for (const b of bufs) { if (!b) continue; const s = c.createBufferSource(); s.buffer = b; s.connect(chain.input); s.start(t); t += b.duration + 0.18; }
      this.squelch(chain.input, t - 0.1);
      chain.staticAt(t0, t + 0.1);
      setTimeout(() => this.nextRadio(), (t - c.currentTime + 0.6) * 1000);
    });
  },
  // band-limited, slightly overdriven radio voice with a bed of static
  radioChain() {
    const c = Sfx.ctx, input = c.createGain(); input.gain.value = 1;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3100;
    const sh = c.createWaveShaper(), curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const v = i / 256 - 1; curve[i] = Math.tanh(v * 3) * 0.8; } sh.curve = curve;
    const out = Sfx.out(null, null, 0.32, 0.02) || Sfx.sfx;
    input.connect(hp); hp.connect(lp); lp.connect(sh); sh.connect(out);
    return {
      input,
      staticAt(a, b) {
        const n = c.createBufferSource(); n.buffer = Sfx.white; n.loop = true;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.05, a + 0.04); g.gain.setValueAtTime(0.05, b); g.gain.linearRampToValueAtTime(0.0001, b + 0.05);
        n.connect(f); f.connect(g); g.connect(out); n.start(a); n.stop(b + 0.1);
      },
    };
  },
  squelch(dest, t) {
    const c = Sfx.ctx, n = c.createBufferSource(); n.buffer = Sfx.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.12);
  },
  /* the dispatcher reports a crime the police just heard about, and a unit answers */
  report(type, x, z) {
    const k = 'dispatch/crime_' + type; if (!this.has(k)) return false;
    const parts = [k];
    if (type !== 'bank') parts.push(this.placeKey(x, z));
    this.radio(parts);
    if (Math.random() < 0.7) this.radio([this.unit('ack_' + randi(1, 4))]);
    return true;
  },
  heatUp(level) { if (level >= 2) this.radio(['dispatch/heat_' + level]); },
};
let VOICE_STREETS = { ew: ['Oak', 'Pine', 'Maple', 'Cedar', 'Main', 'Elm', 'Market', 'Union', 'Harbor'], ns: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'] };
/* "Main & Fifth" for the HUD: the cross streets nearest to a spot in the city */
W.streetName = function (x, z) {
  const i = clamp(Math.round((x + W.HALF) / 50), 0, 8), j = clamp(Math.round((z + W.HALF) / 50), 0, 8);
  return VOICE_STREETS.ew[j] + ' & ' + VOICE_STREETS.ns[i];
};
