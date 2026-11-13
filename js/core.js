'use strict';
/* Loot Run — core helpers: math, input, audio, particles, floating text. */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
function dist(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
function turnTo(a, b, step) { return a + clamp(angDiff(a, b), -step, step); }
function damp(cur, target, k, dt) { return lerp(cur, target, 1 - Math.exp(-k * dt)); }
function money(n) { return '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US'); }
function segPointDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return dist(px, pz, ax + dx * t, az + dz * t);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GFX = { aniso: 4 };
const MatCache = new Map();
function lam(color) {
  let m = MatCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); MatCache.set(color, m); }
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = GFX.aniso;
  return t;
}
function speckle(g, w, h, colors, n, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = size * (0.5 + Math.random());
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

/* ---------------- Input ---------------- */
const Input = {
  keys: Object.create(null), pressed: Object.create(null),
  mx: innerWidth / 2, my: innerHeight / 2, mdown: false, mclick: false, wheel: 0,
  dx: 0, dy: 0, rdown: false, locked: false, lockFailed: false, el: null, wantLock: null, onLock: null,
  requestLock() {
    if (!this.el || !this.el.requestPointerLock) { this.lockFailed = true; return; }
    try { const p = this.el.requestPointerLock(); if (p && p.catch) p.catch(() => { this.lockFailed = true; }); } catch (e) { this.lockFailed = true; }
  },
  exitLock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); },
  init(el) {
    this.el = el;
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; if (this.onLock) this.onLock(this.locked); });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.mdown = false; });
    el.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; this.dx += e.movementX || 0; this.dy += e.movementY || 0; });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (this.wantLock && this.wantLock()) { this.requestLock(); return; } // this click only grabs the mouse
        this.mdown = true; this.mclick = true;
      }
      if (e.button === 2) this.rdown = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mdown = false; if (e.button === 2) this.rdown = false; });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  down(c) { return !!this.keys[c]; },
  hit(c) { return !!this.pressed[c]; },
  endFrame() { this.pressed = Object.create(null); this.mclick = false; this.wheel = 0; this.dx = 0; this.dy = 0; },
};

/* ---------------- Particles ---------------- */
const FX = {
  pool: [], live: [],
  init(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 320; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false; m.frustumCulled = false; scene.add(m); this.pool.push(m);
    }
  },
  spawn(x, y, z, vx, vy, vz, color, size, life, o) {
    const m = this.pool.pop();
    if (!m) return;
    m.visible = true; m.position.set(x, y, z); m.scale.setScalar(size);
    m.material.color.set(color); m.material.opacity = 1;
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.live.push({ m, vx, vy, vz, life, max: life, size, grav: o && o.grav != null ? o.grav : 14, grow: (o && o.grow) || 0, drag: (o && o.drag) || 0.5 });
  },
  burst(x, y, z, n, color, speed, size, life, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s, (o && o.up != null ? o.up : speed * 0.6) * Math.random(), Math.sin(a) * s,
        Array.isArray(color) ? pick(color) : color, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), o);
    }
  },
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; this.pool.push(p.m); this.live.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = p.life / p.max;
      p.m.material.opacity = Math.min(1, f * 2);
      if (p.grow) p.m.scale.setScalar(p.size * (1 + (1 - f) * p.grow));
      p.m.rotation.x += dt * 3;
    }
  },
  clear() { for (const p of this.live) { p.m.visible = false; this.pool.push(p.m); } this.live.length = 0; },
};

/* ---------------- Floating world-space text ---------------- */
const Floaters = {
  list: [], el: null, v: null,
  init(el) { this.el = el; this.v = new THREE.Vector3(); },
  add(x, y, z, text, cls) {
    if (!this.el) return;
    const d = document.createElement('div');
    d.className = 'floater ' + (cls || '');
    d.textContent = text;
    this.el.appendChild(d);
    this.list.push({ d, x, y, z, t: 0 });
  },
  update(dt, cam, w, h) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      if (f.t > 1.4) { f.d.remove(); this.list.splice(i, 1); continue; }
      this.v.set(f.x, f.y + f.t * 2.2, f.z).project(cam);
      f.d.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
      f.d.style.opacity = String(clamp(2.2 - f.t * 1.6, 0, 1));
    }
  },
  clear() { for (const f of this.list) f.d.remove(); this.list.length = 0; },
};
