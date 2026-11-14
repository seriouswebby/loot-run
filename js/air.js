'use strict';
/* Helicopters and explosives.
   - Police choppers join the chase at heat 3 (two at heat 5). They search with a spotlight and fire from above.
     Forest Park's canopy and narrow alleys make you very hard to spot; smoke blinds them completely.
   - Parked choppers at the police helipad and the beach dock can be stolen and flown.
   - Rockets (home in on choppers), grenades and C4. */

function buildHeliMesh(kind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const police = kind === 'police', attack = kind === 'attack';
  const [main, trim] = { police: ['#1d3557', '#f1f1ee'], news: ['#c1121f', '#fdf0d5'], attack: ['#4b5320', '#2f3518'] }[kind] || ['#f4f1ea', '#0b6e99'];
  const add = (w, h, d, x, y, z, c, par) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); m.castShadow = true; (par || body).add(m); return m; };
  add(2.3, 1.9, 4.2, 0, 1.75, 0, main);
  add(2.1, 1.3, 1.3, 0, 1.85, 2.55, '#22303c');
  add(2.34, 0.35, 4.24, 0, 1.25, 0, trim);
  add(0.55, 0.55, 5.2, 0, 2.2, -4.6, main);
  add(0.16, 1.5, 1.0, 0, 2.8, -7.0, trim);
  for (const sx of [-1, 1]) { add(0.16, 0.16, 4.2, sx * 1.05, 0.1, 0.2, '#2b2b2e'); add(0.12, 0.75, 0.12, sx * 1.05, 0.45, 1.2, '#2b2b2e'); add(0.12, 0.75, 0.12, sx * 1.05, 0.45, -0.8, '#2b2b2e'); }
  add(0.5, 0.35, 0.5, 0, 2.85, 0, '#2b2b2e');
  add(0.42, 0.3, 0.42, 0, 0.72, 2.4, '#dddddd');
  if (police || attack) add(0.14, 0.14, 1.3, 0, 0.75, 3.1, '#1b1b1e'); // nose gun
  if (attack) { add(4.4, 0.16, 1.0, 0, 1.55, 0.3, trim); for (const sx of [-1, 1]) { add(0.45, 0.45, 1.6, sx * 2.1, 1.25, 0.4, '#2b2b2e'); add(0.1, 0.1, 0.9, sx * 2.1, 1.25, 1.5, '#1b1b1e'); } }
  const rotor = new THREE.Group(); rotor.position.set(0, 3.0, 0); body.add(rotor);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.07, 0.38), lam('#1b1b1e')); b1.castShadow = true; rotor.add(b1);
  const b2 = b1.clone(); b2.rotation.y = Math.PI / 2; rotor.add(b2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.2, 28), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.32, 2.7, -7.0); body.add(tail);
  tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.2), lam('#1b1b1e')));
  let lights = null;
  if (police) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2020 })); r.position.set(-0.7, 2.75, 1.2); body.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0x2050ff })); b.position.set(0.7, 2.75, 1.2); body.add(b);
    lights = [r, b];
  }
  return { root, body, rotor, tail, disc, lights };
}

/* tallest rooftop under a circle (for landing and for keeping AI choppers above buildings) */
function roofAt(x, z, r) {
  let h = 0;
  for (const b of W.buildings) {
    if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
    if (b.h > h) h = b.h;
  }
  return h;
}

class Chopper {
  constructor(kind, x, z, yaw, o) {
    o = o || {};
    this.kind = kind; this.police = kind === 'police';
    const PL = PLANES[kind]; this.wing = !!PL; this.v = 0; this.thr = 0;
    this.armed = this.police || kind === 'attack' || !!(PL && PL.armed) || !!o.armed; // police choppers, gunships and fighters carry a gun
    this.ammo = PL ? PL.ammo || 0 : kind === 'attack' ? 900 : this.armed ? 500 : 0;
    this.x = x; this.z = z; this.y = o.y || 0; this.vx = 0; this.vz = 0; this.vy = 0; this.yaw = yaw || 0;
    this.maxHp = PL ? PL.hp : kind === 'attack' ? 440 : this.police ? 320 : 240; this.hp = this.maxHp; this.top = kind === 'attack' ? 44 : 36;
    this.rotor = this.y > 0 ? 1 : 0; this.spin = 0; this.pilot = o.pilot || null; this.pad = o.pad || null;
    this.falling = 0; this.dead = false; this.tilt = 0; this.roll = 0; this.leaving = false; this.lastHit = null;
    this.m = PL ? buildPlaneMesh(kind) : buildHeliMesh(kind); G.scene.add(this.m.root);
    if (this.pilot === 'ai') this.makeSpot();
    Choppers.list.push(this);
  }
  makeSpot() {
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1, 1, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    this.spotDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.spotDisc.rotation.x = -Math.PI / 2;
    G.scene.add(this.cone); G.scene.add(this.spotDisc);
  }
  damage(n, src) {
    if (this.falling > 0 || this.dead) return;
    this.hp -= n; this.lastHit = src;
    FX.burst(this.x, this.y + 1.8, this.z, 6, ['#ffd166', '#ffffff', '#555555'], 6, 0.15, 0.4);
    if (this.hp > 0) return;
    this.falling = 3; this.vy = -1;
    if (this.pilot === 'ai' && src === G.player) { Heat.add(1, 5, 'Police helicopter down'); G.toast('You shot down the police helicopter!', 'good'); G.S.stats.kos++; }
    if (G.player.inHeli === this) G.toast(this.wing ? 'Mayday! Your plane is going down — bail out!' : 'Mayday! Your helicopter is going down!', 'warn');
  }
  sync(dt) {
    const m = this.m;
    this.spin += dt * (2 + this.rotor * 30);
    m.root.position.set(this.x, this.y, this.z);
    m.root.rotation.set(0, this.yaw, 0);
    m.body.rotation.set(this.tilt, 0, -this.roll);
    m.rotor.rotation.y = this.spin; m.tail.rotation.x = this.spin * 1.5;
    if (m.prop) m.prop.rotation.z = this.spin * 1.4;
    if (m.glow) m.glow.material.opacity = this.pilot ? 0.25 + this.thr * 0.7 : 0;
    m.disc.material.opacity = this.rotor > 0.6 ? 0.12 * this.rotor : 0;
    if (m.lights) { const ph = Math.floor(G.time * 5) % 2, on = this.pilot === 'ai' || this.rotor > 0.5; m.lights[0].material.color.set(on && ph ? 0xff2020 : 0x441111); m.lights[1].material.color.set(on && !ph ? 0x2050ff : 0x111144); }
    if (this.cone) {
      const vis = !this.falling && !this.leaving;
      this.cone.visible = this.spotDisc.visible = vis;
      if (vis) {
        const sx = this.spotX, sz = this.spotZ, top = new THREE.Vector3(this.x, this.y + 0.6, this.z), bot = new THREE.Vector3(sx, 0.08, sz);
        const dir = bot.clone().sub(top), L = dir.length();
        this.cone.position.copy(top).addScaledVector(dir, 0.5);
        this.cone.scale.set(3.4, L, 3.4);
        this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
        this.spotDisc.position.set(sx, 0.09, sz);
        const locked = this.ai && this.ai.sees;
        this.spotDisc.material.color.set(locked ? 0xffffff : 0xfff2b0); this.spotDisc.material.opacity = locked ? 0.5 : 0.32;
        this.cone.material.opacity = locked ? 0.17 : 0.11;
      }
    }
  }
  remove() {
    this.dead = true; G.scene.remove(this.m.root);
    if (this.cone) { G.scene.remove(this.cone); G.scene.remove(this.spotDisc); }
  }
}

const Choppers = {
  list: [], tracers: [], spawnCd: 0, announced: false,
  init() {
    for (const p of W.places.helipads) { p.heli = new Chopper(p.kind, p.x, p.z, p.yaw, { pad: p }); p.t = 0; }
  },
  active() { return this.list.filter((h) => h.pilot === 'ai' && !h.dead && !h.falling && !h.leaving); },
  want() { return G.respawning || Weather.noHeli() ? 0 : Heat.level >= 5 ? 2 : Heat.level >= 3 ? 1 : 0; },
  update(dt) {
    const want = this.want(), act = this.active();
    this.spawnCd -= dt;
    if (act.length < want && this.spawnCd <= 0) { this.spawnAI(); this.spawnCd = 8; }
    if (act.length > want) { act[0].leaving = true; if (Weather.noHeli() && Heat.level >= 3) { G.toast('The storm grounded the police helicopters!', 'good'); Voice.radio(['dispatch/storm'], true); } }
    if (Heat.level === 0) this.announced = false;
    for (const h of this.list) {
      if (h.dead) continue;
      if (h.falling > 0) this.fall(h, dt);
      else if (h.pilot === 'ai') heliAI(h, dt);
      else if (!h.pilot) this.idle(h, dt);
      h.sync(dt);
    }
    const P = G.body();
    for (const p of W.places.helipads) {
      const taken = !p.heli || p.heli.dead || p.heli.pilot || dist(p.heli.x, p.heli.z, p.x, p.z) > 12;
      if (!taken) { p.t = 0; continue; }
      p.t += dt;
      if (p.t > 90 && dist(P.x, P.z, p.x, p.z) > 60 && !this.list.some((h) => !h.dead && dist(h.x, h.z, p.x, p.z) < 8)) { p.heli = new Chopper(p.kind, p.x, p.z, p.yaw, { pad: p }); p.t = 0; }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt; t.m.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { t.m.visible = false; this.tracers.splice(i, 1); this.pool.push(t.m); }
    }
    this.list = this.list.filter((h) => !h.dead);
  },
  pool: [],
  tracer(ax, ay, az, bx, by, bz, color) {
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true })); G.scene.add(m); }
    m.visible = true; m.material.color.set(color || 0xffe08a);
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, 1, a.distanceTo(b)); m.lookAt(b);
    this.tracers.push({ m, life: 0.09 });
  },
  spawnAI() {
    const t = G.body(), a = rand(0, TAU);
    const h = new Chopper('police', t.x + Math.cos(a) * 140, t.z + Math.sin(a) * 140, a + Math.PI, { y: 30, pilot: 'ai' });
    h.ai = { sees: false, checkT: 0, lostT: 99, lastX: Heat.lastX, lastZ: Heat.lastZ, searchT: 0, orbit: rand(0, TAU), cd: 2.5, burst: 0, burstT: 0 };
    h.spotX = Heat.lastX; h.spotZ = Heat.lastZ;
    if (!this.announced) { this.announced = true; G.toast('Police helicopter inbound! Hide under the Forest Park trees or in an alley.', 'warn'); Sfx.sting('chopper'); Voice.radio([Voice.unit('air_inbound')], true); }
    return h;
  },
  idle(h, dt) {
    h.rotor = Math.max(0, h.rotor - dt * 0.25);
    const g = roofAt(h.x, h.z, 1.5);
    if (h.y > g) { h.vy -= 14 * dt; h.y += h.vy * dt; if (h.y <= g) { if (h.vy < -10) h.damage(-h.vy * 5); h.y = g; h.vy = 0; } }
    h.vx = damp(h.vx, 0, 2, dt); h.vz = damp(h.vz, 0, 2, dt); h.x += h.vx * dt; h.z += h.vz * dt;
    h.tilt = damp(h.tilt, 0, 3, dt); h.roll = damp(h.roll, 0, 3, dt);
  },
  fall(h, dt) {
    h.falling -= dt; h.yaw += dt * 5; h.vy -= 16 * dt; h.y += h.vy * dt; h.x += h.vx * dt; h.z += h.vz * dt;
    if (Math.random() < 0.7) FX.spawn(h.x, h.y + 2, h.z, rand(-1, 1), 2, rand(-1, 1), pick(['#333333', '#555555', '#ff6b1a']), rand(0.6, 1.2), 1.2, { grav: -1, grow: 2 });
    const g = roofAt(h.x, h.z, 1);
    if (h.y <= g || h.falling <= 0) {
      const P = G.player;
      if (P.inHeli === h) { G.exitHeli(true); G.hurtPlayer(70, h.x + 1, h.z, 8, null); }
      explosion(h.x, h.z, 9, 90, h.lastHit === P ? P : null);
      h.remove();
    }
  },
  clearPolice() { for (const h of this.list) if (h.pilot === 'ai') h.remove(); this.list = this.list.filter((h) => !h.dead); },
};

/* ---------------- police chopper AI ---------------- */
function heliSees(h, tx, tz) {
  const P = G.player, zone = G.playerZone;
  for (const c of Smoke.clouds) if (dist(c.x, c.z, tx, tz) < c.r) return false;
  const dH = dist(h.x, h.z, tx, tz), dS = dist(h.spotX, h.spotZ, tx, tz);
  if (zone === 'air') return dH < 110;
  if (zone === 'tunnel') return false;
  // trees: in the forest the spotlight has to land right on you and still only catches a glimpse now and then;
  // a lone tree in town gives nearly as much cover while you stand under it
  if (zone === 'forest') {
    if (W.onTrail(tx, tz)) return dS < 4.5;
    return dS < (P.inCar ? 3.8 : 2.6) && Math.random() < (P.inCar ? 0.3 : 0.18);
  }
  if (!P.inCar && !P.inHeli && W.underCanopy(tx, tz)) return dS < 2.8 && Math.random() < 0.22;
  if (zone === 'alley') return dS < 5.5;
  if (zone === 'highway' || zone === 'beach') return dH < 75;
  return dH < 42 || dS < 7;
}
function heliAI(h, dt) {
  const a = h.ai, P = G.player, t = G.body();
  if (h.leaving) {
    const dx = h.x - t.x, dz = h.z - t.z, d = Math.hypot(dx, dz) || 1;
    h.vx = damp(h.vx, dx / d * 30, 1, dt); h.vz = damp(h.vz, dz / d * 30, 1, dt); h.y += dt * 4;
    h.x += h.vx * dt; h.z += h.vz * dt; h.rotor = 1;
    if (d > 220) h.remove();
    return;
  }
  a.checkT -= dt;
  if (a.checkT <= 0) {
    a.checkT = 0.35;
    a.sees = !G.respawning && heliSees(h, t.x, t.z);
    if (a.sees) { a.lastX = t.x; a.lastZ = t.z; a.lostT = 0; Heat.spotted(); }
  }
  if (!a.sees) {
    a.lostT += dt;
    if (Heat.seenT > 0.3 && dist(Heat.lastX, Heat.lastZ, a.lastX, a.lastZ) > 8) { a.lastX = Heat.lastX; a.lastZ = Heat.lastZ; a.searchT = 0; }
  }
  let gx, gz, sx, sz, speed;
  if (a.sees || a.lostT < 1.2) {
    a.orbit += dt * 0.35;
    sx = t.x + P.vx * 0.15; sz = t.z + P.vz * 0.15;
    gx = t.x + P.vx * 0.6 + Math.cos(a.orbit) * 14; gz = t.z + P.vz * 0.6 + Math.sin(a.orbit) * 14;
    speed = 27; a.searchT = 0;
  } else {
    a.searchT += dt;
    const R = Math.min(5 + a.searchT * 1.6, 34), ang = a.searchT * 1.05;
    sx = a.lastX + Math.cos(ang) * R; sz = a.lastZ + Math.sin(ang) * R;
    gx = sx - Math.cos(ang) * 7; gz = sz - Math.sin(ang) * 7;
    speed = 15;
  }
  // the spotlight sweeps at a limited rate, so you can watch it and slip away
  const rate = (a.sees ? 32 : 11) * dt, ddx = sx - h.spotX, ddz = sz - h.spotZ, dd = Math.hypot(ddx, ddz);
  if (dd > 0) { const k = Math.min(1, rate / dd); h.spotX += ddx * k; h.spotZ += ddz * k; }
  const reach = dist(h.spotX, h.spotZ, h.x, h.z);
  if (reach > 32) { h.spotX = h.x + (h.spotX - h.x) * 32 / reach; h.spotZ = h.z + (h.spotZ - h.z) * 32 / reach; }
  const dx = gx - h.x, dz = gz - h.z, d = Math.hypot(dx, dz) || 1, want = Math.min(speed, d * 1.2);
  h.vx = damp(h.vx, dx / d * want, 1.6, dt); h.vz = damp(h.vz, dz / d * want, 1.6, dt);
  h.x += h.vx * dt; h.z += h.vz * dt;
  const alt = Math.max(26, roofAt(h.x, h.z, 10) + 8, P.inHeli ? P.inHeli.y + 5 : 0);
  h.y = damp(h.y, alt, 1.2, dt);
  h.yaw = turnTo(h.yaw, Math.atan2(t.x - h.x, t.z - h.z), dt * 1.5);
  h.tilt = damp(h.tilt, clamp(Math.hypot(h.vx, h.vz) / 60, 0, 0.3), 3, dt);
  h.rotor = 1;
  // gunfire: short bursts while it can see you
  a.cd -= dt;
  const dH = dist(h.x, h.z, t.x, t.z);
  if (a.sees && dH < 45 && a.cd <= 0 && a.burst <= 0 && !G.respawning) { a.burst = 4; a.burstT = 0; a.cd = Heat.level >= 5 ? 1.8 : 2.6; }
  if (a.burst > 0) { a.burstT -= dt; if (a.burstT <= 0) { a.burstT = 0.11; a.burst--; heliShoot(h, t); } }
}
function heliShoot(h, t) {
  const P = G.player, zone = G.playerZone, canopy = (zone === 'forest' && !W.onTrail(t.x, t.z)) || (!P.inCar && !P.inHeli && W.underCanopy(t.x, t.z));
  const moving = Math.hypot(P.vx, P.vz);
  let spread = 1.5 + moving * 0.1; if (canopy) spread *= 2.5;
  const ix = t.x + rand(-1, 1) * spread, iz = t.z + rand(-1, 1) * spread;
  const blocked = (canopy && Math.random() < 0.7) || (zone === 'alley' && Math.random() < 0.35);
  const air = P.inHeli ? P.inHeli.y + 1.5 : 0;
  const iy = blocked ? 5.5 : air + 0.15;
  Choppers.tracer(h.x, h.y + 0.6, h.z, ix, iy, iz, 0xff9f6b);
  Sfx.heliGun(h.x, h.z);
  if (blocked) { FX.burst(ix, 5.5, iz, 5, ['#2f5d34', '#4f8a3a', '#6b4a2f'], 3, 0.18, 0.6); return; }
  const r = P.inHeli ? 2.6 : P.inCar ? 1.7 : 0.75;
  if (dist(ix, iz, t.x, t.z) < r) {
    if (P.inHeli) P.inHeli.damage(8, null);
    else if (P.inCar) P.inCar.damage(6, h.x, h.z);
    else G.hurtPlayer(6, h.x, h.z, 1, null);
  } else { FX.burst(ix, 0.2, iz, 3, ['#9c9488', '#d9d2c3'], 3, 0.1, 0.3); Sfx.impact(ix, iz); }
}

/* ---------------- fixed-wing aircraft: they share the helicopter code path (P.inHeli) ---------------- */
const PLANES = {
  prop: { name: 'PROP PLANE', vmax: 55, accel: 9, vrot: 24, vstall: 19, climb: 10, turn: 0.95, hp: 200, ceil: 120, cam: 21, snd: 'engine_prop' },
  bizjet: { name: 'PRIVATE JET', vmax: 88, accel: 13, vrot: 40, vstall: 32, climb: 15, turn: 0.75, hp: 260, ceil: 150, cam: 25, snd: 'engine_jet' },
  fighter: { name: 'FIGHTER JET', vmax: 125, accel: 24, vrot: 44, vstall: 34, climb: 24, turn: 1.25, hp: 380, ceil: 160, cam: 26, snd: 'engine_fighter', armed: true, ammo: 1200 },
};
function buildPlaneMesh(kind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (w, h, d, x, y, z, c, ry, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); m.rotation.set(0, ry || 0, rz || 0); m.castShadow = true; body.add(m); return m; };
  const wheel = (x, z, s) => { add(0.1, 0.9 * s, 0.1, x, 0.75 * s, z, '#555555'); add(0.28, 0.55 * s, 0.55 * s, x, 0.28 * s, z, '#1b1b1e'); };
  let prop = null, glow = null;
  if (kind === 'prop') {
    const main = '#f4f1ea', trim = '#c1121f';
    add(1.3, 1.4, 6.6, 0, 1.6, 0, main); add(1.24, 0.8, 1.7, 0, 2.15, 1.2, '#22303c');
    add(11, 0.14, 1.6, 0, 2.4, 0.9, main); add(11.05, 0.16, 0.32, 0, 2.4, 1.6, trim);
    for (const sx of [-1, 1]) add(0.08, 1.1, 0.08, sx * 1.9, 1.85, 1.0, '#999999', 0, sx * 0.5);
    add(0.9, 0.9, 2.6, 0, 1.7, -4.0, main); add(0.12, 1.5, 1.2, 0, 2.7, -4.9, trim); add(3.6, 0.1, 0.9, 0, 1.9, -4.9, main);
    add(0.62, 0.62, 0.4, 0, 1.6, 3.5, '#555555');
    prop = new THREE.Group(); prop.position.set(0, 1.6, 3.75); body.add(prop);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.06), lam('#222222')); prop.add(blade);
    wheel(-1.1, 0.5, 1); wheel(1.1, 0.5, 1); wheel(0, 2.6, 0.9);
  } else if (kind === 'bizjet') {
    const main = '#f7f7f5', trim = '#1d3557';
    add(1.9, 2.0, 13, 0, 2.1, 0, main); add(1.6, 1.5, 1.6, 0, 2.0, 7.0, main); add(1.0, 0.9, 1.0, 0, 1.9, 8.0, main);
    add(1.7, 0.55, 1.3, 0, 2.75, 6.1, '#22303c'); add(1.95, 0.25, 11, 0, 2.4, 0, trim);
    for (const sx of [-1, 1]) {
      add(6.2, 0.16, 2.2, sx * 3.6, 1.5, 0.2, main, sx * 0.35);
      add(0.9, 0.9, 2.8, sx * 1.55, 2.8, -4.3, '#d9d9d6'); add(0.7, 0.7, 0.1, sx * 1.55, 2.8, -5.75, '#1b1b1e');
      for (let i = 0; i < 6; i++) add(0.05, 0.35, 0.45, sx * 0.97, 2.55, 3.2 - i * 1.1, '#22303c');
    }
    add(0.18, 2.6, 2.0, 0, 3.9, -5.6, trim); add(4.2, 0.12, 1.2, 0, 5.15, -6.1, main);
    wheel(-1.4, -0.2, 1.1); wheel(1.4, -0.2, 1.1); wheel(0, 5.6, 1);
  } else {
    const main = '#7d868b', dark = '#5b6266';
    add(1.4, 1.2, 11, 0, 2.0, 0, main); add(0.9, 0.8, 2.6, 0, 1.95, 6.6, main); add(0.45, 0.45, 1.2, 0, 1.9, 8.4, dark);
    add(0.9, 0.6, 2.4, 0, 2.75, 3.6, '#2e4a5c');
    for (const sx of [-1, 1]) {
      add(4.6, 0.12, 3.6, sx * 2.6, 1.85, -0.6, main, sx * 0.55);
      add(0.12, 2.0, 1.8, sx * 0.9, 3.2, -4.6, dark, 0, sx * 0.3);
      add(2.4, 0.1, 1.4, sx * 1.6, 2.0, -5.0, main, sx * 0.4);
      add(0.5, 0.7, 2.2, sx * 0.85, 1.75, 1.6, dark); // intakes
    }
    add(0.12, 0.12, 1.4, 0.55, 2.2, 6.0, '#1b1b1e'); // cannon
    add(1.1, 1.0, 0.6, 0, 2.0, -5.7, '#2b2b2e');
    glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0 }));
    glow.position.set(0, 2.0, -6.02); glow.rotation.y = Math.PI; body.add(glow);
    wheel(-1.3, -0.6, 1.1); wheel(1.3, -0.6, 1.1); wheel(0, 4.2, 1);
  }
  // planes have no rotor or tail rotor; stand-ins keep the shared helicopter code happy
  return { root, body, rotor: new THREE.Group(), tail: new THREE.Group(), disc: { material: { opacity: 0 } }, lights: null, prop, glow };
}
function flyPlane(h, dt, fw, st, up, down) {
  const S = PLANES[h.kind], g = roofAt(h.x, h.z, 2);
  h.rotor = Math.min(1, h.rotor + dt * 0.8);
  // W/S set the throttle; on the ground with the throttle closed, S is the brake
  if (fw > 0) h.thr = Math.min(1, h.thr + dt * 0.7); else if (fw < 0) h.thr = Math.max(0, h.thr - dt * 0.9);
  const onGround = h.y - g < 0.4;
  h.v += clamp(h.thr * S.vmax - h.v, -S.accel * 0.6 * dt, S.accel * dt * (h.rotor > 0.9 ? 1 : 0.2));
  if (onGround && fw < 0 && h.thr <= 0.01) h.v = Math.max(0, h.v - 14 * dt);
  if (!onGround) h.v = clamp(h.v - h.vy * 0.22 * dt, 0, S.vmax * 1.25); // climbing bleeds speed, diving builds it
  const lift = clamp((h.v - S.vstall) / (S.vrot - S.vstall), 0, 1);
  if (onGround) {
    h.vy = 0; h.y = g;
    if (up && h.v >= S.vrot) { h.vy = S.climb * 0.5; h.y = g + 0.5; }
    h.yaw -= st * 0.9 * clamp(h.v / 8, 0.12, 1) * clamp(30 / Math.max(1, h.v), 0.2, 1) * dt;
    h.roll = damp(h.roll, 0, 6, dt);
    h.stall = false;
  } else {
    let vyT = (up - down) * S.climb * lift;
    h.stall = h.v < S.vstall;
    if (h.stall) { vyT = -4 - 12 * (1 - h.v / S.vstall); if (!(G.stallT > G.time)) { G.stallT = G.time + 3; G.toast('STALL! Throttle up (W) and dive (Shift).', 'warn'); } }
    h.vy = damp(h.vy, vyT, 2.2, dt);
    h.yaw -= st * S.turn * clamp(h.v / S.vrot, 0.4, 1) * dt;
    h.roll = damp(h.roll, st * 0.7, 3, dt);
  }
  h.y += h.vy * dt;
  if (h.y > S.ceil) { h.y = S.ceil; h.vy = Math.min(0, h.vy); }
  if (h.y < g) { // touchdown: gentle is fine, a hard or banked landing breaks things
    const impact = -h.vy; h.y = g; h.vy = 0;
    if (impact > 6) { h.damage((impact - 6) * 18, null); G.shake(0.5); Sfx.crash(0.8, h.x, h.z); }
    if (Math.abs(h.roll) > 0.45 && h.v > 15) { h.damage(45, null); Sfx.crash(0.6, h.x, h.z); }
  }
  // leaving the map: the plane banks round on its own
  const lim = W.OUT + 40, out = Math.abs(h.x) > lim || h.z < -lim || h.z > W.SHORE + 320;
  if (out) { h.yaw = h.yaw + clamp(angDiff(h.yaw, Math.atan2(-h.x, W.VIEW.cz - h.z)), -1.6 * dt, 1.6 * dt); if (!(G.edgeT > G.time)) { G.edgeT = G.time + 4; G.toast('Edge of the map: turning back.'); } }
  h.vx = Math.sin(h.yaw) * h.v; h.vz = Math.cos(h.yaw) * h.v;
  h.x += h.vx * dt; h.z += h.vz * dt;
  if (!onGround) { h.x += Weather.windX() * 3 * dt; h.z += Weather.windZ() * 3 * dt; } // crosswind drift
  // fences, trees and the like when taxiing or skimming the grass
  if (h.y - g < 3 && h.v > 0.5) {
    const p = { x: h.x, z: h.z }, hit = W.collideCircle(p, 2.2, h.y);
    if (hit) { h.x = p.x; h.z = p.z; if (h.v > 8) { h.damage(h.v * 2.5, null); Sfx.crash(Math.min(1, h.v / 40), h.x, h.z); } h.v *= 0.25; }
  }
  const vx0 = h.vx, vz0 = h.vz; heliCollide(h);
  if (Math.abs(h.vx - vx0) + Math.abs(h.vz - vz0) > 1) h.v *= 0.3; // hit a building
  h.tilt = damp(h.tilt, onGround ? 0 : -Math.atan2(h.vy, Math.max(10, h.v)), 4, dt);
}

/* ---------------- the nose gun, when you're the one flying an armed chopper ---------------- */
function heliGunFire(h) {
  const P = G.player;
  if (h.ammo <= 0) { if (!(G.heliAmmoT > G.time)) { G.heliAmmoT = G.time + 2; G.toast('The chopper gun is out of ammo.'); Sfx.error(); } return; }
  h.ammo--; P.cd = 0.09;
  const nose = h.wing ? 7 : 2.4, fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), gx = h.x + fx * nose, gy = h.y + (h.wing ? 2 : 0.4), gz = h.z + fz * nose;
  const tgt = G.heliAim && !G.heliAim.falling && !G.heliAim.dead ? G.heliAim : null;
  let ix, iy, iz;
  if (tgt) {
    const hit = Math.random() < 0.55;
    ix = tgt.x + (hit ? 0 : rand(-3, 3)); iy = tgt.y + 1.8 + (hit ? 0 : rand(-2, 2)); iz = tgt.z + (hit ? 0 : rand(-3, 3));
    if (hit) tgt.damage(9, P);
  } else {
    const spread = 0.7 + dist(gx, gz, G.aimX, G.aimZ) * 0.015;
    ix = G.aimX + rand(-1, 1) * spread; iz = G.aimZ + rand(-1, 1) * spread; iy = W.floorAt(ix, iz, gy) || 0;
    let hitSomething = false;
    for (const n of G.npcs) {
      if (n.dead || Math.abs(n.x - ix) > 1.1 || Math.abs(n.z - iz) > 1.1 || Math.abs((n.y || 0) - iy) > 2) continue;
      const ko = n.hurt(16, gx, gz, 3, P); hitSomething = true;
      G.crime(n.kind === 'cop' ? 'assaultCop' : 'assault', ix, iz, { victim: n, ko });
    }
    for (const c of G.cars) if (!c.dead && !c.wreck && iy < 2 && dist(c.x, c.z, ix, iz) < c.T.w * 0.5 + 0.7) { c.damage(10, ix, iz, P); hitSomething = true; }
    for (const o of Choppers.list) if (o !== h && !o.dead && dist(o.x, o.z, ix, iz) < 3 && Math.abs(o.y + 1.5 - iy) < 2.5) { o.damage(9, P); hitSomething = true; }
    if (!hitSomething) { FX.burst(ix, iy + 0.2, iz, 3, ['#9c9488', '#d9d2c3'], 3, 0.1, 0.3); Sfx.impact(ix, iz); }
  }
  Choppers.tracer(gx, gy, gz, ix, iy, iz, 0xffd166);
  FX.burst(gx, gy, gz, 2, ['#fff3b0', '#ffb703'], 3, 0.12, 0.06, { grav: 0 });
  Sfx.heliGun(h.x, h.z);
  G.crime('gunfire', ix, iz, {});
}

/* ---------------- flying a stolen chopper ---------------- */
function flyHeli(h, dt, fw, st, up, down) {
  h.rotor = Math.min(1, h.rotor + dt * 0.55);
  const ground = roofAt(h.x, h.z, 1.5);
  const ready = h.rotor > 0.97;
  h.vy = damp(h.vy, ready ? (up - down) * 11 : -4, 3, dt);
  h.y += h.vy * dt;
  if (h.y > 85) { h.y = 85; h.vy = Math.min(0, h.vy); }
  if (h.y <= ground) { const impact = -h.vy; h.y = ground; h.vy = Math.max(0, h.vy); if (impact > 9) h.damage((impact - 9) * 6, null); }
  const airborne = h.y > ground + 0.3;
  h.yaw -= st * 1.9 * dt;
  if (airborne) {
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    h.vx += fx * fw * 26 * dt; h.vz += fz * fw * 26 * dt;
    const k = Math.exp(-0.75 * dt); h.vx *= k; h.vz *= k;
    const sp = Math.hypot(h.vx, h.vz), top = h.top || 36; if (sp > top) { h.vx *= top / sp; h.vz *= top / sp; }
  } else { h.vx = damp(h.vx, 0, 6, dt); h.vz = damp(h.vz, 0, 6, dt); }
  if (airborne) { h.vx += Weather.windX() * 2.2 * dt; h.vz += Weather.windZ() * 2.2 * dt; } // gusts push choppers about
  h.x += h.vx * dt; h.z += h.vz * dt;
  const lim = W.OUT + 30; h.x = clamp(h.x, -lim, lim); h.z = clamp(h.z, -lim, W.SHORE + 120);
  heliCollide(h);
  h.tilt = damp(h.tilt, airborne ? fw * 0.22 : 0, 4, dt); h.roll = damp(h.roll, airborne ? st * 0.25 : 0, 4, dt);
}
function heliCollide(h) {
  const r = 3;
  // the ridge: solid below its crest
  for (const b of W.RIDGE || []) {
    if (h.y >= b.h || h.x + r < b.minX || h.x - r > b.maxX || h.z + r < b.minZ || h.z - r > b.maxZ) continue;
    const dx = Math.min(h.x - b.minX, b.maxX - h.x), dz = Math.min(h.z - b.minZ, b.maxZ - h.z), up = b.h - h.y;
    if (up < Math.min(dx, dz) && up < 12) { h.y = b.h; if (h.vy < 0) h.vy = 0; continue; } // skim over the crest
    let nx = 0, nz = 0; if (dx < dz) nx = h.x - b.minX < b.maxX - h.x ? -1 : 1; else nz = h.z - b.minZ < b.maxZ - h.z ? -1 : 1;
    h.x += nx * (Math.min(dx, dz) + r); h.z += nz * (Math.min(dx, dz) + r);
    const vn = h.vx * nx + h.vz * nz; if (vn < 0) { h.vx -= nx * vn * 1.5; h.vz -= nz * vn * 1.5; if (-vn > 8) { h.damage((-vn - 8) * 4, null); Sfx.crash(-vn / 30, h.x, h.z); } }
  }
  for (const b of W.buildings) {
    if (h.y >= b.h - 0.6) continue; // a roof you're level with is floor, not wall
    if (h.x + r < b.minX || h.x - r > b.maxX || h.z + r < b.minZ || h.z - r > b.maxZ) continue;
    const qx = clamp(h.x, b.minX, b.maxX), qz = clamp(h.z, b.minZ, b.maxZ), dx = h.x - qx, dz = h.z - qz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-4) { h.y = b.h; continue; }
    const nx = dx / d, nz = dz / d; h.x += nx * (r - d); h.z += nz * (r - d);
    const vn = h.vx * nx + h.vz * nz;
    if (vn < 0) { h.vx -= nx * vn * 1.5; h.vz -= nz * vn * 1.5; if (-vn > 8) { h.damage((-vn - 8) * 4, null); Sfx.crash(-vn / 30, h.x, h.z); } }
  }
}
G.body = () => G.player.inCar || G.player.inHeli || G.player;
/* jump out of a flying chopper with a parachute; the empty chopper drops out of the sky */
G.bailOut = function (h) {
  const P = G.player;
  h.pilot = null; P.inHeli = null; P.rig.root.visible = true; P.resetPose();
  P.x = h.x - Math.cos(h.yaw) * 1.5; P.z = h.z + Math.sin(h.yaw) * 1.5; P.y = Math.max(h.y - 0.5, 1); P.yv = 1; P.top = P.y;
  P.kx = h.vx * 0.5; P.kz = h.vz * 0.5; P.jumping = true; P.facing = h.yaw;
  h.falling = 4; h.lastHit = P;
  G.toast('You jumped! Press SPACE to open your parachute.', 'warn'); Sfx.whoosh(P.x, P.z);
  return true;
};
G.heliLanded = (h) => h.y - roofAt(h.x, h.z, 1.5) < 0.6 && (!h.wing || h.v < 3);
G.enterHeli = function (h) {
  const P = G.player;
  if (h.dead || h.falling > 0 || h.pilot) return false;
  if (h.police) G.crime('copHeli', h.x, h.z, {});
  else if (h.kind === 'attack' || h.kind === 'fighter') G.crime('milHeli', h.x, h.z, {});
  else G.crime('carTheft', h.x, h.z, {});
  h.pilot = 'player'; h.pad = null;
  P.inHeli = h; P.rig.root.visible = false; P.vx = P.vz = 0;
  G.toast(h.wing ? 'W/S throttle · A/D steer · build speed on the runway, then SPACE to pull up · SHIFT to dive · land and stop, then F' : 'SPACE climb · SHIFT descend · W/S fly · A/D turn · land, then F to get out', 'good');
  return true;
};
G.exitHeli = function (force) {
  const P = G.player, h = P.inHeli; if (!h) return false;
  if (!force && !G.heliLanded(h)) {
    if (G.S.parachute > 0) return G.bailOut(h);
    G.toast('Land first (hold Shift), or buy a Parachute to bail out mid-air.'); Sfx.error(); return false;
  }
  // step out beside the chopper: on the street, or onto the roof it landed on
  const pad = force ? 0 : roofAt(h.x, h.z, 1.5), rx = -Math.cos(h.yaw), rz = Math.sin(h.yaw), fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
  let spot = null;
  const tries = [[rx * 3.2, rz * 3.2], [-rx * 3.2, -rz * 3.2], [-fx * 3.5, -fz * 3.5], [fx * 3.5, fz * 3.5]];
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; for (const r of [2.2, 1.2, 0.4]) tries.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const fits = (x, z) => Math.abs(W.floorAt(x, z, pad + 0.1) - pad) < 0.3 && (pad < 0.5 || Math.abs(W.floorAt(x + 0.45, z, pad + 0.1) - pad) < 0.3 && Math.abs(W.floorAt(x - 0.45, z, pad + 0.1) - pad) < 0.3 && Math.abs(W.floorAt(x, z + 0.45, pad + 0.1) - pad) < 0.3 && Math.abs(W.floorAt(x, z - 0.45, pad + 0.1) - pad) < 0.3);
  for (const [ox, oz] of tries) if (fits(h.x + ox, h.z + oz)) { spot = [h.x + ox, h.z + oz]; break; }
  if (!spot && pad > 0.5) {
    // the chopper is perched over the roof's edge: put you on the nearest bit of that roof
    let best = null, bd = 1e9;
    for (const b of W.buildings) { if (Math.abs(b.h - pad) > 0.3) continue; const qx = clamp(h.x, b.minX + 0.6, b.maxX - 0.6), qz = clamp(h.z, b.minZ + 0.6, b.maxZ - 0.6), d = dist(qx, qz, h.x, h.z); if (d < bd) { bd = d; best = [qx, qz]; } }
    spot = best;
  }
  if (!spot) spot = [h.x + rx * 3.2, h.z + rz * 3.2];
  P.x = spot[0]; P.z = spot[1]; P.y = pad; P.yv = 0; P.top = null; P.safeT = G.time + 1.5;
  if (pad < 0.5) W.collideCircle(P, P.r); else W.collideBuildings(P, P.r, pad);
  if (pad > 0.5) G.toast('You are on the roof. Cops on the street can\'t reach you, but choppers can see you.');
  h.pilot = null; P.inHeli = null; P.rig.root.visible = true; P.facing = h.yaw; P.yv = 0; P.spin = 0; P.kx = P.kz = 0; P.resetPose();
  return true;
};

/* ---------------- rockets, grenades, C4 ---------------- */
const Ordnance = {
  rockets: [], grenades: [], c4: [],
  geo: null,
  init() { this.geo = { rocket: new THREE.BoxGeometry(0.22, 0.22, 0.9), nade: new THREE.SphereGeometry(0.22, 8, 6), c4: new THREE.BoxGeometry(0.5, 0.22, 0.35) }; },
  fireRocket(owner, ang, target) {
    const m = new THREE.Mesh(this.geo.rocket, lam('#4b5320')); G.scene.add(m);
    const sp = 48, x = owner.x + Math.sin(ang) * 1, z = owner.z + Math.cos(ang) * 1;
    this.rockets.push({ m, x, y: 1.5, z, vx: Math.sin(ang) * sp, vy: 0, vz: Math.cos(ang) * sp, life: 2.2, target });
    Sfx.whoosh(x, z); Sfx.shot('shotgun', x, z);
  },
  throwGrenade(owner, tx, tz) {
    let dx = tx - owner.x, dz = tz - owner.z, d = Math.hypot(dx, dz) || 1;
    const D = clamp(d, 3, 20); dx = dx / d * D; dz = dz / d * D;
    const T = 0.85, g = 20, y0 = 1.6;
    const m = new THREE.Mesh(this.geo.nade, lam('#3a4a2a')); m.castShadow = true; G.scene.add(m);
    this.grenades.push({ m, x: owner.x, y: y0, z: owner.z, vx: dx / T, vz: dz / T, vy: (0.5 * g * T * T - y0) / T, fuse: 1.7 });
    Sfx.whoosh(owner.x, owner.z);
  },
  plantC4(x, z) {
    const m = new THREE.Mesh(this.geo.c4, lam('#d9c7a0')); G.scene.add(m);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.y = 0.15; m.add(led);
    let car = null, bd = 3.2;
    for (const c of G.cars) { if (c.dead || c.wreck || c === G.player.inCar) continue; const d = dist(c.x, c.z, x, z); if (d < bd) { bd = d; car = c; } }
    const b = { m, led, x, z, y: 0.12, car, ox: car ? x - car.x : 0, oz: car ? z - car.z : 0 };
    this.c4.push(b); Sfx.click();
    return b;
  },
  detonate() { for (const b of this.c4) { G.scene.remove(b.m); explosion(b.x, b.z, 8, 115, G.player); } this.c4.length = 0; },
  update(dt) {
    const P = G.player;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      if (r.target && !r.target.dead && !r.target.falling) {
        const tx = r.target.x - r.x, ty = r.target.y + 1.8 - r.y, tz = r.target.z - r.z, L = Math.hypot(tx, ty, tz) || 1;
        r.vx = damp(r.vx, tx / L * 52, 6, dt); r.vy = damp(r.vy, ty / L * 52, 6, dt); r.vz = damp(r.vz, tz / L * 52, 6, dt);
      }
      const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt, nz = r.z + r.vz * dt;
      let boom = false, hitHeli = null;
      for (const h of Choppers.list) if (!h.dead && h !== P.inHeli && Math.hypot(h.x - nx, h.y + 1.8 - ny, h.z - nz) < 3.2) { boom = true; hitHeli = h; }
      if (!boom && ny < 3) {
        if (W.segBlocked(r.x, r.z, nx, nz)) boom = true;
        for (const c of G.cars) if (!c.dead && c !== P.inCar && dist(c.x, c.z, nx, nz) < 1.8) boom = true;
        for (const n of G.npcs) if (!n.dead && !n.down && dist(n.x, n.z, nx, nz) < 0.8) boom = true;
      }
      if (ny < 0.2) boom = true;
      r.x = nx; r.y = ny; r.z = nz; r.life -= dt;
      r.m.position.set(nx, ny, nz); r.m.lookAt(nx + r.vx, ny + r.vy, nz + r.vz);
      if (Math.random() < 0.8) FX.spawn(nx, ny, nz, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), pick(['#d9d9d9', '#bfbfbf', '#ffb703']), 0.35, 0.6, { grav: 0, grow: 2 });
      if (boom || r.life <= 0) {
        G.scene.remove(r.m); this.rockets.splice(i, 1);
        if (hitHeli) { hitHeli.damage(340, P); FX.burst(nx, ny, nz, 30, ['#ff6b1a', '#ffb703', '#fff3b0'], 10, 0.5, 0.8); Sfx.explode(nx, nz); }
        else explosion(nx, nz, 7, 95, P);
      }
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vy -= 20 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      if (g.y < 0.22) { g.y = 0.22; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
      const ox = g.vx, oz = g.vz, hit = W.collideCircle(g, 0.22);
      if (hit) { const vn = ox * hit.nx + oz * hit.nz; if (vn < 0) { g.vx -= hit.nx * vn * 1.6; g.vz -= hit.nz * vn * 1.6; } }
      g.m.position.set(g.x, g.y, g.z); g.m.rotation.x += dt * 10;
      g.fuse -= dt;
      if (g.fuse <= 0) { G.scene.remove(g.m); this.grenades.splice(i, 1); explosion(g.x, g.z, 6.5, 85, P); }
    }
    for (const b of this.c4) {
      if (b.car) { if (b.car.dead) b.car = null; else { const c = Math.cos(b.car.h), s = Math.sin(b.car.h); b.x = b.car.x + b.ox; b.z = b.car.z + b.oz; b.y = 1.3; void c; void s; } }
      b.m.position.set(b.x, b.y, b.z);
      b.led.material.color.set(Math.floor(G.time * 3) % 2 ? 0xff2020 : 0x330000);
    }
  },
  clear() {
    for (const r of this.rockets) G.scene.remove(r.m);
    for (const g of this.grenades) G.scene.remove(g.m);
    this.rockets.length = 0; this.grenades.length = 0;
  },
};
