'use strict';
/* Terrain: rolling hills, highlands and badland mesas out in the county.
   The simulation stays flat: every y in the game means "height above the local ground". The ground's height is
   only added when things are drawn (W.groundAt), plus two pieces of physics that need it: cars and people launch
   when the ground falls away under them (crests, ramps, cliffs), and slopes slow you down uphill.
   Everything that exists on flat ground — the city, roads, rail, water, the airport, fields, buildings — sits in
   zones where the ground is exactly 0. Stunt ramps add their own height on top. */

W.HILLS = true;
W.TERRAIN = null;
W.RAMPS = [];

/* ---------------- noise ---------------- */
function tHash(ix, iz, seed) { let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function tNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = tHash(ix, iz, seed), b = tHash(ix + 1, iz, seed), c = tHash(ix, iz + 1, seed), d = tHash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
function tFbm(x, z, seed, oct) { let s = 0, amp = 0.5, f = 1, norm = 0; for (let i = 0; i < (oct || 4); i++) { s += amp * tNoise(x * f, z * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2.03; } return s / norm; }
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------- biomes: how hilly each part of the county is ---------------- */
W.biomeAt = function (x, z) {
  // weights blend smoothly so biomes fade into one another
  const high = sstep(-380, -560, x) * sstep(-200, -360, z), bad = sstep(330, 470, x) * sstep(-470, -600, z);
  const woods = sstep(-380, -520, x) * (1 - sstep(-200, -360, z)) * sstep(60, -20, z);
  return { high, bad: bad * (1 - high), woods: woods * (1 - high), farm: Math.max(0, 1 - high - bad - woods) };
};
function rawHeight(x, z) {
  const b = W.biomeAt(x, z);
  let h = b.farm * 5 * tFbm(x / 170, z / 170, 11, 3);
  if (b.woods > 0) h += b.woods * 13 * tFbm(x / 120, z / 120, 23, 4);
  if (b.high > 0) { const n = tFbm(x / 230, z / 230, 37, 5); h += b.high * (8 + 70 * Math.pow(n, 2.2)); }
  if (b.bad > 0) { // mesas: flat tops with steep sides, low dunes between
    const n = tFbm(x / 190, z / 190, 53, 3), plateau = sstep(0.52, 0.62, n) * 16 + sstep(0.65, 0.72, n) * 9;
    h += b.bad * (plateau + 1.6 * tFbm(x / 40, z / 40, 61, 2));
  }
  return h;
}

/* ---------------- where the ground must stay flat ---------------- */
W.FLAT = []; // extra flat areas registered by districts: {minX,maxX,minZ,maxZ,pad}
function flatMask(x, z, near) {
  const B = W.BOUND + 30;
  // the city, the ring, its outskirts and the coast
  let m = sstep(0, 90, Math.max(Math.abs(x) - B, -(z + B)));
  m = Math.min(m, sstep(30, 90, W.SHORE - z));
  m = Math.min(m, sstep(10, 60, W.OUT - Math.abs(x)), sstep(10, 60, W.OUT + z)); // the fences
  if (m <= 0) return 0;
  for (const e of near) m = Math.min(m, sstep(20, 60, segPointDist(x, z, e.ax, e.az, e.bx, e.bz))); // roads
  if (W.RAIL) m = Math.min(m, sstep(16, 50, W.railDist(x, z)));
  if (W.LAKE) m = Math.min(m, sstep(30, 70, dist(x, z, W.LAKE.x, W.LAKE.z) - W.LAKE.r));
  if (W.RIVER) { let d = 1e9; const p = W.RIVER.pts; for (let i = 1; i < p.length; i++) d = Math.min(d, segPointDist(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1])); m = Math.min(m, sstep(34, 80, d)); }
  const box = (q, a, b) => { const d = Math.max(q.minX - x, x - q.maxX, q.minZ - z, z - q.maxZ); m = Math.min(m, sstep(a, b, d)); };
  if (W.AIRPORT) box(W.AIRPORT.fence, 20, 90);
  for (const r of W.RESERVE) if (r.kind === 'mountain') box(r, 10, 50);
  for (const f of W.fields) box({ minX: f.x0, maxX: f.x1, minZ: f.z0, maxZ: f.z1 }, 12, 40);
  for (const q of W.FLAT) box(q, q.pad || 12, (q.pad || 12) + 35);
  return m;
}

function buildTerrain() {
  const C = 8, x0 = -W.OUT - 80, z0 = -W.OUT - 80, x1 = W.OUT + 80, z1 = W.SHORE + 80;
  const nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((z1 - z0) / C) + 1, H = new Float32Array(nx * nz);
  W.TERRAIN = { C, x0, z0, nx, nz, H, env: null };
  // every stunt jump sits on a level, graded track: 70 m of run-up and 70 m of landing (they all face along the map's axes)
  for (const st of W.STUNTS) {
    const fx = Math.round(Math.sin(st.ang)), fz = Math.round(Math.cos(st.ang)), ax = st.x - fx * 70, az = st.z - fz * 70, bx = st.x + fx * 70, bz = st.z + fz * 70, w = Math.max(9, st.len);
    W.FLAT.push({ minX: Math.min(ax, bx) - (fx ? 0 : w), maxX: Math.max(ax, bx) + (fx ? 0 : w), minZ: Math.min(az, bz) - (fz ? 0 : w), maxZ: Math.max(az, bz) + (fz ? 0 : w), pad: 6 });
  }
  // county buildings stay level too
  for (const b of W.buildings) if (W.inCounty(b.minX, b.minZ) || W.inCounty(b.maxX, b.maxZ)) W.FLAT.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, pad: 10 });
  if (!W.HILLS) return;
  // roads near each 64 m patch, so the flat-mask test only looks at a few segments per vertex
  const P = 64, near = new Map(), key = (i, j) => i + ',' + j;
  for (const e of W.countyEdges) {
    const i0 = Math.floor((Math.min(e.ax, e.bx) - 70 - x0) / P), i1 = Math.floor((Math.max(e.ax, e.bx) + 70 - x0) / P);
    const j0 = Math.floor((Math.min(e.az, e.bz) - 70 - z0) / P), j1 = Math.floor((Math.max(e.az, e.bz) + 70 - z0) / P);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!near.has(k)) near.set(k, []); near.get(k).push(e); }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * C, z = z0 + j * C;
    const m = flatMask(x, z, near.get(key(Math.floor((x - x0) / P), Math.floor((z - z0) / P))) || []);
    H[j * nx + i] = m > 0 ? rawHeight(x, z) * m : 0;
    if (W.DAM && m > 0) H[j * nx + i] = damShape(x, z, H[j * nx + i], near.get(key(Math.floor((x - x0) / P), Math.floor((z - z0) / P))) || []);
  }
  // no slope steeper than 0.6 m per metre: sweep the grid both ways, capping each point at its neighbours plus that
  // rise (flat zones stay at 0, peaks and mesa sides become climbable, and flat-zone edges ease in)
  const S = 0.6 * C;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; let h = H[k]; if (i) h = Math.min(h, H[k - 1] + S); if (j) h = Math.min(h, H[k - nx] + S); H[k] = h; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let h = H[k]; if (i < nx - 1) h = Math.min(h, H[k + 1] + S); if (j < nz - 1) h = Math.min(h, H[k + nx] + S); H[k] = h; }
  }
  // aircraft follow a smooth envelope over the hills instead of every bump
  const E = 4, ex = Math.ceil(nx / E), ez = Math.ceil(nz / E), env = new Float32Array(ex * ez);
  for (let j = 0; j < ez; j++) for (let i = 0; i < ex; i++) {
    let mx = 0;
    for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) { const a = i * E + di, b = j * E + dj; if (a >= 0 && b >= 0 && a < nx && b < nz) mx = Math.max(mx, H[b * nx + a]); }
    env[j * ex + i] = mx;
  }
  W.TERRAIN.env = { E, ex, ez, a: env };
}

/* the reservoir behind the dam: a basin below the water, a rim above it all round, and canyon walls either side of
   the valley below the dam (so the dam spans the canyon and nothing leaks round its ends). Roads stay level. */
function damShape(x, z, h, near) {
  const D = W.DAM, e = ((x - D.cx) / D.rx) ** 2 + ((z - D.cz) / D.rz) ** 2;
  if (e > 2.4 && (z < D.z - 4 || z > D.z + 80 || Math.abs(x - D.x) > 170)) return h;
  let road = 1; for (const r of near) road = Math.min(road, sstep(20, 60, segPointDist(x, z, r.ax, r.az, r.bx, r.bz)));
  // under the water: shallows at the shore shelving to 3 m out in the middle, and right up to the dam's face
  if (e < 1.0 || (Math.abs(x - D.x) < 85 && z > D.z - 40 && z < D.z - 4)) return D.water - 1 - 10 * sstep(0.92, 0.5, e);
  const wall = D.crest + 1;
  if (road < 0.02) return h; // roads stay level: the hills grade down to them
  if (z < D.z - 4) return e < 2.6 ? Math.max(h, wall * (1 - sstep(2.2, 2.6, e))) : h; // the rim
  const out = Math.abs(x - D.x); // below the dam: canyon walls, fading out downstream
  if (out > 62) return Math.max(h, wall * sstep(62, 74, out) * (1 - sstep(D.z + 40, D.z + 80, z)) * (1 - sstep(140, 170, out)));
  return h;
}
/* ground height at a point, on the same two triangles per cell the mesh is drawn with (plus ramps, the roundabout
   island and the dam crest on top) */
W.groundAt = function (x, z) { return W.terrainAt(x, z) + (W.RAMPS.length ? W.rampAt(x, z) : 0) + W.islandAt(x, z) + W.damAt(x, z); };
/* the dam's crest: level at 16 m across the canyon, whatever the ground under it */
W.damAt = function (x, z) {
  const D = W.DAM; if (!D || !D.x1 || Math.abs(z - D.z) > D.half || x < D.x0 || x > D.x1) return 0;
  return Math.max(0, D.crest - W.terrainAt(x, z));
};
W.terrainAt = function (x, z) {
  let h = 0;
  const T = W.TERRAIN;
  if (T && W.HILLS) {
    const fx = (x - T.x0) / T.C, fz = (z - T.z0) / T.C, i = Math.floor(fx), j = Math.floor(fz);
    if (i >= 0 && j >= 0 && i < T.nx - 1 && j < T.nz - 1) {
      const u = fx - i, v = fz - j, a = T.H[j * T.nx + i], b = T.H[j * T.nx + i + 1], c = T.H[(j + 1) * T.nx + i], d = T.H[(j + 1) * T.nx + i + 1];
      h = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    }
  }
  return h;
};
/* the roundabout's raised island: a kerb you can bump up and over */
W.islandAt = function (x, z) {
  const I = W.ISLAND; if (!I || Math.abs(x - I.x) >= I.r || Math.abs(z - I.z) >= I.r) return 0;
  const d = Math.hypot(x - I.x, z - I.z); return d < I.r ? I.h * Math.min(1, (I.r - d) / 0.3) : 0;
};
/* the smooth "sky floor" aircraft fly relative to when high up */
W.groundEnv = function (x, z) {
  const T = W.TERRAIN; if (!T || !T.env || !W.HILLS) return W.groundAt(x, z);
  const e = T.env, fx = (x - T.x0) / (T.C * e.E), fz = (z - T.z0) / (T.C * e.E), i = clamp(Math.floor(fx), 0, e.ex - 2), j = clamp(Math.floor(fz), 0, e.ez - 2), u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const a = e.a[j * e.ex + i], b = e.a[j * e.ex + i + 1], c = e.a[(j + 1) * e.ex + i], d = e.a[(j + 1) * e.ex + i + 1];
  return Math.max(W.groundAt(x, z), a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v);
};
/* drawn height of something at height y above the ground: low down it hugs the terrain, high up the envelope */
W.airY = function (x, z, y) { const g = W.groundAt(x, z); if (y < 2) return y + g; return y + g + (W.groundEnv(x, z) - g) * sstep(2, 30, y); };
/* slope of the ground along a direction (rise per metre) */
W.slopeAlong = function (x, z, dx, dz) { return (W.groundAt(x + dx * 1.5, z + dz * 1.5) - W.groundAt(x - dx * 1.5, z - dz * 1.5)) / 3; };

/* ---------------- stunt ramps: wedges whose height adds to the ground ---------------- */
W.rampAt = function (x, z) {
  let h = 0;
  for (const r of W.RAMPS) {
    if (Math.abs(x - r.x) > r.reach || Math.abs(z - r.z) > r.reach) continue;
    const dx = x - r.x, dz = z - r.z, along = dx * r.fx + dz * r.fz, side = dx * r.fz - dz * r.fx;
    if (along < -r.len / 2 || along > r.len / 2 || Math.abs(side) > r.w / 2) continue;
    h = Math.max(h, r.h * (along + r.len / 2) / r.len);
  }
  return h;
};

/* named stunt jumps: x, z, heading (direction you drive up it), length, width, lip height */
W.STUNTS = [
  { name: 'River Run', x: 886, z: -300, ang: Math.PI / 2, len: 12, w: 7, h: 5.6 },
  { name: 'Return Leg', x: 964, z: -330, ang: -Math.PI / 2, len: 12, w: 7, h: 5.6 },
  { name: 'Runway Launch', x: -565, z: 300, ang: Math.PI / 2, len: 11, w: 9, h: 3.4 },
  { name: 'Wrong Way Up', x: -1225, z: 300, ang: -Math.PI / 2, len: 11, w: 9, h: 3.4 },
  { name: 'Beach Flyer', x: 160, z: 386, ang: Math.PI / 2, len: 10, w: 6, h: 2.8 },
  { name: 'Sand Bar', x: -170, z: 386, ang: -Math.PI / 2, len: 10, w: 6, h: 2.8 },
  { name: 'Barrier Breaker', x: 78, z: -318, ang: Math.PI, len: 12, w: 7, h: 3.4 },
  { name: 'Circle Jump', x: 600, z: 45, ang: Math.PI / 2, len: 10, w: 6, h: 3.0 },
  { name: 'Mesa Hop', x: 820, z: -690, ang: Math.PI / 2, len: 12, w: 7, h: 4.2 },
];
function buildRamps() {
  // a dirt bike waits near every county jump (at the start of its run-up)
  for (const st of W.STUNTS) { const fx = Math.round(Math.sin(st.ang)), fz = Math.round(Math.cos(st.ang)), x = st.x - fx * 75 + fz * 7, z = st.z - fz * 75 - fx * 7; if (W.inCounty(x, z) && !W.inAirport(x, z)) W.dirtSpots.push({ x, z, h: st.ang }); }
  const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#1b1b1e'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#ffd23f'; for (let x = -16; x < 64; x += 16) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 8, 16); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; })();
  W.STUNTS.forEach((st, i) => {
    const fx = Math.sin(st.ang), fz = Math.cos(st.ang), r = { id: i, x: st.x, z: st.z, fx, fz, len: st.len, w: st.w, h: st.h, reach: st.len / 2 + st.w / 2 + 1, name: st.name };
    W.RAMPS.push(r);
    // the wedge: a sloped deck rising to the lip, sides, and a back wall under the lip
    const L = st.len / 2, Wd = st.w / 2, Hh = st.h, g = new THREE.BufferGeometry();
    const v = [[-Wd, 0, -L], [Wd, 0, -L], [Wd, Hh, L], [-Wd, Hh, L], [-Wd, 0, L], [Wd, 0, L]];
    const tri = [[0, 2, 1], [0, 3, 2], [0, 4, 3], [1, 2, 5], [4, 5, 2], [4, 2, 3]], pos = [];
    for (const t of tri) for (const k of t) pos.push(...v[k]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x9a968c, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true;
    const base = W.groundAt(st.x, st.z) - W.rampAt(st.x, st.z); // terrain under it (the ramp itself is already counted)
    m.position.set(st.x, base, st.z); m.rotation.y = st.ang; S.add(m);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(st.w, 0.12, 0.6), new THREE.MeshLambertMaterial({ map: stripeTex })); lip.position.set(0, Hh + 0.02, L - 0.3); m.add(lip);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, st.len), lam('#ffd23f')); rail.position.set(s * Wd, Hh / 2 + 0.25, 0); rail.rotation.x = -Math.atan2(Hh, st.len); m.add(rail); }
    // the back wall under the lip is solid (from behind you hit it; off the lip you're already above it)
    for (let k = -Wd; k <= Wd; k += 1.0) { const c = W.addCircle(st.x + fx * (L + 0.5) + fz * k, st.z + fz * (L + 0.5) - fx * k, 0.5, 'ramp'); c.h = Hh * 0.8; c.oneWay = [fx, fz]; }
    W.places['stunt' + i] = { id: 'stunt', name: st.name, x: st.x, z: st.z };
    // clear trees off the run-up and the landing
    for (const t of W.trees) {
      if (!t.col || t.col.removed) continue;
      const dx = t.x - st.x, dz = t.z - st.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (along > -L - 25 && along < L + 60 && Math.abs(side) < Wd + 4) { W.removeCollider(t.col); W.hideTree(t); }
    }
  });
}
/* which ramp (if any) is under a point */
W.rampUnder = function (x, z) { for (const r of W.RAMPS) { const dx = x - r.x, dz = z - r.z, along = dx * r.fx + dz * r.fz, side = dx * r.fz - dz * r.fx; if (Math.abs(along) <= r.len / 2 + 0.5 && Math.abs(side) <= r.w / 2 + 0.5) return r; } return null; };

/* ---------------- the terrain mesh: 256 m tiles coloured by biome and height ---------------- */
function terrainColor(x, z, h, slope, out) {
  const b = W.biomeAt(x, z), n = tFbm(x / 30, z / 30, 91, 2);
  // farmland and woods: greens; highlands: grass, then rock, then snow; badlands: sand, red rock sides, pale tops
  let r = 0.42 + 0.08 * n, g = 0.66 + 0.1 * n, bl = 0.27;
  if (b.woods > 0) { r -= 0.1 * b.woods; g -= 0.12 * b.woods; bl -= 0.05 * b.woods; }
  if (b.high > 0) {
    const rock = sstep(18, 34, h) * b.high, snow = sstep(46, 58, h) * b.high;
    r = r + (0.5 - r) * rock; g = g + (0.48 - g) * rock; bl = bl + (0.44 - bl) * rock;
    r = r + (0.95 - r) * snow; g = g + (0.96 - g) * snow; bl = bl + (0.98 - bl) * snow;
  }
  if (b.bad > 0) {
    const side = sstep(0.25, 0.6, slope), top = sstep(12, 15, h) * (1 - side);
    let br = 0.86 + 0.06 * n, bg = 0.6 + 0.05 * n, bb = 0.36; // sand
    br = br + (0.68 - br) * side; bg = bg + (0.34 - bg) * side; bb = bb + (0.24 - bb) * side; // red rock
    br = br + (0.84 - br) * top; bg = bg + (0.66 - bg) * top; bb = bb + (0.46 - bb) * top;
    r = r + (br - r) * b.bad; g = g + (bg - g) * b.bad; bl = bl + (bb - bl) * b.bad;
  }
  out[0] = r; out[1] = g; out[2] = bl;
}
function buildTerrainMesh(scene) {
  const T = W.TERRAIN; if (!T || !W.HILLS) return null;
  // a neutral speckle texture; the colour comes from the vertices
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d'), rr = mulberry32(5);
  g2.fillStyle = '#d0d0d0'; g2.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 700; i++) { const v = 170 + Math.floor(rr() * 85); g2.fillStyle = `rgb(${v},${v},${v})`; g2.fillRect(Math.floor(rr() * 64), Math.floor(rr() * 64), 2, 2); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  // snow dusts the hills too
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.snowCover = W.snowUniform = { value: 0 };
    sh.fragmentShader = 'uniform float snowCover;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.97), snowCover * 0.9);');
  };
  W.terrainMat = mat;
  const TC = 64, col = [0, 0, 0], H = T.H, nx = T.nx, meshes = []; // 512 m tiles: few draw calls, still culled
  for (let tj = 0; tj < T.nz - 1; tj += TC) for (let ti = 0; ti < T.nx - 1; ti += TC) {
    const cx = Math.min(TC, T.nx - 1 - ti), cz = Math.min(TC, T.nz - 1 - tj), vx = cx + 1, vz = cz + 1;
    const pos = new Float32Array(vx * vz * 3), colr = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), idx = [];
    let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
      const gi = ti + i, gj = tj + j, x = T.x0 + gi * T.C, z = T.z0 + gj * T.C, h = H[gj * nx + gi], k = j * vx + i;
      const sx = (H[gj * nx + Math.min(nx - 1, gi + 1)] - H[gj * nx + Math.max(0, gi - 1)]) / (2 * T.C), sz = (H[Math.min(T.nz - 1, gj + 1) * nx + gi] - H[Math.max(0, gj - 1) * nx + gi]) / (2 * T.C);
      // past the shoreline the ground is drawn as a sea bed, under the water (the grid runs on 80 m out to sea, and at
      // the ground's own height it lay over the water as grass)
      const sea = z > W.SHORE + 2;
      pos[k * 3] = x; pos[k * 3 + 1] = sea ? -2.5 : h; pos[k * 3 + 2] = z; uv[k * 2] = x / 12; uv[k * 2 + 1] = z / 12;
      if (sea) { col[0] = 0.76; col[1] = 0.7; col[2] = 0.5; } else terrainColor(x, z, h, Math.hypot(sx, sz), col);
      colr[k * 3] = col[0]; colr[k * 3 + 1] = col[1]; colr[k * 3 + 2] = col[2];
      hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
    }
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) { const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); meshes.push(m);
  }
  return meshes;
}
/* county trees were planted before the hills: lift each one onto the ground and fix the tiles' culling bounds */
function plantTreesOnHills() {
  if (!W.HILLS) return;
  const m4 = new THREE.Matrix4(), tiles = new Set();
  for (const t of W.trees) {
    if (!t.tm) continue;
    const y = W.groundAt(t.x, t.z); if (!y) continue;
    for (const [mesh, i] of [[t.tm, t.ti], [t.cm, t.ci]]) { mesh.getMatrixAt(i, m4); m4.elements[13] += y; mesh.setMatrixAt(i, m4); mesh.instanceMatrix.needsUpdate = true; tiles.add(mesh); }
  }
  for (const mesh of tiles) {
    const list = mesh.userData.trees || []; let lo = 1e9, hi = -1e9; for (const t of list) { const y = W.groundAt(t.x, t.z); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const bs = mesh.geometry.boundingSphere; if (!bs || !list.length) continue;
    bs.center.y = (lo + hi) / 2 + 4; bs.radius = Math.hypot(bs.radius, (hi - lo) / 2 + 6);
  }
}
/* hills block line of sight: sample the ground along the sight line */
W.terrainBlocks = function (ax, az, bx, bz, ya, yb) {
  if (!W.HILLS || !W.TERRAIN) return false;
  const ha = W.groundAt(ax, az) + (ya || 1.6), hb = W.groundAt(bx, bz) + (yb || 1.6), n = Math.min(10, Math.ceil(dist(ax, az, bx, bz) / 12));
  for (let i = 1; i < n; i++) { const t = i / n; if (W.groundAt(ax + (bx - ax) * t, az + (bz - az) * t) > ha + (hb - ha) * t + 0.4) return true; }
  return false;
};
