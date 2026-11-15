'use strict';
/* Vehicles: arcade car physics, traffic + police AI, roadblocks, spikes, explosions. */

const CAR_TYPES = {
  jetski: { name: 'Jet ski', len: 2.8, w: 1.1, maxV: 30, accel: 16, hp: 90, value: 1500, mass: 0.35, boat: true, ski: true, colors: ['#ffd60a', '#ff006e', '#06d6a0', '#3a86ff', '#fb5607'] },
  speedboat: { name: 'Speedboat', len: 6.4, w: 2.4, maxV: 36, accel: 12, hp: 170, value: 5200, mass: 1.4, boat: true, nitro: true, colors: ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#ffffff'] },
  yacht: { name: 'Yacht', len: 16, w: 5.2, maxV: 17, accel: 3.5, hp: 700, value: 85000, mass: 14, boat: true, colors: ['#f8f9fa'] },
  policeboat: { name: 'Police boat', len: 7, w: 2.6, maxV: 33, accel: 12, hp: 240, value: 0, mass: 1.6, boat: true, colors: ['#1d3557'] },
  sedan: { name: 'Sedan', len: 4.3, w: 2.0, maxV: 25, accel: 13, hp: 160, value: 450, mass: 1, colors: ['#c1121f', '#284b63', '#e5e5e5', '#3c6e71', '#6d597a', '#b56576', '#22223b', '#9a8c98'] },
  sports: { name: 'Sports car', len: 4.2, w: 1.95, maxV: 39, accel: 22, hp: 130, value: 1200, mass: 0.9, nitro: true, colors: ['#ff006e', '#ffbe0b', '#fb5607', '#3a86ff', '#06d6a0'] },
  van: { name: 'Van', len: 5.0, w: 2.2, maxV: 20, accel: 10, hp: 220, value: 550, mass: 1.5, colors: ['#f1faee', '#a8dadc', '#6c757d', '#f4a261'] },
  taxi: { name: 'Taxi', len: 4.3, w: 2.0, maxV: 25, accel: 13, hp: 160, value: 380, mass: 1, colors: ['#ffc300'] },
  pickup: { name: 'Ute', len: 4.8, w: 2.1, maxV: 24, accel: 12, hp: 190, value: 520, mass: 1.3, colors: ['#7f5539', '#386641', '#bc4749', '#495057'] },
  supercar: { name: 'Supercar', len: 4.5, w: 2.05, maxV: 50, accel: 30, hp: 130, value: 3400, mass: 0.9, nitro: true, colors: ['#9ef01a', '#ff7b00', '#7209b7', '#f72585', '#ffd60a'] },
  hatch: { name: 'Hatchback', len: 3.5, w: 1.75, maxV: 22, accel: 12, hp: 130, value: 320, mass: 0.75, colors: ['#e9c46a', '#90be6d', '#f28482', '#84a59d', '#ffffff', '#4361ee'] },
  suv: { name: 'SUV', len: 4.7, w: 2.15, maxV: 26, accel: 14, hp: 240, value: 780, mass: 1.5, colors: ['#1b263b', '#6c757d', '#ffffff', '#5e503f', '#9d0208'] },
  muscle: { name: 'Muscle car', len: 4.6, w: 2.0, maxV: 41, accel: 21, hp: 180, value: 1600, mass: 1.15, nitro: true, colors: ['#d00000', '#03045e', '#ffba08', '#222222', '#2b9348'] },
  truck: { name: 'Box truck', len: 7.2, w: 2.5, maxV: 18, accel: 7, hp: 420, value: 950, mass: 3.6, colors: ['#e9ecef', '#ffd166', '#118ab2', '#ef476f'] },
  motorbike: { name: 'Motorbike', len: 2.2, w: 0.8, maxV: 45, accel: 27, hp: 90, value: 950, mass: 0.4, bike: true, nitro: true, colors: ['#d00000', '#111111', '#3a86ff', '#ffbe0b', '#2b9348'] },
  dirtbike: { name: 'Dirt bike', len: 2.1, w: 0.8, maxV: 30, accel: 26, hp: 100, value: 850, mass: 0.36, bike: true, dirt: true, colors: ['#ff6d00', '#ffd60a', '#1e88e5', '#43a047', '#e53935', '#f5f5f5'] },
  bicycle: { name: 'Pedal bike', len: 1.8, w: 0.62, maxV: 17, accel: 11, hp: 60, value: 120, mass: 0.2, bike: true, pedal: true, colors: ['#e63946', '#2a9d8f', '#f4a261', '#264653', '#8338ec'] },
  bmx: { name: 'BMX', len: 1.6, w: 0.6, maxV: 16.5, accel: 14, hp: 60, value: 90, mass: 0.18, bike: true, pedal: true, colors: ['#ff006e', '#06d6a0', '#ffd60a', '#000000', '#4cc9f0'] },
  police: { name: 'Police cruiser', len: 4.5, w: 2.0, maxV: 31, accel: 18, hp: 240, value: 900, mass: 1.2, colors: ['#f5f5f5'] },
  tank: { name: 'Tank', len: 7.4, w: 3.6, maxV: 16, accel: 7, hp: 3000, value: 0, mass: 8, colors: ['#4b5320'], tank: true },
  armored: { name: 'Armored truck', len: 5.8, w: 2.4, maxV: 20, accel: 9, hp: 500, value: 2600, mass: 3, colors: ['#4b5a3c'] },
};

const CARGEO = {};
function carGeo() {
  if (CARGEO.wheel) return CARGEO;
  CARGEO.wheel = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10); CARGEO.wheel.rotateZ(Math.PI / 2);
  CARGEO.light = new THREE.BoxGeometry(0.4, 0.18, 0.06);
  CARGEO.bar = new THREE.BoxGeometry(0.5, 0.16, 0.3);
  for (const k in CARGEO) CARGEO[k].userData.shared = true;
  return CARGEO;
}
function buildCarMesh(type, color) {
  const T = CAR_TYPES[type], g = new THREE.Group(), C = carGeo();
  const L = T.len, Wd = T.w, mats = [], dentable = [], glassMats = [];
  const glass = '#22303c';
  const box = (w, h, d, x, y, z, c, shadow) => {
    const mat = new THREE.MeshLambertMaterial({ color: c }); mats.push(mat);
    const big = w > 1 && d > 1;
    const m = new THREE.Mesh(big ? new THREE.BoxGeometry(w, h, d, 3, 2, Math.max(2, Math.round(d))) : new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
    m.castShadow = shadow !== false; g.add(m);
    if (big && !T.bike) dentable.push({ m, orig: m.geometry.attributes.position.array.slice() });
    if (c === glass) glassMats.push(mat);
    return m;
  };
  if (T.bike) {
    const dirt = !!T.dirt, motor = type === 'motorbike' || dirt, bmx = type === 'bmx', r = bmx ? 0.3 : dirt ? 0.42 : 0.36;
    if (dirt) {
      for (const az of [L / 2 - r, -L / 2 + r]) { const w = new THREE.Mesh(C.wheel, lam('#1b1b1e')); w.scale.set(0.42, r / 0.38, r / 0.38); w.position.set(0, r, az); w.castShadow = true; g.add(w); }
      box(0.34, 0.34, 0.75, 0, 0.92, 0.12, color); box(0.42, 0.26, 0.55, 0, 0.98, -0.42, color); // tank and side panels
      box(0.3, 0.1, 0.9, 0, 1.16, -0.3, '#1b1b1e'); // the long flat seat
      box(0.24, 0.05, 0.55, 0, 1.12, L / 2 - r + 0.08, color); box(0.24, 0.05, 0.6, 0, 1.08, -L / 2 + 0.32, color); // high fenders
      for (const sx of [-0.11, 0.11]) box(0.07, 0.8, 0.07, sx, 0.78, L / 2 - r - 0.04, '#c0c4c8'); // long-travel forks
      box(0.3, 0.32, 0.38, 0, 0.6, 0, '#5c5c5c'); box(0.09, 0.09, 0.75, 0.2, 0.86, -0.5, '#9aa0a6'); // engine, exhaust
      box(0.82, 0.05, 0.05, 0, 1.3, L / 2 - r - 0.08, '#2b2b2e'); // bars
      box(0.32, 0.26, 0.04, 0, 1.14, L / 2 - r + 0.12, '#f5f5f5'); box(0.12, 0.16, 0.05, 0, 1.14, L / 2 - r + 0.14, '#1b1b1e'); // number plate
      const rider = new THREE.Group(), shirt = lam(pick(LOOKS.shirt)), pants = lam(pick(LOOKS.pants));
      const rb = (w, h, d, x, y, z, m, rx) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx || 0; o.castShadow = true; rider.add(o); };
      rb(0.52, 0.62, 0.3, 0, 1.68, -0.2, shirt, 0.3); rb(0.38, 0.38, 0.4, 0, 2.2, 0, lam(color));
      for (const sx of [-0.15, 0.15]) { rb(0.2, 0.7, 0.22, sx, 1.2, -0.05, pants, -1.2); rb(0.16, 0.62, 0.18, sx * 2.4, 1.6, 0.25, shirt, -1.1); }
      rider.visible = false; g.add(rider);
      return { g, mats, bar: null, rider };
    }
    for (const az of [L / 2 - r, -L / 2 + r]) { const w = new THREE.Mesh(C.wheel, lam('#1b1b1e')); w.scale.set(motor ? 0.45 : 0.2, r / 0.38, r / 0.38); w.position.set(0, r, az); w.castShadow = true; g.add(w); }
    if (motor) {
      box(0.42, 0.42, 1.1, 0, 0.72, -0.05, color); box(0.46, 0.26, 0.55, 0, 1.0, 0.25, color);
      box(0.36, 0.1, 0.7, 0, 0.98, -0.42, '#1b1b1e'); box(0.08, 0.7, 0.08, 0, 0.75, L / 2 - r - 0.05, '#9aa0a6');
      box(0.75, 0.06, 0.06, 0, 1.18, 0.62, '#2b2b2e'); box(0.12, 0.1, 0.6, 0.2, 0.5, -0.55, '#9aa0a6');
      const hl = new THREE.Mesh(C.light, new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); hl.scale.set(0.6, 1, 1); hl.position.set(0, 1.0, L / 2 - 0.15); g.add(hl);
    } else {
      const y = bmx ? 0.62 : 0.78;
      box(0.06, 0.06, L * 0.55, 0, y, 0.02, color); box(0.06, 0.06, L * 0.5, 0, y - 0.22, 0.05, color);
      box(0.06, y, 0.06, 0, y / 2 + 0.05, -0.25, color); box(0.2, 0.06, 0.3, 0, y + 0.22, -0.28, '#1b1b1e');
      box(0.06, 0.5, 0.06, 0, y + 0.05, L / 2 - r, '#9aa0a6'); box(bmx ? 0.55 : 0.6, 0.05, 0.05, 0, y + 0.32, L / 2 - r - 0.05, '#2b2b2e');
    }
    // a simple rider shown while the AI rides it
    const rider = new THREE.Group(), shirt = lam(pick(LOOKS.shirt)), skin = lam(pick(LOOKS.skin)), pants = lam(pick(LOOKS.pants));
    const rb = (w, h, d, x, y, z, m, rx) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx || 0; o.castShadow = true; rider.add(o); };
    rb(0.52, 0.62, 0.3, 0, 1.5, -0.25, shirt, 0.35); rb(0.36, 0.36, 0.36, 0, 2.02, -0.05, motor ? lam(color) : skin);
    for (const sx of [-0.15, 0.15]) { rb(0.2, 0.7, 0.22, sx, 1.05, -0.05, pants, -1.2); rb(0.16, 0.62, 0.18, sx * 2.4, 1.45, 0.2, shirt, -1.1); }
    rider.visible = false; g.add(rider);
    return { g, mats, bar: null, rider };
  }
  if (T.boat) {
    // a hull sitting in the water (its waterline at y = 0): a dark bottom, coloured sides, a pointed bow, and what each kind carries
    const white = '#f4f4f0', dark = '#1b1b1e', hullC = type === 'policeboat' ? '#1d3557' : color, big = L > 10;
    const turn = (m, rx, ry) => { m.rotation.set(rx || 0, ry || 0, 0); return m; };
    if (T.ski) {
      box(Wd * 0.85, 0.42, L * 0.8, 0, 0.05, -L * 0.08, hullC); turn(box(Wd * 0.7, 0.36, L * 0.32, 0, 0.12, L * 0.36, hullC), -0.35);
      box(Wd * 0.6, 0.12, L * 0.42, 0, 0.32, -L * 0.12, white); box(0.36, 0.22, L * 0.38, 0, 0.42, -L * 0.14, dark);
      box(0.14, 0.42, 0.14, 0, 0.5, L * 0.18, dark); box(0.7, 0.07, 0.07, 0, 0.72, L * 0.2, '#9aa0a6');
      return { g, mats, bar: null, rider: null, dentable, glassMats, bumpers: [] };
    }
    const sideH = big ? 1.5 : 0.75, sideY = big ? 0.9 : 0.5, sideC = big ? white : hullC;
    box(Wd, 0.5, L * 0.82, 0, -0.1, -L * 0.09, dark, false);
    box(Wd, sideH, L * 0.82, 0, sideY, -L * 0.09, sideC);
    for (const s of [-1, 1]) turn(box(Wd * 0.62, sideH, L * 0.26, s * Wd * 0.19, sideY, L * 0.38, sideC), 0, s * 0.42);
    box(Wd * 1.01, 0.14, L * 0.8, 0, big ? 0.4 : 0.22, -L * 0.09, big ? '#1d3557' : white);
    let bar = null;
    if (big) {
      // the yacht: a teak deck, two decks of cabin with tinted windows, a radar arch and rails
      box(Wd * 0.95, 0.1, L * 0.8, 0, 1.68, -L * 0.09, '#c8a97e');
      box(Wd * 0.75, 1.4, L * 0.42, 0, 2.4, -L * 0.12, white); box(Wd * 0.77, 0.45, L * 0.4, 0, 2.5, -L * 0.12, glass);
      box(Wd * 0.6, 0.9, L * 0.25, 0, 3.55, -L * 0.15, white); box(Wd * 0.62, 0.32, L * 0.23, 0, 3.6, -L * 0.15, glass);
      for (const s of [-1, 1]) { box(0.15, 1.2, 0.15, s * Wd * 0.25, 4.5, -L * 0.2, white); box(0.06, 0.06, L * 0.7, s * Wd * 0.47, 2.15, -L * 0.05, '#d9d9d9'); }
      box(Wd * 0.55, 0.15, 0.3, 0, 5.1, -L * 0.2, white);
    } else {
      box(Wd * 0.9, 0.08, L * 0.75, 0, 0.9, -L * 0.1, white);
      turn(box(Wd * 0.8, 0.45, 0.08, 0, 1.15, L * 0.12, glass), -0.5);
      for (const z of [-0.05, -0.28]) box(Wd * 0.7, 0.35, 0.5, 0, 1.05, L * z, dark);
      box(0.5, 0.9, 0.6, 0, 0.7, -L / 2 - 0.1, dark);
      if (type === 'policeboat') {
        // a cabin with a light bar on its roof
        box(Wd * 0.8, 1.1, L * 0.3, 0, 1.45, -L * 0.02, white); box(Wd * 0.82, 0.35, L * 0.31, 0, 1.65, -L * 0.02, glass);
        bar = [-0.3, 0.3].map((x, i) => { const m = new THREE.Mesh(C.bar, new THREE.MeshBasicMaterial({ color: i ? 0x111155 : 0x551111 })); m.position.set(x, 2.08, -L * 0.02); g.add(m); return m; });
      }
    }
    return { g, mats, bar, rider: null, dentable, glassMats, bumpers: [] };
  }
  if (T.tank) {
    // hull, tracks with road wheels, and a turret that turns to where you aim, with a long gun
    const dark = '#2b2f22', trackC = '#1f1f1c';
    box(Wd * 0.7, 0.85, L, 0, 0.95, 0, color); box(Wd * 0.86, 0.5, L * 0.78, 0, 1.6, -0.2, color);
    box(Wd * 0.7, 0.4, 0.9, 0, 1.15, L / 2 - 0.2, dark);
    for (const sx of [-1, 1]) {
      box(0.8, 1.0, L * 0.98, sx * (Wd / 2 - 0.4), 0.55, 0, trackC, true);
      box(0.9, 0.12, L * 0.9, sx * (Wd / 2 - 0.4), 1.12, 0, color, false); // track guard
      for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(C.wheel, lam('#3a3d33')); w.scale.set(2.2, 1.05, 1.05); w.position.set(sx * (Wd / 2 - 0.4), 0.45, -L / 2 + 0.9 + i * (L - 1.8) / 5); g.add(w); }
    }
    const turret = new THREE.Group(); turret.position.set(0, 2.1, -0.5); g.add(turret);
    const tb = (w, h, d, x, y, z, c) => { const mat = new THREE.MeshLambertMaterial({ color: c }); mats.push(mat); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; turret.add(m); return m; };
    tb(2.3, 0.75, 2.9, 0, 0, 0, color); tb(1.9, 0.3, 2.2, 0, 0.5, -0.1, color); tb(0.7, 0.2, 0.7, 0.45, 0.72, -0.4, dark);
    tb(0.3, 0.3, 3.8, 0, 0.05, 3.2, color); tb(0.42, 0.42, 0.5, 0, 0.05, 5.0, dark); // the gun and its muzzle brake
    for (const sx of [-1, 1]) tb(0.04, 0.5, 0.5, sx * 1.17, 0.05, 0.2, '#e9ecef'); // white stars (squares) on the sides
    return { g, mats, bar: null, rider: null, turret, dentable, glassMats, bumpers: [] };
  }
  if (type === 'truck') {
    const cabL = 2.1, boxL = L - cabL - 0.2;
    box(Wd, 1.9, cabL, 0, 1.45, L / 2 - cabL / 2, color);
    box(Wd * 0.92, 0.7, 0.06, 0, 1.9, L / 2 + 0.01, glass, false);
    box(Wd + 0.1, 2.9, boxL, 0, 1.95, -L / 2 + boxL / 2, pick(['#f8f9fa', '#dee2e6', '#fff3bf']));
    box(Wd + 0.12, 0.5, boxL, 0, 2.2, -L / 2 + boxL / 2, color, false);
  } else if (type === 'supercar') {
    box(Wd, 0.42, L, 0, 0.5, 0, color);
    box(Wd * 0.8, 0.36, L * 0.36, 0, 0.88, -L * 0.08, glass);
    box(Wd * 0.78, 0.06, L * 0.3, 0, 1.08, -L * 0.08, color);
    box(Wd + 0.04, 0.18, L * 0.25, 0, 0.55, -L * 0.15, '#111111', false);
    for (const sx of [-0.7, 0.7]) box(0.08, 0.38, 0.12, sx, 0.9, -L / 2 + 0.35, '#111111', false);
    box(Wd * 0.95, 0.07, 0.5, 0, 1.12, -L / 2 + 0.35, '#111111');
  } else if (type === 'hatch') {
    box(Wd, 0.6, L, 0, 0.7, 0, color);
    box(Wd * 0.88, 0.62, L * 0.62, 0, 1.3, -L * 0.12, glass);
    box(Wd * 0.86, 0.08, L * 0.58, 0, 1.64, -L * 0.12, color);
  } else if (type === 'suv') {
    box(Wd, 0.85, L, 0, 0.95, 0, color);
    box(Wd * 0.9, 0.62, L * 0.64, 0, 1.68, -L * 0.1, glass);
    box(Wd * 0.88, 0.1, L * 0.62, 0, 2.04, -L * 0.1, color);
    box(Wd * 0.7, 0.08, L * 0.5, 0, 2.14, -L * 0.1, '#222222', false);
  } else if (type === 'muscle') {
    box(Wd, 0.6, L, 0, 0.7, 0, color);
    box(Wd * 0.84, 0.48, L * 0.4, 0, 1.24, -L * 0.1, glass);
    box(Wd * 0.82, 0.07, L * 0.36, 0, 1.5, -L * 0.1, color);
    box(0.5, 0.06, L + 0.02, -0.3, 1.01, 0, '#f8f9fa', false); box(0.5, 0.06, L + 0.02, 0.3, 1.01, 0, '#f8f9fa', false);
    box(0.7, 0.2, 0.9, 0, 1.1, L * 0.28, '#222222');
  } else if (type === 'van' || type === 'armored') {
    box(Wd, type === 'armored' ? 2.0 : 1.8, L, 0, 1.4, 0, color);
    box(Wd * 0.92, 0.6, 0.06, 0, 1.9, L / 2 + 0.01, glass, false);
    if (type === 'armored') { box(Wd + 0.02, 0.3, L * 0.7, 0, 1.4, -0.3, '#c9a227', false); box(Wd * 0.7, 0.25, 1, 0, 2.5, -1, '#3a4630'); }
  } else if (type === 'pickup') {
    box(Wd, 0.6, L, 0, 0.75, 0, color);
    box(Wd * 0.9, 0.62, L * 0.36, 0, 1.36, L * 0.12, glass);
    box(Wd * 0.9, 0.08, L * 0.34, 0, 1.7, L * 0.12, color);
    box(Wd, 0.4, 0.12, 0, 1.2, -L / 2 + 0.06, color);
  } else {
    const low = type === 'sports';
    box(Wd, low ? 0.5 : 0.62, L, 0, low ? 0.6 : 0.72, 0, color);
    box(Wd * 0.86, low ? 0.42 : 0.55, L * (low ? 0.42 : 0.5), 0, low ? 1.06 : 1.3, -L * 0.06, glass);
    box(Wd * 0.84, 0.08, L * (low ? 0.36 : 0.44), 0, low ? 1.3 : 1.6, -L * 0.06, color);
    if (type === 'police') { box(Wd + 0.02, 0.32, L * 0.5, 0, 0.78, -L * 0.04, '#1d2733', false); box(Wd * 0.9, 0.06, L * 0.18, 0, 1.09, L * 0.36, '#1d2733', false); }
    if (type === 'taxi') box(0.9, 0.25, 0.4, 0, 1.78, -L * 0.06, '#222');
  }
  const wheelM = lam('#1b1b1e');
  const axles = type === 'truck' ? [L * 0.36, -L * 0.22, -L * 0.36] : [L * 0.32, -L * 0.32];
  for (const sx of [-1, 1]) for (const az of axles) {
    const w = new THREE.Mesh(C.wheel, wheelM); w.position.set(sx * (Wd / 2 - 0.05), 0.38, az); if (type === 'truck' || type === 'suv') w.scale.set(1.15, 1.15, 1.15); g.add(w);
  }
  const head = new THREE.MeshBasicMaterial({ color: 0xfff3c4 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(C.light, head); h.position.set(sx * Wd * 0.32, 0.8, L / 2 + 0.01); g.add(h);
    const t = new THREE.Mesh(C.light, tail); t.position.set(sx * Wd * 0.32, 0.8, -L / 2 - 0.01); g.add(t);
  }
  let bar = null;
  if (type === 'police') {
    const r = new THREE.Mesh(C.bar, new THREE.MeshBasicMaterial({ color: 0x661111 })); r.position.set(-0.28, 1.72, -L * 0.06);
    const b = new THREE.Mesh(C.bar, new THREE.MeshBasicMaterial({ color: 0x111166 })); b.position.set(0.28, 1.72, -L * 0.06);
    g.add(r); g.add(b); bar = [r, b];
  }
  // bumpers: hard front/rear hits knock them off
  const bumpers = [];
  if (type !== 'armored' && type !== 'truck') for (const sz of [1, -1]) {
    const bm = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.96, 0.24, 0.26), lam(type === 'police' ? '#1d2733' : '#2b2d31'));
    bm.position.set(0, 0.48, sz * (L / 2 + 0.08)); bm.castShadow = true; g.add(bm); bumpers.push({ m: bm, sz, on: true });
  }
  return { g, mats, bar, dentable, glassMats, bumpers };
}

class Car {
  constructor(type, x, z, h, o) {
    o = o || {};
    this.type = type; this.T = CAR_TYPES[type];
    this.x = x; this.z = z; this.h = h; this.v = 0; this.vx = 0; this.vz = 0; this.kx = 0; this.kz = 0; this.steerV = 0;
    this.hp = this.maxHp = this.T.hp; this.burning = 0; this.dead = false; this.wreck = false; this.wreckT = 0;
    this.driver = o.driver || null; this.ai = null; this.police = type === 'police' || type === 'policeboat';
    this.parked = !!o.parked; this.persistent = !!o.persistent; this.mission = !!o.mission;
    this.popped = false; this.alarmT = 0; this.siren = false; this.smokeT = 0; this.honkT = 0; this.y = 0; this.yv = 0;
    this.r = this.T.w / 2 + 0.05; this.off = this.T.len / 2 - this.T.w / 2;
    this.color = o.color || pick(this.T.colors);
    this.lane = pick(HWY_LANES);
    const built = buildCarMesh(type, this.color);
    this.mesh = built.g; this.mats = built.mats; this.bar = built.bar; this.rider = built.rider || null; this.turret = built.turret || null; this.turretYaw = 0;
    this.dentable = built.dentable || []; this.glassMats = built.glassMats || []; this.bumpers = built.bumpers || []; this.pull = chance(0.5) ? 1 : -1;
    this.mesh.position.set(x, W.groundAt(x, z), z); this.mesh.rotation.order = 'YXZ'; this.mesh.rotation.y = h;
    G.scene.add(this.mesh);
    G.cars.push(this);
  }
  mass() { return this.T.mass * (this.ai && (this.ai.mode === 'roadblock') ? 5 : (this.parked || this.wreck) ? 2.2 : 1); }
  /* how fast this car may go, and how hard it pulls, right here and now: the zone (streets, highway, sand...), city
     taming, off-road boosts, nitro, damage, a flat tyre, fire. Both handling models use it. */
  limits(boost) {
    if (this.T.boat) { const cond = clamp(this.hp / this.maxHp, 0, 1); return { maxV: this.T.maxV * (boost ? 1.45 : 1) * (cond < 0.5 ? 0.6 + 0.8 * cond : 1) * (this.burning > 0 ? 0.6 : 1), accel: this.T.accel * (boost ? 2 : 1), cond }; }
    const T = this.T;
    let mul = 1;
    if (this.driver === 'player' || (this.police && this.ai && this.ai.mode !== 'patrol')) {
      const z = W.zoneAt(this.x, this.z);
      mul = W.ZONES[z].car;
      if (z === 'forest' && !W.onTrail(this.x, this.z)) mul = 0.78; // weaving through the trees, off the dirt trails
      // the fastest machines are tamed on city streets (nitro still gives the full kick)
      if ((z === 'street' || z === 'alley') && CITY_TAME[this.type] && !boost) mul *= CITY_TAME[this.type];
      // SUVs (and to a lesser degree utes) are built for grass, dirt trails and sand
      if (OFFROAD[this.type] && OFFROAD_ZONES.includes(z)) mul *= OFFROAD[this.type];
    }
    if (this.popped) mul *= 0.5;
    const cond = clamp(this.hp / this.maxHp, 0, 1);
    if (!T.pedal && cond < 0.6) mul *= 0.7 + 0.5 * cond;
    if (this.burning > 0) mul *= 0.6;
    return { maxV: Math.min(88, T.maxV * mul * (boost ? 1.55 : 1)), accel: T.accel * (boost ? 2.6 : 1) * (mul > 1 ? 1.25 : 1), cond };
  }
  drive(dt, thr, steer, hb, boost) {
    if (this.phys) { this.phys.input(thr, steer, hb, boost); return; } // realistic handling: the physics body drives
    const T = this.T, { maxV, accel, cond } = this.limits(boost);
    if (T.boat) { Boats.drive(this, dt, thr, steer, hb, maxV, accel); return; }
    if (this.y <= 0.001) { const sl = W.slopeAlong(this.x, this.z, Math.sin(this.h), Math.cos(this.h)); if (sl) this.v -= sl * ((OFFROAD[this.type] || 0) > 1 ? 5 : 9) * dt; } // 4x4s and dirt bikes pull up hills better
    if (thr > 0) {
      if (this.v < 0) this.v = Math.min(0, this.v + 32 * dt); else if (this.v < maxV) this.v = Math.min(maxV, this.v + accel * thr * dt);
    } else if (thr < 0) {
      if (this.v > 0) this.v = Math.max(0, this.v - 32 * dt); else this.v -= accel * 0.6 * dt;
    } else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 5 * dt);
    if (hb) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 15 * dt);
    if (this.v > maxV) this.v = Math.max(maxV, this.v - 24 * dt);
    if (this.v < -maxV * 0.4) this.v = -maxV * 0.4;
    const sf = clamp(Math.abs(this.v) / 6, 0, 1) * (1 - Math.min(Math.abs(this.v), 40) / 40 * 0.4);
    this.steerV = damp(this.steerV, steer + (!T.pedal && cond < 0.5 && Math.abs(this.v) > 3 ? this.pull * (0.5 - cond) * 0.35 : 0), 10, dt);
    if (T.tank) this.h -= this.steerV * 0.9 * (this.v < -0.5 ? -1 : 1) * dt; // tracks: it turns on the spot
    else this.h -= this.steerV * (T.bike ? 3.1 : 2.4) * sf * Math.sign(this.v) * dt * (hb ? 1.7 : 1);
    if (this.popped) this.h += (Math.random() - 0.5) * 0.9 * dt * Math.min(1, Math.abs(this.v) / 10);
    const fx = Math.sin(this.h), fz = Math.cos(this.h), grip = (hb ? 1.8 : 8) * Weather.grip();
    this.vx = damp(this.vx, fx * this.v, grip, dt); this.vz = damp(this.vz, fz * this.v, grip, dt);
  }
  integrate(dt) {
    if (this.phys) return; // moved by the physics step
    if (this.T.boat) { Boats.move(this, dt); return; }
    // move in short hops so fast cars and bikes can't skip over thin barriers
    const sp = Math.hypot(this.vx + this.kx, this.vz + this.kz), n = Math.min(12, Math.max(1, Math.ceil(sp * dt / 0.25))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const g0 = W.groundAt(this.x, this.z);
      this.x += (this.vx + this.kx) * h; this.z += (this.vz + this.kz) * h;
      const dg = W.groundAt(this.x, this.z) - g0;
      if (dg) this.groundStep(dg, h, sp * h); else if (this.y <= 0.001) this.gvy = 0; // flat again: no climb to carry off the next edge
      this.collideStatic();
    }
    const k = Math.exp(-3 * dt); this.kx *= k; this.kz *= k;
  }
  /* the ground moved under the car by dg (see Actor.groundStep): airborne cars keep their height,
     grounded ones follow it unless it drops away faster than they can, which launches them */
  groundStep(dg, h, len) {
    if (this.y > 0.001 || this.yv > 0) { this.y -= dg; return; }
    if (dg < -Math.max(0.1, len * 0.3)) {
      const bx = this.x - this.vx * h, bz = this.z - this.vz * h; // where it took off from
      this.y = -dg; this.yv = Math.max(0, this.gvy || 0); this.airT = 0; this.launch = { x: bx, z: bz, ramp: W.rampUnder(bx, bz) };
      return;
    }
    this.gvy = dg / h;
  }
  circles() {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), o = this.off;
    const c = [[this.x + fx * o, this.z + fz * o], [this.x - fx * o, this.z - fz * o]];
    if (this.T.len > 4.7) c.push([this.x, this.z]);
    return c;
  }
  collideStatic() {
    let best = null;
    const ox = this.x, oz = this.z;
    for (let k = 0, n = this.circles().length; k < n; k++) {
      const [cx, cz] = this.circles()[k], p = { x: cx, z: cz }; // re-read after each push
      const hit = W.collideCircle(p, this.r, this.y, this.vx, this.vz);
      if (hit) { this.x += p.x - cx; this.z += p.z - cz; if (!best || hit.depth > best.depth) best = hit; }
    }
    if (!best) return;
    const smash = best.c.destructible;
    // cars flatten trees, poles and pumps; a bike just stops dead against them (and you don't)
    if (smash && !this.T.bike && Math.hypot(this.vx, this.vz) > (SMASH_SPEED[smash.kind] || 99)) {
      this.x = ox; this.z = oz; G.smash(best.c, this);
      return;
    }
    const vn = this.vx * best.nx + this.vz * best.nz;
    if (vn < 0) {
      const pvx = this.vx, pvz = this.vz;
      this.vx -= best.nx * vn * 1.35; this.vz -= best.nz * vn * 1.35;
      const impact = -vn;
      if (this.T.bike && impact > 8 && this.driver) G.bail(this, impact, pvx, pvz);
      if (impact > 9) {
        this.damage((impact - 9) * 1.6, this.x - best.nx * 3, this.z - best.nz * 3);
        Sfx.crash(impact / 30, this.x, this.z); if (this.driver === 'player') G.shake(impact * 0.03);
        if (best.c.kind === 'tree') FX.burst(this.x, 2, this.z, 8, ['#2f5d34', '#4f8a3a'], 4, 0.25, 0.8);
      }
    }
    this.v = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
  }
  damage(amount, fx, fz, src) {
    if (this.dead || this.wreck) return;
    if (fx != null && amount > 2 && !this.T.bike) this.dent(fx, fz, amount);
    if (this.T.pedal) {
      // pedal bikes and BMXs never burn or explode: wreck one and it just tips over
      this.hp -= amount;
      if (this.hp <= 0) { this.hp = this.maxHp; this.knockOver(); }
      return;
    }
    this.hp -= amount;
    if (src && src === G.player && this.police && this.driver === 'ai') G.crime('assaultCop', G.player.x, G.player.z, { radio: true });
    if (this.hp <= 0 && this.burning <= 0) {
      this.hp = 0; this.burning = 6.5;
      if (this.driver === 'player') G.toast(this.T.boat ? 'Your boat is on fire! Get it to the shore.' : 'Your car is on fire — get out!', 'warn');
      if (this.driver === 'ai' && this.ai) { const empty = this.ai.mode === 'roadblock' || this.ai.mode === 'parked' || this.T.boat; this.ai.mode = 'dead'; if (!empty) G.ejectDriver(this); this.driver = null; }
    }
  }
  /* push panel vertices in around the impact, crack the glass, maybe knock a bumper off */
  dent(fx, fz, amount) {
    const c = Math.cos(this.h), s = Math.sin(this.h), dx = fx - this.x, dz = fz - this.z;
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    const L = this.T.len / 2, Wd = this.T.w / 2, sx = Math.abs(lx) / Wd, sz = Math.abs(lz) / L;
    if (sx > sz) lx = Math.sign(lx) * Wd; else lz = Math.sign(lz) * L;
    const nl = Math.hypot(lx, lz) || 1, nx = sx > sz ? Math.sign(lx) : 0, nz = sx > sz ? 0 : Math.sign(lz);
    const depth = Math.min(0.55, amount / 36);
    FX.burst(this.x + (lx * c + lz * s) * 0.9, 0.9, this.z + (-lx * s + lz * c) * 0.9, Math.min(14, 3 + amount / 3), ['#ffd166', '#ffffff', '#ff9f1c'], 7, 0.1, 0.35, { grav: 10 });
    for (const d of this.dentable) {
      const pos = d.m.geometry.attributes.position, a = pos.array, o = d.m.position;
      for (let i = 0; i < a.length; i += 3) {
        const vx = a[i] + o.x, vz = a[i + 2] + o.z, dist2 = (vx - lx) ** 2 + (vz - lz) ** 2;
        if (dist2 > 2.6) continue;
        const f = (1 - dist2 / 2.6) * depth;
        a[i] -= nx * f; a[i + 2] -= nz * f;
        if (a[i + 1] > 0) a[i + 1] = Math.max(d.orig[i + 1] * 0.55, a[i + 1] - f * 0.35); // tops crumple down a bit
        // never fold past 45% of the way in
        a[i] = clamp(a[i], d.orig[i] - Math.abs(d.orig[i]) * 0.6 - 0.05, d.orig[i] + Math.abs(d.orig[i]) * 0.6 + 0.05);
        a[i + 2] = clamp(a[i + 2], d.orig[i + 2] - Math.abs(d.orig[i + 2]) * 0.6 - 0.05, d.orig[i + 2] + Math.abs(d.orig[i + 2]) * 0.6 + 0.05);
      }
      pos.needsUpdate = true; d.m.geometry.computeVertexNormals();
    }
    void nl;
    const cond = clamp((this.hp - amount) / this.maxHp, 0, 1);
    for (const g of this.glassMats) g.color.set(cond < 0.4 ? '#cfd8df' : cond < 0.75 ? '#7f93a3' : '#22303c');
    // paint gets scuffed and scorched the more it's damaged
    if (!this.matOrig) this.matOrig = this.mats.map((m) => m.color.clone());
    this.mats.forEach((m, i) => { if (!this.glassMats.includes(m)) m.color.copy(this.matOrig[i]).lerp(this.scuff || (this.scuff = new THREE.Color('#2e2a27')), (1 - cond) * 0.55); });
    const loose = nz !== 0 && this.bumpers.find((b) => b.on && b.sz === nz);
    if (loose && amount > 6 && !loose.hanging) { loose.hanging = true; loose.m.rotation.z = (chance(0.5) ? 1 : -1) * 0.3; loose.m.position.y -= 0.18; }
    else if (loose && loose.hanging) amount = Math.max(amount, 15);
    if (amount > 14 && nz !== 0) {
      const bp = this.bumpers.find((b) => b.on && b.sz === nz);
      if (bp) {
        bp.on = false; this.mesh.remove(bp.m);
        const wx = this.x + Math.sin(this.h) * nz * (L + 0.3), wz = this.z + Math.cos(this.h) * nz * (L + 0.3);
        const thrown = Phys.debrisPiece(bp.m, wx, 0.6, wz, this.h, { x: Math.sin(this.h) * nz * 4 + this.vx * 0.5, y: 3, z: Math.cos(this.h) * nz * 4 + this.vz * 0.5 }, { x: rand(-3, 3), y: rand(-3, 3), z: rand(-3, 3) });
        if (!thrown) FX.burst(wx, 0.5, wz, 6, ['#2b2d31', '#555555'], 4, 0.2, 0.6);
        Sfx.crash(0.6, this.x, this.z);
      }
    }
  }
  repair() {
    for (const d of this.dentable) { d.m.geometry.attributes.position.array.set(d.orig); d.m.geometry.attributes.position.needsUpdate = true; d.m.geometry.computeVertexNormals(); }
    for (const g of this.glassMats) g.color.set('#22303c');
    if (this.matOrig) this.mats.forEach((m, i) => m.color.copy(this.matOrig[i]));
    for (const b of this.bumpers) if (b.on && b.hanging) { b.hanging = false; b.m.rotation.set(0, 0, 0); b.m.position.y = 0.48; }
    for (const b of this.bumpers) if (!b.on) { const m = b.m.clone(); m.position.set(0, 0.48, b.sz * (this.T.len / 2 + 0.08)); m.quaternion.identity(); this.mesh.add(m); b.m = m; b.on = true; }
    this.hp = this.maxHp; this.popped = false;
  }
  knockOver() {
    if (this.fallen) return;
    if (this.driver === 'player') G.bail(this, Math.max(10, Math.abs(this.v)));
    else if (this.driver === 'ai') G.bail(this, 10);
    this.fallen = true; this.driver = null; this.ai = null; this.parked = true; this.v *= 0.3; this.leftT = this.leftT || 120;
    Sfx.crash(0.35, this.x, this.z);
  }
  explode() {
    this.burning = 0; this.wreck = true; this.wreckT = 40; this.v = 0;
    for (const m of this.mats) m.color.set('#2a2624');
    if (this.bar) for (const b of this.bar) b.material.color.set(0x222222);
    explosion(this.x, this.z, 7.5, 70, this.lastHitBy);
    if (G.player.inCar === this) { G.exitCar(true); G.hurtPlayer(55, this.x, this.z, 10, null); }
    this.driver = null; this.ai = null; this.parked = true;
    if (this.mission) G.missionCarLost(this);
  }
  update(dt) {
    if (this.burning > 0) {
      this.burning -= dt;
      if (Math.random() < 0.6) FX.spawn(this.x + rand(-0.8, 0.8), 1.3, this.z + rand(-0.8, 0.8), rand(-0.5, 0.5), rand(2, 4), rand(-0.5, 0.5), pick(['#ff6b1a', '#ffb703', '#e63946']), rand(0.3, 0.6), 0.6, { grav: -2 });
      // flames lick up and a thick black column pours off a burning car
      if (Math.random() < 0.5) Puffs.add(this.x + rand(-0.6, 0.6), 1.4, this.z + rand(-0.6, 0.6), rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), 0.9, 1.4, 0.45, pick(['#ff7a1a', '#ffb703']), 0.85, 2);
      if (Math.random() < 0.7) Puffs.add(this.x + rand(-0.5, 0.5), 2.0, this.z + rand(-0.5, 0.5), rand(-0.4, 0.4), rand(2, 3), rand(-0.4, 0.4), 1.4, 4.5, 3.2, '#1c1c1c', 0.8, 1.2);
      if (this.burning <= 0) this.explode();
    } else if (!this.wreck && !this.T.pedal && this.hp < this.maxHp * 0.5) {
      this.smokeT -= dt;
      const heavy = this.hp < this.maxHp * 0.25;
      // smoke billows from under the bonnet: grey steam when it's hurt, thick black smoke when it's about to go
      if (this.smokeT <= 0) {
        this.smokeT = heavy ? 0.045 : 0.09; const fx = Math.sin(this.h), fz = Math.cos(this.h), hx = this.x + fx * this.T.len * 0.33, hz = this.z + fz * this.T.len * 0.33;
        Puffs.add(hx + rand(-0.4, 0.4), 1.1, hz + rand(-0.4, 0.4), rand(-0.4, 0.4) - this.vx * 0.15, rand(1, 2), rand(-0.4, 0.4) - this.vz * 0.15, heavy ? 0.9 : 0.75, heavy ? 3.8 : 3.0, heavy ? 2.6 : 1.9, heavy ? pick(['#2a2a2a', '#3a3a3a']) : pick(['#d8d8d8', '#b4b4b4']), heavy ? 0.75 : 0.65, 1.4);
      }
    }
    if (this.wreck) { this.wreckT -= dt; if (Math.random() < 0.25) Puffs.add(this.x + rand(-0.6, 0.6), 1.2, this.z + rand(-0.6, 0.6), rand(-0.3, 0.3), rand(1, 1.8), rand(-0.3, 0.3), 1.2, 4, 3.5, pick(['#2b2b2b', '#454545']), 0.6, 1); }
    // pedal bikes left lying around (or abandoned) vanish after 2 minutes
    if (this.T.pedal && this.leftT > 0 && !this.driver) { this.leftT -= dt; if (this.leftT <= 0) { if (G.canSee(this.x, this.z, 2)) this.leftT = 3; else { this.remove(); return; } } }
    if (this.alarmT > 0) { this.alarmT -= dt; this.honkT -= dt; if (this.honkT <= 0) { this.honkT = 0.6; Sfx.honk(this.x, this.z); } }
    if (this.bar) {
      const on = this.siren && !this.wreck, ph = Math.floor(G.time * 6) % 2;
      this.bar[0].material.color.set(on && ph ? 0xff2020 : 0x551111);
      this.bar[1].material.color.set(on && !ph ? 0x2050ff : 0x111155);
    }
    if (this.phys) { this.phys.pose(); if (this.rider) this.rider.visible = this.driver === 'ai'; return; }
    if (this.T.boat) { Boats.pose(this, dt); return; }
    // airborne (or the ground just rose up to meet a falling car): fall, and land properly either way
    if (this.y > 0 || this.yv !== 0) {
      this.yv -= 22 * dt; this.y += this.yv * dt; this.airT = (this.airT || 0) + dt;
      if (this.y <= 0) {
        this.y = 0; this.yv = 0;
        if (this.driver === 'player') { Sfx.land(this.x, this.z); if (this.launch && this.airT > 0.9 && !this.wreck) G.stunt(this, this.airT, dist(this.launch.x, this.launch.z, this.x, this.z), this.launch.ramp); }
        this.launch = null;
      }
    }
    const gnd = W.groundAt(this.x, this.z), fx = Math.sin(this.h), fz = Math.cos(this.h);
    this.mesh.position.set(this.x, this.y + gnd, this.z); this.mesh.rotation.y = this.h;
    // pitch and roll with the slope underneath; in the air the nose lifts a little
    const pitchG = -Math.atan(W.slopeAlong(this.x, this.z, fx, fz)), rollG = -Math.atan(W.slopeAlong(this.x, this.z, -fz, fx));
    this.mesh.rotation.x = this.y > 0.05 ? damp(this.mesh.rotation.x, -0.25, 8, dt) : damp(this.mesh.rotation.x, pitchG, 10, dt);
    if (this.T.bike) this.lean = damp(this.lean || 0, this.fallen ? 1.45 : this.parked && !this.driver ? 0.18 : clamp(this.steerV * Math.min(Math.abs(this.v) / 8, 1) * 0.45, -0.5, 0.5), this.fallen ? 10 : 8, dt);
    else this.lean = damp(this.lean || 0, clamp(-this.steerV * this.v * 0.004, -0.08, 0.08), 6, dt);
    this.mesh.rotation.z = this.lean + (this.y > 0.05 ? 0 : rollG);
    if (this.rider) this.rider.visible = this.driver === 'ai';
  }
  remove() { if (this.phys) this.phys.destroy(); this.dead = true; G.scene.remove(this.mesh); disposeObj(this.mesh); }
}

/* ---------------- skid marks (pooled instanced quads) ---------------- */
const Skids = {
  N: 700, i: 0, t: 0, mesh: null, d: null,
  init() {
    const g = new THREE.PlaneGeometry(0.34, 0.95); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.5, depthWrite: false }), this.N);
    this.mesh.frustumCulled = false; this.d = new THREE.Object3D(); this.d.position.set(0, -50, 0); this.d.updateMatrix();
    for (let k = 0; k < this.N; k++) this.mesh.setMatrixAt(k, this.d.matrix);
    G.scene.add(this.mesh);
  },
  add(car, dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.035;
    const fx = Math.sin(car.h), fz = Math.cos(car.h), rx = -fz, rz = fx, back = car.T.len * 0.32, side = car.T.w * 0.4;
    for (const s of [-1, 1]) {
      const x = car.x - fx * back + rx * side * s, z = car.z - fz * back + rz * side * s;
      this.d.position.set(x, 0.065 + W.groundAt(x, z), z); this.d.rotation.set(0, Math.atan2(car.vx, car.vz), 0); this.d.updateMatrix();
      this.mesh.setMatrixAt(this.i, this.d.matrix); this.i = (this.i + 1) % this.N;
      if (Math.random() < 0.45) Puffs.add(x, 0.4, z, rand(-0.6, 0.6) - car.vx * 0.05, rand(0.3, 0.8), rand(-0.6, 0.6) - car.vz * 0.05, 0.7, 3.2, 1.4, pick(['#e8e8e8', '#d4d4d4']), 0.45, 0.4); // tyre smoke
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  },
};

/* ---------------- collisions between cars and with people ---------------- */
function carPairs() {
  const cs = G.cars;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i]; if (a.dead) continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j]; if (b.dead) continue;
      if (a.phys && b.phys) continue; // two physics cars: Box3D handles the contact
      if (a.y > 0.9 || b.y > 0.9) continue; // a hopping BMX sails over
      const reach = (a.T.len + b.T.len) / 2 + 0.5;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
      let best = null;
      const rr = a.r + b.r;
      for (const p of a.circles()) for (const q of b.circles()) {
        const dx = p[0] - q[0], dz = p[1] - q[1], d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.01, pen = rr - d; if (!best || pen > best.pen) best = { nx: dx / d, nz: dz / d, pen }; }
      }
      if (!best) continue;
      const ma = a.mass(), mb = b.mass(), ta = mb / (ma + mb), tb = ma / (ma + mb);
      a.x += best.nx * best.pen * ta; a.z += best.nz * best.pen * ta;
      b.x -= best.nx * best.pen * tb; b.z -= best.nz * best.pen * tb;
      const vn = (a.vx - b.vx) * best.nx + (a.vz - b.vz) * best.nz;
      if (vn < 0) {
        const pre = [a.vx, a.vz, b.vx, b.vz];
        const jimp = -(1.3 * vn) / (1 / ma + 1 / mb);
        a.vx += jimp * best.nx / ma; a.vz += jimp * best.nz / ma;
        b.vx -= jimp * best.nx / mb; b.vz -= jimp * best.nz / mb;
        a.v = a.vx * Math.sin(a.h) + a.vz * Math.cos(a.h);
        b.v = b.vx * Math.sin(b.h) + b.vz * Math.cos(b.h);
        const imp = -vn;
        if (imp > 8) {
          a.damage((imp - 8) * 1.15 * (mb / ma), b.x, b.z, b.driver === 'player' ? G.player : null);
          b.damage((imp - 8) * 1.15 * (ma / mb), a.x, a.z, a.driver === 'player' ? G.player : null);
          Sfx.crash(imp / 30, (a.x + b.x) / 2, (a.z + b.z) / 2); if (a.driver === 'player' || b.driver === 'player') G.shake(imp * 0.025);
          for (const c of [a, b]) if (c.parked && !c.wreck && c.alarmT <= 0 && imp > 9 && !c.T.bike) c.alarmT = 5;
          if (a.T.bike && a.driver) G.bail(a, imp, pre[0], pre[1]);
          if (b.T.bike && b.driver) G.bail(b, imp, pre[2], pre[3]);
        }
      }
    }
  }
}
function carHitsActors(car) {
  const spd = Math.hypot(car.vx, car.vz), fx = Math.sin(car.h), fz = Math.cos(car.h);
  const P = G.player;
  const test = (a) => {
    if (a.dead || a.y > 0.8) return;
    const dx = a.x - car.x, dz = a.z - car.z;
    if (dx * dx + dz * dz > 20 || car.y > 0.6) return;
    const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
    const hl = car.T.len / 2 + a.r, hw = car.T.w / 2 + a.r;
    if (Math.abs(lz) > hl || Math.abs(lx) > hw) return;
    if (a.down) return;
    if (spd > 5.5 && !a.invuln && !(a.carHitT > G.time)) {
      a.carHitT = G.time + 0.6; // one hit per crash: you're still inside the car's outline for a few steps
      const s = Math.sign(lx) || 1;
      a.kx = car.vx * 0.85 + fz * s * 3; a.kz = car.vz * 0.85 - fx * s * 3;
      a.yv = 4 + spd * 0.15; a.y = 0.02;
      const byPlayer = car.driver === 'player';
      if (a === P) G.hurtPlayer(spd * 2, car.x, car.z, 0, null);
      else {
        const ko = a.hurt(spd * 2.4, car.x, car.z, 0, byPlayer ? P : null);
        if (byPlayer) G.crime(a.kind === 'cop' ? 'assaultCop' : 'assault', car.x, car.z, { victim: a, ko });
        else panic(a.x, a.z, 12);
      }
      const pvx = car.vx, pvz = car.vz;
      car.vx *= 0.9; car.vz *= 0.9; car.v *= 0.9;
      Sfx.punch(car.x, car.z); if (byPlayer) G.shake(0.25);
      // a bike that ploughs into someone at speed throws its rider too
      if (car.T.bike && car.driver && spd > 13) G.bail(car, spd * 0.55, pvx, pvz);
    } else {
      const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
      if (px < pz) { const s = Math.sign(lx) || 1; a.x += fz * s * px; a.z += -fx * s * px; }
      else { const s = Math.sign(lz) || 1; a.x += fx * s * pz; a.z += fz * s * pz; }
    }
  };
  if (!P.inCar && !P.inHeli) test(P);
  for (const n of G.npcs) test(n);
  // bikes vs heavy street props (bins, crates, newspaper boxes): hit one fast and you go over the bars
  if (car.T.bike && car.driver && spd > 12 && Phys.ready) {
    for (const p of Phys.props) {
      if (!p.body || p.kind === 'cone' || p.y > 1.2) continue;
      const dx = p.x - car.x, dz = p.z - car.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      if (lz > 0 && lz < car.T.len / 2 + 0.45 && Math.abs(lx) < car.T.w / 2 + 0.35) { G.bail(car, spd * 0.5); break; }
    }
  }
}

function explosion(x, z, r, dmg, src, o) {
  FX.burst(x, 1.5, z, 40, ['#ff6b1a', '#ffb703', '#e63946', '#fff3b0'], 12, 0.5, 0.9, { grav: 4 });
  // a fireball, then a rolling cloud of dark smoke
  for (let i = 0; i < 26; i++) { const a = rand(0, TAU), s = rand(1, 5); Puffs.add(x + Math.cos(a) * rand(0, 2), rand(0.8, 2.5), z + Math.sin(a) * rand(0, 2), Math.cos(a) * s, rand(1.5, 4), Math.sin(a) * s, rand(1.4, 2.4), 3.2, rand(0.5, 0.8), pick(['#ff8c1a', '#ffc04d', '#ff5a1f']), 0.9, 1); }
  for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(0.5, 4); Puffs.add(x + Math.cos(a) * rand(0, 3), rand(1, 3.5), z + Math.sin(a) * rand(0, 3), Math.cos(a) * s, rand(1, 3.5), Math.sin(a) * s, rand(1.6, 2.6), 4.5, rand(3, 5), pick(['#2a2a2a', '#3d3d3d', '#555555']), 0.7, 1.1); }
  Sfx.explode(x, z); G.shake(clamp(1.2 - dist(x, z, G.player.x, G.player.z) / 60, 0, 1));
  const P = G.player;
  if (o && o.rocket) rocketKills(x, z, src, o.hit); // (first: the ordinary blast below would only throw a bike's rider clear)
  const hitA = (a) => {
    const d = dist(a.x, a.z, x, z); if (d > r || a.dead || a.y > 4) return; // blasts on the street don't reach people high above
    const f = 1 - d / r;
    a.yv = 5 * f + 2; a.y = Math.max(a.y, 0.02);
    if (a === P) { if (!P.inCar && !P.inHeli) G.hurtPlayer(dmg * f, x, z, 12 * f, null); }
    else { const ko = a.hurt(dmg * f, x, z, 12 * f, src === P ? P : null); if (ko && src === P && a.kind === 'cop') G.crime('assaultCop', x, z, { victim: a, ko }); }
  };
  hitA(P); for (const n of G.npcs) hitA(n);
  for (const c of G.cars) { if (c.dead || c.wreck) continue; const d = dist(c.x, c.z, x, z); if (d < r && d > 0.1) { c.lastHitBy = src; c.damage(dmg * (1 - d / r) * 0.9, x, z, src); c.kx += (c.x - x) / d * 6; c.kz += (c.z - z) / d * 6; } }
  for (const h of Choppers.list) if (!h.dead && h.y < 7 && dist(h.x, h.z, x, z) < r + 2) h.damage(dmg * 1.2, src);
  for (const c of W.queryBox(x - r * 0.6, z - r * 0.6, x + r * 0.6, z + r * 0.6)) if (c.destructible && !c.removed && dist(c.destructible.x != null ? c.destructible.x : c.x, c.destructible.z != null ? c.destructible.z : c.z, x, z) < r * 0.6) G.smash(c, null, x, z);
  Phys.explode(x, z, r);
  panic(x, z, 45);
  if (src === P) { G.crime('explosion', x, z, {}); G.blastLoot(x, z, r); }
}

/* a rocket (or a tank's shell) destroys the vehicle it hits outright, and anything right beside the blast: cars and
   motorbikes go up, aircraft come down, and whoever was riding a bike is killed. A pedal bike just goes over (they never
   burn), and a tank's armour shrugs it off (it takes the blast's damage like anything else) */
function rocketKills(x, z, src, hit) {
  const P = G.player;
  const beside = (c) => { const s = Math.sin(c.h), co = Math.cos(c.h), dx = x - c.x, dz = z - c.z; return Math.hypot(Math.max(0, Math.abs(dx * s + dz * co) - c.T.len / 2), Math.max(0, Math.abs(dx * co - dz * s) - c.T.w / 2)) < 1.5; };
  for (const c of G.cars.filter((k) => !k.dead && !k.wreck && !k.T.tank && (k === hit || beside(k)))) {
    c.lastHitBy = src;
    if (c.T.bike) { // the rider takes the full blast
      if (c.driver === 'ai') { const a = G.ejectDriver(c); c.driver = null; c.ai = null; c.parked = true; if (a) { a.x = c.x; a.z = c.z; G.killActor(a, x, z, src); } }
      else if (c.driver === 'player' && P.inCar === c) { G.exitCar(true); G.hurtPlayer(9999, x, z, 14, null); }
      if (c.T.pedal) { c.knockOver(); continue; }
    }
    c.damage(c.hp + 1, x, z, src); if (!c.wreck && !c.dead) c.explode();
  }
  for (const h of Choppers.list) if (!h.dead && h.falling <= 0 && h.y < 7 && dist(h.x, h.z, x, z) < (h.wing ? 6 : 4)) h.damage(h.hp + 1, src);
}

/* ---------------- AI driving ---------------- */
// how fast a physics car can take a turn of this many radians inside a junction: a right angle at about 11 m/s
// (what real tyres hold within the crossing), turning right round at about 6
const turnSpeed = (turn) => (turn <= 1.57 ? 11 + 26 * (1 - turn / 1.57) : Math.max(6, 11 - 5 * (turn - 1.57) / 1.57)) * Math.sqrt(Weather.grip()); // (slower in the wet, the snow, a storm)
function steerTo(car, tx, tz, want, dt) {
  const desired = Math.atan2(tx - car.x, tz - car.z);
  const d = angDiff(car.h, desired);
  if (car.ai) car.ai.hdErr = d;
  let steer = clamp(-d * 2.6, -1, 1);
  let thr = 0;
  if (Math.abs(d) > 0.6) want = Math.min(want, 8);
  if (car.phys && Math.abs(d) > 0.3) want = Math.min(want, (Math.abs(d) > 1.8 ? 6 : 9 + 23 * Math.max(0, 1 - (Math.abs(d) - 0.3) / 0.6)) * Math.sqrt(Weather.grip())); // tyres, not rails (turning right round slowly, and slower on a slippery road)
  if (car.phys) thr = clamp((want - car.v) / 3, -1, 1); // a physics car gets smooth pedals
  else if (car.v < want - 0.8) thr = 1; else if (car.v > want + 1.5) thr = -1;
  if (want <= 0.1 && car.v < 0.6) { thr = 0; if (!car.phys) car.v = Math.max(0, car.v); }
  if (car.v < 0) steer = -steer;
  car.drive(dt, thr, steer, false, false);
}
const HWY_LANES = [2.5, 7.5, 12.5];
function laneOff(a, b, car) { return (a.hwy && b.hwy) ? ((car && car.lane) || 7.5) : 2.5; }
function navPoints(car) {
  const a = car.ai, A = W.nodes[a.from], B = W.nodes[a.to];
  const L = dist(A.x, A.z, B.x, B.z) || 1, dx = (B.x - A.x) / L, dz = (B.z - A.z) / L, lo = laneOff(A, B, car);
  a.exitX = A.x + dx * A.half * 0.9 - dz * lo; a.exitZ = A.z + dz * A.half * 0.9 + dx * lo;
  a.tx = B.x - dx * B.half * 0.7 - dz * lo; a.tz = B.z - dz * B.half * 0.7 + dx * lo;
  a.stage = 'exit';
  a.limit = Math.min((A.hwy && B.hwy) ? 30 - car.lane : 14, car.T.maxV * ((A.hwy && B.hwy) ? 1.1 : 0.8));
}
/* top-speed factor on city streets for the fastest vehicles */
const CITY_TAME = { supercar: 0.72, sports: 0.8, motorbike: 0.76 };
const OFFROAD = { suv: 1.25, pickup: 1.12, dirtbike: 1.3, motorbike: 0.75 }, OFFROAD_ZONES = ['outskirts', 'beach', 'forest']; // (a road motorbike struggles on grass and sand)
const SMASH_SPEED = { tree: 12, lamp: 6, pump: 5, cactus: 3 }; // how fast a car must be going to flatten each kind of thing
function initTraffic(car, from, to) {
  car.ai = Object.assign(car.ai || {}, { mode: car.police ? 'patrol' : 'traffic', from, to, blockT: 0, ignoreT: 0, checkT: 0, blocked: null, stuckT: 0, revT: 0 });
  navPoints(car); car.ai.stage = 'run';
}
function obstacleAhead(car, look) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h), a = car.ai;
  const P = G.player;
  if (a.ignoreT <= 0) for (const o of G.cars) {
    if (o === car || o.dead) continue;
    const dx = o.x - car.x, dz = o.z - car.z, lz = dx * fx + dz * fz;
    if (lz < 1 || lz > look) continue;
    if (Math.abs(dx * fz - dz * fx) < 2.3) return o === P.inCar ? 'player' : 'car';
  }
  const chk = (n) => {
    if (n.dead || n.y > 0.5) return false;
    const dx = n.x - car.x, dz = n.z - car.z, lz = dx * fx + dz * fz;
    return lz > 1 && lz < look * 0.8 && Math.abs(dx * fz - dz * fx) < 1.7;
  };
  if (!P.inCar && !P.inHeli && chk(P)) return 'player';
  for (const n of G.npcs) if (chk(n)) return 'ped';
  return null;
}
function aiTraffic(car, dt) {
  const a = car.ai;
  if (a.revT > 0) { a.revT -= dt; car.drive(dt, -1, a.revSteer, false, false); return; }
  const tx = a.stage === 'exit' ? a.exitX : a.tx, tz = a.stage === 'exit' ? a.exitZ : a.tz, dT = dist(car.x, car.z, tx, tz);
  // the next turn is chosen before the junction (so the driver can slow for it)
  const choose = () => {
    const B = W.nodes[a.to];
    let opts = B.adj.filter((n) => n !== a.from);
    if (!opts.length) opts = B.adj;
    let next = pick(opts);
    if (W.nodes[next].lot && opts.length > 1 && Math.random() < 0.7) next = pick(opts.filter((n) => !W.nodes[n].lot)); // (a car park is a stop, not the way on)
    // a fleeing driver mostly takes the turn that leads away from you
    if (a.flee && Math.random() < 0.8) { const t = G.body(); next = opts.slice().sort((p, q) => dist(W.nodes[q].x, W.nodes[q].z, t.x, t.z) - dist(W.nodes[p].x, W.nodes[p].z, t.x, t.z))[0]; }
    return next;
  };
  if (a.stage !== 'exit' && dT < 26 && a.peek == null) a.peek = choose();
  if (dT < 3.2) {
    if (a.stage === 'exit') a.stage = 'run';
    else { const next = a.peek != null ? a.peek : choose(); a.peek = null; a.from = a.to; a.to = next; navPoints(car); }
  }
  a.checkT -= dt; a.ignoreT -= dt;
  if (a.checkT <= 0) { a.checkT = 0.15; a.blocked = obstacleAhead(car, 6 + Math.max(0, car.v) * (car.phys ? 0.95 : 0.6)); } // a physics car needs room to stop
  let want = a.flee ? Math.min(car.T.maxV * 0.85, a.limit * 1.8) : a.limit;
  if (a.peek != null && a.stage !== 'exit' && dT < 26) { // slow for the turn: the sharper, the slower
    const A = W.nodes[a.from], B = W.nodes[a.to], C = W.nodes[a.peek], turn = Math.abs(angDiff(Math.atan2(B.x - A.x, B.z - A.z), Math.atan2(C.x - B.x, C.z - B.z)));
    const long = car.T.len > 5.5; want = Math.min(want, ((long ? 12 : 15) - (long ? 8.5 : 9) * Math.min(1, turn / 1.57)) * (car.phys ? Math.sqrt(Weather.grip()) : 1)); // big trucks take corners slower (and physics cars on a slippery road, as cornering speed goes with the root of the grip)
  }
  for (const cr of W.railCrossings || []) {
    if (!cr.closed) continue;
    const dx = cr.x - car.x, dz = cr.z - car.z, d = Math.hypot(dx, dz);
    if (d < 30 && d > 7 && dx * Math.sin(car.h) + dz * Math.cos(car.h) > d * 0.7) { want = 0; a.crossingT = G.time; break; } // waiting for the train
  }
  if (a.blocked && !a.flee) {
    want = 0; a.blockT += dt;
    if (a.blocked === 'player' && a.blockT > 1.2 && car.honkT <= 0) { car.honkT = 3; Sfx.honk(car.x, car.z); }
    if (a.blocked === 'car' && a.blockT > 3.5) { a.ignoreT = 1.5; a.blockT = 0; }
  } else a.blockT = 0;
  car.honkT -= dt;
  steerTo(car, a.stage === 'exit' ? a.exitX : a.tx, a.stage === 'exit' ? a.exitZ : a.tz, want, dt);
  unstick(car, dt, want);
}
function unstick(car, dt, want) {
  const a = car.ai;
  if (want > 4 && Math.abs(car.v) < 1.2) a.stuckT += dt; else a.stuckT = Math.max(0, a.stuckT - dt);
  if (a.stuckT > (car.phys ? 1.1 : 1.6)) {
    a.stuckT = 0;
    if (car.phys) { a.revN = G.time - (a.revAt || -99) < 8 ? Math.min(3, (a.revN || 0) + 1) : 0; a.revAt = G.time; a.revT = 1.3 + 0.5 * a.revN; a.revSteer = a.hdErr ? Math.sign(a.hdErr) : (chance(0.5) ? 1 : -1); } // a physics car can't slide round a corner: back off with the nose swinging toward where it's going, further each time it wedges at the same spot
    else { a.revT = 1.1; a.revSteer = chance(0.5) ? 1 : -1; }
  }
}

function aiPolice(car, dt) {
  const a = car.ai, P = G.player;
  if (a.mode === 'roadblock' || a.mode === 'dead') { car.drive(dt, 0, 0, true, false); return; }
  if (Heat.level === 0 || G.respawning) {
    car.siren = false;
    if (a.mode !== 'patrol') { const n = W.nearestNode(car.x, car.z); initTraffic(car, n, pick(W.nodes[n].adj)); a.stage = 'exit'; navPoints(car); }
    return aiTraffic(car, dt);
  }
  car.siren = true;
  if (a.mode === 'parked') {
    const t = G.body();
    if (dist(car.x, car.z, t.x, t.z) > (P.inCar || P.inHeli ? 40 : 70) && G.playerZone !== 'alley' && G.playerZone !== 'forest') { a.mode = 'pursuit'; a.node = null; }
    else { car.drive(dt, 0, 0, true, false); return; }
  }
  if (a.mode === 'patrol' || a.mode === 'traffic') { a.mode = 'pursuit'; a.node = null; a.dropped = false; }
  if (a.revT > 0) { a.revT -= dt; car.drive(dt, -1, a.revSteer, false, false); return; }
  const tgt = G.body(), tx = tgt.x, tz = tgt.z, d = dist(car.x, car.z, tx, tz);
  const pz = G.playerZone;
  if (a.mode === 'pursuit' && (pz === 'alley' || pz === 'forest') && Heat.level >= 2 && d < 110) {
    const exit = Heat.pickExit(car);
    if (exit) { a.mode = 'perimeter'; a.ex = exit.x; a.ez = exit.z; a.node = null; }
  }
  let gx, gz, want = car.T.maxV;
  if (a.mode === 'perimeter') {
    const de = dist(car.x, car.z, a.ex, a.ez);
    if (de < 9) {
      a.mode = 'parked'; car.v *= 0.3;
      Heat.dropCops(car, 2, 'guard');
      return;
    }
    if (de < 30 && !W.segBlocked(car.x, car.z, a.ex, a.ez)) { gx = a.ex; gz = a.ez; want = Math.min(want, 16); }
    else { const g = graphStep(car, a.ex, a.ez); gx = g.gx; gz = g.gz; if (car.phys && g.turn > 0.3) want = Math.min(want, turnSpeed(g.turn)); }
    if (pz !== 'alley' && pz !== 'forest') a.mode = 'pursuit';
  } else {
    const direct = d < 34 && pz !== 'alley' && pz !== 'forest' && !W.segBlocked(car.x, car.z, tx, tz);
    if (direct) {
      const lead = P.inCar ? 0.45 : 0.2;
      gx = tx + P.vx * lead; gz = tz + P.vz * lead;
      if (!P.inCar && !P.inHeli && d < 30) want = Math.min(want, Math.max(0, (d - 9) * 1.3)); // pull up next to a suspect on foot instead of running them over
      if (!P.inCar && !P.inHeli && d < 15) {
        want = 0;
        if (!a.dropped && Math.abs(car.v) < 4) { a.dropped = true; a.mode = 'parked'; Heat.dropCops(car, 2, 'chase'); return; }
      }
    } else { const g = graphStep(car, tx, tz); gx = g.gx; gz = g.gz; if (car.phys && g.turn > 0.3) want = Math.min(want, turnSpeed(g.turn)); } // brake for the turn
  }
  steerTo(car, gx, gz, want, dt);
  unstick(car, dt, want);
}
// the junction a car on the move is heading for: the end of the road it's on that lies ahead (the nearest one may be behind it)
function nodeAhead(car) {
  if (Math.abs(car.v) < 3) return W.nearestNode(car.x, car.z);
  let be = null, bd = 12; for (const e of W.edges) { const A = W.nodes[e.a], B = W.nodes[e.b], d = segPointDist(car.x, car.z, A.x, A.z, B.x, B.z); if (d < bd) { bd = d; be = e; } }
  if (!be) return W.nearestNode(car.x, car.z);
  const A = W.nodes[be.a], B = W.nodes[be.b], fwd = ((B.x - A.x) * Math.sin(car.h) + (B.z - A.z) * Math.cos(car.h)) * Math.sign(car.v);
  return fwd >= 0 ? be.b : be.a;
}
function graphStep(car, tx, tz) {
  const a = car.ai;
  if (a.node == null) a.node = car.phys ? nodeAhead(car) : W.nearestNode(car.x, car.z);
  let n = W.nodes[a.node], uturn = false;
  if (dist(car.x, car.z, n.x, n.z) < 7) {
    let best = n.adj[0], bd = 1e9;
    for (const id of n.adj) { const m = W.nodes[id], dd = dist(m.x, m.z, tx, tz); if (dd < bd) { bd = dd; best = id; } }
    if (dist(n.x, n.z, tx, tz) < bd - 5) return { gx: tx, gz: tz, turn: 0, dn: 0 };
    // a physics car turns back only from the middle of the junction, where the side roads leave room for its turning circle
    const m = W.nodes[best], back = car.phys && Math.abs(angDiff(car.h, Math.atan2(m.x - n.x, m.z - n.z))) > 2.3;
    const atMiddle = dist(car.x, car.z, n.x, n.z) < 2.5 || (n.x - car.x) * Math.sin(car.h) + (n.z - car.z) * Math.cos(car.h) < 0;
    if (back && !atMiddle) uturn = true; else { a.node = best; n = m; }
  }
  if (uturn) return { gx: n.x, gz: n.z, turn: Math.PI, dn: dist(car.x, car.z, n.x, n.z) };
  // a physics car follows the road to the junction (aiming a little way along it) instead of cutting across the corner block
  let gx = n.x, gz = n.z;
  if (car.phys) {
    let pv = null, pd = 1e9; for (const id of n.adj) { const m = W.nodes[id], dd = segPointDist(car.x, car.z, m.x, m.z, n.x, n.z); if (dd < pd) { pd = dd; pv = m; } }
    if (pv) { const sx = n.x - pv.x, sz = n.z - pv.z, L2 = sx * sx + sz * sz, u = clamp(((car.x - pv.x) * sx + (car.z - pv.z) * sz) / L2, 0, 1) + (6 + Math.abs(car.v) * 0.4) / Math.sqrt(L2); if (u < 1) { gx = pv.x + sx * u; gz = pv.z + sz * u; } }
  }
  // the junction ahead: which way from there, and how sharp a turn that is
  const dn = dist(car.x, car.z, n.x, n.z); let turn = 0;
  if (dn < 12 + Math.abs(car.v) * (car.phys ? 1.2 : 0.9)) {
    let nb = null, bd = 1e9; for (const id of n.adj) { const m = W.nodes[id], dd = dist(m.x, m.z, tx, tz); if (dd < bd) { bd = dd; nb = m; } }
    if (nb && dist(n.x, n.z, tx, tz) >= bd - 5) turn = Math.abs(angDiff(Math.atan2(n.x - car.x, n.z - car.z), Math.atan2(nb.x - n.x, nb.z - n.z)));
  }
  return { gx, gz, turn, dn };
}

/* ---------------- roadblocks + spike strips ---------------- */
const Spikes = {
  list: [],
  add(x, z, ang, len, life, byPlayer) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.7), lam('#2b2b2b')); g.add(base);
    for (let k = -len / 2 + 0.3; k < len / 2; k += 0.45) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 4), lam('#d9d9d9')); s.position.set(k, 0.15, 0); g.add(s); }
    g.position.set(x, 0.06 + W.groundAt(x, z), z); g.rotation.y = ang; G.scene.add(g);
    this.list.push({ x, z, ang, len, life, g, byPlayer });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.life -= dt;
      const ax = Math.cos(s.ang), az = -Math.sin(s.ang);
      for (const c of G.cars) {
        if (c.dead || c.wreck || c.popped || Math.abs(c.v) < 2 || c.y > 0.15) continue;
        const dx = c.x - s.x, dz = c.z - s.z, along = dx * ax + dz * az, across = -dx * az + dz * ax;
        if (Math.abs(along) < s.len / 2 + 0.5 && Math.abs(across) < 1.2) {
          c.popped = true; Sfx.pop(c.x, c.z);
          FX.burst(c.x, 0.4, c.z, 10, ['#222', '#888'], 5, 0.2, 0.6);
          if (c.driver === 'player') { G.toast('Spike strip! Tires shredded.', 'warn'); G.shake(0.4); }
          else if (c.police && s.byPlayer) G.toast('Cop car hit your spikes!', 'good');
        }
      }
      if (s.life <= 0) { G.scene.remove(s.g); this.list.splice(i, 1); }
    }
  },
  clear() { for (const s of this.list) G.scene.remove(s.g); this.list.length = 0; },
};

const Roadblocks = {
  list: [], timer: 6,
  update(dt) {
    const P = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const rb = this.list[i];
      const d = dist(rb.x, rb.z, P.x, P.z);
      if (((Heat.level === 0 && d > 70) || d > 260) && (!G.canSee(rb.x, rb.z, 16) || d > 420)) { this.removeRB(rb); this.list.splice(i, 1); }
    }
    if (Heat.level < 2 || !P.inCar || G.playerZone !== 'highway') { this.timer = Math.max(this.timer, 4); return; }
    this.timer -= dt;
    if (this.timer > 0 || this.list.length >= 1) return;
    if (this.spawnAhead()) this.timer = Heat.level >= 4 ? 10 : 15; else this.timer = 2;
  },
  spawnAhead() {
    const car = G.player.inCar, s0 = W.ringParam(car.x, car.z), p0 = W.ringPoint(s0);
    const vt = car.vx * p0.tx + car.vz * p0.tz;
    if (Math.abs(vt) < 6) return false;
    const sg = Math.sign(vt);
    let s = s0 + sg * 150, rp = W.ringPoint(s), tries = 0;
    while ((rp.arc || G.canSee(rp.x, rp.z, 16)) && tries++ < 8) { s += sg * 25; rp = W.ringPoint(s); }
    if (rp.arc || G.canSee(rp.x, rp.z, 16)) return false; // nowhere out of sight ahead: try again in a moment
    for (const c of G.cars) if (!c.dead && c !== car && !c.mission && !c.persistent && dist(c.x, c.z, rp.x, rp.z) < 18) c.remove(); // clear the traffic out of the way
    const nx = -rp.tz, nz = rp.tx;
    const rb = { x: rp.x, z: rp.z, cars: [], cops: [], props: [] };
    const slots = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5], gap = randi(0, 5);
    slots.forEach((off, k) => {
      if (k === gap) return;
      const c = new Car('police', rp.x + nx * off, rp.z + nz * off, Math.atan2(nx, nz) + rand(-0.15, 0.15));
      c.driver = 'ai'; c.ai = { mode: 'roadblock' }; c.siren = true; rb.cars.push(c);
    });
    for (const off of [-(W.HWH - 0.5), W.HWH - 0.5]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), lam('#ff7b00'));
      cone.position.set(rp.x + nx * off - rp.tx * sg * 3, 0.45, rp.z + nz * off - rp.tz * sg * 3); G.scene.add(cone); rb.props.push(cone);
    }
    if (Heat.level >= 3) {
      const gx = rp.x + nx * slots[gap] - rp.tx * sg * 6, gz = rp.z + nz * slots[gap] - rp.tz * sg * 6;
      Spikes.add(gx, gz, Math.atan2(-rp.tx, -rp.tz), 5.2, 9999, false);
      rb.spike = Spikes.list[Spikes.list.length - 1];
    }
    for (const off of [-8, 8]) {
      const cop = spawnCop(rp.x + nx * off + rp.tx * sg * 3.5, rp.z + nz * off + rp.tz * sg * 3.5, 'guard');
      cop.facing = Math.atan2(-rp.tx * sg, -rp.tz * sg); rb.cops.push(cop);
    }
    this.list.push(rb);
    G.toast(Heat.level >= 3 ? 'Roadblock ahead! Spikes in the gap.' : 'Roadblock ahead on the highway!', 'warn');
    Voice.radio([Voice.unit('roadblock'), Voice.placeKey(rb.x, rb.z)].concat(rb.spike ? [Voice.unit('spikes')] : []), true);
    Sfx.alarm();
    return true;
  },
  removeRB(rb) {
    for (const c of rb.cars) if (G.player.inCar !== c) c.remove();
    for (const p of rb.props) G.scene.remove(p);
    if (rb.spike) rb.spike.life = 0;
    for (const c of rb.cops) if (!c.dead && c.ai.mode === 'guard') c.remove(); // cops who left their post to chase you stay in the chase
  },
  clear() { for (const rb of this.list) this.removeRB(rb); this.list.length = 0; this.timer = 4; }, // a fresh chase gets a fresh roadblock clock
};
