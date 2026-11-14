'use strict';
/* Terrain: rolling hills, highlands and badland mesas out in the county.
   The simulation stays flat: every y in the game means "height above the local ground". The ground's height is
   only added when things are drawn (W.groundAt), plus two pieces of physics that need it: cars and people launch
   when the ground falls away under them (crests, ramps, cliffs), and slopes slow you down uphill.
   Everything that exists on flat ground — the city, roads, rail, water, the airport, fields, buildings — sits in
   zones where the ground is exactly 0. Stunt ramps add their own height on top. */

W.HILLS = false; // switched on once everything that draws knows about the ground
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
    const n = tFbm(x / 190, z / 190, 53, 3), plateau = sstep(0.56, 0.6, n) * 16 + sstep(0.66, 0.69, n) * 9;
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

/* ground height at a point, on the same two triangles per cell the mesh is drawn with */
W.groundAt = function (x, z) {
  let h = 0;
  const T = W.TERRAIN;
  if (T && W.HILLS) {
    const fx = (x - T.x0) / T.C, fz = (z - T.z0) / T.C, i = Math.floor(fx), j = Math.floor(fz);
    if (i >= 0 && j >= 0 && i < T.nx - 1 && j < T.nz - 1) {
      const u = fx - i, v = fz - j, a = T.H[j * T.nx + i], b = T.H[j * T.nx + i + 1], c = T.H[(j + 1) * T.nx + i], d = T.H[(j + 1) * T.nx + i + 1];
      h = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    }
  }
  if (W.RAMPS.length) h += W.rampAt(x, z);
  return h;
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
