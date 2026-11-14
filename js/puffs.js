'use strict';
/* Soft smoke: billowing puffs (damaged and burning cars, wrecks, tyre smoke, explosions), all drawn in one call as
   point sprites with a soft cloudy texture. Each puff grows, rises, drifts with the wind and fades. */

const Puffs = {
  N: 1100, n: 0, mesh: null,
  init(scene) {
    const N = this.N;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.s0 = new Float32Array(N); this.grow = new Float32Array(N); this.a0 = new Float32Array(N); this.rise = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture() }, scale: { value: 400 }, ortho: { value: 0 }, light: { value: 1 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; uniform float ortho;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = ortho > 0.5 ? size * scale : size * scale / max(0.5, -mv.z); vA = alpha; vC = color; }`,
      fragmentShader: `uniform sampler2D map; uniform float light; varying float vA; varying vec3 vC;
        void main() { vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * (0.55 + 0.45 * t.r) * light, a); }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; scene.add(this.mesh);
    this.c = new THREE.Color();
  },
  // a soft lumpy blob: overlapping radial gradients, so each puff looks like a little cloud, not a disc
  texture() {
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    blob(32, 32, 30, 0.75);
    const rnd = mulberry32(42);
    for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, d = 6 + rnd() * 12; blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 9 + rnd() * 9, 0.35 + rnd() * 0.3); }
    const t = new THREE.CanvasTexture(cv); return t;
  },
  /* x, y, z: start; v*: velocity; size: metres; grow: extra size by the end (×); life: seconds; color: hex or css; alpha; rise: upward push */
  add(x, y, z, vx, vy, vz, size, grow, life, color, alpha, rise) {
    if (!this.mesh) return;
    let i = this.n;
    if (i >= this.N) { // full: recycle the oldest-looking puff
      let best = 0, bl = 1e9; for (let k = 0; k < this.N; k += 7) if (this.life[k] < bl) { bl = this.life[k]; best = k; } i = best;
    } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.c.set(color); this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.rise[i] = rise || 0;
    this.size[i] = size; this.alpha[i] = 0;
  },
  update(dt, cam, viewH) {
    if (!this.mesh) return;
    const wx = typeof Weather !== 'undefined' ? Weather.windX() * 2.2 : 0, wz = typeof Weather !== 'undefined' ? Weather.windZ() * 2.2 : 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap the last live puff into this slot
        const j = --this.n; if (j !== i) this.copy(j, i); i--; continue;
      }
      const f = 1 - this.life[i] / this.max[i], k = Math.exp(-1.2 * dt);
      this.vel[i * 3] = this.vel[i * 3] * k + wx * dt; this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * k + wz * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.rise[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] * (1 + this.grow[i] * Math.sqrt(f));
      this.alpha[i] = this.a0[i] * Math.min(1, f * 6) * (1 - f) * (1 - f * 0.3);
    }
    const g = this.mesh.geometry; g.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size', 'alpha']) g.attributes[a].needsUpdate = true;
    // point size in pixels: perspective scales by distance, the iso camera by its zoom
    if (cam.isOrthographicCamera) { this.mat.uniforms.ortho.value = 1; this.mat.uniforms.scale.value = viewH / (cam.top - cam.bottom); }
    else { this.mat.uniforms.ortho.value = 0; this.mat.uniforms.scale.value = viewH / (2 * Math.tan((cam.fov * Math.PI) / 360)); }
    this.mat.uniforms.light.value = typeof Weather !== 'undefined' ? clamp(0.55 + Weather.p.sun * 0.5 + Weather.flash * 0.6, 0.45, 1.3) : 1;
  },
  copy(j, i) {
    for (let a = 0; a < 3; a++) { this.pos[i * 3 + a] = this.pos[j * 3 + a]; this.vel[i * 3 + a] = this.vel[j * 3 + a]; this.col[i * 3 + a] = this.col[j * 3 + a]; }
    this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j]; this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j]; this.a0[i] = this.a0[j]; this.rise[i] = this.rise[j];
  },
  clear() { this.n = 0; if (this.mesh) this.mesh.geometry.setDrawRange(0, 0); },
};
