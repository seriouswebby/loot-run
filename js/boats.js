'use strict';
/* Boats: jet skis on the beach, speedboats along Pier 9, a yacht moored on the pier's other side, and police boats
   that come after you on the water at 3 stars. To the rest of the game they're cars (you get in and out, the HUD,
   damage, rockets), but they float: kept to the sea (anywhere inside the harbour's water and clear of the pier, the
   dock and the shore), bobbing on it, bow up at speed and leaning into their turns. They're never physics bodies. */
const SEA_Y = -0.15; // the water's surface (the sea plane in buildCity)

/* is this point open water? (inside one of the harbour's water colliders, which leave the pier and the dock out) */
W.waterAt = function (x, z) {
  for (const c of W.queryBox(x, z, x, z)) {
    if (c.kind !== 'water' || c.removed) continue;
    if (c.circle ? dist(x, z, c.x, c.z) < c.r : x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  }
  return false;
};
/* is something solid standing here (not water, not a ramp's one-way back wall)? */
W.solidAt = function (x, z) {
  for (const c of W.queryBox(x, z, x, z)) {
    if (c.kind === 'water' || c.removed || c.oneWay) continue;
    if (c.circle ? dist(x, z, c.x, c.z) < c.r : x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  }
  return false;
};
/* the riders you can see: on a bike or a jet ski you're out in the open (bullets reach you, the camera shows you) */
const openRide = (car) => !!(car && (car.T.bike || car.T.ski));

const Boats = {
  auto: false, spawned: false, t: 0, warned: -99, MOORINGS: [],
  init() {
    const S = W.SHORE;
    this.MOORINGS = [
      { type: 'jetski', x: 14, z: S + 2.2, h: 0 }, { type: 'jetski', x: 18, z: S + 2.2, h: 0 }, { type: 'jetski', x: 22, z: S + 2.2, h: 0 },
      { type: 'speedboat', x: 5.9, z: S + 6.5, h: 0 }, { type: 'speedboat', x: 5.9, z: S + 13.5, h: 0 }, { type: 'speedboat', x: 5.9, z: S + 20.5, h: 0 },
      { type: 'yacht', x: -7.5, z: S + 13, h: 0 },
    ];
    for (const m of this.MOORINGS) m.r = CAR_TYPES[m.type].len / 2 + 1;
  },
  /* would this boat's hull, centred here and heading this way, sit wholly on open water? */
  afloatAt(car, x, z, h) {
    const T = car.T, fx = Math.sin(h), fz = Math.cos(h), L = T.len / 2, Wd = T.w / 2;
    for (const [a, s] of [[L, 0], [-L, 0], [0, Wd], [0, -Wd], [L * 0.6, Wd * 0.8], [L * 0.6, -Wd * 0.8], [-L * 0.8, Wd], [-L * 0.8, -Wd]]) {
      const px = x + fx * a + fz * s, pz = z + fz * a - fx * s;
      if (!W.waterAt(px, pz) || W.solidAt(px, pz)) return false;
    }
    return true;
  },
  /* how far a point is from a boat's hull (0 on or inside it) */
  hullDist(car, x, z) {
    const fx = Math.sin(car.h), fz = Math.cos(car.h), dx = x - car.x, dz = z - car.z;
    return Math.hypot(Math.max(0, Math.abs(dx * fx + dz * fz) - car.T.len / 2), Math.max(0, Math.abs(dx * fz - dz * fx) - car.T.w / 2));
  },
  /* somewhere to step off onto within a few metres of the hull: the pier, the beach, a bank (null when it's all water) */
  landing(car) {
    const R = car.T.len / 2 + 4; let best = null, bd = 3.6;
    for (let dx = -R; dx <= R; dx += 0.75) for (let dz = -R; dz <= R; dz += 0.75) {
      const x = car.x + dx, z = car.z + dz, d = this.hullDist(car, x, z);
      if (d >= bd || d < 0.3) continue;
      let ok = true;
      for (const [ox, oz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) if (W.waterAt(x + ox, z + oz) || W.solidAt(x + ox, z + oz)) { ok = false; break; }
      if (ok) { bd = d; best = { x, z }; }
    }
    return best;
  },
  /* the same, looked up at most four times a second (for the prompt, which asks every frame) */
  landingSoon(car) { const L = car.landC; if (L && G.time - L.t < 0.25 && dist(L.x, L.z, car.x, car.z) < 1) return L.spot; const spot = this.landing(car); car.landC = { t: G.time, x: car.x, z: car.z, spot }; return spot; },
  /* the helm: a boat answers it best when moving (a little even when still), slides through its turns, and the water
     slows it as soon as the throttle's off */
  drive(car, dt, thr, steer, hb, maxV, accel) {
    const T = car.T;
    if (car.burning > 0 || car.wreck) { thr = 0; steer = 0; }
    if (thr > 0) car.v = Math.min(maxV, car.v + accel * thr * dt * (car.v < 0 ? 2 : 1));
    else if (thr < 0) car.v = car.v > 0 ? Math.max(0, car.v - accel * 1.6 * -thr * dt) : Math.max(-maxV * 0.3, car.v - accel * 0.6 * -thr * dt);
    car.v -= car.v * (thr ? 0.08 : 0.4) * dt + Math.sign(car.v) * Math.min(Math.abs(car.v), (thr ? 0 : 0.8) * dt);
    if (car.v > maxV) car.v = Math.max(maxV, car.v - accel * dt);
    const sf = clamp(Math.abs(car.v) / 5, 0.3, 1) * (1 - Math.min(Math.abs(car.v), 40) / 40 * 0.35);
    car.steerV = damp(car.steerV || 0, steer, 6, dt);
    car.h -= car.steerV * (T.ski ? 1.9 : T.len > 10 ? 0.42 : 1.25) * sf * (car.v < -0.3 ? -1 : 1) * dt;
    const fx = Math.sin(car.h), fz = Math.cos(car.h), grip = (T.ski ? 3.4 : T.len > 10 ? 3 : 2.3) * (hb ? 0.45 : 1);
    car.vx = damp(car.vx, fx * car.v, grip, dt); car.vz = damp(car.vz, fz * car.v, grip, dt);
  },
  /* move on the water: run aground (or into the pier) and it slides along if it can, or stops dead, and a hard knock
     hurts the hull; shoved somewhere it can't float, it goes back to the last good water */
  move(car, dt) {
    if (car.sea && !this.afloatAt(car, car.x, car.z, car.h)) { car.x = car.sea.x; car.z = car.sea.z; car.h = car.sea.h; }
    const sp = Math.hypot(car.vx + car.kx, car.vz + car.kz), n = Math.min(10, Math.max(1, Math.ceil(sp * dt / 0.3))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const nx = car.x + (car.vx + car.kx) * h, nz = car.z + (car.vz + car.kz) * h;
      if (this.afloatAt(car, nx, nz, car.h)) { car.x = nx; car.z = nz; continue; }
      if (this.afloatAt(car, nx, car.z, car.h)) { car.x = nx; car.vz *= -0.2; car.kz = 0; }
      else if (this.afloatAt(car, car.x, nz, car.h)) { car.z = nz; car.vx *= -0.2; car.kx = 0; }
      else { car.vx *= -0.25; car.vz *= -0.25; car.kx = car.kz = 0; }
      car.v = car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h);
      if (sp > 7 && !(car.crashT > G.time)) {
        car.crashT = G.time + 0.4; car.damage((sp - 7) * 2.2, car.x + Math.sin(car.h) * car.T.len / 2, car.z + Math.cos(car.h) * car.T.len / 2);
        Sfx.crash(Math.min(1, sp / 30), car.x, car.z); if (car.driver === 'player') G.shake(sp * 0.03);
      }
      break;
    }
    car.sea = { x: car.x, z: car.z, h: car.h };
    const k = Math.exp(-3 * dt); car.kx *= k; car.kz *= k;
  },
  /* on the water: bobbing, bow up at speed, leaning into turns, a wake off the stern; a wreck settles and sinks */
  pose(car, dt) {
    const T = car.T, big = T.len > 10, t = G.time, ph = car.x * 0.13 + car.z * 0.07, sp = clamp(Math.abs(car.v) / T.maxV, 0, 1);
    if (car.wreck) car.sinkY = (car.sinkY || 0) + dt * 0.6;
    const bob = Math.sin(t * 1.7 + ph) * (big ? 0.05 : 0.09) - (car.sinkY || 0);
    const pitch = -sp * (big ? 0.03 : T.ski ? 0.14 : 0.1) + Math.sin(t * 1.3 + ph) * (big ? 0.008 : 0.025) + Math.min(0.5, (car.sinkY || 0) * 0.3);
    car.lean = damp(car.lean || 0, -(car.steerV || 0) * clamp(Math.abs(car.v) / 10, 0, 1) * (T.ski ? 0.4 : big ? 0.04 : 0.14), 4, dt);
    car.y = 0; car.mesh.position.set(car.x, SEA_Y + bob, car.z);
    car.mesh.rotation.set(pitch, car.h, car.lean + Math.sin(t * 1.1 + ph) * (big ? 0.01 : 0.03));
    if (Math.abs(car.v) > 4 && Math.random() < 0.6) {
      const fx = Math.sin(car.h), fz = Math.cos(car.h), bx = car.x - fx * T.len * 0.5, bz = car.z - fz * T.len * 0.5;
      FX.spawn(bx + rand(-0.5, 0.5) * T.w * 0.5, 0.05, bz, -fx * rand(1, 3) + rand(-1, 1), rand(0.5, 1.5), -fz * rand(1, 3) + rand(-1, 1), pick(['#ffffff', '#e8f4f8', '#cfe8f0']), rand(0.25, 0.5), rand(0.6, 1.1), { grav: 3 });
    }
  },
  moor(m) { const c = new Car(m.type, m.x, m.z, m.h, { parked: true, persistent: true }); c.locked = false; c.sea = { x: m.x, z: m.z, h: m.h }; m.car = c; return c; },
  /* police boats come from out at sea, out of your sight if they can */
  spawnCop(me) {
    const probe = { T: CAR_TYPES.policeboat };
    for (let k = 0; k < 24; k++) {
      const a = rand(0, TAU), d = rand(90, 150), x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d, h = Math.atan2(me.x - x, me.z - z);
      if (!this.afloatAt(probe, x, z, h) || (k < 16 && G.canSee(x, z, 8))) continue;
      const c = new Car('policeboat', x, z, h); c.driver = 'ai'; c.ai = { mode: 'boat', stuckT: 0, revT: 0, shootCd: rand(1, 2) };
      c.siren = true; c.v = 14; c.vx = Math.sin(h) * 14; c.vz = Math.cos(h) * 14; c.sea = { x, z, h };
      if (G.time - this.warned > 30) { this.warned = G.time; G.toast('Police boats are coming for you!', 'warn'); }
      return c;
    }
    return null;
  },
  update(dt) {
    if (G.autotest && !this.auto) return; // (tests that don't ask for boats keep the world they expect)
    if (!this.MOORINGS.length) this.init();
    this.t -= dt; if (this.t > 0) return; this.t = 1;
    const P = G.player, t = G.body();
    for (const m of this.MOORINGS) {
      const c = m.car;
      // left somewhere else with nobody aboard, out of sight and you're well away: it goes, and a fresh one is moored
      if (c && !c.dead && !c.driver && P.inCar !== c && dist(c.x, c.z, m.x, m.z) > 25 && dist(t.x, t.z, c.x, c.z) > 220 && !G.canSee(c.x, c.z, 6)) c.remove();
      if ((!m.car || m.car.dead || m.car.wreck) && (!this.spawned || !G.canSee(m.x, m.z, 8)) && !G.cars.some((o) => !o.dead && !o.wreck && dist(o.x, o.z, m.x, m.z) < m.r)) this.moor(m);
    }
    this.spawned = true;
    // police boats: at 3 stars, when you're out on the water
    const me = P.inCar && P.inCar.T.boat ? P.inCar : null, cops = G.cars.filter((c) => c.T.boat && c.police && !c.dead && !c.wreck);
    if (me && Heat.level >= 3 && (!G.noSpawn || this.auto)) {
      const want = Heat.level >= 5 ? 3 : 2;
      if (cops.filter((c) => dist(c.x, c.z, me.x, me.z) < 320).length < want) this.spawnCop(me);
    }
    for (const c of cops) { const d = dist(c.x, c.z, t.x, t.z); if ((c.ai && c.ai.leaveT > 4 && d > 120 && !G.canSee(c.x, c.z, 6)) || d > 600) c.remove(); }
    for (const c of G.cars) if (c.T.boat && c.wreck && !c.dead && (c.sinkY || 0) > 3 && P.inCar !== c) c.remove();
  },
};

/* a police boat: runs you down with its siren going, rams you, and the officers on deck shoot when they're close;
   with no heat (or you ashore) it heads back out to sea and goes */
function aiBoat(car, dt) {
  const a = car.ai, P = G.player, me = P.inCar && P.inCar.T.boat ? P.inCar : null;
  if (a.revT > 0) { a.revT -= dt; car.drive(dt, -1, a.revSteer, false, false); return; }
  if (!car.police) { car.drive(dt, 0, 0, true, false); return; }
  if (!me || Heat.level === 0) { car.siren = false; a.leaveT = (a.leaveT || 0) + dt; boatSteer(car, car.x + (car.x >= 0 ? 60 : -60), W.SHORE + 150, 16, dt); return; }
  a.leaveT = 0; car.siren = true;
  const d = dist(car.x, car.z, me.x, me.z), lead = Math.min(1.5, d / 25);
  boatSteer(car, me.x + me.vx * lead, me.z + me.vz * lead, car.T.maxV, dt);
  a.shootCd = (a.shootCd || 1) - dt;
  if (d < 40 && a.shootCd <= 0 && !W.segBlocked(car.x, car.z, me.x, me.z)) {
    a.shootCd = rand(0.8, 1.3); Sfx.shot('pistol', car.x, car.z);
    const hit = Math.random() < clamp(0.8 - d / 55 - Math.hypot(me.vx, me.vz) / 70, 0.12, 0.7);
    if (hit) {
      me.damage(5, car.x, car.z, null); FX.burst(me.x, 1.2, me.z, 5, ['#ffd166', '#ffffff'], 4, 0.1, 0.3);
      if (openRide(me) || Math.random() < 0.3) G.hurtPlayer(openRide(me) ? 6 : 3, car.x, car.z, 0, null);
    }
  }
  unstick(car, dt, car.T.maxV * 0.5);
}
/* steer for a point, turning away from land (or the pier) coming up ahead, towards whichever side has open water */
function boatSteer(car, tx, tz, want, dt) {
  const look = 8 + Math.abs(car.v) * 0.9, h = car.h, ahead = (ang, k) => Boats.afloatAt(car, car.x + Math.sin(ang) * look * k, car.z + Math.cos(ang) * look * k, ang);
  let desired = Math.atan2(tx - car.x, tz - car.z);
  if (!ahead(h, 1) || !ahead(h, 0.5)) {
    const l = ahead(h + 0.9, 1), r = ahead(h - 0.9, 1);
    desired = l && !r ? h + 1.4 : r && !l ? h - 1.4 : angDiff(h, desired) > 0 ? h + 1.4 : h - 1.4; want = Math.min(want, 9);
  }
  const d = angDiff(car.h, desired), steer = clamp(-d * 2.4, -1, 1);
  let thr = car.v < want - 0.5 ? 1 : car.v > want + 1.5 ? -0.6 : 0.3;
  if (Math.abs(d) > 1.5 && car.v > 9) thr = -0.3;
  car.drive(dt, thr, steer, false, false);
}
