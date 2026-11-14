'use strict';
/* Realistic handling: cars as Box3D rigid bodies on four spring-damper wheels.
   Each wheel finds the ground under it (hills, ramps, kerbs: W.groundAt), pushes back with its spring, and grips with
   a tyre model (drive, brakes, cornering grip, a friction circle, the handbrake locking the rears), so a car pitches
   under braking, rolls in corners, rides up kerbs, bounces off walls and shunts the cars it hits.

   A physics car (PVeh) writes its result back into its Car (x, z, h, v, vx, vz, y), so the camera, skids, sound,
   stunts, damage, people getting hit and the AI carry on unchanged; anything that moves the car from outside (a
   teleport, a shunt from an arcade car, an explosion) is pushed back into the body before the next step.

   Like ragdolls and props, each body lives in "height above the local ground": the ground under the car's centre is
   y = 0, and the frame is shifted as that ground rises and falls (keeping the car's height in the world).

   PhysCar manages them: the car you drive, and every parked car, traffic car and police cruiser in play (up to 80;
   parked ones sleep until something touches them). L switches your own car to the arcade handling; K turns the
   physics traffic off. Bikes ride on two sprung wheels in line, the rear one driven; the rider (or the stand) holds
   them upright and the lean you see is drawn on top, until one falls over for real. Without Box3D (offline, ?nophys)
   or with ?arcade, every car and bike uses the arcade model. */

class PVeh {
  constructor(car) {
    const T = car.T, m = 1200 * T.mass, R = PhysCar.RIDE, bike = !!T.bike;
    // the body's box runs from just above the wheels' bottoms to the top of the roof, so it lies right on its roof or side
    // (a bike's box is the bike: its rider is thrown clear in a crash)
    const mesh = car.mesh, p0 = mesh.position.clone(), q0 = mesh.quaternion.clone(), rider = car.rider && car.rider.parent === mesh ? car.rider : null;
    if (rider) mesh.remove(rider);
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh);
    mesh.position.copy(p0); mesh.quaternion.copy(q0); if (rider) mesh.add(rider); mesh.updateMatrixWorld(true);
    const top = clamp(bb.max.y, 1.1, 3.4), hx = T.w / 2 * 0.9, hy = (top - 0.45) / 2, hz = T.len / 2 * 0.92, oy = 0.45 + hy - R;
    this.Q = new THREE.Quaternion(); this.V = new THREE.Vector3();
    this.up = new THREE.Vector3(); this.fw = new THREE.Vector3(); this.rt = new THREE.Vector3(); this.wf = new THREE.Vector3(); this.wr = new THREE.Vector3(); this.Q2 = new THREE.Quaternion();
    const b = Phys.body({ type: 'dynamic', position: { x: car.x, y: R + (car.y || 0), z: car.z }, rotation: this.yawQ(car.h),
      linearVelocity: { x: car.vx, y: Math.max(0, car.yv || 0), z: car.vz }, angularDamping: 0.35, linearDamping: 0.01 });
    // not the kinematic stand-ins for arcade cars (those contacts are the arcade's), nor the physics world's flat floor
    // (it rides the real ground), nor the player's body on foot (people are hit by the arcade's car-hits-people)
    const filter = { categoryBits: 1, maskBits: 0xffff & ~4 & ~8 & ~16 };
    // half the mass in the shell, half as ballast low down at the front and back (a low centre of mass that still turns like a long car)
    const mass = m * (car.ai && car.ai.mode === 'roadblock' ? 5 : 1); // a roadblock is a wall of heavy cruisers (as in the arcade)
    b.createBox({ halfExtents: { x: hx, y: hy, z: hz }, offset: { x: 0, y: oy, z: 0 }, density: (mass * 0.5) / (8 * hx * hy * hz), friction: 0.3, restitution: 0.12, filter });
    for (const s of [-1, 1]) b.createSphere({ radius: 0.12, center: { x: 0, y: -0.16, z: s * hz * 0.75 }, density: (mass * 0.25) / (4.19 * 0.12 ** 3), friction: 0.3, filter });
    this.b = b; this.car = car; this.m = b.getMass(); this.dims = { hx, hy, hz, oy }; this.floorHit = false;
    const track = T.w / 2 * 0.86, base = T.len / 2 * 0.66;
    this.wheels = (bike ? [[0, base, true], [0, -base, false]] : [[-track, base, true], [track, base, true], [-track, -base, false], [track, -base, false]]).map(([lx, lz, front]) => ({ lx, lz, front, l: PhysCar.L0 - 0.16, on: false, slip: 0 }));
    this.bike = bike; this.full = bike ? 2 : 3; this.lean = 0; // (wheels down for "sitting on its wheels")
    this.inp = { thr: 0, steer: 0, hb: true, boost: false };
    this.g0 = W.groundAt(car.x, car.z); this.gvy = 0; this.airT = 0; this.wasAir = false; this.landing = null; this.upsideT = 0; this.steerA = 0; this.launch = null; this.restT = 0;
    this.statX = this.statZ = 1e9; this.contacts = this.wheels.length; this.sp = 0; this.last = null;
    car.phys = this; PhysCar.list.add(this);
    this.ensureStatics(car.x, car.z, 0);
    if (Phys.kin.has(car)) { Phys.kill(Phys.kin.get(car)); Phys.kin.delete(car); }
    this.write();
  }
  destroy() {
    const c = this.car, b = this.b; if (!b) return;
    this.write(); c.y = Math.max(0, c.y); c.yv = c.y > 0.05 ? b.getLinearVelocity().y : 0;
    c.mesh.rotation.set(0, c.h, 0); // the arcade poses it from here
    Phys.kill(b); this.b = null; c.phys = null; PhysCar.list.delete(this);
  }
  get player() { return this.car.driver === 'player'; }
  yawQ(h) { this.Q.setFromAxisAngle(this.V.set(0, 1, 0), h); return { x: this.Q.x, y: this.Q.y, z: this.Q.z, w: this.Q.w }; }
  ensureStatics(x, z, sp) {
    if (Math.abs(x - this.statX) < 8 && Math.abs(z - this.statZ) < 8) return;
    this.statX = x; this.statZ = z; Phys.ensureStatics(x, z, 30 + sp * 1.2);
  }
  /* the arcade's drive() hands its input over here */
  input(thr, steer, hb, boost) { const i = this.inp; i.thr = thr; i.steer = steer; i.hb = hb; i.boost = boost; i.set = true; }

  /* before the physics step: suspension and tyre forces */
  preStep(dt) {
    const c = this.car; let b = this.b;
    if (!b) return;
    if (!PhysCar.keep(c)) { PhysCar.detach(c); return; }
    // asleep (parked and still): nothing to do until something nudges it, moves it or someone gets in
    if (this.sleeping) {
      const L = this.last, moved = L && (c.x !== L.x || c.z !== L.z || c.h !== L.h || c.vx !== L.vx || c.vz !== L.vz || c.kx || c.kz || c.yv > 0);
      if (b.isAwake() || moved || c.driver || c.burning > 0) { this.sleeping = false; this.idleT = 0; b.setAwake(true); } else return;
    }
    this.smash(); // knock down trees, lamp posts, pumps and cacti you hit at speed (the slowdown goes through sync)
    b = this.b; if (!b) return; // a pump's blast can end a car
    this.sync();
    this.water();
    this.oneWayWalls();
    const pos = b.getPosition(), q = b.getRotation(), lv = b.getLinearVelocity(), av = b.getAngularVelocity(), m = this.m, Gr = PhysCar.G;
    if (!c.driver && (this.bike && c.fallen ? this.floorHit : this.contacts >= this.full) && Math.hypot(lv.x, lv.y, lv.z) < 0.06 && Math.hypot(av.x, av.y, av.z) < 0.05 && !(c.burning > 0) && !this.onRamp) {
      this.idleT = (this.idleT || 0) + dt;
      if (this.idleT > 1) { b.setLinearVelocity({ x: 0, y: 0, z: 0 }); b.setAngularVelocity({ x: 0, y: 0, z: 0 }); b.setAwake(false); this.sleeping = true; this.write(); return; }
    } else this.idleT = 0;
    const Q = this.Q.set(q.x, q.y, q.z, q.w);
    const up = this.up.set(0, 1, 0).applyQuaternion(Q), fw = this.fw.set(0, 0, 1).applyQuaternion(Q), rt = this.rt.set(1, 0, 0).applyQuaternion(Q);
    if (this.bike) {
      // picked back up (or ridden off) while it lies on its side: stand it on its wheels
      if (!c.fallen && Math.abs(rt.y) > 0.6 && Math.hypot(lv.x, lv.z) < 2) {
        b.setTransform({ x: pos.x, y: PhysCar.RIDE + 0.05, z: pos.z }, this.yawQ(c.h)); b.setLinearVelocity({ x: 0, y: 0, z: 0 }); b.setAngularVelocity({ x: 0, y: 0, z: 0 });
        this.write(); return;
      }
      // the rider (or the stand) holds it upright: the roll rate is steered back towards level (set directly, as a tank's
      // yaw is: a spring stiff enough for a bike's small roll inertia would be unstable at 60 Hz). Knocked over, it goes down
      // onto its side the same way, coming to rest at about 83 degrees on its bars and pedals (the box alone would roll on over)
      const rr = av.x * fw.x + av.y * fw.y + av.z * fw.z, side = (this.fallSide = this.fallSide || (rt.y < 0 ? -1 : 1));
      const rrWant = c.fallen ? side * 3.5 * (up.y - 0.12) : -rt.y * 10, d = (rrWant - rr) * (c.fallen ? 0.35 : 1);
      if (!c.fallen) { this.fallSide = 0; b.setAngularVelocity({ x: av.x + fw.x * d, y: av.y + fw.y * d, z: av.z + fw.z * d }); }
      else { // going down it only rolls (no spin on the spot); on its side it scrapes to a stop
        const r2 = rr + d; b.setAngularVelocity({ x: fw.x * r2, y: fw.y * r2, z: fw.z * r2 });
        if (this.floorHit) { const s = Math.hypot(lv.x, lv.z), k = s > 0 ? Math.max(0, 1 - 8 * dt / s) : 0; b.setLinearVelocity({ x: lv.x * k, y: lv.y, z: lv.z * k }); }
      }
    }
    // the tyres pull with the car's own acceleration; nitro is extra thrust on top (it isn't limited by grip)
    const lim = c.limits(this.inp.boost), maxV = lim.maxV, accel = c.limits(false).accel, thrust = this.inp.boost ? lim.accel - accel : 0;
    const fh = Math.hypot(fw.x, fw.z) || 1, vF = (lv.x * fw.x + lv.z * fw.z) / fh, sp = Math.hypot(lv.x, lv.z);
    // with nobody at the wheel a car sits with its handbrake on
    let thr = this.inp.thr, steer = this.inp.steer, hb = this.inp.hb || (!c.driver && !this.inp.set);
    const chasing = c.police && c.ai && (c.ai.mode === 'pursuit' || c.ai.mode === 'perimeter'); // pursuit-tuned: sharper steering, stickier tyres
    this.inp.set = false;
    if (c.burning > 0 || c.wreck) { thr = 0; steer = 0; hb = true; }
    // steering: full lock when slow, a few degrees at speed (a keyboard aid; AI drivers get a little more); a flat tyre tugs the wheel
    const lock = c.T.tank ? 0 : this.player || chasing ? 0.78 / (1 + Math.abs(vF) / 20) : (c.T.len > 5.5 ? 0.8 : 0.62) / (1 + Math.abs(vF) / 20); // (long trucks get full lock for the junctions; cruisers on a chase steer like you)
    this.steerA = damp(this.steerA, -steer * lock + (c.popped ? Math.sin(G.time * 13) * 0.05 : 0), 16 / (1 + Math.abs(vF) / 40), dt); // keys ease in (a little more gently at speed)
    c.steerV = steer;
    // grip: tyres, weather, surface (SUVs and utes keep theirs off-road)
    const zone = W.zoneAt(c.x, c.z), off = OFFROAD_ZONES.includes(zone);
    const mu0 = PhysCar.grip(c) * (chasing ? 1.15 : 1) * Weather.grip() * (off ? ((OFFROAD[c.type] || 0) > 1 ? 0.95 : 0.78) : 1) * (c.popped ? 0.75 : 1);
    let contacts = 0;
    const nW = this.wheels.length, kS = (m * Gr / nW) / 0.17, cS = 2 * 0.5 * Math.sqrt(kS * m / nW); // static sag 0.17 m, damping ratio 0.5
    const brk = this.bike ? 16 : 26; // (a bike braking as hard as a car would go over its bars)
    const ca = Math.cos(this.steerA), sa = Math.sin(this.steerA), L0 = PhysCar.L0;
    const down = this.bike && c.fallen; if (down) for (const w of this.wheels) { w.on = false; w.l = L0; w.slip = 0; } // (a fallen bike is off its wheels)
    for (const w of down ? [] : this.wheels) {
      const Mx = pos.x + rt.x * w.lx + fw.x * w.lz - up.x * 0.12, My = pos.y + rt.y * w.lx + fw.y * w.lz - up.y * 0.12, Mz = pos.z + rt.z * w.lx + fw.z * w.lz - up.z * 0.12;
      const S = W.groundAt(Mx, Mz) - this.g0, d = (My - S) / Math.max(0.35, up.y), l = d - PhysCar.R;
      if (l >= L0) { w.on = false; w.l = L0; w.slip = 0; continue; }
      w.on = true; contacts++;
      const x = L0 - Math.max(l, -0.1), vl = (l - w.l) / dt; w.l = l;
      const Fs = clamp(kS * x - cS * vl + (l < 0 ? kS * 6 * -l : 0), 0, m * Gr * 4);
      // the wheel's heading: the fronts steer
      const wf = w.front ? this.wf.set(fw.x * ca + rt.x * sa, fw.y * ca + rt.y * sa, fw.z * ca + rt.z * sa) : this.wf.copy(fw);
      const wr = this.wr.crossVectors(up, wf).normalize(); // across the wheel
      // contact patch velocity: v + w x r (a bike's from its yaw alone: it balances by leaning, which is drawn, so its roll
      // and pitch mustn't scrub the tyres; a narrow bike's small roll inertia would make that feedback unstable at 60 Hz)
      const rx = this.bike ? fw.x * w.lz : Mx - pos.x, ry = this.bike ? fw.y * w.lz : My - d * up.y - pos.y, rz = this.bike ? fw.z * w.lz : Mz - pos.z;
      // (a tank's tracks resist the hull sliding sideways, not it turning: it skid-steers)
      const yw = c.T.tank ? 0 : 1, vx = lv.x + (av.y * rz - av.z * ry) * yw, vy = lv.y + (av.z * rx - av.x * rz) * yw, vz = lv.z + (av.x * ry - av.y * rx) * yw;
      const vLong = vx * wf.x + vy * wf.y + vz * wf.z, vLat = vx * wr.x + vy * wr.y + vz * wr.z;
      const mu = mu0 * (hb && !w.front ? 0.5 : 1), N = Fs, cap = mu * N, stopF = Math.abs(vLong) * (m / nW) / dt; // no more than it takes to stop the wheel's share
      // drive (40/60 front/rear; a bike's back wheel), brakes (a bike's split evenly), reverse, rolling resistance, handbrake lock
      let Fx = 0;
      const share = this.bike ? (w.front ? 0 : 1) : (w.front ? 0.4 : 0.6) / 2, bshare = this.bike ? 0.5 : share;
      if (thr > 0) {
        if (vF < -0.6) Fx = m * brk * bshare;
        else Fx = m * accel * thr * share * clamp((maxV - vF) / 2.5, 0, 1);
      } else if (thr < 0) {
        if (vF > 0.6) Fx = -m * brk * bshare * -thr;
        else Fx = -m * accel * 0.6 * share * -thr * clamp((maxV * 0.4 + vF) / 2, 0, 1);
      } else Fx = -Math.sign(vLong) * Math.min(Math.abs(vLong) * m * 0.5, m * 4) / nW;
      if (hb && !w.front) Fx = -Math.sign(vLong) * Math.min(cap * 0.85, stopF);
      if (c.burning > 0 || c.wreck) Fx = -Math.sign(vLong) * Math.min(cap, stopF);
      let Fy = -vLat * (cap / 1.0) * (c.T.tank && steer ? (Math.abs(vF) < 3 ? 0.12 : 0.28) : 1); // full grip at 1 m/s of sideways slip (a turning tank's tracks skid: a lot on the spot, some on the move)
      // the friction circle: what's left of the grip after driving or braking goes to cornering
      const tot = Math.hypot(Fx, Fy); if (tot > cap) { Fx *= cap / tot; Fy *= cap / tot; }
      w.slip = Math.abs(vLat) + (hb && !w.front ? Math.abs(vLong) * 0.3 : 0);
      // tyre forces act a little below the centre of mass (a roll centre; a bike's level with it, so they steer it without
      // rolling or pitching it), suspension at the wheel
      const rc = this.bike ? 0 : 0.3, ax = pos.x + rt.x * w.lx + fw.x * w.lz - up.x * rc, ay = pos.y + rt.y * w.lx + fw.y * w.lz - up.y * rc, az = pos.z + rt.z * w.lx + fw.z * w.lz - up.z * rc;
      b.applyForce({ x: wf.x * Fx + wr.x * Fy, y: wf.y * Fx + wr.y * Fy, z: wf.z * Fx + wr.z * Fy }, { x: ax, y: ay, z: az }, true);
      b.applyForce({ x: up.x * Fs, y: up.y * Fs, z: up.z * Fs }, { x: Mx, y: My, z: Mz }, true);
    }
    // stability assist (keyboard steering is all-or-nothing): nudge the yaw towards what the steering asks for, within
    // what the tyres could give; off with the handbrake, so you can still throw it into a slide
    if (contacts >= this.full && !hb && Math.abs(vF) > 3 && !c.T.tank) {
      const wb = 2 * this.wheels[0].lz, rMax = mu0 * Gr * 1.6 / Math.abs(vF), rDes = clamp(vF * Math.tan(this.steerA) / wb, -rMax, rMax);
      const r = av.x * up.x + av.y * up.y + av.z * up.z, I = m * (c.T.len * c.T.len + c.T.w * c.T.w) / 12 * 0.8, tq = clamp((rDes - r) * I * 5, -m * 9, m * 9);
      b.applyTorque({ x: up.x * tq, y: up.y * tq, z: up.z * tq }, true);
    }
    // a tank's tracks pull against each other: it turns on the spot
    if (c.T.tank && contacts >= 2) { // the tracks have the authority to set the yaw rate (eased in), as tracked vehicles do in games
      const r = av.x * up.x + av.y * up.y + av.z * up.z, rDes = -steer * 0.9 * (vF < -0.5 ? -1 : 1), d = (rDes - r) * Math.min(1, dt * 8);
      b.setAngularVelocity({ x: av.x + up.x * d, y: av.y + up.y * d, z: av.z + up.z * d });
    }
    // downforce: the faster you go the harder the air presses the car onto its tyres (about double the grip flat out)
    if (contacts) { const df = m * (this.bike ? 0.0022 : 0.0065) * vF * vF; b.applyForceToCenter({ x: -up.x * df, y: -up.y * df, z: -up.z * df }, true); } // (a bike has little aero to speak of)
    if (thrust > 0 && thr > 0 && vF < maxV) b.applyForceToCenter({ x: fw.x * m * thrust, y: 0, z: fw.z * m * thrust }, true);
    // over the speed limit (it changes with the zone): ease back to it
    if (vF > maxV + 0.3 && contacts) { const k = m * Math.min(12, (vF - maxV) * 3); b.applyForceToCenter({ x: -fw.x * k, y: 0, z: -fw.z * k }, true); }
    // in the air: settle the spin and drift back level, so jumps land on the wheels more often than not
    if (!contacts && !(this.bike && c.fallen)) { // (a bike lying on its side has no wheels down either)
      b.applyTorque({ x: -av.x * m * 0.9 - up.z * m * 2.5, y: -av.y * m * 0.3, z: -av.z * m * 0.9 + up.x * m * 2.5 }, true); // up x worldUp, toward level
    }
    // standing still: don't creep down slopes
    if (contacts >= this.full && thr === 0 && sp < 0.35 && (!hb || !c.driver)) b.setLinearVelocity({ x: lv.x * 0.6, y: lv.y, z: lv.z * 0.6 });
    this.contacts = contacts; this.sp = sp;
    // on a stunt ramp the car rides the wedge like a rail (springs can't lift a car up a steep ramp at 40 m/s in a
    // third of a second): pitched to the slope, rising with it; at the lip physics takes over with that climb
    const rp = contacts && W.rampAt(pos.x, pos.z) > 0.02 ? W.rampUnder(pos.x, pos.z) : null;
    if (rp) {
      const dirV = lv.x * rp.fx + lv.z * rp.fz, s = rp.h / rp.len, yaw = Math.atan2(fw.x, fw.z), facing = Math.cos(yaw - Math.atan2(rp.fx, rp.fz));
      this.Q.setFromEuler(new THREE.Euler(-Math.atan(s * facing), yaw, 0, 'YXZ'));
      b.setTransform({ x: pos.x, y: PhysCar.RIDE, z: pos.z }, { x: this.Q.x, y: this.Q.y, z: this.Q.z, w: this.Q.w });
      b.setLinearVelocity({ x: lv.x, y: Math.max(0, s * dirV), z: lv.z }); b.setAngularVelocity({ x: 0, y: av.y, z: 0 });
      this.onRamp = true; this.lastRamp = rp; this.lastRampT = G.time;
    } else this.onRamp = false;
    this.ensureStatics(pos.x, pos.z, sp);
    this.preV = { x: lv.x, y: lv.y, z: lv.z };
  }

  /* after the physics step: re-centre the frame on the ground under the car, launches, landings, impacts, write back */
  postStep(dt) {
    const c = this.car, b = this.b; if (!b || this.sleeping) return;
    const player = this.player;
    let pos = b.getPosition(); const q = b.getRotation();
    if (!isFinite(pos.x + pos.y + pos.z + q.x + q.y + q.z + q.w)) { // never let a NaN loose: put it back where it was
      const L = this.last || { x: c.x, z: c.z, h: c.h };
      b.setTransform({ x: L.x, y: PhysCar.RIDE, z: L.z }, this.yawQ(L.h)); b.setLinearVelocity({ x: 0, y: 0, z: 0 }); b.setAngularVelocity({ x: 0, y: 0, z: 0 });
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
    this.Q.set(q.x, q.y, q.z, q.w); const upY = this.V.set(0, 1, 0).applyQuaternion(this.Q).y;
    // resting on something that isn't ground (a stall's roof, a fence, a boulder): it has stopped falling, so it isn't in the air
    this.restT = !this.contacts && !this.floorHit && Math.abs(lv.y) < 0.6 ? this.restT + dt : 0;
    const air = !this.contacts && !this.floorHit && this.restT < 0.25;
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
      if (this.launch && this.airT > 0.9 && !c.wreck && player) this.landing = { air: this.airT, launch: this.launch, t: 0.5 };
      this.launch = null; this.airT = 0;
    }
    const L = this.landing;
    if (L && !air) {
      L.t -= dt;
      if (this.contacts >= 2 && upY > 0.7) { if (player) G.stunt(c, L.air, dist(L.launch.x, L.launch.z, pos.x, pos.z), L.launch.ramp); this.landing = null; }
      else if (L.t <= 0) this.landing = null; // landed on its roof or side: no stunt
    }
    this.wasAir = air;
    // hits: a sudden change of speed that our own tyre forces can't explain (walls, props, other physics cars)
    if (this.preV) {
      const dv = Math.hypot(lv.x - this.preV.x, lv.z - this.preV.z);
      if (dv > 4.5) PhysCar.impact(this, dv, (this.preV.x - lv.x) / dv, (this.preV.z - lv.z) / dv);
    }
    if (!this.b) return; // the knock wrecked it
    // stuck on its roof or side: after a moment it rights itself
    if (upY < 0.35 && this.sp < 3 && !(this.bike && c.fallen)) this.upsideT += dt; else this.upsideT = 0; // (a fallen bike waits to be picked up)
    if (this.upsideT > 1.6) {
      const f = this.V.set(0, 0, 1).applyQuaternion(this.Q);
      b.setTransform({ x: pos.x, y: PhysCar.RIDE + 0.4, z: pos.z }, this.yawQ(Math.atan2(f.x, f.z) || c.h)); b.setAngularVelocity({ x: 0, y: 0, z: 0 }); b.setLinearVelocity({ x: 0, y: 0, z: 0 });
      this.upsideT = 0; if (player) G.toast('Back on its wheels.');
    }
    this.write(); this.pose();
  }

  /* the car's fields from the body */
  write() {
    const c = this.car, b = this.b; if (!b) return;
    const p = b.getPosition(), q = b.getRotation(), lv = b.getLinearVelocity();
    this.Q.set(q.x, q.y, q.z, q.w);
    const f = this.V.set(0, 0, 1).applyQuaternion(this.Q), fh = Math.hypot(f.x, f.z);
    c.x = p.x; c.z = p.z; if (fh > 0.05) c.h = Math.atan2(f.x, f.z);
    c.vx = lv.x; c.vz = lv.z; c.v = fh > 0.05 ? (lv.x * f.x + lv.z * f.z) / fh : 0;
    c.y = Math.max(0, p.y - PhysCar.RIDE - 0.05); c.yv = 0; c.kx = c.kz = 0;
    c.physY = p.y - PhysCar.RIDE; c.physQ = { x: q.x, y: q.y, z: q.z, w: q.w }; c.physP = { x: p.x, y: p.y, z: p.z };
    this.last = { x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz, v: c.v, y: c.y };
  }
  /* someone else moved the car since we last wrote it (a teleport, a shunt, a test): the body follows */
  sync() {
    const c = this.car, b = this.b, L = this.last; if (!L) return;
    const moved = c.x !== L.x || c.z !== L.z, turned = c.h !== L.h;
    if (moved || turned) {
      const p = b.getPosition(), q = b.getRotation(), far = dist(c.x, c.z, L.x, L.z) > 15;
      const nx = c.x, nz = c.z, g = W.groundAt(nx, nz);
      b.setTransform({ x: nx, y: far ? PhysCar.RIDE + (c.y || 0) : p.y - (g - this.g0), z: nz }, turned || far ? this.yawQ(c.h) : q);
      this.g0 = g; if (far) { b.setAngularVelocity({ x: 0, y: 0, z: 0 }); this.statX = 1e9; }
    }
    if (c.y > L.y + 0.05 && !(dist(c.x, c.z, L.x, L.z) > 15)) { const p = b.getPosition(); b.setTransform({ x: p.x, y: p.y + (c.y - L.y), z: p.z }, b.getRotation()); } // lifted (a bike's hop clearing a kerb)
    const lv = b.getLinearVelocity();
    if (c.vx !== L.vx || c.vz !== L.vz) b.setLinearVelocity({ x: lv.x + (c.vx - L.vx), y: lv.y, z: lv.z + (c.vz - L.vz) });
    else if (c.v !== L.v) { const d = c.v - L.v; b.setLinearVelocity({ x: lv.x + Math.sin(c.h) * d, y: lv.y, z: lv.z + Math.cos(c.h) * d }); }
    if (c.kx || c.kz) { const v2 = b.getLinearVelocity(); b.setLinearVelocity({ x: v2.x + c.kx, y: v2.y, z: v2.z + c.kz }); c.kx = c.kz = 0; }
    if (c.yv > 0) { const v2 = b.getLinearVelocity(); b.setLinearVelocity({ x: v2.x, y: v2.y + c.yv, z: v2.z }); c.yv = 0; }
  }
  smash() {
    // only something the car is about to drive into: inside its width, just ahead of its nose (as the arcade's actual contact)
    const c = this.car, sp = Math.hypot(c.vx, c.vz); if (sp < 3 || c.T.bike) return; // (a bike stops dead against them instead)
    const hx = Math.sin(c.h), hz = Math.cos(c.h), fwd = c.vx * hx + c.vz * hz; if (fwd < 1) return;
    const len = c.T.len / 2 + sp * STEP + 0.1, half = c.T.w / 2, reach = len + 1;
    for (const col of W.queryBox(c.x - reach, c.z - reach, c.x + reach, c.z + reach)) {
      const s = col.destructible; if (!s || col.removed || sp <= (SMASH_SPEED[s.kind] || 99)) continue;
      const px = col.circle ? col.x : clamp(c.x + hx * len, col.minX, col.maxX), pz = col.circle ? col.z : clamp(c.z + hz * len, col.minZ, col.maxZ), r = col.circle ? col.r : 0;
      const dx = px - c.x, dz = pz - c.z, along = dx * hx + dz * hz, side = Math.abs(dx * hz - dz * hx);
      if (along > c.T.len / 2 - 0.5 && along < len + r && side < half + r) { G.smash(col, c); if (!this.b) return; }
    }
  }
  /* push the body out of something by (px, pz), killing the speed going into it (as the arcade's walls do) */
  shove(px, pz, k) {
    const b = this.b, pos = b.getPosition(), lv = b.getLinearVelocity(), l = Math.hypot(px, pz), nx = px / l, nz = pz / l, vn = lv.x * nx + lv.z * nz;
    b.setTransform({ x: pos.x + px, y: pos.y, z: pos.z + pz }, b.getRotation());
    if (vn < 0) b.setLinearVelocity({ x: lv.x - nx * vn * k, y: lv.y, z: lv.z - nz * vn * k });
    this.write();
  }
  /* water: pushed back out to the bank, exactly as the arcade cars are (unless you're flying over it) */
  water() {
    const c = this.car; if (c.y >= 0.6) return;
    let px = 0, pz = 0;
    for (const [cx, cz] of c.circles()) for (const col of W.queryBox(cx - c.r - 0.5, cz - c.r - 0.5, cx + c.r + 0.5, cz + c.r + 0.5)) {
      if (col.kind !== 'water' || col.removed || !col.circle) continue;
      const dx = cx - col.x, dz = cz - col.z, d = Math.hypot(dx, dz) || 0.01, pen = c.r + col.r - d;
      if (pen > 0 && pen > Math.hypot(px, pz)) { px = dx / d * pen; pz = dz / d * pen; }
    }
    if (px || pz) this.shove(px, pz, 1.35);
  }
  /* a stunt ramp's back wall only stops a car coming at it from behind (checked per car, as the arcade does) */
  oneWayWalls() {
    const c = this.car; let px = 0, pz = 0;
    for (const [cx, cz] of c.circles()) for (const col of W.queryBox(cx - c.r - 0.5, cz - c.r - 0.5, cx + c.r + 0.5, cz + c.r + 0.5)) {
      if (!col.oneWay || col.removed || c.y >= col.h || c.vx * col.oneWay[0] + c.vz * col.oneWay[1] > 0) continue;
      const qx = clamp(cx, col.minX, col.maxX), qz = clamp(cz, col.minZ, col.maxZ), dx = cx - qx, dz = cz - qz, d = Math.hypot(dx, dz);
      if (d >= c.r) continue;
      let nx, nz, pen;
      if (d > 1e-4) { nx = dx / d; nz = dz / d; pen = c.r - d; }
      else { const ox = Math.min(cx - col.minX, col.maxX - cx), oz = Math.min(cz - col.minZ, col.maxZ - cz); if (ox < oz) { nx = cx - col.minX < col.maxX - cx ? -1 : 1; nz = 0; pen = ox + c.r; } else { nz = cz - col.minZ < col.maxZ - cz ? -1 : 1; nx = 0; pen = oz + c.r; } }
      if (pen > Math.hypot(px, pz)) { px = nx * pen; pz = nz * pen; }
    }
    if (px || pz) this.shove(px, pz, 1.3);
  }
  /* draw the car where the body is, tilted with it */
  pose() {
    const car = this.car, q = car.physQ, p = car.physP; if (!q || !p) return;
    const Qp = this.Q.set(q.x, q.y, q.z, q.w), off = this.V.set(0, -PhysCar.RIDE, 0).applyQuaternion(Qp); // the mesh's origin sits RIDE below the body's centre, in the body's frame
    car.mesh.position.set(p.x + off.x, p.y + off.y + W.groundAt(p.x, p.z), p.z + off.z); car.mesh.quaternion.copy(Qp);
    if (this.bike) { // a bike leans into its turns (and on its stand when parked), about the line its wheels touch
      const want = car.fallen ? 0 : car.parked && !car.driver ? 0.18 : clamp((car.steerV || 0) * Math.min(Math.abs(car.v) / 8, 1) * 0.45, -0.5, 0.5);
      this.lean = damp(this.lean, want, 8, STEP); car.lean = this.lean; car.mesh.quaternion.multiply(this.Q2.setFromAxisAngle(this.V.set(0, 0, 1), this.lean));
    }
  }
}

const PhysCar = {
  on: true, world: true, list: new Set(), mT: 0,
  RIDE: 0.83, R: 0.36, L0: 0.52, G: 20,
  MAX: 80, RON: 1e9, ROFF: 1e9, // every car in play (up to 80) is a physics car; K turns the others back to the arcade model
  classes: { parked: true, traffic: true, police: true, bikes: true }, // which kinds of car become physics bodies (bikes: those you aren't riding)

  init() {
    let pref = null, world = null; try { pref = localStorage.getItem('lootrun.handling'); world = localStorage.getItem('lootrun.physWorld'); } catch (e) { /* private window */ }
    const q = new URLSearchParams(location.search);
    this.on = !q.has('arcade') && pref !== 'arcade';
    this.world = !q.has('arcade') && !q.has('arcadeworld') && world !== 'off';
  },
  usable(car) { return !!(Phys.ready && car && !car.dead && !car.wreck && (car.driver === 'player' ? this.on : this.world)); },
  /* which cars become physics bodies (the K key turns the others off, in case they cost too much) */
  eligible(car) {
    if (!car || car.dead || car.wreck) return false;
    if (car.driver === 'player') return true;
    if (!this.world || (car.T.bike && !this.classes.bikes)) return false;
    if (!car.driver || car.parked || (car.ai && (car.ai.mode === 'parked' || car.ai.mode === 'dead'))) return this.classes.parked;
    if (car.police) return this.classes.police;
    return car.driver === 'ai' && this.classes.traffic;
  },
  /* does a car stay a physics body? Yours does; others while they're near and eligible, and (going back to the arcade)
     only once they sit square on their wheels */
  keep(car) {
    if (car.dead || !Phys.ready) return false;
    if (car.driver === 'player' && G.player.inCar === car) return this.on;
    const t = G.body(), d = dist(car.x, car.z, t.x, t.z);
    if (this.eligible(car) && d < this.ROFF) return true;
    return !this.settled(car) && d < 220;
  },
  settled(car) { const v = car.phys; return !v || (v.contacts >= v.full && v.upsideT === 0 && !v.wasAir && Math.abs(car.physY || 0) < 0.3); },
  overlaps(c) {
    for (const v of this.list) {
      const o = v.car; if (dist(o.x, o.z, c.x, c.z) > (o.T.len + c.T.len) / 2 + 0.5) continue;
      for (const p of o.circles()) for (const q of c.circles()) if (dist(p[0], p[1], q[0], q[1]) < o.r + c.r + 0.2) return true;
    }
    return false;
  },
  /* every quarter second: eligible cars become physics bodies (the nearest first, if there are ever more than MAX) */
  manage(dt) {
    this.mT -= dt; if (this.mT > 0) return; this.mT = 0.25;
    if (!Phys.ready || !this.world) return;
    const t = G.body(), cands = [];
    for (const c of G.cars) if (!c.phys && this.eligible(c) && this.usable(c)) { const d = dist(c.x, c.z, t.x, t.z); if (d < this.RON) cands.push([d, c]); }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, c] of cands) { if (this.list.size >= this.MAX) break; if (!this.overlaps(c)) new PVeh(c); }
  },
  toggleWorld() {
    this.world = !this.world;
    try { localStorage.setItem('lootrun.physWorld', this.world ? 'on' : 'off'); } catch (e) { /* fine */ }
    if (!this.world) for (const v of [...this.list]) if (!v.player) v.destroy();
    return this.world;
  },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('lootrun.handling', this.on ? 'physics' : 'arcade'); } catch (e) { /* fine */ }
    const mine = G.player.inCar; if (!this.on) { if (mine && mine.phys) mine.phys.destroy(); } else if (mine) this.attach(mine); // L: your car only (K is the traffic)
    return this.on;
  },
  grip(car) { return 1.15 * ({ tank: 1.7, supercar: 1.4, sports: 1.38, muscle: 1.2, police: 1.3, taxi: 1.22, truck: 1.0, van: 1.05, armored: 1.0, suv: 1.15, pickup: 1.12, hatch: 1.25 }[car.type] || 1.25); },
  attach(car) { if (!this.usable(car)) return false; if (!car.phys) new PVeh(car); return true; },
  detach(car) { car = car || this.car; if (car && car.phys) car.phys.destroy(); },
  preStep(dt) { this.manage(dt); for (const v of [...this.list]) v.preStep(dt); },
  postStep(dt) { for (const v of [...this.list]) v.postStep(dt); },
  pose(car) { if (car.phys) car.phys.pose(); },
  /* a physics car took a knock: damage, a crash, a dent where it was hit */
  impact(v, dv, nx, nz) {
    const c = v.car, ix = c.x + nx * 1.5, iz = c.z + nz * 1.5;
    // what hit it? another physics car just over there, if any
    let other = null, bd = 1e9; for (const o of this.list) { if (o === v) continue; const d = dist(o.car.x, o.car.z, c.x, c.z); if (d < (o.car.T.len + c.T.len) / 2 + 1.2 && d < bd) { bd = d; other = o.car; } }
    if (c.T.bike && c.driver && dv > 8) G.bail(c, dv, v.preV.x, v.preV.z); // a hard knock throws a bike's rider over the bars
    else if (c.T.bike && !c.driver && dv > 5) c.knockOver(); // and knocks a bike with nobody on it off its stand
    const thr = other ? 4.5 : 7; if (dv <= thr) return; // another car (each takes about half the closing speed) or a wall
    const byPlayer = other && other.driver === 'player';
    c.damage((dv - thr) * 1.8, ix, iz, byPlayer ? G.player : null);
    if (c.parked && !c.wreck && c.alarmT <= 0 && dv > 9 && !c.T.bike) c.alarmT = 5;
    if (!(c.crashT > G.time)) { Sfx.crash(dv / 30, c.x, c.z); c.crashT = G.time + 0.25; if (other) other.crashT = G.time + 0.25; }
    if (v.player || byPlayer) G.shake(dv * 0.03);
  },
  /* the player's physics car, for the camera, the HUD and the tests */
  get cur() { const c = G.player && G.player.inCar; return (c && c.phys) || null; },
  get car() { const v = this.cur; return v ? v.car : null; },
  get b() { const v = this.cur; return v ? v.b : null; },
  get contacts() { const v = this.cur; return v ? v.contacts : 0; },
  get wasAir() { const v = this.cur; return !!(v && v.wasAir); },
  get airT() { const v = this.cur; return v ? v.airT : 0; },
  get landing() { const v = this.cur; return v ? v.landing : null; },
  get launch() { const v = this.cur; return v ? v.launch : null; },
  get floorHit() { const v = this.cur; return !!(v && v.floorHit); },
  get steerA() { const v = this.cur; return v ? v.steerA : 0; },
};
