'use strict';
/* Box3D rigid-body physics (Erin Catto's engine, via the box3d-wasm port, loaded from jsDelivr).
   Used for: ragdolls when someone is knocked out, loose street props (bins, cones, crates, newspaper boxes),
   flying car parts, and explosion impulses. The arcade car/actor/helicopter movement is unchanged.
   If the module can't load (offline, or ?nophys), everything falls back to the hand-animated knockdowns. */

const PHYS_URL = 'https://cdn.jsdelivr.net/npm/box3d-wasm@0.2.0/dist/box3d.mjs';

const Phys = {
  ready: false, b3: null, world: null,
  ragdolls: [], props: [], debris: [], statics: new Set(), kin: new Map(), playerKin: null,
  bodies: 0, ragdollBodies: 0, group: 1, activeT: 0,
  q: new THREE.Quaternion(), v: new THREE.Vector3(), v2: new THREE.Vector3(),

  init() {
    if (new URLSearchParams(location.search).has('nophys')) return Promise.resolve(false);
    const load = import(PHYS_URL).then((m) => m.default()).then((b3) => {
      this.b3 = b3;
      this.world = new b3.World({ gravity: { x: 0, y: -20, z: 0 }, enableSleep: true, enableContinuous: true });
      const g = this.world.createBody({ type: 'static', position: { x: 0, y: -0.5, z: 0 } });
      g.createBox({ halfExtents: { x: 4000, y: 0.5, z: 4000 }, friction: 0.8 });
      this.ready = true;
      return true;
    });
    const timeout = new Promise((r) => setTimeout(() => r(false), 4000));
    return Promise.race([load, timeout]).catch(() => false);
  },

  body(opts) { this.bodies++; return this.world.createBody(opts); },
  kill(b) { if (!b) return; try { b.destroy(); b.delete(); } catch (e) { /* already gone */ } this.bodies--; },

  /* static copies of nearby walls and buildings, added lazily around whatever is moving */
  ensureStatics(x, z, r) {
    for (const c of W.queryBox(x - r, z - r, x + r, z + r)) {
      if (this.statics.has(c) || c.kind === 'bound' || c.removed) continue;
      this.statics.add(c);
      const h = Math.max(0.6, c.h || 3);
      if (c.circle) { const b = this.world.createBody({ type: 'static', position: { x: c.x, y: h / 2, z: c.z } }); b.createBox({ halfExtents: { x: c.r * 0.9, y: h / 2, z: c.r * 0.9 } }); if (c.destructible) c.physBody = b; else b.delete(); }
      else { const b = this.world.createBody({ type: 'static', position: { x: (c.minX + c.maxX) / 2, y: h / 2, z: (c.minZ + c.maxZ) / 2 } }); b.createBox({ halfExtents: { x: (c.maxX - c.minX) / 2, y: h / 2, z: (c.maxZ - c.minZ) / 2 } }); if (c.destructible) c.physBody = b; else b.delete(); }
    }
    for (const bd of W.buildings) {
      if (this.statics.has(bd) || bd.maxX < x - r || bd.minX > x + r || bd.maxZ < z - r || bd.minZ > z + r) continue;
      this.statics.add(bd);
      const b = this.world.createBody({ type: 'static', position: { x: (bd.minX + bd.maxX) / 2, y: bd.h / 2, z: (bd.minZ + bd.maxZ) / 2 } });
      b.createBox({ halfExtents: { x: (bd.maxX - bd.minX) / 2, y: bd.h / 2, z: (bd.maxZ - bd.minZ) / 2 } }); b.delete();
    }
  },

  /* ---------------- ragdolls ---------------- */
  PARTS: [
    { key: 'torso', half: { x: 0.3, y: 0.36, z: 0.16 }, off: 0, mass: 3 },
    { key: 'head', half: { x: 0.19, y: 0.19, z: 0.19 }, off: 0, mass: 1 },
    { key: 'armL', half: { x: 0.08, y: 0.35, z: 0.09 }, off: -0.33, mass: 0.6 },
    { key: 'armR', half: { x: 0.08, y: 0.35, z: 0.09 }, off: -0.33, mass: 0.6 },
    { key: 'legL', half: { x: 0.11, y: 0.42, z: 0.12 }, off: -0.43, mass: 1.2 },
    { key: 'legR', half: { x: 0.11, y: 0.42, z: 0.12 }, off: -0.43, mass: 1.2 },
  ],
  JOINTS: [
    // [part, parent, anchor on parent, anchor on part, cone, twist]
    ['head', 'torso', { x: 0, y: 0.38, z: 0 }, { x: 0, y: -0.2, z: 0 }, 0.6, 0.5],
    ['armL', 'torso', { x: -0.39, y: 0.33, z: 0 }, { x: 0, y: 0.35, z: 0 }, 1.9, 0.6],
    ['armR', 'torso', { x: 0.39, y: 0.33, z: 0 }, { x: 0, y: 0.35, z: 0 }, 1.9, 0.6],
    ['legL', 'torso', { x: -0.14, y: -0.37, z: 0 }, { x: 0, y: 0.43, z: 0 }, 1.2, 0.35],
    ['legR', 'torso', { x: 0.14, y: -0.37, z: 0 }, { x: 0, y: 0.43, z: 0 }, 1.2, 0.35],
  ],
  ragdoll(a, vel, spin) {
    if (!this.ready || a.ragdoll || a.dead) return false;
    // too many: freeze the oldest — never the player, who has to get back up
    if (this.ragdolls.length >= 8) { const old = this.ragdolls.find((r) => r !== G.player); if (old) this.freeze(old); }
    const rg = a.rig, group = -(++this.group % 30000 + 1);
    rg.root.updateMatrixWorld(true);
    this.ensureStatics(a.x, a.z, 14);
    const sp = Math.hypot(vel.x, vel.y, vel.z), k = sp > 40 ? 40 / sp : 1;
    const parts = {}, joints = [];
    for (const def of this.PARTS) {
      const mesh = rg[def.key];
      mesh.getWorldPosition(this.v); mesh.getWorldQuaternion(this.q);
      this.v2.set(0, def.off, 0).applyQuaternion(this.q).add(this.v);
      const b = this.body({ type: 'dynamic', position: { x: this.v2.x, y: Math.max(this.v2.y, def.half.y), z: this.v2.z }, rotation: { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w },
        linearVelocity: { x: vel.x * k, y: vel.y * k, z: vel.z * k }, angularDamping: 0.8, linearDamping: 0.05 });
      b.createBox({ halfExtents: def.half, density: def.mass / (8 * def.half.x * def.half.y * def.half.z), friction: 0.8, restitution: 0.05, filter: { categoryBits: 2, maskBits: 0xffff, groupIndex: group } });
      parts[def.key] = { b, mesh, off: def.off }; this.ragdollBodies++;
    }
    for (const [key, parent, pa, pb, cone, twist] of this.JOINTS) {
      joints.push(this.world.createSphericalJoint(parts[parent].b, parts[key].b, { localFrameA: { position: pa }, localFrameB: { position: pb }, enableConeLimit: true, coneAngle: cone, enableTwistLimit: true, lowerTwistAngle: -twist, upperTwistAngle: twist, collideConnected: false }));
    }
    // a little tumble (or a proper somersault when thrown off a bike)
    parts.torso.b.applyAngularImpulse(spin || { x: rand(-1, 1), y: rand(-0.5, 0.5), z: rand(-1, 1) }, true);
    // the meshes now take world transforms straight from the bodies
    rg.root.position.set(0, 0, 0); rg.root.rotation.set(0, 0, 0); rg.body.position.set(0, 0, 0); rg.body.rotation.set(0, 0, 0);
    a.ragdoll = { parts, joints, t: 0, spd: sp, sx: a.x, sz: a.z, px: a.x, py: 1, pz: a.z };
    this.ragdolls.push(a);
    return true;
  },
  /* too many ragdolls: the oldest stops simulating and stays where it lies */
  freeze(a) {
    const r = a.ragdoll; if (!r || r.frozen) return;
    for (const j of r.joints) { try { j.destroy(); j.delete(); } catch (e) { /* gone */ } }
    for (const k in r.parts) { this.kill(r.parts[k].b); this.ragdollBodies--; }
    a.ragdoll = { frozen: true };
    this.ragdolls.splice(this.ragdolls.indexOf(a), 1);
  },
  unragdoll(a) {
    const r = a.ragdoll; if (!r) return;
    if (!r.frozen) {
      const t = r.parts.torso.b.getPosition(), q = r.parts.torso.b.getRotation();
      a.x = t.x; a.z = t.z; a.facing = new THREE.Euler().setFromQuaternion(this.q.set(q.x, q.y, q.z, q.w), 'YXZ').y;
      for (const j of r.joints) { try { j.destroy(); j.delete(); } catch (e) { /* gone */ } }
      for (const k in r.parts) { this.kill(r.parts[k].b); this.ragdollBodies--; }
      const i = this.ragdolls.indexOf(a); if (i >= 0) this.ragdolls.splice(i, 1);
    }
    a.ragdoll = null; a.y = 0; a.yv = 0;
    W.collideCircle(a, a.r);
    a.resetPose();
  },
  syncRagdolls(dt) {
    for (const a of this.ragdolls) {
      const r = a.ragdoll; { const t0 = r.parts.torso.b.getPosition(); r.gnd = W.groundAt(t0.x, t0.z); }
      for (const k in r.parts) {
        const p = r.parts[k], pos = p.b.getPosition(), rot = p.b.getRotation();
        if (!isFinite(pos.x + pos.y + pos.z)) continue;
        p.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        this.v.set(0, -p.off, 0).applyQuaternion(p.mesh.quaternion);
        p.mesh.position.set(pos.x + this.v.x, pos.y + this.v.y + r.gnd, pos.z + this.v.z);
      }
      const t = r.parts.torso.b.getPosition();
      if (isFinite(t.x + t.z)) {
        a.x = t.x; a.z = t.z; r.t += dt;
        r.spd = Math.hypot(t.x - r.px, t.y - r.py, t.z - r.pz) / dt; r.px = t.x; r.py = t.y; r.pz = t.z;
        // a body flying across the map needs the walls ahead of it to exist in the physics world
        if (Math.abs(t.x - r.sx) > 5 || Math.abs(t.z - r.sz) > 5) { r.sx = t.x; r.sz = t.z; this.ensureStatics(t.x, t.z, 16); }
      }
      if (a.stars) { const h = r.parts.head.b.getPosition(); a.stars.position.set(h.x, h.y + 0.5 + r.gnd, h.z); a.stars.rotation.y += 0.05; }
    }
  },

  /* ---------------- loose props: bins, cones, crates, newspaper boxes ---------------- */
  PROP_KINDS: {
    bin: { half: { x: 0.35, y: 0.5, z: 0.35 }, color: '#2f6b4a', density: 0.4 },
    cone: { half: { x: 0.25, y: 0.38, z: 0.25 }, color: '#ff7b00', density: 0.25 },
    crate: { half: { x: 0.45, y: 0.45, z: 0.45 }, color: '#9b7650', density: 0.35 },
    news: { half: { x: 0.3, y: 0.55, z: 0.25 }, color: '#2f5fa0', density: 0.5 },
  },
  propMesh(kind) {
    const d = this.PROP_KINDS[kind], g = new THREE.Group();
    if (kind === 'cone') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(d.half.x, d.half.y * 2, 10), lam(d.color)); g.add(c);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(d.half.x * 0.55, d.half.x * 0.7, 0.12, 10), lam('#ffffff')); s.position.y = 0.02; g.add(s);
    } else if (kind === 'bin') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(d.half.x, d.half.x * 0.85, d.half.y * 2, 12), lam(d.color)));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(d.half.x * 1.05, d.half.x * 1.05, 0.08, 12), lam('#244f37')); lid.position.y = d.half.y; g.add(lid);
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(d.half.x * 2, d.half.y * 2, d.half.z * 2), lam(d.color)));
      if (kind === 'news') { const w = new THREE.Mesh(new THREE.BoxGeometry(d.half.x * 1.4, 0.25, 0.02), lam('#dfe9f5')); w.position.set(0, 0.15, d.half.z + 0.01); g.add(w); }
    }
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    G.scene.add(g);
    return g;
  },
  spawnProps() {
    for (const s of W.propSpots) {
      const d = this.PROP_KINDS[s.kind];
      const p = { kind: s.kind, x: s.x, y: d.half.y, z: s.z, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot || 0), body: null, mesh: this.propMesh(s.kind) };
      p.mesh.position.set(p.x, p.y, p.z); p.mesh.quaternion.copy(p.q);
      this.props.push(p);
    }
  },
  /* bodies exist only near the player; far props keep their last resting pose */
  activateProps() {
    const P = G.body();
    for (const p of this.props) {
      const d = dist(p.x, p.z, P.x, P.z);
      if (!p.body && d < 70) {
        this.ensureStatics(p.x, p.z, 6);
        const def = this.PROP_KINDS[p.kind];
        p.body = this.body({ type: 'dynamic', position: { x: p.x, y: p.y, z: p.z }, rotation: { x: p.q.x, y: p.q.y, z: p.q.z, w: p.q.w }, angularDamping: 0.3, linearDamping: 0.05 });
        p.body.createBox({ halfExtents: def.half, density: def.density, friction: 0.6, restitution: 0.15 });
      } else if (p.body && d > 95) { this.kill(p.body); p.body = null; }
    }
  },
  syncProps() {
    for (const p of this.props) {
      if (!p.body) continue;
      const pos = p.body.getPosition(), rot = p.body.getRotation();
      if (!isFinite(pos.x + pos.y + pos.z)) continue;
      p.x = pos.x; p.y = pos.y; p.z = pos.z; p.q.set(rot.x, rot.y, rot.z, rot.w);
      p.mesh.position.set(p.x, p.y + W.groundAt(p.x, p.z), p.z); p.mesh.quaternion.copy(p.q);
    }
  },

  /* ---------------- flying car parts ---------------- */
  debrisPiece(mesh, x, y, z, rotY, vel, spin, half) {
    if (!this.ready) return false;
    if (this.debris.length > 40) { const old = this.debris.shift(); this.kill(old.b); G.scene.remove(old.mesh); }
    this.ensureStatics(x, z, 10);
    const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const b = this.body({ type: 'dynamic', position: { x, y, z }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w }, linearVelocity: vel, angularVelocity: spin, angularDamping: 0.2 });
    b.createBox({ halfExtents: half || { x: Math.max(0.05, size.x / 2), y: Math.max(0.05, size.y / 2), z: Math.max(0.05, size.z / 2) }, density: 0.6, friction: 0.7, restitution: 0.2 });
    mesh.position.set(x, y, z); mesh.quaternion.copy(q); G.scene.add(mesh);
    this.debris.push({ b, mesh, t: 45 });
    return true;
  },
  syncDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], pos = d.b.getPosition(), rot = d.b.getRotation();
      d.t -= dt;
      if (d.t <= 0 || !isFinite(pos.x)) { this.kill(d.b); G.scene.remove(d.mesh); this.debris.splice(i, 1); continue; }
      d.mesh.position.set(pos.x, pos.y + W.groundAt(pos.x, pos.z), pos.z); d.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }
  },

  /* ---------------- moving obstacles: cars and the player push things around ---------------- */
  syncKinematics(dt) {
    const near = [];
    for (const a of this.ragdolls) near.push(a.x, a.z);
    for (const p of this.props) if (p.body) near.push(p.x, p.z);
    for (const d of this.debris) { const pos = d.b.getPosition(); near.push(pos.x, pos.z); }
    const isNear = (x, z, r) => { for (let i = 0; i < near.length; i += 2) if (Math.abs(near[i] - x) < r && Math.abs(near[i + 1] - z) < r) return true; return false; };
    for (const c of G.cars) {
      let k = this.kin.get(c);
      const want = !c.dead && isNear(c.x, c.z, 14);
      if (!want) { if (k) { this.kill(k); this.kin.delete(c); } continue; }
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), c.h);
      const hh = c.T.bike ? 0.5 : 0.75, y = hh + (c.y || 0);
      if (!k) { k = this.body({ type: 'kinematic', position: { x: c.x, y, z: c.z }, rotation: { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w } }); k.createBox({ halfExtents: { x: c.T.w / 2, y: hh, z: c.T.len / 2 }, friction: 0.5 }); this.kin.set(c, k); }
      else k.setTargetTransform({ position: { x: c.x, y, z: c.z }, rotation: { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w } }, dt);
    }
    for (const [c, k] of this.kin) if (c.dead) { this.kill(k); this.kin.delete(c); }
    // the player's body, so you can walk into a bin and knock it over
    const P = G.player, on = !P.inCar && !P.inHeli && !P.ragdoll && !P.down && isNear(P.x, P.z, 6);
    if (on) {
      const pos = { x: P.x, y: P.y + 0.9, z: P.z };
      if (!this.playerKin) { this.playerKin = this.body({ type: 'kinematic', position: pos }); this.playerKin.createBox({ halfExtents: { x: 0.3, y: 0.9, z: 0.3 } }); }
      else this.playerKin.setTargetTransform({ position: pos, rotation: { x: 0, y: 0, z: 0, w: 1 } }, dt);
    } else if (this.playerKin) { this.kill(this.playerKin); this.playerKin = null; }
  },

  explode(x, z, r) {
    if (!this.ready) return;
    // blast centre just under the street, so things get thrown up and out, not just shoved sideways
    this.world.explode({ position: { x, y: -1.2, z }, radius: r * 1.6, falloff: r, impulsePerArea: 26 });
  },

  step(dt) {
    if (!this.ready) return;
    this.activeT -= dt;
    if (this.activeT <= 0) { this.activeT = 0.5; this.activateProps(); }
    this.syncKinematics(dt);
    this.world.step(dt, 4);
    this.syncRagdolls(dt); this.syncProps(); this.syncDebris(dt);
  },

  clearRagdolls() { for (const a of this.ragdolls.slice()) this.unragdoll(a); },
};
