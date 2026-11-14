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
  /* a bark group's size: clips are bark/<group>/<line>/<voice> */
  groupInfo(g) {
    this._g = this._g || {};
    if (!this._g[g]) { let lines = 0, voices = 0; if (typeof VOICE_DATA !== 'undefined') { while (VOICE_DATA['bark/' + g + '/' + lines + '/0']) lines++; while (VOICE_DATA['bark/' + g + '/0/' + voices]) voices++; } this._g[g] = { lines, voices }; }
    return this._g[g];
  },
  groupKeys(g) { const n = this.groupInfo(g), out = []; for (let i = 0; i < n.lines; i++) for (let v = 0; v < n.voices; v++) out.push('bark/' + g + '/' + i + '/' + v); return out; },

  /* ---------- people shouting ---------- */
  bark(group, who, opts) {
    opts = opts || {};
    const x = who ? who.x : null, z = who ? who.z : null;
    if (this.cd > G.time && !opts.force) return false;
    if (who && who.barkT > G.time) return false;
    if (who && x != null && dist(x, z, G.player.x, G.player.z) > 55) return false; // too far away to hear
    const n = this.groupInfo(group); if (!n.lines || !n.voices) return false;
    // each person keeps one voice for everything they shout
    const seed = who ? (who.voiceSeed = who.voiceSeed != null ? who.voiceSeed : randi(0, 99)) : randi(0, 99);
    const key = 'bark/' + group + '/' + randi(0, n.lines - 1) + '/' + (seed % n.voices);
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
  radio(keys, prio) {
    keys = keys.filter((k) => this.has(k)); if (!keys.length) return false;
    this.note('radio:' + keys.join('+'));
    // a full queue drops its oldest routine call; heat changes, roadblocks and outcomes are never squeezed out
    if (this.radioQ.length >= 3) { const i = this.radioQ.findIndex((q) => !q.prio); this.radioQ.splice(i >= 0 ? i : 0, 1); }
    keys.prio = !!prio;
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
    this.lastRep = this.lastRep || {};
    if (this.lastRep[type] > G.time - 25) return false; // one report per kind of crime every 25 s, not every shot
    this.lastRep[type] = G.time;
    const parts = [k];
    if (type !== 'bank') parts.push(this.placeKey(x, z));
    this.radio(parts);
    if (Math.random() < 0.6) this.radio([this.unit('ack_' + randi(1, 4))]);
    return true;
  },
  heatUp(level) { if (level >= 2) this.radio(['dispatch/heat_' + level], true); },
};
let VOICE_STREETS = { ew: ['Oak', 'Pine', 'Maple', 'Cedar', 'Main', 'Elm', 'Market', 'Union', 'Harbor'], ns: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'] };
/* "Main & Fifth" for the HUD: the cross streets nearest to a spot in the city */
W.streetName = function (x, z) {
  const i = clamp(Math.round((x + W.HALF) / 50), 0, 8), j = clamp(Math.round((z + W.HALF) / 50), 0, 8);
  return VOICE_STREETS.ew[j] + ' & ' + VOICE_STREETS.ns[i];
};
