'use strict';
/* Characters: rig, pedestrians, cops, weapons, bullets, pickups, smoke. */

const LOOKS = {
  shirt: ['#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#8338ec', '#ff006e', '#3a86ff', '#6a994e', '#bc4749', '#ffb703', '#219ebc', '#d4a5a5'],
  pants: ['#1d3557', '#2b2d42', '#5c4033', '#3d405b', '#6c757d', '#264653', '#14213d', '#7f5539'],
  skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0662f'],
  hair: ['#2b1b10', '#4a2e19', '#0f0f0f', '#a0522d', '#d4a017', '#6b6b6b', '#8b2f1b'],
};
function randomLook() { return { shirt: pick(LOOKS.shirt), pants: pick(LOOKS.pants), skin: pick(LOOKS.skin), hair: pick(LOOKS.hair) }; }

const WEAPONS = {
  fists: { name: 'Fists', melee: true, dmg: 12, range: 1.7, cd: 0.38, knock: 5 },
  bat: { name: 'Bat', melee: true, dmg: 30, range: 2.3, cd: 0.55, knock: 9 },
  pistol: { name: 'Pistol', dmg: 24, cd: 0.26, spread: 0.03, ammo: 'pistol', speed: 95, range: 45, knock: 2 },
  shotgun: { name: 'Shotgun', dmg: 15, pellets: 6, cd: 0.85, spread: 0.16, ammo: 'shells', speed: 85, range: 28, knock: 5 },
  smg: { name: 'SMG', dmg: 13, cd: 0.085, spread: 0.07, ammo: 'smg', speed: 95, range: 40, auto: true, knock: 1.5 },
  rpg: { name: 'Rocket Launcher', rocket: true, dmg: 95, cd: 1.4, ammo: 'rockets' },
};
const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'shotgun', 'smg', 'rpg'];

const RIG = {};
function rigGeos() {
  if (RIG.leg) return RIG;
  RIG.leg = new THREE.BoxGeometry(0.24, 0.86, 0.26); RIG.leg.translate(0, -0.43, 0);
  RIG.arm = new THREE.BoxGeometry(0.18, 0.72, 0.2); RIG.arm.translate(0, -0.33, 0);
  RIG.torso = new THREE.BoxGeometry(0.62, 0.74, 0.34);
  RIG.head = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  RIG.hair = new THREE.BoxGeometry(0.43, 0.13, 0.43);
  RIG.cap = new THREE.BoxGeometry(0.46, 0.14, 0.46);
  RIG.brim = new THREE.BoxGeometry(0.42, 0.04, 0.2);
  RIG.eye = new THREE.BoxGeometry(0.07, 0.07, 0.02);
  RIG.bat = new THREE.BoxGeometry(0.1, 0.95, 0.1); RIG.bat.translate(0, -0.42, 0);
  RIG.pistol = new THREE.BoxGeometry(0.1, 0.34, 0.16); RIG.pistol.translate(0, -0.12, 0.02);
  RIG.long = new THREE.BoxGeometry(0.1, 0.85, 0.14); RIG.long.translate(0, -0.3, 0);
  RIG.star = new THREE.OctahedronGeometry(0.1);
  RIG.mask = new THREE.BoxGeometry(0.42, 0.3, 0.42);
  return RIG;
}

function buildRig(look) {
  const R = rigGeos();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const m = (c) => lam(c);
  const add = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; (parent || body).add(o); return o; };
  const legL = add(R.leg, m(look.pants), -0.14, 0.9, 0), legR = add(R.leg, m(look.pants), 0.14, 0.9, 0);
  const torso = add(R.torso, m(look.shirt), 0, 1.27, 0);
  const armL = add(R.arm, m(look.shirt), -0.41, 1.6, 0), armR = add(R.arm, m(look.shirt), 0.41, 1.6, 0);
  const handMat = m(look.skin);
  add(new THREE.BoxGeometry(0.16, 0.14, 0.18), handMat, 0, -0.7, 0, armL).castShadow = false;
  add(new THREE.BoxGeometry(0.16, 0.14, 0.18), handMat, 0, -0.7, 0, armR).castShadow = false;
  const head = add(R.head, m(look.skin), 0, 1.86, 0);
  let hat = null;
  if (look.cap) { hat = add(R.cap, m(look.cap), 0, 0.24, 0, head); add(R.brim, m(look.cap), 0, 0.2, 0.28, head); }
  else add(R.hair, m(look.hair), 0, 0.24, -0.01, head);
  const eyeM = m('#151515');
  add(R.eye, eyeM, -0.09, 0.04, 0.205, head).castShadow = false; add(R.eye, eyeM, 0.09, 0.04, 0.205, head).castShadow = false;
  if (look.badge) add(new THREE.BoxGeometry(0.12, 0.12, 0.02), m('#ffd166'), -0.16, 0.15, 0.18, torso).castShadow = false;
  const mask = add(R.mask, m('#1b1b1b'), 0, 0, 0, head); mask.visible = false;
  const hand = new THREE.Group(); hand.position.set(0, -0.66, 0); armR.add(hand);
  const defaults = [legL, legR, torso, armL, armR, head].map((o) => ({ o, p: o.position.clone() }));
  return { root, body, legL, legR, torso, armL, armR, head, hand, hat, mask, weapon: null, weaponId: null, defaults };
}
function rigSetWeapon(rig, id) {
  if (rig.weaponId === id) return;
  if (rig.weapon) { rig.hand.remove(rig.weapon); rig.weapon = null; }
  rig.weaponId = id;
  const R = rigGeos();
  if (id === 'bat') rig.weapon = new THREE.Mesh(R.bat, lam('#b07a45'));
  else if (id === 'pistol') rig.weapon = new THREE.Mesh(R.pistol, lam('#222428'));
  else if (id === 'shotgun') rig.weapon = new THREE.Mesh(R.long, lam('#5b3a24'));
  else if (id === 'smg') rig.weapon = new THREE.Mesh(R.long, lam('#1e1f22'));
  if (rig.weapon) { rig.weapon.castShadow = true; rig.hand.add(rig.weapon); }
}

class Actor {
  constructor(kind, x, z, look) {
    this.kind = kind; this.team = kind === 'cop' ? 'cop' : kind === 'player' ? 'player' : 'civ';
    this.x = x; this.z = z; this.y = 0; this.yv = 0;
    this.vx = 0; this.vz = 0; this.kx = 0; this.kz = 0;
    this.facing = rand(0, TAU); this.r = 0.38;
    this.maxHp = kind === 'cop' ? 70 : kind === 'player' ? 100 : 35; this.hp = this.maxHp;
    this.down = false; this.downT = 0; this.spin = 0;
    this.anim = rand(0, 6); this.atkT = 0; this.atkDur = 0.3; this.cd = 0; this.aimT = 0; this.handsUp = 0;
    this.weapon = 'fists'; this.dead = false; this.invuln = false;
    this.ai = { mode: 'walk' };
    this.look = look || randomLook();
    this.rig = buildRig(this.look);
    this.rig.root.position.set(x, 0, z);
    G.scene.add(this.rig.root);
    this.stars = null;
  }
  setWeapon(id) { this.weapon = id; rigSetWeapon(this.rig, id === 'fists' ? null : id); }
  hurt(dmg, fx, fz, knock, src) {
    if (this.invuln || this.dead) return false;
    if (this.kind === 'player') return G.hurtPlayer(dmg, fx, fz, knock, src);
    const wasDown = this.down;
    this.hp -= dmg;
    const d = dist(this.x, this.z, fx, fz) || 1;
    this.kx += ((this.x - fx) / d) * (knock || 3); this.kz += ((this.z - fz) / d) * (knock || 3);
    FX.burst(this.x, 1.3, this.z, 5, ['#ffffff', '#ffd166'], 4, 0.12, 0.35, { grav: 6 });
    if (this.hp <= 0 && !wasDown) { this.knockOut(); return true; }
    if (!this.down) { Sfx.hurt(this.x, this.z); Voice.bark(this.kind === 'cop' ? 'cop_hurt' : 'ped_hurt', this); if (src === G.player) onNpcAttacked(this); }
    return false;
  }
  knockOut() {
    this.down = true; this.downT = this.kind === 'cop' ? 22 : 16; this.hp = 0; this.vx = this.vz = 0;
    this.handsUp = 0;
    if (!this.stars) {
      this.stars = new THREE.Group();
      for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(rigGeos().star, new THREE.MeshBasicMaterial({ color: 0xffd23f })); s.position.set(Math.cos(k * 2.1) * 0.4, 0, Math.sin(k * 2.1) * 0.4); this.stars.add(s); }
      G.scene.add(this.stars);
    }
    this.stars.visible = true;
    Phys.ragdoll(this, { x: this.kx + this.vx, y: this.yv, z: this.kz + this.vz });
    G.onKnockout(this);
  }
  getUp() {
    if (this.ragdoll) Phys.unragdoll(this);
    this.down = false; this.hp = Math.ceil(this.maxHp * 0.5);
    if (this.stars) this.stars.visible = false;
  }
  /* the ground moved under us by dg: in the air we keep our height; on the ground we follow it, unless it drops
     away faster than we can follow, and then we're airborne (off a crest, a ramp or a ledge) */
  groundStep(dg, h, len) {
    if (this.y > 0.001 || this.yv > 0) { this.y -= dg; if (this.top != null) this.top -= dg; return; }
    if (dg < -Math.max(0.12, len * 0.6)) { this.y = -dg; this.yv = Math.max(0, this.gvy || 0); this.top = this.y; return; }
    this.gvy = dg / h;
  }
  physics(dt) {
    if (this.ragdoll) return; // the physics engine owns the body while it's limp
    if (this.vault) return; // vaulting/mantling moves the player directly
    let mx = this.vx, mz = this.vz;
    if (this.down || this.handsUp > 0) { mx = 0; mz = 0; }
    const tx = (mx + this.kx) * dt, tz = (mz + this.kz) * dt, hops = Math.min(10, Math.max(1, Math.ceil(Math.hypot(tx, tz) / 0.25)));
    for (let i = 0; i < hops; i++) {
      const g0 = W.groundAt(this.x, this.z);
      this.x += tx / hops; this.z += tz / hops; if (hops > 1) W.collideCircle(this, this.r, this.y, tx, tz);
      const dg = W.groundAt(this.x, this.z) - g0;
      if (dg) this.groundStep(dg, dt / hops, Math.hypot(tx, tz) / hops); else if (this.y <= 0.001) this.gvy = 0;
    }
    const kd = Math.exp(-(this.y > 0 && !this.jumping ? 0.8 : 7) * dt); this.kx *= kd; this.kz *= kd;
    const roofs = this.kind === 'player';
    const floor = roofs && this.y > 0.5 ? W.floorAt(this.x, this.z, this.y) : 0;
    if (this.y > floor + 0.001 || this.yv !== 0) { // airborne, or the ground rose to meet us mid-fall: either way we land properly
      if (this.top == null || this.yv > 0) this.top = Math.max(this.top || 0, this.y);
      this.yv -= 22 * dt; if (this.chute) this.yv = Math.max(this.yv, -2.6);
      this.y += this.yv * dt; if (!this.jumping && !this.chute) this.spin += dt * 9;
      if (this.y <= floor) {
        const drop = (this.top || 0) - floor;
        const chuted = this.chute; this.y = floor; this.yv = 0; this.spin = 0; this.top = null;
        if (this.chute) { this.chute = false; if (roofs) G.toast('Touchdown.'); }
        if (this.jumping) { this.jumping = false; if (roofs) Sfx.land(this.x, this.z); }
        if (roofs && drop > 6 && !chuted && !(this.safeT > G.time)) { G.toast(drop > 20 ? 'That was a long way down.' : 'Ouch — hard landing.', 'warn'); G.hurtPlayer((drop - 6) * 9, this.x, this.z + 1, 0, null); }
      }
    } else { this.y = floor; this.top = null; }
    W.collideCircle(this, this.r, this.y, this.vx + this.kx, this.vz + this.kz);
    if (roofs && this.y > 0.5) W.collideBuildings(this, this.r, this.y);
  }
  animate(dt) {
    const rg = this.rig;
    if (this.dead || this.ragdoll) return;
    rg.root.position.set(this.x, this.y + W.groundAt(this.x, this.z), this.z);
    rg.root.rotation.y = this.facing;
    if (this.down) {
      rg.body.rotation.x = damp(rg.body.rotation.x, -Math.PI / 2, 12, dt);
      rg.body.position.y = damp(rg.body.position.y, 0.22, 12, dt);
      rg.body.position.z = damp(rg.body.position.z, -0.9, 12, dt);
      rg.legL.rotation.x = rg.legR.rotation.x = 0; rg.armL.rotation.x = -2.6; rg.armR.rotation.x = -2.6;
      if (this.stars) {
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        this.stars.position.set(this.x - fx * 1.8, 0.75 + W.groundAt(this.x, this.z), this.z - fz * 1.8);
        this.stars.rotation.y += dt * 4;
      }
      return;
    }
    if (this.vault) {
      // vault: side-on hop with tucked legs; mantle: arms up, pull, swing legs over
      const v = this.vault, k = Math.min(1, v.t / v.dur);
      rg.body.rotation.set(v.mantle ? -0.25 + k * 0.5 : 0.35, 0, v.mantle ? 0 : 0.55 * Math.sin(Math.PI * k));
      rg.legL.rotation.x = rg.legR.rotation.x = v.mantle ? -0.4 - Math.sin(Math.PI * k) : -1.3;
      rg.armL.rotation.x = rg.armR.rotation.x = v.mantle ? -2.9 + k * 1.8 : -1.0;
      return;
    }
    if (this.ride) { // sitting in a coaster car or drop-tower seat (arms up when it gets wild), or standing in a gondola
      const s = this.ride.s || {}, pose = s.pose || 'sit';
      rg.root.rotation.order = 'YXZ'; rg.root.rotation.x = s.pitch || 0;
      rg.body.rotation.set(0, 0, 0); rg.body.position.set(0, 0, 0);
      rg.legL.rotation.x = rg.legR.rotation.x = pose === 'stand' ? 0 : -1.45;
      rg.armL.rotation.x = rg.armR.rotation.x = pose === 'scream' ? -2.9 : pose === 'sit' ? -0.9 : 0;
      return;
    }
    if (this.chute) {
      rg.body.rotation.set(0, 0, 0); rg.legL.rotation.x = 0.15; rg.legR.rotation.x = -0.1; rg.armL.rotation.x = rg.armR.rotation.x = -2.8;
      return;
    }
    if (this.jumping && this.y > 0.02) {
      rg.body.rotation.set(0.12, 0, 0);
      rg.legL.rotation.x = -0.9; rg.legR.rotation.x = 0.35; rg.armL.rotation.x = -0.7; rg.armR.rotation.x = -2.2;
      return;
    }
    rg.body.rotation.x = this.y > 0.05 ? this.spin : damp(rg.body.rotation.x, 0, 12, dt);
    rg.body.rotation.y = 0; rg.body.rotation.z = damp(rg.body.rotation.z, 0, 12, dt);
    rg.body.position.y = damp(rg.body.position.y, 0, 12, dt);
    rg.body.position.z = damp(rg.body.position.z, 0, 12, dt);
    const sp = Math.hypot(this.vx, this.vz);
    this.anim += dt * (3 + sp * 2.2);
    const sw = Math.min(1, sp / 3) * 0.8, s = Math.sin(this.anim);
    rg.legL.rotation.x = s * sw; rg.legR.rotation.x = -s * sw;
    if (this.handsUp > 0) { rg.armL.rotation.x = rg.armR.rotation.x = -2.9; return; }
    rg.armL.rotation.x = -s * sw * 0.8;
    const w = WEAPONS[this.weapon];
    if (this.atkT > 0) {
      this.atkT = Math.max(0, this.atkT - dt);
      const p = 1 - this.atkT / this.atkDur;
      if (this.weapon === 'bat') rg.armR.rotation.x = lerp(-2.6, -0.6, Math.min(1, p * 1.6));
      else if (w && w.melee) rg.armR.rotation.x = -Math.PI / 2 * Math.sin(Math.min(1, p) * Math.PI);
      else rg.armR.rotation.x = -Math.PI / 2 + (1 - p) * 0.25;
    } else if (w && !w.melee && this.aimT > 0) {
      this.aimT -= dt; rg.armR.rotation.x = -Math.PI / 2;
    } else rg.armR.rotation.x = s * sw * 0.8;
  }
  // stand up straight again (after riding a bike, sitting in a car or flying)
  resetPose() {
    const rg = this.rig;
    rg.body.rotation.set(0, 0, 0); rg.body.position.set(0, 0, 0);
    for (const p of [rg.legL, rg.legR, rg.armL, rg.armR]) p.rotation.set(0, 0, 0);
    for (const d of rg.defaults) { d.o.position.copy(d.p); d.o.rotation.set(0, 0, 0); }
    rg.root.position.set(this.x, this.y + W.groundAt(this.x, this.z), this.z); rg.root.rotation.set(0, this.facing, 0);
  }
  remove() {
    if (this.ragdoll) Phys.unragdoll(this);
    this.dead = true;
    G.scene.remove(this.rig.root);
    if (this.stars) G.scene.remove(this.stars);
  }
}

/* ---------------- spawning ---------------- */
function spawnPed(x, z, block, sx, sz) {
  const p = new Actor('ped', x, z);
  p.ai = { mode: 'walk', block, sx, sz, dir: chance(0.5) ? 1 : -1, speed: rand(1.4, 2.1), tough: chance(0.12) };
  pedTarget(p);
  if (chance(0.5)) p.cash = randi(15, 90); else p.cash = randi(5, 30);
  G.npcs.push(p); return p;
}
function spawnCop(x, z, mode) {
  const swat = Heat.level >= 4;
  const look = swat ? { shirt: '#22262b', pants: '#1a1d21', skin: pick(LOOKS.skin), hair: '#111', cap: '#111418' }
    : { shirt: '#24467a', pants: '#1b2a44', skin: pick(LOOKS.skin), hair: '#111', cap: '#16233b', badge: true };
  const c = new Actor('cop', x, z, look);
  c.maxHp = swat ? 100 : 70; c.hp = c.maxHp; c.swat = swat;
  c.ai = { mode: mode || 'chase', losT: rand(0, 0.3), sees: false, crumbT: 0, tx: x, tz: z, stuckT: 0, sideT: 0, side: 1, lx: x, lz: z, shootCd: rand(0.5, 1.5), punchCd: 0, speed: rand(5.0, 5.6) };
  c.setWeapon(swat ? 'smg' : 'pistol');
  G.npcs.push(c); return c;
}
function pedTarget(p) {
  const a = p.ai; if (!a.block) { a.block = W.nearestBlock(p.x, p.z); a.sx = chance(0.5) ? 1 : -1; a.sz = chance(0.5) ? 1 : -1; }
  const c = W.corner(a.block, a.sx, a.sz);
  a.tx = c.x + rand(-0.9, 0.9); a.tz = c.z + rand(-0.9, 0.9);
}
function pedNextCorner(p) {
  const a = p.ai;
  if (chance(0.25)) {
    const crossX = chance(0.5);
    const ni = a.block.i + (crossX ? a.sx : 0), nj = a.block.j + (crossX ? 0 : a.sz);
    const nb = W.blockGrid[nj] && W.blockGrid[nj][ni];
    if (nb) { a.block = nb; if (crossX) a.sx = -a.sx; else a.sz = -a.sz; pedTarget(p); return; }
  }
  const order = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let k = order.findIndex((o) => o[0] === a.sx && o[1] === a.sz);
  k = (k + (a.dir > 0 ? 1 : 3)) % 4;
  a.sx = order[k][0]; a.sz = order[k][1];
  pedTarget(p);
}
function moveToward(a, tx, tz, speed, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { a.vx = a.vz = 0; return d; }
  a.vx = (dx / d) * speed; a.vz = (dz / d) * speed;
  a.facing = turnTo(a.facing, Math.atan2(dx, dz), dt * 10);
  return d;
}

function onNpcAttacked(a) {
  if (a.kind === 'ped') {
    if (a.ai.tough && a.hp > a.maxHp * 0.4) { a.ai.mode = 'fight'; a.ai.fightT = 15; }
    else { a.ai.mode = 'flee'; a.ai.fleeT = rand(6, 10); a.ai.thx = G.player.x; a.ai.thz = G.player.z; }
  }
}
function panic(x, z, r) {
  let shouted = false;
  for (const n of G.npcs) {
    if (n.kind !== 'ped' || n.down || n.ai.mode === 'fight' || n.ai.mode === 'vera') continue;
    if (dist(n.x, n.z, x, z) < r) { n.ai.mode = 'flee'; n.ai.fleeT = rand(6, 11); n.ai.thx = x; n.ai.thz = z; if (!shouted) shouted = Voice.bark('ped_panic', n); }
  }
}

function pedAI(p, dt) {
  const a = p.ai;
  if (p.down) { p.downT -= dt; p.vx = p.vz = 0; if (p.downT <= 0) { p.getUp(); a.mode = 'flee'; a.fleeT = 8; a.thx = G.player.x; a.thz = G.player.z; } return; }
  if (p.handsUp > 0) { p.handsUp -= dt; p.vx = p.vz = 0; if (p.handsUp <= 0) { a.mode = 'flee'; a.fleeT = rand(6, 9); a.thx = G.player.x; a.thz = G.player.z; } return; }
  if (a.mode === 'vera') { p.vx = p.vz = 0; const P = G.player; if (dist(p.x, p.z, P.x, P.z) < 8) p.facing = turnTo(p.facing, Math.atan2(P.x - p.x, P.z - p.z), dt * 5); return; }
  if (a.mode === 'park') { // strolling a district's paths (Funland, Millbrook), stopping now and then to look around
    if (a.waitT > 0) { a.waitT -= dt; p.vx = p.vz = 0; return; }
    if (moveToward(p, a.tx, a.tz, a.speed, dt) < 0.7) Strollers.nextTarget(p);
  } else if (a.mode === 'walk') {
    const d = moveToward(p, a.tx, a.tz, a.speed, dt);
    if (d < 0.8) pedNextCorner(p);
  } else if (a.mode === 'flee') {
    a.fleeT -= dt;
    let dx = p.x - a.thx, dz = p.z - a.thz; const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const wob = Math.sin(G.time * 2 + p.anim) * 0.4;
    const vx = dx - dz * wob, vz = dz + dx * wob;
    moveToward(p, p.x + vx * 3, p.z + vz * 3, 5.4, dt);
    if (a.fleeT <= 0) { if (a.park) Strollers.resume(p); else { a.mode = 'walk'; a.block = W.nearestBlock(p.x, p.z); pedTarget(p); } }
  } else if (a.mode === 'fight') {
    a.fightT -= dt;
    const P = G.player;
    if (P.inCar || P.inHeli || a.fightT <= 0 || P.down) { a.mode = 'flee'; a.fleeT = 6; a.thx = P.x; a.thz = P.z; return; }
    const d = dist(p.x, p.z, P.x, P.z);
    if (d > 1.15) moveToward(p, P.x, P.z, 4.6, dt);
    else {
      p.vx = p.vz = 0; p.facing = turnTo(p.facing, Math.atan2(P.x - p.x, P.z - p.z), dt * 10);
      p.cd -= dt;
      if (p.cd <= 0) { p.cd = 1.0; p.atkT = p.atkDur = 0.3; Sfx.punch(p.x, p.z); G.hurtPlayer(6, p.x, p.z, 3, p); }
    }
  }
}

function copSees(c, tx, tz, d) {
  const zone = W.ZONES[G.playerZone] || W.ZONES.street;
  let sight = zone.sight * Weather.sight();
  if (c.ai.mode === 'guard') sight = Math.max(sight, 40);
  if (d > sight) return false;
  if (W.segBlocked(c.x, c.z, tx, tz)) return false;
  if (Smoke.blocks(c.x, c.z, tx, tz)) return false;
  return true;
}

function copAI(c, dt) {
  const a = c.ai, P = G.player;
  if (c.down) { c.downT -= dt; c.vx = c.vz = 0; if (c.downT <= 0) { c.getUp(); a.mode = Heat.level > 0 ? 'chase' : 'walk'; } return; }
  const car = P.inCar, heli = P.inHeli, B = G.body(), tx = B.x, tz = B.z;
  const d = dist(c.x, c.z, tx, tz);
  if (Heat.level === 0 || P.down || G.respawning) {
    if (a.mode !== 'walk') { a.mode = 'walk'; a.block = W.nearestBlock(c.x, c.z); a.sx = 1; a.sz = 1; a.dir = 1; a.speed = 1.8; pedTarget(c); }
    const dd = moveToward(c, a.tx, a.tz, a.speed || 1.8, dt);
    if (dd < 0.8) pedNextCorner(c);
    return;
  }
  if (a.mode === 'walk') a.mode = 'chase';
  a.losT -= dt;
  if (a.losT <= 0) {
    a.losT = rand(0.25, 0.4);
    const saw = a.sees;
    a.sees = copSees(c, tx, tz, d);
    if (a.sees) Heat.spotted(c.x, c.z);
    // shout on first sight, and now and then while chasing on foot
    if (a.sees && !saw && Heat.level > 0) Voice.bark('cop_spot', c, { every: 9 });
    else if (a.sees && Heat.level > 0 && d < 30 && !car && Math.random() < 0.04) Voice.bark('cop_chase', c, { every: 10 });
    else if (!a.sees && saw && Heat.level > 0 && Math.random() < 0.3) Voice.bark('cop_lost', c, { every: 12 });
  }
  a.shootCd -= dt; a.punchCd -= dt;
  const canShoot = Heat.level >= 2 && a.sees;
  if (a.mode === 'guard') {
    c.vx = c.vz = 0; a.guardT = (a.guardT || 0) + dt;
    if (a.guardT > 25 && !a.sees) { a.mode = 'chase'; return; }
    if (a.sees) c.facing = turnTo(c.facing, Math.atan2(tx - c.x, tz - c.z), dt * 6);
    if (canShoot && d < 38 && a.shootCd <= 0) copShoot(c, tx, tz, car);
    if (!car && d < 14) a.mode = 'chase';
    return;
  }
  // chase: pick a navigation target
  let gx = tx, gz = tz;
  if (!a.sees) {
    a.crumbT -= dt;
    if (a.crumbT <= 0) {
      a.crumbT = 0.5;
      a.nav = null;
      const cr = G.crumbs;
      for (let i = cr.length - 1; i >= Math.max(0, cr.length - 24); i--) {
        if (dist(c.x, c.z, cr[i].x, cr[i].z) < 60 && !W.segBlocked(c.x, c.z, cr[i].x, cr[i].z)) { a.nav = cr[i]; break; }
      }
    }
    if (a.nav) { gx = a.nav.x; gz = a.nav.z; a.gnode = null; a.direct = false; }
    else {
      // walk the street grid toward the last place the player was seen
      const lx = Heat.lastX, lz = Heat.lastZ;
      if (a.gnode == null) a.gnode = W.nearestNode(c.x, c.z);
      let n = W.nodes[a.gnode];
      if (!a.direct && dist(c.x, c.z, n.x, n.z) < 3) {
        let best = null, bd = dist(n.x, n.z, lx, lz);
        for (const id of n.adj) { const m = W.nodes[id], d2 = dist(m.x, m.z, lx, lz); if (d2 < bd - 1) { bd = d2; best = id; } }
        if (best == null) a.direct = true; else { a.gnode = best; n = W.nodes[best]; }
      }
      if (a.direct) { gx = lx; gz = lz; } else { gx = n.x; gz = n.z; }
    }
  } else { a.gnode = null; a.direct = false; }
  const stopAt = heli ? 7 : car ? 2.6 : 0.95;
  const dd = dist(c.x, c.z, gx, gz);
  const speed = a.speed + Heat.level * 0.12;
  if (a.sideT > 0) {
    a.sideT -= dt;
    const ang = Math.atan2(gx - c.x, gz - c.z) + a.side * 1.3;
    c.vx = Math.sin(ang) * speed; c.vz = Math.cos(ang) * speed; c.facing = ang;
  } else if (dd > stopAt || !a.sees) moveToward(c, gx, gz, speed, dt);
  else { c.vx = c.vz = 0; c.facing = turnTo(c.facing, Math.atan2(tx - c.x, tz - c.z), dt * 10); }
  // stuck detection
  a.stuckT += dt;
  if (a.stuckT > 0.8) {
    const moved = dist(c.x, c.z, a.lx, a.lz);
    if (moved < 0.5 && dd > 2) { a.sideT = rand(0.5, 1.0); a.side = chance(0.5) ? 1 : -1; }
    a.lx = c.x; a.lz = c.z; a.stuckT = 0;
  }
  // attacks
  if (canShoot && d > 2.2 && d < 24 && a.shootCd <= 0) copShoot(c, tx, tz, car);
  if (!car && !heli && d < 1.35 && P.y < 1.5) {
    Heat.grab(dt);
    if (Heat.level === 1 && a.punchCd <= 0) { a.punchCd = 1.3; c.atkT = c.atkDur = 0.3; Sfx.punch(c.x, c.z); G.hurtPlayer(5, c.x, c.z, 1, c); }
  }
  if (car && d < 3.2 && Math.abs(car.v) < 2) Heat.grab(dt, !car.T.bike);
  if (heli && G.heliLanded(heli) && d < 4) Heat.grab(dt, true);
}
function copShoot(c, tx, tz, car) {
  c.ai.shootCd = c.swat ? rand(0.35, 0.6) : rand(0.9, 1.5) - Heat.level * 0.08;
  const ang = Math.atan2(tx - c.x, tz - c.z) + rand(-1, 1) * (c.swat ? 0.1 : 0.13);
  c.facing = ang; c.atkT = c.atkDur = 0.2; c.aimT = 1;
  Bullets.fire(c, c.x + Math.sin(ang) * 0.6, c.z + Math.cos(ang) * 0.6, ang, c.swat ? 9 : 7, { speed: 70, range: 40, team: 'cop' });
  Sfx.shot(c.swat ? 'smg' : 'pistol', c.x, c.z);
}

/* ---------------- melee ---------------- */
function meleeHit(att, ang, w) {
  const fx = Math.sin(ang), fz = Math.cos(ang);
  let hit = false;
  for (const n of G.npcs) {
    if (n === att || n.down || n.invuln || n.dead || Math.abs((n.y || 0) - (att.y || 0)) > 2) continue;
    const dx = n.x - att.x, dz = n.z - att.z, d = Math.hypot(dx, dz);
    if (d > w.range + n.r) continue;
    if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue;
    const ko = n.hurt(w.dmg, att.x, att.z, w.knock, att);
    hit = true;
    G.crime(n.kind === 'cop' ? 'assaultCop' : 'assault', att.x, att.z, { victim: n, ko });
  }
  for (const car of G.cars) {
    if (car.dead) continue;
    if (dist(car.x, car.z, att.x + fx * 1.2, att.z + fz * 1.2) < 2) { car.damage(w.dmg * 0.25, att.x, att.z); hit = true; }
  }
  for (const al of W.alarms) {
    if (al.cutT > 0) continue;
    if (dist(al.wx, al.wz, att.x + fx, att.z + fz) < 1.6) { G.smashAlarm(al); hit = true; }
  }
  if (hit) Sfx.punch(att.x, att.z); else Sfx.whoosh(att.x, att.z);
  return hit;
}

/* ---------------- bullets ---------------- */
const Bullets = {
  list: [], pool: [], geo: null,
  init() { this.geo = new THREE.BoxGeometry(0.08, 0.08, 1.4); },
  fire(owner, x, z, ang, dmg, o) {
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffe08a })); G.scene.add(m); }
    m.visible = true; m.material.color.set(o.team === 'cop' ? 0xff9f6b : 0xffe08a);
    const y = (owner && owner.y > 0.5 ? owner.y : 0) + 1.35;
    m.position.set(x, y + W.groundAt(x, z), z); m.rotation.set(0, ang, 0);
    const sp = o.speed || 90;
    this.list.push({ m, x, z, y, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life: (o.range || 40) / sp, dmg, owner, team: o.team, knock: o.knock || 2 });
  },
  kill(i) { const b = this.list[i]; b.m.visible = false; this.pool.push(b.m); this.list.splice(i, 1); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      let done = false;
      // actors
      const P = G.player;
      const targets = b.team === 'cop' ? [P] : G.npcs;
      for (const t of targets) {
        if (t === b.owner || t.down || t.dead || t.invuln) continue;
        if (t === P && P.inCar && !P.inCar.T.bike) continue;
        if (t === P && P.inHeli) {
          const h = P.inHeli;
          if (segPointDist(h.x, h.z, b.x, b.z, nx, nz) < 2.4) { h.damage(b.dmg * 0.5, b.owner); done = true; break; }
          continue;
        }
        if (segPointDist(t.x, t.z, b.x, b.z, nx, nz) < t.r + 0.18) {
          const ko = t.hurt(b.dmg, b.x, b.z, b.knock, b.owner);
          if (b.owner === P) G.crime(t.kind === 'cop' ? 'assaultCop' : 'assault', P.x, P.z, { victim: t, ko });
          done = true; break;
        }
      }
      if (!done) for (const car of G.cars) {
        if (car.dead || car === (b.owner && b.owner.inCar)) continue;
        if (segPointDist(car.x, car.z, b.x, b.z, nx, nz) < 1.25) {
          car.damage(b.dmg * 0.35, b.x, b.z, b.owner);
          FX.burst(nx, 1, nz, 4, ['#ffd166', '#ffffff'], 5, 0.1, 0.3);
          done = true; break;
        }
      }
      if (!done && b.team !== 'cop') for (const cam of W.cams) {
        if (cam.deadT > 0) continue;
        if (segPointDist(cam.x, cam.z, b.x, b.z, nx, nz) < 0.7) { G.destroyCam(cam); done = true; break; }
      }
      if (!done && W.segBlocked(b.x, b.z, nx, nz, b.y - 1.35)) { FX.burst(nx, 1.3, nz, 4, ['#cfcfcf', '#ffd166'], 3, 0.1, 0.3); done = true; }
      b.x = nx; b.z = nz; b.life -= dt;
      b.m.position.set(nx, b.y + W.groundAt(nx, nz), nz);
      if (done || b.life <= 0) this.kill(i);
    }
  },
  clear() { while (this.list.length) this.kill(this.list.length - 1); },
};

/* ---------------- pickups ---------------- */
const Pickups = {
  list: [],
  add(kind, x, z, amount) {
    const g = new THREE.Group();
    if (kind === 'cash') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.45), lam('#4caf50')); g.add(m);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.47), lam('#f1faee')); g.add(band);
    } else if (kind === 'ammo') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), lam('#c9a227')));
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), lam('#e63946')));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), lam('#e63946')));
    }
    g.position.set(x, 0.5 + W.groundAt(x, z), z); G.scene.add(g);
    this.list.push({ kind, x, z, amount, g, t: 0 });
  },
  update(dt) {
    const P = G.player, B = G.body(), px = B.x, pz = B.z, low = (!P.inHeli || P.inHeli.y < 3) && P.y < 2;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      p.g.rotation.y += dt * 2.5; p.g.position.y = 0.5 + Math.sin(p.t * 4) * 0.12 + W.groundAt(p.x, p.z);
      if (!P.down && low && dist(px, pz, p.x, p.z) < (P.inCar || P.inHeli ? 2.6 : 1.3)) { G.collect(p); G.scene.remove(p.g); this.list.splice(i, 1); continue; }
      if (p.t > 60) { G.scene.remove(p.g); this.list.splice(i, 1); }
    }
  },
  clear() { for (const p of this.list) G.scene.remove(p.g); this.list.length = 0; },
};

/* ---------------- smoke bombs ---------------- */
const Smoke = {
  clouds: [],
  add(x, z) { this.clouds.push({ x, z, r: 6.5, t: 12, emit: 0 }); Sfx.smoke(x, z); },
  blocks(ax, az, bx, bz) {
    for (const c of this.clouds) if (segPointDist(c.x, c.z, ax, az, bx, bz) < c.r) return true;
    return false;
  },
  update(dt) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]; c.t -= dt; c.emit -= dt;
      if (c.emit <= 0) {
        c.emit = 0.06;
        const a = rand(0, TAU), r = rand(0, c.r * 0.8);
        FX.spawn(c.x + Math.cos(a) * r, rand(0.3, 2.5), c.z + Math.sin(a) * r, rand(-0.4, 0.4), rand(0.2, 0.7), rand(-0.4, 0.4), pick(['#d9d9d9', '#bfbfbf', '#e8e8e8']), rand(1.2, 2.2), 2.4, { grav: 0, grow: 1.2, drag: 0.3 });
      }
      if (c.t <= 0) this.clouds.splice(i, 1);
    }
  },
  clear() { this.clouds.length = 0; },
};
