'use strict';
/* Dynamic weather: clear → cloudy → rain → storm / fog, blending smoothly every few minutes.
   Gameplay: rain and fog shorten how far police can see, wet roads cut grip, storms ground police choppers. */

const WEATHER = {
  clear: { label: 'CLEAR', hint: 'Cops see far', sky: '#a9cfe3', fogNear: 150, fogFar: 380, sun: 0.85, hemi: 0.72, rain: 0, sight: 1, grip: 1 },
  cloudy: { label: 'OVERCAST', hint: 'Normal visibility', sky: '#9aa7b2', fogNear: 100, fogFar: 300, sun: 0.45, hemi: 0.78, rain: 0, sight: 0.95, grip: 1 },
  rain: { label: 'RAIN', hint: 'Cops see less · roads slick', sky: '#7d8b97', fogNear: 35, fogFar: 190, sun: 0.25, hemi: 0.7, rain: 0.55, sight: 0.8, grip: 0.7 },
  storm: { label: 'THUNDERSTORM', hint: 'Choppers grounded · cops see less · roads slick', sky: '#4e5964', fogNear: 15, fogFar: 140, sun: 0.12, hemi: 0.55, rain: 1, sight: 0.7, grip: 0.6, lightning: true, noHeli: true },
  fog: { label: 'FOG', hint: 'Cops can barely see you', sky: '#b7bfc4', fogNear: -20, fogFar: 75, sun: 0.3, hemi: 0.85, rain: 0, sight: 0.55, grip: 0.95 },
};
const WEATHER_NEXT = { clear: ['clear', 'cloudy', 'cloudy', 'fog'], cloudy: ['clear', 'rain', 'rain', 'fog'], rain: ['cloudy', 'storm', 'rain'], storm: ['rain', 'rain'], fog: ['clear', 'cloudy'] };

const Weather = {
  cur: 'clear', prev: 'clear', blend: 1, camDist: 200, timer: 150, flash: 0, boltT: 8, thunderQ: [],
  p: Object.assign({}, WEATHER.clear),
  sky: new THREE.Color(), tmpA: new THREE.Color(), tmpB: new THREE.Color(),
  init(scene, hemi, sun) {
    this.scene = scene; this.hemi = hemi; this.sun = sun;
    const N = 1600; this.N = N;
    const pos = new Float32Array(N * 6);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = rand(-45, 45); this.drops[i * 3 + 1] = rand(0, 40); this.drops[i * 3 + 2] = rand(-45, 45); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d6e5, transparent: true, opacity: 0 }));
    this.rainMesh.frustumCulled = false; scene.add(this.rainMesh);
    this.apply();
  },
  set(kind, instant) {
    if (!WEATHER[kind]) return;
    this.prev = instant ? kind : this.cur; this.cur = kind; this.blend = instant ? 1 : 0;
    this.timer = rand(150, 260);
    if (!instant && G.state === 'play') G.toast('Weather: ' + WEATHER[kind].label.toLowerCase() + ' — ' + WEATHER[kind].hint.toLowerCase(), kind === 'storm' || kind === 'fog' ? 'warn' : '');
  },
  sight() { return this.p.sight; },
  grip() { return this.p.grip; },
  noHeli() { return this.cur === 'storm' && this.blend > 0.5; },
  apply() {
    const a = WEATHER[this.prev], b = WEATHER[this.cur], t = this.blend, p = this.p;
    for (const k of ['fogNear', 'fogFar', 'sun', 'hemi', 'rain', 'sight', 'grip']) p[k] = lerp(a[k], b[k], t);
    this.sky.copy(this.tmpA.set(a.sky)).lerp(this.tmpB.set(b.sky), t);
    const s = this.scene;
    // fog distances are measured from the player, not the camera (the iso camera sits 200 m away)
    if (s.fog) { s.fog.color.copy(this.sky); s.fog.near = Math.max(0.1, this.camDist + p.fogNear); s.fog.far = this.camDist + p.fogFar; }
    s.background = this.sky;
    const fl = this.flash;
    this.sun.intensity = p.sun + fl * 1.2; this.hemi.intensity = p.hemi + fl * 0.8;
  },
  update(dt, fx, fy, fz) {
    if (G.state === 'play') {
      this.timer -= dt;
      if (this.timer <= 0) this.set(pick(WEATHER_NEXT[this.cur]));
    }
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / 14);
    // lightning + thunder
    this.flash = Math.max(0, this.flash - dt * 4);
    if (WEATHER[this.cur].lightning && this.blend > 0.4) {
      this.boltT -= dt;
      if (this.boltT <= 0) { this.boltT = rand(5, 14); this.flash = 1; this.thunderQ.push(rand(0.3, 1.6)); }
    }
    for (let i = this.thunderQ.length - 1; i >= 0; i--) { this.thunderQ[i] -= dt; if (this.thunderQ[i] <= 0) { this.thunderQ.splice(i, 1); Sfx.thunder(); } }
    this.apply();
    // rain: streaks in a box that follows the camera focus
    const R = this.p.rain, m = this.rainMesh;
    m.material.opacity = R * 0.55; m.visible = R > 0.02;
    if (!m.visible) return;
    const pos = m.geometry.attributes.position.array, d = this.drops, n = Math.floor(this.N * R);
    const fall = 38 * dt, slant = 4 * dt;
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      if (i >= n) { pos[o + 1] = pos[o + 4] = -50; continue; }
      d[i * 3 + 1] -= fall; d[i * 3] += slant;
      if (d[i * 3 + 1] < 0) { d[i * 3] = rand(-45, 45); d[i * 3 + 1] = rand(30, 42); d[i * 3 + 2] = rand(-45, 45); }
      if (d[i * 3] > 45) d[i * 3] -= 90;
      const x = fx + d[i * 3], y = fy + d[i * 3 + 1], z = fz + d[i * 3 + 2];
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x - 0.12; pos[o + 4] = y + 1.1; pos[o + 5] = z;
    }
    m.geometry.attributes.position.needsUpdate = true;
  },
};
