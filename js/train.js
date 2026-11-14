'use strict';
/* The county train: a locomotive and four cars running round the rail loop (js/outer.js), stopping at both stations.
   Anything on the track gets hit. You can climb on (E next to it) and ride the roofs: the train carries you, the
   police can't follow you up there. The third car carries a safe on its roof (the Gravy Train job). */

const Train = {
  cars: [], s: 0, v: 0, state: 'run', dwell: 0, nextStop: 0, hornT: 0, GAP: 17, CRUISE: 22,
  init() {
    if (!W.RAIL) return;
    W.railSegs();
    const specs = [
      { len: 16, roof: 4.6, color: '#e0a100', loco: true }, { len: 15, roof: 4.2, color: '#8b3a2a' }, { len: 15, roof: 4.2, color: '#5b6066', cash: true },
      { len: 15, roof: 4.2, color: '#3a5f8b' }, { len: 15, roof: 4.2, color: '#8b3a2a' },
    ];
    this.cars = specs.map((sp, i) => {
      const g = new THREE.Group(), add = (w, h, d, x, y, z, c, basic) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic ? new THREE.MeshBasicMaterial({ color: c }) : lam(c)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      add(3.0, 0.5, sp.len - 0.6, 0, 0.55, 0, '#2b2b2e'); // chassis
      for (const z of [-sp.len / 2 + 2.2, sp.len / 2 - 2.2]) add(2.6, 0.7, 2.4, 0, 0.35, z, '#1b1b1e'); // bogies
      if (sp.loco) {
        add(3.1, 3.0, 9.5, 0, 2.3, -2.6, sp.color); add(3.1, 3.6, 4.6, 0, 2.6, 5, '#c1121f'); add(3.15, 1.0, 4.2, 0, 3.6, 5.4, '#22303c');
        add(3.2, 0.25, 15.6, 0, 3.95, 0.4, '#3b3b3b'); add(1.4, 0.8, 1.4, 0, 4.25, -4, '#3b3b3b');
        add(0.5, 0.5, 0.2, -0.9, 1.6, 7.75, '#fff5c0', true); add(0.5, 0.5, 0.2, 0.9, 1.6, 7.75, '#fff5c0', true);
      } else {
        add(3.1, 3.4, sp.len - 0.8, 0, 2.5, 0, sp.color); add(3.2, 0.2, sp.len - 0.6, 0, 4.25, 0, '#3b3b3b');
        add(0.1, 2.6, 3, 1.58, 2.3, 0, '#2b2b2e'); add(0.1, 2.6, 3, -1.58, 2.3, 0, '#2b2b2e'); // sliding doors
        if (sp.cash) { add(1.6, 0.9, 1.6, 0, 4.8, 0, '#c9a227'); add(1.1, 0.2, 1.1, 0, 5.3, 0, '#8a6d12'); add(3.15, 0.5, sp.len - 0.8, 0, 3.6, 0, '#c9a227'); }
      }
      G.scene.add(g);
      return Object.assign({ mesh: g, x: 0, z: 0, h: 0, dx: 0, dz: 0, hl: sp.len / 2, hw: 1.7 }, sp);
    });
    this.v = 0; this.state = 'dwell'; this.dwell = 4;
    // start the train standing at the first station
    const st = W.STATIONS[0]; this.s = st.s + 2 * this.GAP; this.nextStop = 1;
    this.place(0);
    const cash = this.cars[2];
    this.safe = makeRob('trainSafe', 'store', 'Rail Safe', cash.x, cash.z, { hold: 6, cash: [2600, 4200], base: 2, cool: 300, onTrain: true, r: 2.2 });
  },
  /* move every car to its spot on the loop; remember how far each moved (to carry riders) */
  place(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], s = this.s - i * this.GAP, p = W.railPoint(s), q = W.railPoint(s + 1);
      const nx = p.x, nz = p.z;
      c.dx = nx - c.x; c.dz = nz - c.z; if (!dt) c.dx = c.dz = 0;
      c.x = nx; c.z = nz; c.h = Math.atan2(q.x - p.x, q.z - p.z);
      c.mesh.position.set(c.x, 0.15, c.z); c.mesh.rotation.y = c.h;
    }
  },
  /* which car (if any) covers a point, with a margin */
  carAt(x, z, m) {
    for (const c of this.cars) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h), dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx * fx + dz * fz) < c.hl + (m || 0) && Math.abs(dx * fz - dz * fx) < c.hw + (m || 0)) return c;
    }
    return null;
  },
  floorAt(x, z, y) {
    let f = 0;
    for (const c of this.cars) { if (c.roof > y + 0.6 || c.roof <= f) continue; if (this.carAt(x, z, 0.1) === c) f = c.roof; }
    return f;
  },
  onTrain(P) { const c = !P.inCar && !P.inHeli && P.y > 2 && this.carAt(P.x, P.z, 0.2); return c && Math.abs(P.y - c.roof) < 0.35 ? c : null; },
  near(x, z, d) { for (const c of this.cars) if (this.carAt(x, z, d) === c) return c; return null; },
  climb(c) {
    const P = G.player; if (!c) return;
    P.x = c.x; P.z = c.z; P.y = c.roof; P.yv = 0; P.jumping = false; P.vault = null; P.top = null; P.safeT = G.time + 1;
    Sfx.jump(P.x, P.z); G.toast('On the train. Ride it, rob it, or jump off with SPACE.', 'good'); Story.event('boardTrain');
  },
  update(dt) {
    if (!this.cars.length) return;
    const st = W.STATIONS[this.nextStop];
    if (this.state === 'dwell') {
      this.v = 0; this.dwell -= dt;
      if (this.dwell <= 0) { this.state = 'run'; this.horn(); }
    } else {
      // brake for the next station so the train's middle stops at the platform
      const stopAt = st.s + 2 * this.GAP, L = W.RAILLEN, ahead = (((stopAt - this.s) % L) + L) % L, brake = (this.v * this.v) / (2 * 1.4) + 1;
      const want = ahead < brake ? 0 : this.CRUISE;
      this.v = want > this.v ? Math.min(want, this.v + 1.3 * dt) : Math.max(0, this.v - 1.6 * dt);
      if (ahead < 1.5 || (ahead < 6 && this.v < 0.5)) { this.state = 'dwell'; this.dwell = 10; this.v = 0; this.nextStop = (this.nextStop + 1) % W.STATIONS.length; }
    }
    this.s += this.v * dt;
    this.place(dt);
    const P = G.player;
    // riders go where the train goes
    const ride = P.y > 2 && !P.inCar && !P.inHeli ? this.cars.find((c) => this.carAt(P.x, P.z, 0.3) === c && Math.abs(P.y - c.roof) < 0.5) : null;
    if (ride) { P.x += ride.dx; P.z += ride.dz; }
    if (this.safe) { const c = this.cars[2]; this.safe.x = c.x; this.safe.z = c.z; }
    this.hornT -= dt;
    if (this.v > 3) this.collide(dt);
    // crossings: lights flash and the barriers come down while the train is close
    const loco = this.cars[0], blink = Math.floor(G.time * 3) % 2;
    for (const cr of W.railCrossings) {
      const near = this.cars.some((c) => dist(c.x, c.z, cr.x, cr.z) < 110) && this.v > 0.5;
      cr.posts.forEach((p, i) => { p.light.material.color.set(near && (blink ^ (i & 1)) ? 0xff2020 : 0x441111); p.arm.rotation.z = damp(p.arm.rotation.z, near ? 0 : Math.PI / 2 - 0.05, 3, dt); });
      if (near && dist(loco.x, loco.z, cr.x, cr.z) < 90 && dist(loco.x, loco.z, cr.x, cr.z) > 40 && this.hornT <= 0) this.horn();
    }
  },
  horn() { if (this.hornT > 0) return; this.hornT = 6; const l = this.cars[0]; Sfx.play('horn_train', l.x, l.z, 1.0, { range: 320, verb: 0.2, vary: 0.02 }) || Sfx.honk(l.x, l.z); },
  /* the train doesn't stop for anything: cars get shoved and smashed, people get thrown */
  collide(dt) {
    const P = G.player, ahead = this.cars[0];
    for (const c of this.cars) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const hit = (x, z, r) => { const dx = x - c.x, dz = z - c.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx; return Math.abs(lz) < c.hl + r && Math.abs(lx) < c.hw + r ? { lz, lx } : null; };
      for (const car of G.cars) {
        if (car.dead || car.y > 3) continue;
        const h = hit(car.x, car.z, car.T.w * 0.5); if (!h) continue;
        const sgn = Math.sign(h.lx) || 1, push = c.hw + car.T.w * 0.5 + 0.3 - Math.abs(h.lx);
        car.x += fz * sgn * push; car.z -= fx * sgn * push;
        if (!(car.trainHitT > G.time)) {
          car.trainHitT = G.time + 0.8;
          car.vx += fx * this.v * 0.8 + fz * sgn * 6; car.vz += fz * this.v * 0.8 - fx * sgn * 6;
          car.damage(this.v * 5, c.x, c.z, null); Sfx.crash(1, car.x, car.z); if (car.driver === 'player') G.shake(0.8);
          if (car.driver === 'player' && car.T.bike) G.bail(car, this.v, car.vx, car.vz);
        }
      }
      const actors = G.npcs.concat(!P.inCar && !P.inHeli && P.y < 2 ? [P] : []);
      for (const a of actors) {
        if (a.dead || a.down || a.y > 2 || a.trainHitT > G.time) continue;
        const h = hit(a.x, a.z, a.r); if (!h) continue;
        a.trainHitT = G.time + 1;
        const sgn = Math.sign(h.lx) || 1; a.kx = fx * this.v * 0.7 + fz * sgn * 8; a.kz = fz * this.v * 0.7 - fx * sgn * 8; a.yv = 6; a.y = 0.05;
        if (a === P) G.hurtPlayer(25 + this.v * 3, c.x, c.z, 0, null); else a.hurt(200, c.x, c.z, 0, null);
        Sfx.punch(a.x, a.z);
      }
    }
    // somebody on the track ahead: lean on the horn
    const fx = Math.sin(ahead.h), fz = Math.cos(ahead.h);
    if (this.hornT <= 0) for (const o of G.cars.concat(G.npcs, [P])) { const dx = o.x - ahead.x, dz = o.z - ahead.z, lz = dx * fx + dz * fz; if (lz > 8 && lz < 70 && Math.abs(dx * fz - dz * fx) < 2.5) { this.horn(); break; } }
  },
};
