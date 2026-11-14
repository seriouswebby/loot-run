'use strict';
/* Dynamic weather. Mostly sunny; now and then partly cloudy, overcast, windy, rain, a thunderstorm, fog, snow or hail,
   each lasting a few minutes and blending smoothly into the next. Effects: drifting clouds, rain streaks, snowflakes
   and a snow blanket that builds up, bouncing hail, wind-blown leaves, lightning and thunder.
   Gameplay: bad weather shortens how far police can see, wet/icy roads cut grip, storms ground police choppers,
   wind pushes aircraft around. */

const WEATHER = {
  clear: { label: 'SUNNY', hint: 'Clear skies · cops see far', sky: '#9fd0ef', fogNear: 480, fogFar: 1350, sun: 0.95, hemi: 0.72, clouds: 0.12, cloudCol: '#ffffff', wind: 0.15, sight: 1, grip: 1, w: 0, dur: [240, 480] },
  clouds: { label: 'PARTLY CLOUDY', hint: 'Normal visibility', sky: '#a9c6da', fogNear: 420, fogFar: 1150, sun: 0.72, hemi: 0.75, clouds: 0.55, cloudCol: '#f4f6f8', wind: 0.3, sight: 1, grip: 1, w: 16, dur: [150, 300] },
  cloudy: { label: 'OVERCAST', hint: 'Grey skies', sky: '#98a5b0', fogNear: 320, fogFar: 900, sun: 0.42, hemi: 0.8, clouds: 1, cloudCol: '#c9ced3', wind: 0.35, sight: 0.95, grip: 1, w: 9, dur: [120, 240] },
  windy: { label: 'WINDY', hint: 'Strong gusts · aircraft drift', sky: '#a7cbe0', fogNear: 440, fogFar: 1250, sun: 0.85, hemi: 0.74, clouds: 0.4, cloudCol: '#ffffff', wind: 1, sight: 1, grip: 0.95, w: 8, dur: [100, 200] },
  rain: { label: 'RAIN', hint: 'Cops see less · roads slick', sky: '#7d8b97', fogNear: 90, fogFar: 430, sun: 0.25, hemi: 0.7, rain: 0.55, clouds: 1, cloudCol: '#8d969e', wind: 0.45, sight: 0.8, grip: 0.7, w: 7, dur: [100, 200] },
  storm: { label: 'THUNDERSTORM', hint: 'Choppers grounded · cops see less · roads slick', sky: '#4e5964', fogNear: 35, fogFar: 280, sun: 0.12, hemi: 0.55, rain: 1, clouds: 1, cloudCol: '#5b6168', wind: 0.9, sight: 0.7, grip: 0.6, lightning: true, noHeli: true, w: 3, dur: [80, 150] },
  fog: { label: 'FOG', hint: 'Cops can barely see you', sky: '#b7bfc4', fogNear: -20, fogFar: 75, sun: 0.3, hemi: 0.85, clouds: 0, cloudCol: '#ffffff', wind: 0.05, sight: 0.55, grip: 0.95, w: 3, dur: [80, 160] },
  snow: { label: 'SNOW', hint: 'Icy roads · cops see less', sky: '#c9d3dc', fogNear: 70, fogFar: 400, sun: 0.5, hemi: 0.9, snow: 1, clouds: 1, cloudCol: '#dfe4e8', wind: 0.35, sight: 0.8, grip: 0.55, w: 4, dur: [120, 240] },
  hail: { label: 'HAIL', hint: 'Slick roads · get under cover', sky: '#7f8b96', fogNear: 60, fogFar: 340, sun: 0.3, hemi: 0.68, hail: 1, clouds: 1, cloudCol: '#7a828a', wind: 0.6, sight: 0.8, grip: 0.72, w: 2, dur: [50, 100] },
};
const WEATHER_KEYS = ['fogNear', 'fogFar', 'sun', 'hemi', 'rain', 'snow', 'hail', 'clouds', 'wind', 'sight', 'grip'];
// weather that tends to follow weather: rain can build to a storm or turn to hail, overcast can bring rain or snow
const WEATHER_FOLLOW = { cloudy: ['rain', 'snow', 'clouds'], clouds: ['cloudy', 'windy'], rain: ['storm', 'hail', 'cloudy'], storm: ['rain'], windy: ['clouds'], snow: ['cloudy'], hail: ['rain'], fog: ['clouds'] };

const Weather = {
  cur: 'clear', prev: 'clear', blend: 1, camDist: 200, timer: 300, flash: 0, boltT: 8, thunderQ: [], snowCover: 0, windA: 0.8, gust: 0,
  p: {},
  sky: new THREE.Color(), cloudC: new THREE.Color(), tmpA: new THREE.Color(), tmpB: new THREE.Color(),
  init(scene, hemi, sun) {
    this.scene = scene; this.hemi = hemi; this.sun = sun;
    // rain: falling streaks
    const N = 1800; this.N = N;
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = rand(-45, 45); this.drops[i * 3 + 1] = rand(0, 40); this.drops[i * 3 + 2] = rand(-45, 45); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d6e5, transparent: true, opacity: 0 }));
    this.rainMesh.frustumCulled = false; scene.add(this.rainMesh);
    // snow and hail: soft round points
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dc = dot.getContext('2d'), gr = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); dc.fillStyle = gr; dc.fillRect(0, 0, 32, 32);
    const dotTex = new THREE.CanvasTexture(dot);
    const pts = (n, size, color) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: dotTex, color, transparent: true, depthWrite: false, opacity: 0 }));
      m.frustumCulled = false; m.visible = false; scene.add(m);
      const st = new Float32Array(n * 4); for (let i = 0; i < n; i++) { st[i * 4] = rand(-45, 45); st[i * 4 + 1] = rand(0, 35); st[i * 4 + 2] = rand(-45, 45); st[i * 4 + 3] = rand(0, TAU); }
      return { m, n, st };
    };
    this.snowP = pts(2200, 0.32, 0xffffff);
    this.hailP = pts(1800, 0.3, 0xf2f6fa);
    this.leafP = pts(260, 0.28, 0x8a6a3a); this.leafP.m.material.map = null;
    // a snow blanket that builds up on the ground around you while it snows
    const bm = new THREE.MeshLambertMaterial({ color: 0xf4f7fa, transparent: true, opacity: 0, depthWrite: false });
    bm.stencilWrite = true; bm.stencilRef = 1; bm.stencilFunc = THREE.NotEqualStencilFunc; bm.stencilZPass = THREE.KeepStencilOp; // not on water
    this.blanket = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), bm);
    this.blanket.rotation.x = -Math.PI / 2; this.blanket.renderOrder = 1; this.blanket.visible = false; scene.add(this.blanket);
    // clouds: flattened puffs drifting high overhead, wrapped round whoever is watching
    const puff = new THREE.IcosahedronGeometry(1, 1);
    this.cloudN = 260; this.cloudSpan = 3000;
    this.cloudMesh = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, emissive: 0x555555, depthWrite: false }), this.cloudN);
    this.cloudMesh.frustumCulled = false; scene.add(this.cloudMesh);
    this.clouds = [];
    for (let c = 0; c < 65; c++) {
      const cx = rand(0, this.cloudSpan), cz = rand(0, this.cloudSpan), y = rand(115, 165), big = rand(18, 40);
      for (let k = 0; k < 4; k++) this.clouds.push({ x: cx + rand(-1, 1) * big, z: cz + rand(-0.6, 0.6) * big, y: y + rand(-4, 6), sx: big * rand(0.6, 1.1), sy: big * rand(0.18, 0.3), sz: big * rand(0.5, 0.9), rank: Math.random() });
    }
    this.clouds.sort((a, b) => a.rank - b.rank); // the first ones show up even in a nearly clear sky
    this.cloudOff = { x: 0, z: 0 };
    this.d3 = new THREE.Object3D();
    this.apply();
  },
  set(kind, instant) {
    if (!WEATHER[kind]) return;
    this.prev = instant ? kind : this.cur; this.cur = kind; this.blend = instant ? 1 : 0;
    const d = WEATHER[kind].dur; this.timer = rand(d[0], d[1]);
    if (instant && !WEATHER[kind].snow) this.snowCover = 0;
    if (!instant && G.state === 'play') G.toast('Weather: ' + WEATHER[kind].label.toLowerCase() + ' — ' + WEATHER[kind].hint.toLowerCase(), kind === 'storm' || kind === 'fog' || kind === 'hail' || kind === 'snow' ? 'warn' : '');
  },
  /* mostly sunny: out of sunshine, weighted odds of something else; after it, usually sunny again or a related turn */
  pickNext() {
    if (this.cur !== 'clear') {
      if (Math.random() < 0.55) return 'clear';
      if (Math.random() < 0.6 && WEATHER_FOLLOW[this.cur]) return pick(WEATHER_FOLLOW[this.cur]);
    }
    let total = 0; for (const k in WEATHER) if (k !== this.cur) total += WEATHER[k].w;
    let r = Math.random() * total;
    for (const k in WEATHER) { if (k === this.cur) continue; r -= WEATHER[k].w; if (r <= 0) return k; }
    return 'clouds';
  },
  sight() { return this.p.sight; },
  grip() { return this.p.grip * (1 - this.snowCover * 0.15); },
  noHeli() { return this.cur === 'storm' && this.blend > 0.5; },
  windX() { return Math.cos(this.windA) * (this.p.wind + this.gust); },
  windZ() { return Math.sin(this.windA) * (this.p.wind + this.gust); },
  apply() {
    const a = WEATHER[this.prev], b = WEATHER[this.cur], t = this.blend, p = this.p;
    for (const k of WEATHER_KEYS) p[k] = lerp(a[k] || 0, b[k] || 0, t);
    this.sky.copy(this.tmpA.set(a.sky)).lerp(this.tmpB.set(b.sky), t);
    this.cloudC.copy(this.tmpA.set(a.cloudCol)).lerp(this.tmpB.set(b.cloudCol), t);
    const s = this.scene;
    // fog distances are measured from the player, not the camera (the iso camera sits 200 m away)
    if (s.fog) { s.fog.color.copy(this.sky); s.fog.near = Math.max(0.1, this.camDist + p.fogNear); s.fog.far = this.camDist + p.fogFar; }
    s.background = this.sky;
    const fl = this.flash;
    this.sun.intensity = p.sun + fl * 1.2; this.hemi.intensity = p.hemi + fl * 0.8 + this.snowCover * 0.12;
  },
  update(dt, fx, fy, fz) {
    if (G.state === 'play') {
      this.timer -= dt;
      if (this.timer <= 0) this.set(this.pickNext());
    }
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / 14);
    // the wind veers slowly and gusts
    this.windA += dt * 0.02 * Math.sin(G.time * 0.05);
    this.gust = Math.max(0, Math.sin(G.time * 0.7) * Math.sin(G.time * 0.23)) * this.p.wind * 0.6;
    // lightning + thunder
    this.flash = Math.max(0, this.flash - dt * 4);
    if (WEATHER[this.cur].lightning && this.blend > 0.4) {
      this.boltT -= dt;
      if (this.boltT <= 0) { this.boltT = rand(5, 14); this.flash = 1; this.thunderQ.push(rand(0.3, 1.6)); }
    }
    for (let i = this.thunderQ.length - 1; i >= 0; i--) { this.thunderQ[i] -= dt; if (this.thunderQ[i] <= 0) { this.thunderQ.splice(i, 1); Sfx.thunder(); } }
    // snow settles while it snows and melts slowly afterwards
    this.snowCover = clamp(this.snowCover + (this.p.snow > 0.3 ? dt / 70 : -dt / 50), 0, 0.85);
    this.apply();
    const wx = this.windX(), wz = this.windZ();
    this.updateClouds(dt, fx, fz, wx, wz);
    const bl = this.blanket; bl.visible = this.snowCover > 0.01; if (bl.visible) { bl.material.opacity = this.snowCover; bl.position.set(Math.round(fx / 20) * 20, 0.07, Math.round(fz / 20) * 20); }
    this.updateRain(dt, fx, fy, fz, wx, wz);
    this.updatePts(this.snowP, this.p.snow, dt, fx, fy, fz, 3.2, wx * 5, wz * 5, 1.2, 0.95);
    this.updatePts(this.hailP, this.p.hail, dt, fx, fy, fz, 26, wx * 3, wz * 3, 0, 0.9);
    this.updatePts(this.leafP, Math.max(0, this.p.wind - 0.5) * 2 * (1 - this.p.snow), dt, fx, fy, fz, 1.5, wx * 14, wz * 14, 2.5, 0.9, 6);
  },
  updateClouds(dt, fx, fz, wx, wz) {
    const m = this.cloudMesh, C = this.p.clouds, n = Math.floor(this.clouds.length * Math.min(1, C));
    m.visible = n > 0 && (G.camMode === 'chase' || G.state === 'title'); if (!m.visible) { m.count = n > 0 ? m.count : 0; if (n === 0) return; }
    this.cloudOff.x += (1.5 + wx * 6) * dt; this.cloudOff.z += (0.6 + wz * 6) * dt;
    m.material.color.copy(this.cloudC); m.material.emissive.copy(this.cloudC).multiplyScalar(0.45); m.material.opacity = 0.55 + C * 0.35;
    const S = this.cloudSpan, d = this.d3;
    for (let i = 0; i < n; i++) {
      const c = this.clouds[i];
      // wrap each puff into the S×S box centred on the camera focus
      const x = fx + ((((c.x + this.cloudOff.x - fx) % S) + S) % S) - S / 2, z = fz + ((((c.z + this.cloudOff.z - fz) % S) + S) % S) - S / 2;
      d.position.set(x, c.y, z); d.scale.set(c.sx, c.sy * (0.8 + C * 0.4), c.sz); d.rotation.set(0, 0, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    }
    m.count = n; m.instanceMatrix.needsUpdate = true;
  },
  updateRain(dt, fx, fy, fz, wx, wz) {
    const R = this.p.rain, m = this.rainMesh;
    m.material.opacity = R * 0.55; m.visible = R > 0.02;
    if (!m.visible) return;
    const pos = m.geometry.attributes.position.array, d = this.drops, n = Math.floor(this.N * R);
    const fall = 38 * dt, sx = (2 + wx * 10) * dt, sz = wz * 10 * dt, lx = -(0.05 + wx * 0.3), lz = -wz * 0.3;
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      if (i >= n) { pos[o + 1] = pos[o + 4] = -50; continue; }
      d[i * 3 + 1] -= fall; d[i * 3] += sx; d[i * 3 + 2] += sz;
      if (d[i * 3 + 1] < 0) { d[i * 3] = rand(-45, 45); d[i * 3 + 1] = rand(30, 42); d[i * 3 + 2] = rand(-45, 45); }
      if (d[i * 3] > 45) d[i * 3] -= 90; else if (d[i * 3] < -45) d[i * 3] += 90;
      if (d[i * 3 + 2] > 45) d[i * 3 + 2] -= 90; else if (d[i * 3 + 2] < -45) d[i * 3 + 2] += 90;
      const x = fx + d[i * 3], y = fy + d[i * 3 + 1], z = fz + d[i * 3 + 2];
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x + lx; pos[o + 4] = y + 1.1; pos[o + 5] = z + lz;
    }
    m.geometry.attributes.position.needsUpdate = true;
  },
  /* snowflakes, hail and blown leaves: points in a box that follows the camera focus */
  updatePts(P, amount, dt, fx, fy, fz, fall, wx, wz, wobble, opacity, ceil) {
    const m = P.m; m.visible = amount > 0.02; if (!m.visible) return;
    m.material.opacity = Math.min(1, amount * 1.4) * opacity;
    const pos = m.geometry.attributes.position.array, st = P.st, n = Math.floor(P.n * Math.min(1, amount)), top = ceil || 35;
    for (let i = 0; i < P.n; i++) {
      const o = i * 3;
      if (i >= n) { pos[o + 1] = -500; continue; }
      st[i * 4 + 3] += dt * 1.7;
      st[i * 4] += (wx + Math.sin(st[i * 4 + 3]) * wobble) * dt; st[i * 4 + 2] += (wz + Math.cos(st[i * 4 + 3] * 0.8) * wobble) * dt;
      st[i * 4 + 1] -= fall * dt * (0.8 + (i % 5) * 0.1);
      if (st[i * 4 + 1] < 0) { st[i * 4] = rand(-45, 45); st[i * 4 + 1] = top * rand(0.8, 1); st[i * 4 + 2] = rand(-45, 45); }
      for (const k of [0, 2]) { if (st[i * 4 + k] > 45) st[i * 4 + k] -= 90; else if (st[i * 4 + k] < -45) st[i * 4 + k] += 90; }
      pos[o] = fx + st[i * 4]; pos[o + 1] = Math.max(0.05, fy + st[i * 4 + 1]); pos[o + 2] = fz + st[i * 4 + 2];
    }
    m.geometry.attributes.position.needsUpdate = true;
  },
};
