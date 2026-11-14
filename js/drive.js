'use strict';
/* Realistic handling: the car you drive is a Box3D rigid body on four spring-damper wheels.
   Each wheel finds the ground under it (hills, ramps, kerbs: W.groundAt), pushes back with its spring, and grips with
   a tyre model (drive, brakes, cornering grip, a friction circle, the handbrake locking the rears), so the car pitches
   under braking, rolls in corners, rides up kerbs, bounces off walls and gets shunted by the cars it hits.

   It writes its result back into the Car (x, z, h, v, vx, vz, y) so the camera, skids, sound, stunts, damage, people
   getting hit and everything else carry on unchanged; anything that moves the car from outside (a teleport, a shunt
   from another car, an explosion) is pushed back into the body before the next step.

   Like ragdolls and props, the body lives in "height above the local ground" — the ground under the car's centre is
   y = 0, and the frame is shifted as that ground rises and falls (keeping the car's height in the world), so it
   shares the physics world with everything else.

   Bikes stay on the arcade model (balance, hops, bails), and AI cars do too: you hit them through the same car-to-car
   contacts as before. Without Box3D (offline, ?nophys), with ?arcade, or with L pressed, cars use the arcade model. */

const PhysCar = {
  car: null, b: null, on: true, wheels: [], inp: { thr: 0, steer: 0, hb: false, boost: false }, last: null,
  g0: 0, gvy: 0, airT: 0, wasAir: false, upsideT: 0, steerA: 0, statX: 1e9, statZ: 1e9, oneWay: new Map(), launch: null,
  RIDE: 0.83, R: 0.36, L0: 0.52, G: 20,
  Q: new THREE.Quaternion(), V: new THREE.Vector3(),

  init() {
    let pref = null; try { pref = localStorage.getItem('lootrun.handling'); } catch (e) { /* private window */ }
    this.on = !new URLSearchParams(location.search).has('arcade') && pref !== 'arcade';
  },
  usable(car) { return !!(Phys.ready && this.on && car && !car.T.bike && !car.dead && !car.wreck); },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('lootrun.handling', this.on ? 'physics' : 'arcade'); } catch (e) { /* fine */ }
    const car = G.player.inCar;
    if (!this.on) this.detach(); else if (car) this.attach(car);
    return this.on;
  },
  grip(car) { return { supercar: 1.4, sports: 1.38, muscle: 1.2, police: 1.3, taxi: 1.22, truck: 1.0, van: 1.05, armored: 1.0, suv: 1.15, pickup: 1.12, hatch: 1.25 }[car.type] || 1.25; },

  attach(car) {
    if (!this.usable(car)) return false;
    if (this.car && this.car !== car) this.detach();
    if (this.car === car) return true;
    // the body's box runs from just above the wheels' bottoms to the top of the roof, so it lies right on its roof or side
    const T = car.T, m = 1200 * T.mass, mesh = car.mesh, p0 = mesh.position.clone(), q0 = mesh.quaternion.clone();
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh);
    mesh.position.copy(p0); mesh.quaternion.copy(q0); mesh.updateMatrixWorld(true);
    const top = clamp(bb.max.y, 1.1, 3.4), hx = T.w / 2 * 0.9, hy = (top - 0.45) / 2, hz = T.len / 2 * 0.92, oy = 0.45 + hy - this.RIDE;
    const b = Phys.body({ type: 'dynamic', position: { x: car.x, y: this.RIDE + (car.y || 0), z: car.z }, rotation: this.yawQ(car.h),
      linearVelocity: { x: car.vx, y: Math.max(0, car.yv || 0), z: car.vz }, angularDamping: 0.35, linearDamping: 0.01 });
    // the body shell, and low ballast so it takes a hard corner without tipping over (the centre of mass sits low, like a real car's)
    // not the kinematic stand-ins for other cars (those contacts are the arcade's), nor the physics world's flat floor (it rides the real ground)
    const filter = { categoryBits: 1, maskBits: 0xffff & ~4 & ~8 };
    // half the mass in the shell, half as ballast low down at the front and back (low centre of mass, and it still turns like a long car)
    b.createBox({ halfExtents: { x: hx, y: hy, z: hz }, offset: { x: 0, y: oy, z: 0 }, density: (m * 0.5) / (8 * hx * hy * hz), friction: 0.3, restitution: 0.12, filter });
    for (const s of [-1, 1]) b.createSphere({ radius: 0.12, center: { x: 0, y: -0.16, z: s * hz * 0.75 }, density: (m * 0.25) / (4.19 * 0.12 ** 3), friction: 0.3, filter });
    this.b = b; this.car = car; this.m = b.getMass(); this.dims = { hx, hy, hz, oy }; this.floorHit = false;
    const track = T.w / 2 * 0.86, base = T.len / 2 * 0.66;
    this.wheels = [[-track, base, true], [track, base, true], [-track, -base, false], [track, -base, false]].map(([lx, lz, front]) => ({ lx, lz, front, l: this.L0 - 0.16, on: false, slip: 0 }));
    this.g0 = W.groundAt(car.x, car.z); this.gvy = 0; this.airT = 0; this.wasAir = false; this.landing = null; this.upsideT = 0; this.steerA = 0; this.launch = null;
    this.statX = this.statZ = 1e9; this.ensureStatics(car.x, car.z, 0);
    if (Phys.kin.has(car)) { Phys.kill(Phys.kin.get(car)); Phys.kin.delete(car); }
    this.write();
    return true;
  },
  detach() {
    const c = this.car, b = this.b; if (!b) return;
    this.write(); c.y = Math.max(0, c.y); c.yv = c.y > 0.05 ? b.getLinearVelocity().y : 0;
    for (const [, ob] of this.oneWay) Phys.kill(ob); this.oneWay.clear();
    Phys.kill(b); this.b = null; this.car = null; this.last = null;
  },
  yawQ(h) { this.Q.setFromAxisAngle(this.V.set(0, 1, 0), h); return { x: this.Q.x, y: this.Q.y, z: this.Q.z, w: this.Q.w }; },
  ensureStatics(x, z, sp) {
    if (Math.abs(x - this.statX) < 8 && Math.abs(z - this.statZ) < 8) return;
    this.statX = x; this.statZ = z; Phys.ensureStatics(x, z, 30 + sp * 1.2);
  },

  /* the arcade's drive() hands its input over here */
  input(thr, steer, hb, boost) { this.inp.thr = thr; this.inp.steer = steer; this.inp.hb = hb; this.inp.boost = boost; },

  /* before the physics step: suspension and tyre forces */
  preStep(dt) {
    const c = this.car, b = this.b;
    if (!b) return;
    if (c.dead || c.driver !== 'player' || G.player.inCar !== c || !this.on || !Phys.ready) { this.detach(); return; }
    this.smash(); // knock down trees, lamp posts, pumps and cacti you hit at speed (the slowdown goes through sync)
    this.sync();
    this.water();
    const pos = b.getPosition(), q = b.getRotation(), lv = b.getLinearVelocity(), av = b.getAngularVelocity(), m = this.m, Gr = this.G;
    const Q = this.Q.set(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(Q), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(Q), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
    // the tyres pull with the car's own acceleration; nitro is extra thrust on top (it isn't limited by grip)
    const lim = c.limits(this.inp.boost), maxV = lim.maxV, accel = c.limits(false).accel, thrust = this.inp.boost ? lim.accel - accel : 0;
    const fh = Math.hypot(fw.x, fw.z) || 1, vF = (lv.x * fw.x + lv.z * fw.z) / fh, sp = Math.hypot(lv.x, lv.z);
    let thr = this.inp.thr, steer = this.inp.steer, hb = this.inp.hb;
    if (c.burning > 0 || c.wreck) { thr = 0; steer = 0; hb = true; }
    // steering: full lock when slow, a few degrees at speed; a flat tyre tugs the wheel
    const lock = 0.6 / (1 + Math.abs(vF) / 11);
    this.steerA = damp(this.steerA, -steer * lock + (c.popped ? Math.sin(G.time * 13) * 0.05 : 0), 9 / (1 + Math.abs(vF) / 25), dt); // keys ease in gently at speed
    c.steerV = steer;
    // grip: tyres, weather, surface (SUVs and utes keep theirs off-road)
    const zone = W.zoneAt(c.x, c.z), off = OFFROAD_ZONES.includes(zone);
    const mu0 = this.grip(c) * Weather.grip() * (off ? (OFFROAD[c.type] ? 0.95 : 0.78) : 1) * (c.popped ? 0.75 : 1);
    let contacts = 0;
    const kS = (m * Gr / 4) / 0.17, cS = 2 * 0.5 * Math.sqrt(kS * m / 4); // static sag 0.17 m, damping ratio 0.5
    for (const w of this.wheels) {
      const M = { x: pos.x + rt.x * w.lx + fw.x * w.lz - up.x * 0.12, y: pos.y + rt.y * w.lx + fw.y * w.lz - up.y * 0.12, z: pos.z + rt.z * w.lx + fw.z * w.lz - up.z * 0.12 };
      const S = W.groundAt(M.x, M.z) - this.g0, d = (M.y - S) / Math.max(0.35, up.y), l = d - this.R;
      if (l >= this.L0) { w.on = false; w.l = this.L0; w.slip = 0; continue; }
      w.on = true; contacts++;
      const x = this.L0 - Math.max(l, -0.1), vl = (l - w.l) / dt; w.l = l;
      const Fs = clamp(kS * x - cS * vl + (l < 0 ? kS * 6 * -l : 0), 0, m * Gr * 4);
      // the wheel's heading: the fronts steer
      const ca = Math.cos(this.steerA), sa = Math.sin(this.steerA);
      const wf = w.front ? new THREE.Vector3(fw.x * ca + rt.x * sa, fw.y * ca + rt.y * sa, fw.z * ca + rt.z * sa) : fw.clone();
      const wr = new THREE.Vector3().crossVectors(up, wf).normalize(); // across the wheel
      // contact patch velocity: v + w x r
      const rx = M.x - pos.x, ry = M.y - d * up.y - pos.y, rz = M.z - pos.z;
      const vx = lv.x + av.y * rz - av.z * ry, vy = lv.y + av.z * rx - av.x * rz, vz = lv.z + av.x * ry - av.y * rx;
      const vLong = vx * wf.x + vy * wf.y + vz * wf.z, vLat = vx * wr.x + vy * wr.y + vz * wr.z;
      const mu = mu0 * (hb && !w.front ? 0.5 : 1), N = Fs, cap = mu * N;
      // drive (40/60 front/rear), brakes, reverse, rolling resistance, handbrake lock
      let Fx = 0;
      const share = (w.front ? 0.4 : 0.6) / 2;
      if (thr > 0) {
        if (vF < -0.6) Fx = m * 26 * share;
        else Fx = m * accel * thr * share * clamp((maxV - vF) / 2.5, 0, 1);
      } else if (thr < 0) {
        if (vF > 0.6) Fx = -m * 26 * share;
        else Fx = -m * accel * 0.6 * share * clamp((maxV * 0.4 + vF) / 2, 0, 1);
      } else Fx = -Math.sign(vLong) * Math.min(Math.abs(vLong) * m * 0.5, m * 4) / 4;
      if (hb && !w.front) Fx = -Math.sign(vLong) * cap * 0.85;
      if (c.burning > 0 || c.wreck) Fx = -Math.sign(vLong) * Math.min(cap, Math.abs(vLong) * m);
      let Fy = -vLat * (cap / 1.0); // full grip at 1 m/s of sideways slip
      // the friction circle: what's left of the grip after driving or braking goes to cornering
      const tot = Math.hypot(Fx, Fy); if (tot > cap) { Fx *= cap / tot; Fy *= cap / tot; }
      w.slip = Math.abs(vLat) + (hb && !w.front ? Math.abs(vLong) * 0.3 : 0);
      // tyre forces act a little below the centre of mass (a roll centre), suspension at the wheel
      const ax = pos.x + rt.x * w.lx + fw.x * w.lz - up.x * 0.3, ay = pos.y + rt.y * w.lx + fw.y * w.lz - up.y * 0.3, az = pos.z + rt.z * w.lx + fw.z * w.lz - up.z * 0.3;
      b.applyForce({ x: wf.x * Fx + wr.x * Fy, y: wf.y * Fx + wr.y * Fy, z: wf.z * Fx + wr.z * Fy }, { x: ax, y: ay, z: az }, true);
      b.applyForce({ x: up.x * Fs, y: up.y * Fs, z: up.z * Fs }, M, true);
    }
    // stability assist (keyboard steering is all-or-nothing): nudge the yaw towards what the steering asks for, within
    // what the tyres could give; off with the handbrake, so you can still throw it into a slide
    if (contacts >= 3 && !hb && Math.abs(vF) > 3) {
      const wb = 2 * this.wheels[0].lz, rMax = mu0 * Gr * 1.6 / Math.abs(vF), rDes = clamp(vF * Math.tan(this.steerA) / wb, -rMax, rMax);
      const r = av.x * up.x + av.y * up.y + av.z * up.z, I = m * (c.T.len * c.T.len + c.T.w * c.T.w) / 12 * 0.8, tq = clamp((rDes - r) * I * 3, -m * 6, m * 6);
      b.applyTorque({ x: up.x * tq, y: up.y * tq, z: up.z * tq }, true);
    }
    // downforce: the faster you go the harder the air presses the car onto its tyres (about double the grip flat out)
    if (contacts) { const df = m * 0.0065 * vF * vF; b.applyForceToCenter({ x: -up.x * df, y: -up.y * df, z: -up.z * df }, true); }
    if (thrust > 0 && thr > 0 && vF < maxV) b.applyForceToCenter({ x: fw.x * m * thrust, y: 0, z: fw.z * m * thrust }, true);
    // over the speed limit (it changes with the zone): ease back to it
    if (vF > maxV + 0.3 && contacts) { const k = m * Math.min(12, (vF - maxV) * 3); b.applyForceToCenter({ x: -fw.x * k, y: 0, z: -fw.z * k }, true); }
    // in the air: settle the spin and drift back level, so jumps land on the wheels more often than not
    if (!contacts) {
      b.applyTorque({ x: -av.x * m * 0.9 - up.z * m * 2.5, y: -av.y * m * 0.3, z: -av.z * m * 0.9 + up.x * m * 2.5 }, true); // up x worldUp, toward level
    }
    // parked: don't creep down slopes
    if (contacts >= 3 && thr === 0 && sp < 0.35 && !hb) b.setLinearVelocity({ x: lv.x * 0.6, y: lv.y, z: lv.z * 0.6 });
    this.contacts = contacts; this.sp = sp;
    // on a stunt ramp the car rides the wedge like a rail (springs can't lift a car up a steep ramp at 40 m/s in a
    // third of a second): pitched to the slope, rising with it; at the lip physics takes over with that climb
    const rp = contacts && W.rampAt(pos.x, pos.z) > 0.02 ? W.rampUnder(pos.x, pos.z) : null;
    if (rp) {
      const dirV = lv.x * rp.fx + lv.z * rp.fz, s = rp.h / rp.len, yaw = Math.atan2(fw.x, fw.z), facing = Math.cos(yaw - Math.atan2(rp.fx, rp.fz));
      this.Q.setFromEuler(new THREE.Euler(-Math.atan(s * facing), yaw, 0, 'YXZ'));
      b.setTransform({ x: pos.x, y: this.RIDE, z: pos.z }, { x: this.Q.x, y: this.Q.y, z: this.Q.z, w: this.Q.w });
      b.setLinearVelocity({ x: lv.x, y: Math.max(0, s * dirV), z: lv.z }); b.setAngularVelocity({ x: 0, y: av.y, z: 0 });
      this.onRamp = true; this.lastRamp = rp; this.lastRampT = G.time;
    } else this.onRamp = false;
    this.rampWalls(lv);
    this.ensureStatics(pos.x, pos.z, sp);
    this.preV = { x: lv.x, y: lv.y, z: lv.z };
  },

  /* after the physics step: re-centre the frame on the ground under the car, launches, landings, impacts, write back */
  postStep(dt) {
    const c = this.car, b = this.b; if (!b) return;
    let pos = b.getPosition(); const q = b.getRotation();
    if (!isFinite(pos.x + pos.y + pos.z + q.x + q.y + q.z + q.w)) { // never let a NaN loose: put it back where it was
      const L = this.last || { x: c.x, z: c.z, h: c.h };
      b.setTransform({ x: L.x, y: this.RIDE, z: L.z }, this.yawQ(L.h)); b.setLinearVelocity({ x: 0, y: 0, z: 0 }); b.setAngularVelocity({ x: 0, y: 0, z: 0 });
      pos = b.getPosition();
    }
    const g1 = W.groundAt(pos.x, pos.z), dg = g1 - this.g0;
    // the body's eight corners rest on the real ground (terrain, ramps, kerbs), wherever they are: on its roof or side
    // the car lies on the hillside, not on a flat floor
    this.floorHit = false;
    { const q2 = b.getRotation(), Qc = this.Q.set(q2.x, q2.y, q2.z, q2.w), d = this.dims, v = this.V; let pen = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { v.set(sx * d.hx, d.oy + sy * d.hy, sz * d.hz).applyQuaternion(Qc); pen = Math.max(pen, W.groundAt(pos.x + v.x, pos.z + v.z) - this.g0 - (pos.y + v.y)); }
      if (pen > 0.004) { const lv0 = b.getLinearVelocity(), f = this.contacts ? 1 : 0.94; b.setTransform({ x: pos.x, y: pos.y + pen, z: pos.z }, q2); b.setLinearVelocity({ x: lv0.x * f, y: Math.max(0, lv0.y), z: lv0.z * f }); pos = b.getPosition(); this.floorHit = true; } }
    let lv = b.getLinearVelocity();
    this.Q.set(q.x, q.y, q.z, q.w); const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.Q).y;
    const air = !this.contacts && !this.floorHit;
    if (!air && Math.abs(dg) < Math.max(0.12, this.sp * dt * 0.75)) this.gvy = dg / dt;
    if (dg) { b.setTransform({ x: pos.x, y: pos.y - dg, z: pos.z }, q); this.g0 = g1; pos = b.getPosition(); }
    // leaving the ground off a crest or a ramp lip: keep the climb the ground was giving us
    if (air && !this.wasAir) {
      // a bounce after touching down is still the same jump
      if (this.landing) { this.airT = this.landing.air; this.launch = this.landing.launch; this.landing = null; }
      else { this.airT = 0; this.launch = { x: c.x, z: c.z, ramp: W.rampUnder(c.x, c.z) || (G.time - (this.lastRampT || -9) < 0.6 ? this.lastRamp : null) }; }
      if (this.gvy > 0 && !this.onRamp) { b.setLinearVelocity({ x: lv.x, y: Math.max(lv.y, this.gvy), z: lv.z }); lv = b.getLinearVelocity(); }
    }
    if (air) this.airT += dt;
    else if (this.wasAir) {
      if (this.airT > 0.3) Sfx.land(c.x, c.z);
      // a jump counts if it settles onto its wheels within half a second (one wheel touches first)
      if (this.launch && this.airT > 0.9 && !c.wreck) this.landing = { air: this.airT, launch: this.launch, t: 0.5 };
      this.launch = null; this.airT = 0;
    }
    const L = this.landing;
    if (L && !air) {
      L.t -= dt;
      if (this.contacts >= 2 && upY > 0.7) { G.stunt(c, L.air, dist(L.launch.x, L.launch.z, pos.x, pos.z), L.launch.ramp); this.landing = null; }
      else if (L.t <= 0) this.landing = null; // landed on its roof or side: no stunt
    }
    this.wasAir = air;
    // hits: a sudden change of speed that our own tyre forces can't explain (walls, props, hard landings sideways)
    if (this.preV) {
      const dv = Math.hypot(lv.x - this.preV.x, lv.z - this.preV.z);
      if (dv > 7) {
        const ix = c.x + (this.preV.x - lv.x) * 0.3, iz = c.z + (this.preV.z - lv.z) * 0.3;
        c.damage((dv - 7) * 1.8, ix, iz); Sfx.crash(dv / 30, c.x, c.z); G.shake(dv * 0.03);
      }
    }
    // stuck on its roof or side: after a moment it rights itself
    if (upY < 0.35 && this.sp < 3) this.upsideT += dt; else this.upsideT = 0;
    if (this.upsideT > 1.6) {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.Q);
      b.setTransform({ x: pos.x, y: this.RIDE + 0.4, z: pos.z }, this.yawQ(Math.atan2(f.x, f.z) || c.h)); b.setAngularVelocity({ x: 0, y: 0, z: 0 }); b.setLinearVelocity({ x: 0, y: 0, z: 0 });
      this.upsideT = 0; G.toast('Back on its wheels.');
    }
    this.write(); this.pose(c);
  },

  /* the car's fields from the body */
  write() {
    const c = this.car, b = this.b; if (!b) return;
    const p = b.getPosition(), q = b.getRotation(), lv = b.getLinearVelocity();
    this.Q.set(q.x, q.y, q.z, q.w);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.Q), fh = Math.hypot(f.x, f.z);
    c.x = p.x; c.z = p.z; if (fh > 0.05) c.h = Math.atan2(f.x, f.z);
    c.vx = lv.x; c.vz = lv.z; c.v = fh > 0.05 ? (lv.x * f.x + lv.z * f.z) / fh : 0;
    c.y = Math.max(0, p.y - this.RIDE - 0.05); c.yv = 0; c.kx = c.kz = 0;
    c.physY = p.y - this.RIDE; c.physQ = { x: q.x, y: q.y, z: q.z, w: q.w }; c.physP = { x: p.x, y: p.y, z: p.z };
    this.last = { x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz, v: c.v };
  },
  /* someone else moved the car since we last wrote it (a teleport, a shunt, a test): the body follows */
  sync() {
    const c = this.car, b = this.b, L = this.last; if (!L) return;
    const moved = c.x !== L.x || c.z !== L.z, turned = c.h !== L.h;
    if (moved || turned) {
      const p = b.getPosition(), q = b.getRotation(), far = dist(c.x, c.z, L.x, L.z) > 15;
      const nx = c.x, nz = c.z, g = W.groundAt(nx, nz);
      b.setTransform({ x: nx, y: far ? this.RIDE + (c.y || 0) : p.y - (g - this.g0), z: nz }, turned || far ? this.yawQ(c.h) : q);
      this.g0 = g; if (far) { b.setAngularVelocity({ x: 0, y: 0, z: 0 }); this.statX = 1e9; }
    }
    const lv = b.getLinearVelocity();
    if (c.vx !== L.vx || c.vz !== L.vz) b.setLinearVelocity({ x: lv.x + (c.vx - L.vx), y: lv.y, z: lv.z + (c.vz - L.vz) });
    else if (c.v !== L.v) { const d = c.v - L.v; b.setLinearVelocity({ x: lv.x + Math.sin(c.h) * d, y: lv.y, z: lv.z + Math.cos(c.h) * d }); }
    if (c.kx || c.kz) { const v2 = b.getLinearVelocity(); b.setLinearVelocity({ x: v2.x + c.kx, y: v2.y, z: v2.z + c.kz }); c.kx = c.kz = 0; }
    if (c.yv > 0) { const v2 = b.getLinearVelocity(); b.setLinearVelocity({ x: v2.x, y: v2.y + c.yv, z: v2.z }); c.yv = 0; }
  },
  smash() {
    const c = this.car, sp = Math.hypot(c.vx, c.vz); if (sp < 3) return;
    const ux = c.vx / sp, uz = c.vz / sp, reach = c.r + 0.25 + sp * STEP;
    for (const [cx, cz] of c.circles()) for (const col of W.queryBox(cx - reach - 1, cz - reach - 1, cx + reach + 1, cz + reach + 1)) {
      const s = col.destructible; if (!s || col.removed || sp <= (SMASH_SPEED[s.kind] || 99)) continue;
      const px = col.circle ? col.x : clamp(cx, col.minX, col.maxX), pz = col.circle ? col.z : clamp(cz, col.minZ, col.maxZ), dx = px - cx, dz = pz - cz;
      if (Math.hypot(dx, dz) - (col.circle ? col.r : 0) < reach && dx * ux + dz * uz > 0) G.smash(col, c); // just ahead of you, in the way
    }
  },
  /* water: pushed back out to the bank, exactly as the arcade cars are (unless you're flying over it) */
  water() {
    const c = this.car, b = this.b; if (c.y >= 0.6) return;
    let px = 0, pz = 0;
    for (const [cx, cz] of c.circles()) for (const col of W.queryBox(cx - c.r - 0.5, cz - c.r - 0.5, cx + c.r + 0.5, cz + c.r + 0.5)) {
      if (col.kind !== 'water' || col.removed || !col.circle) continue;
      const dx = cx - col.x, dz = cz - col.z, d = Math.hypot(dx, dz) || 0.01, pen = c.r + col.r - d;
      if (pen > 0 && pen > Math.hypot(px, pz)) { px = dx / d * pen; pz = dz / d * pen; }
    }
    if (!px && !pz) return;
    const pos = b.getPosition(), lv = b.getLinearVelocity(), l = Math.hypot(px, pz), nx = px / l, nz = pz / l, vn = lv.x * nx + lv.z * nz;
    b.setTransform({ x: pos.x + px, y: pos.y, z: pos.z + pz }, b.getRotation());
    if (vn < 0) b.setLinearVelocity({ x: lv.x - nx * vn * 1.35, y: lv.y, z: lv.z - nz * vn * 1.35 });
    this.write();
  },
  /* a stunt ramp's back wall only stops you coming at it from behind */
  rampWalls(lv) {
    const c = this.car;
    for (const col of W.queryBox(c.x - 25, c.z - 25, c.x + 25, c.z + 25)) {
      if (!col.oneWay || col.removed) continue;
      const block = lv.x * col.oneWay[0] + lv.z * col.oneWay[1] <= 0;
      let ob = this.oneWay.get(col);
      if (block && !ob) { ob = Phys.body({ type: 'static', position: { x: (col.minX + col.maxX) / 2, y: col.h / 2, z: (col.minZ + col.maxZ) / 2 } }); ob.createBox({ halfExtents: { x: (col.maxX - col.minX) / 2, y: col.h / 2, z: (col.maxZ - col.minZ) / 2 } }); this.oneWay.set(col, ob); }
      else if (!block && ob) { Phys.kill(ob); this.oneWay.delete(col); }
    }
    for (const [col, ob] of this.oneWay) if (Math.abs(col.minX - c.x) > 40 || Math.abs(col.minZ - c.z) > 40) { Phys.kill(ob); this.oneWay.delete(col); }
  },
  /* draw the car where the body is, tilted with it */
  pose(car) {
    const q = car.physQ, p = car.physP; if (!q || !p) return;
    const Qp = this.Q.set(q.x, q.y, q.z, q.w), off = this.V.set(0, -this.RIDE, 0).applyQuaternion(Qp); // the mesh's origin sits RIDE below the body's centre, in the body's frame
    car.mesh.position.set(p.x + off.x, p.y + off.y + W.groundAt(p.x, p.z), p.z + off.z); car.mesh.quaternion.copy(Qp);
  },
};
